/**
 * Store search — learning from what shoppers do (docs/search SI16, SI-16). Run once a day from the search sweep,
 * claimed on the store's settings like the rollups (SI-13), and only when the store's learning is on.
 *
 *  1. **Pairs** (`SearchPair`): for each search × product the log (`SearchEvent`, 90 days) showed, decayed counts
 *     (half-life 30 days) of impressions, clicks, adds to the bag and orders, and the clicks an average result would
 *     have had at the same positions (position 1 is clicked more anyway). A pair with ≥ 20 impressions from ≥ 5
 *     visitors gets a learned multiplier between × 0.85 and × 1.25 from what it got against that. It only multiplies
 *     products the words already find (rank.ts), so it never brings one in.
 *  2. **Suggestions** (`SearchSuggestion`, source `learned`), for the owner to accept or dismiss on Insights:
 *     - a synonym, from reformulations: a search for A with nothing opened, then a search for B within 60 s by the same
 *       visitor with something opened, seen from ≥ 5 visitors → "A also finds B" (one word for one word: the engine
 *       matches synonyms word by word);
 *     - a pin, when shoppers keep opening a product far down a search's results (learned × 1.2 or more at position 5
 *       or lower).
 *     Nothing is applied until the owner says yes; a dismissed suggestion never comes back.
 *
 * State lives in CommerceSettings `search.learn`: at (the claim), last { at, pairs, boosted, suggestions, ms }.
 */
import mongoose from 'mongoose';
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import SearchEvent from '../../../models/tenancy/searchEvent.model.js';
import SearchPair from '../../../models/tenancy/searchPair.model.js';
import SearchSuggestion from '../../../models/tenancy/searchSuggestion.model.js';
import { currentScope, scopeFilter } from '../../tenantScope.function.js';
import { TenancyError } from '../../tenancy.function.js';
import type { Store } from '../store.js';
import { cleanQuery, normalisedOf } from './events.js';
import { rulesChanged, storeRules } from './rules.js';
import { searchSettingsOf } from './settings.js';

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;
export const HALF_LIFE_DAYS = 30;
export const MIN_IMPRESSIONS = 20;
export const MIN_VISITORS = 5;
export const BOOST_MIN = 0.85;
export const BOOST_MAX = 1.25;
/** Positions counted (a page of 60 at most). */
const MAX_POS = 60;
/** A reformulation: the second search within this long of the first. */
export const REFORM_MS = 60 * 1000;
const LEARN_MS = () => Number(process.env.SEARCH_LEARN_MS) || DAY;
const PLACEHOLDER = /\[(?:email|phone|number)\]/;

/* -------------------------------------------------------------- pure parts */

/** A decay weight: 1 now, ½ after 30 days. */
export const decay = (at: number, now = Date.now()) => Math.pow(0.5, Math.max(0, now - at) / (HALF_LIFE_DAYS * DAY));

/** The prior click rate at a position, before a store has its own (falls with the position). */
export const priorRate = (pos: number) => 0.3 / Math.pow(Math.max(1, pos), 0.8);

/**
 * The store's click rate at each position (index 0 = position 1), from its own impressions and clicks, smoothed
 * towards the prior so a position with little data isn't wild, and never rising further down the page.
 */
export const positionRates = (impressions: number[], clicks: number[], strength = 50) => {
	const out: number[] = [];
	for (let i = 0; i < MAX_POS; i++) {
		const n = impressions[i] || 0;
		const c = Math.min(clicks[i] || 0, n || Infinity);
		out.push((c + strength * priorRate(i + 1)) / (n + strength));
	}
	// A result further down is never more clickable than one above it: a store whose shoppers keep digging for one
	// product would otherwise teach it that position 3 is the best place to be.
	for (let i = MAX_POS - 2; i >= 0; i--) out[i] = Math.max(out[i], out[i + 1]);
	return out;
};

/**
 * The learned multiplier for a pair: what it got (clicks, plus adds and orders weighted by how the store converts)
 * against what an average result at its positions would have got. 1 below the thresholds; else × 0.85 … × 1.25.
 */
export const boostOf = (p: { impressions: number; visitors: number; clicks: number; carts: number; orders: number; expected: number }, convert = 1) => {
	if (p.impressions < MIN_IMPRESSIONS || p.visitors < MIN_VISITORS) return 1;
	const got = p.clicks + 0.5 * p.carts + p.orders;
	const would = p.expected * convert;
	const ratio = (got + 1) / (would + 1);
	const l = Math.log(ratio);
	const x = l >= 0 ? 1 + (BOOST_MAX - 1) * Math.tanh(l) : 1 - (1 - BOOST_MIN) * Math.tanh(-l);
	return Math.round(Math.min(BOOST_MAX, Math.max(BOOST_MIN, x)) * 1000) / 1000;
};

/**
 * Reformulations in one visitor's searches (in time order): A with nothing opened, then B within 60 s with something
 * opened. Typing on (B starts with A), adding words, and the same search again aren't. Returns [A, B] as normalised
 * queries with how they were typed.
 */
export const reformulations = (searches: { at: number; nq: string; q: string; clicked: boolean }[]) => {
	const out: { from: string; to: string; fromQ: string; toQ: string }[] = [];
	for (let i = 0; i + 1 < searches.length; i++) {
		const a = searches[i];
		const b = searches[i + 1];
		if (a.clicked || !b.clicked || !a.nq || !b.nq || a.nq === b.nq) continue;
		if (b.at - a.at > REFORM_MS || b.at < a.at) continue;
		if (PLACEHOLDER.test(a.q) || PLACEHOLDER.test(b.q)) continue;
		if (b.nq.startsWith(a.nq) || a.nq.startsWith(b.nq)) continue;
		out.push({ from: a.nq, to: b.nq, fromQ: a.q, toQ: b.q });
	}
	return out;
};

/**
 * A reformulation as a synonym, or null: one word for one word ("frock" → "dress"), or two searches the same but for
 * one word ("red frock" → "red dress" → frock / dress). As the words were typed, lower case.
 */
export const synonymOf = (fromQ: string, toQ: string, fromNq: string, toNq: string) => {
	const a = fromNq.split(' ');
	const b = toNq.split(' ');
	if (a.length !== b.length || a.length > 4) return null;
	const diff = a.map((w, i) => (w !== b[i] ? i : -1)).filter(i => i >= 0);
	if (diff.length !== 1) return null;
	const k = diff[0];
	const typedA = String(fromQ).toLowerCase().split(/\s+/).filter(Boolean);
	const typedB = String(toQ).toLowerCase().split(/\s+/).filter(Boolean);
	const from = typedA.length === a.length ? typedA[k] : a[k];
	const to = typedB.length === b.length ? typedB[k] : b[k];
	if (!from || !to || from === to || from.length < 2 || to.length < 2 || /\d/.test(from + to)) return null;
	return { from, to, fromStem: a[k], toStem: b[k] };
};

/* ------------------------------------------------------------------ claiming */

const learnState = async (): Promise<any> => ((await CommerceSettings.findOne({}, { 'search.learn': 1 }).lean()) as any)?.search?.learn || {};

const claim = async (was: any, force: boolean) => {
	if (!force && was && Date.now() - new Date(was).getTime() < LEARN_MS()) return false;
	const r = await CommerceSettings.updateOne({ 'search.learn.at': was ?? null }, { $set: { 'search.learn.at': new Date() } });
	return r.modifiedCount > 0;
};

/* --------------------------------------------------------------------- pairs */

const since = () => new Date(Date.now() - WINDOW_DAYS * DAY);
const decayExpr = (now: number) => ({ $pow: [0.5, { $divide: [{ $subtract: [now, { $toLong: '$at' }] }, HALF_LIFE_DAYS * DAY] }] });
const posExpr = { $add: [{ $multiply: [{ $subtract: [{ $ifNull: ['$page', 1] }, 1] }, { $ifNull: ['$limit', 24] }] }, '$i', 1] };

/** Impressions and clicks by position over the window, for the store's click rates. */
const byPosition = async () => {
	const [imps, clicks] = await Promise.all([
		SearchEvent.aggregate([
			{ $match: { type: 'search', at: { $gte: since() }, 'top.0': { $exists: true } } },
			{ $project: { page: 1, limit: 1, top: 1 } },
			{ $unwind: { path: '$top', includeArrayIndex: 'i' } },
			{ $project: { pos: posExpr } },
			{ $match: { pos: { $lte: MAX_POS } } },
			{ $group: { _id: '$pos', n: { $sum: 1 } } },
		]).allowDiskUse(true),
		SearchEvent.aggregate([
			{ $match: { type: 'click', at: { $gte: since() }, position: { $gte: 1, $lte: MAX_POS } } },
			{ $group: { _id: '$position', n: { $sum: 1 } } },
		]),
	]);
	const a: number[] = Array(MAX_POS).fill(0);
	const b: number[] = Array(MAX_POS).fill(0);
	for (const r of imps) a[r._id - 1] = r.n;
	for (const r of clicks) b[r._id - 1] = r.n;
	return positionRates(a, b);
};

/** Every pair, worked out from the log. */
export const computePairs = async (now = Date.now()) => {
	const rates = await byPosition();
	const [shown, acts] = await Promise.all([
		SearchEvent.aggregate([
			{ $match: { type: 'search', at: { $gte: since() }, nq: { $type: 'string', $ne: '' }, 'top.0': { $exists: true } } },
			{ $project: { nq: 1, q: 1, top: 1, page: 1, limit: 1, who: { $ifNull: ['$visitor', '$session'] }, w: decayExpr(now) } },
			{ $unwind: { path: '$top', includeArrayIndex: 'i' } },
			{ $project: { nq: 1, q: 1, top: 1, who: 1, w: 1, pos: posExpr } },
			{ $match: { pos: { $lte: MAX_POS } } },
			{
				$group: {
					_id: { nq: '$nq', product: '$top' },
					q: { $last: '$q' },
					impressions: { $sum: 1 },
					shown: { $sum: '$w' },
					expected: { $sum: { $multiply: ['$w', { $arrayElemAt: [rates, { $subtract: ['$pos', 1] }] }] } },
					posSum: { $sum: '$pos' },
					visitors: { $addToSet: '$who' },
				},
			},
			{ $match: { impressions: { $gte: MIN_IMPRESSIONS } } },
			{ $project: { q: 1, impressions: 1, shown: 1, expected: 1, position: { $divide: ['$posSum', '$impressions'] }, visitors: { $size: { $setDifference: ['$visitors', [null]] } } } },
			{ $match: { visitors: { $gte: MIN_VISITORS } } },
		]).allowDiskUse(true),
		SearchEvent.aggregate([
			{ $match: { type: { $in: ['click', 'cart', 'order'] }, at: { $gte: since() }, nq: { $type: 'string', $ne: '' }, product: { $type: 'objectId' } } },
			{ $project: { nq: 1, product: 1, type: 1, w: decayExpr(now) } },
			{
				$group: {
					_id: { nq: '$nq', product: '$product' },
					clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, '$w', 0] } },
					carts: { $sum: { $cond: [{ $eq: ['$type', 'cart'] }, '$w', 0] } },
					orders: { $sum: { $cond: [{ $eq: ['$type', 'order'] }, '$w', 0] } },
				},
			},
		]).allowDiskUse(true),
	]);
	const act = new Map(acts.map((a: any) => [`${a._id.nq}|${a._id.product}`, a]));
	// How the store turns clicks into adds and orders: an average product scores 1 against what's expected.
	let c = 0;
	let e = 0;
	for (const a of acts) (c += a.clicks), (e += a.clicks + 0.5 * a.carts + a.orders);
	const convert = c > 0 ? e / c : 1;
	return shown.map((s: any) => {
		const a: any = act.get(`${s._id.nq}|${s._id.product}`) || { clicks: 0, carts: 0, orders: 0 };
		const p = {
			nq: s._id.nq,
			q: s.q || s._id.nq,
			product: s._id.product,
			impressions: s.impressions,
			visitors: s.visitors,
			shown: s.shown,
			clicks: a.clicks,
			carts: a.carts,
			orders: a.orders,
			expected: s.expected,
			position: Math.round(s.position * 10) / 10,
		};
		return { ...p, boost: boostOf(p, convert) };
	});
};

/** Writes the pairs (replacing the last run's). Returns whether any boost changed. */
const writePairs = async (pairs: Awaited<ReturnType<typeof computePairs>>) => {
	const before = new Map(((await SearchPair.find({ boost: { $ne: 1 } }, { nq: 1, product: 1, boost: 1 }).lean()) as any[]).map(p => [`${p.nq}|${p.product}`, p.boost]));
	const scope = scopeFilter() || {};
	const at = new Date();
	for (let i = 0; i < pairs.length; i += 1000)
		// bulkWrite isn't confined by the tenant plugin: the scope goes in by hand.
		await SearchPair.bulkWrite(
			pairs.slice(i, i + 1000).map(p => ({ updateOne: { filter: { ...scope, nq: p.nq, product: p.product }, update: { $set: { ...p, ...scope, at } }, upsert: true } })) as any,
			{ ordered: false }
		);
	await SearchPair.deleteMany({ at: { $lt: at } });
	const after = pairs.filter(p => p.boost !== 1);
	return after.length !== before.size || after.some(p => before.get(`${p.nq}|${p.product}`) !== p.boost);
};

/* --------------------------------------------------------------- suggestions */

/** Searches by visitor in time order, with whether anything was opened from each. */
const reformulationCounts = async () => {
	const clicked = new Set(
		((await SearchEvent.aggregate([{ $match: { type: { $in: ['click', 'cart'] }, at: { $gte: since() }, searchId: { $type: 'string' } } }, { $group: { _id: '$searchId' } }]).allowDiskUse(true)) as any[]).map(r => r._id)
	);
	const cursor = SearchEvent.aggregate([
		{ $match: { type: 'search', at: { $gte: since() }, $or: [{ page: 1 }, { page: null }], nq: { $type: 'string', $ne: '' } } },
		{ $project: { who: { $ifNull: ['$visitor', '$session'] }, at: 1, nq: 1, q: 1, searchId: 1 } },
		{ $match: { who: { $type: 'string' } } },
		{ $sort: { who: 1, at: 1 } },
	])
		.allowDiskUse(true)
		.cursor({ batchSize: 2000 });
	const pairs = new Map<string, { from: string; to: string; fromQ: string; toQ: string; who: Set<string> }>();
	let who: string | null = null;
	let list: { at: number; nq: string; q: string; clicked: boolean }[] = [];
	const flush = () => {
		if (!who) return;
		for (const r of reformulations(list)) {
			const k = `${r.from}>${r.to}`;
			const p = pairs.get(k) || { ...r, who: new Set<string>() };
			p.who.add(who);
			pairs.set(k, p);
		}
	};
	for await (const e of cursor as any) {
		if (e.who !== who) flush(), (who = e.who), (list = []);
		list.push({ at: new Date(e.at).getTime(), nq: e.nq, q: e.q, clicked: clicked.has(e.searchId) });
	}
	flush();
	return [...pairs.values()].filter(p => p.who.size >= MIN_VISITORS);
};

/** Saves a suggestion unless the same one is there (an open one gets its new numbers; a decided one is left). */
const offer = async (s: { kind: 'synonym' | 'redirect' | 'rule'; source: 'learned' | 'your-ai'; key: string; title: string; why: string; record: any; evidence?: any }) => {
	const now = { title: s.title, why: s.why, record: s.record, ...(s.evidence && { evidence: s.evidence }) };
	const open = await SearchSuggestion.updateOne({ key: s.key, status: 'open' }, { $set: now });
	if (open.matchedCount) return false;
	// A decided one keeps what it was decided on.
	if (await SearchSuggestion.exists({ key: s.key })) return false;
	try {
		await SearchSuggestion.create({ kind: s.kind, source: s.source, key: s.key, status: 'open', ...now });
		return true;
	} catch (e: any) {
		if (e?.code === 11000) return false; // made by another server a moment ago
		throw e;
	}
};

/** The learned suggestions: synonyms from reformulations, pins from pairs shoppers dig for. */
const suggest = async (store: Store, pairs: Awaited<ReturnType<typeof computePairs>>) => {
	const version = Number(((await CommerceSettings.findOne({}, { 'search.index.version': 1 }).lean()) as any)?.search?.index?.version) || 0;
	const rules = await storeRules(store, version);
	const decided = new Set(((await SearchSuggestion.find({ status: { $ne: 'open' } }, { key: 1 }).lean()) as any[]).map(s => s.key));
	let made = 0;
	if (store.installed.searchSynonym)
		for (const r of await reformulationCounts()) {
			const syn = synonymOf(r.fromQ, r.toQ, r.from, r.to);
			if (!syn) continue;
			const key = `synonym:${syn.fromStem}>${syn.toStem}`;
			if (decided.has(key)) continue;
			// The store already has it.
			const have = rules.synonyms.get(syn.fromStem) || rules.synonyms.get(syn.from);
			if (have && (have.has(syn.toStem) || have.has(syn.to))) continue;
			const ok = await offer({
				kind: 'synonym',
				source: 'learned',
				key,
				title: `Let “${syn.from}” also find “${syn.to}”`,
				why: `${r.who.size} shoppers searched “${r.fromQ}”, opened nothing, then searched “${r.toQ}” and found what they wanted.`,
				record: { kind: 'one-way', words: [syn.from], to: [syn.to], active: true },
				evidence: { visitors: r.who.size, from: r.fromQ, to: r.toQ },
			});
			if (ok) made++;
		}
	if (store.installed.searchRule && store.installed.product) {
		const dig = pairs.filter(p => p.boost >= 1.2 && p.position >= 5).sort((a, b) => b.boost - a.boost || b.visitors - a.visitors).slice(0, 20);
		const names = new Map(
			((await store.M('product').find({ _id: { $in: dig.map(p => p.product) } }, { name: 1 }).lean()) as any[]).map(p => [String(p._id), p.name])
		);
		for (const p of dig) {
			const name = names.get(String(p.product));
			if (!name) continue;
			const key = `rule:pin:${p.nq}:${p.product}`;
			if (decided.has(key)) continue;
			const ok = await offer({
				kind: 'rule',
				source: 'learned',
				key,
				title: `Pin “${name}” for “${p.q}”`,
				why: `Shoppers keep opening it from about position ${Math.round(p.position)} of “${p.q}” (${p.visitors} visitors, ${p.impressions} searches).`,
				record: { when: 'exact', queries: [p.q], action: 'pin', products: [String(p.product)], active: true },
				evidence: { visitors: p.visitors, searches: p.impressions, position: p.position, product: String(p.product) },
			});
			if (ok) made++;
		}
	}
	return made;
};

/* ----------------------------------------------------------------------- run */

/**
 * The day's learning for a store: pairs, then suggestions. Due once a day (`SEARCH_LEARN_MS`); `force` runs it now.
 * Null when not due, or when the store's learning is off (the pairs are left as they are, and the engine ignores them).
 */
export const learnStore = async (store: Store, { force = false } = {}) => {
	const settings: any = await CommerceSettings.findOne({}, { search: 1 }).lean();
	if (!searchSettingsOf(settings?.search).learning) return null;
	const state = await learnState();
	if (!(await claim(state.at, force))) return null;
	const started = Date.now();
	const pairs = await computePairs();
	const changed = await writePairs(pairs);
	const suggestions = await suggest(store, pairs);
	const last = { at: new Date(), pairs: pairs.length, boosted: pairs.filter(p => p.boost !== 1).length, suggestions, ms: Date.now() - started };
	await CommerceSettings.updateOne({}, { $set: { 'search.learn.last': last }, ...(changed && { $inc: { 'search.index.version': 1 } }) });
	return last;
};

/* -------------------------------------------------------- for the engine */

const learnedCache = new Map<string, { at: number; map: Map<string, Map<string, number>> }>();

/** The store's learned multipliers by normalised query, cached per index version (a learning run bumps it). */
export const storeLearned = async (version: number) => {
	const key = `${currentScope()?.project}:${version}`;
	const hit = learnedCache.get(key);
	if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.map;
	const rows: any[] = await SearchPair.find({ boost: { $ne: 1 } }, { nq: 1, product: 1, boost: 1 }).limit(50000).lean();
	const map = new Map<string, Map<string, number>>();
	for (const r of rows) {
		if (!map.has(r.nq)) map.set(r.nq, new Map());
		map.get(r.nq)!.set(String(r.product), r.boost);
	}
	learnedCache.set(key, { at: Date.now(), map });
	if (learnedCache.size > 300) learnedCache.delete(learnedCache.keys().next().value as string);
	return map;
};

/** The learned multipliers for one search as typed (null: none). */
export const learnedFor = (map: Map<string, Map<string, number>> | undefined, q: string) => {
	if (!map?.size) return null;
	return map.get(normalisedOf(cleanQuery(q))) || null;
};

/* ------------------------------------------------------- for the panel */

const kindModel = { synonym: 'searchSynonym', redirect: 'searchRedirect', rule: 'searchRule' } as const;

/** Open suggestions first (newest), then the last decided ones. */
export const listSuggestions = async ({ status = 'open', limit = 50 }: { status?: string; limit?: number } = {}) => {
	const q = status === 'all' ? {} : { status: ['open', 'accepted', 'dismissed'].includes(status) ? status : 'open' };
	const rows: any[] = await SearchSuggestion.find(q).sort({ updatedAt: -1 }).limit(Math.min(200, Math.max(1, Number(limit) || 50))).lean();
	const open = await SearchSuggestion.countDocuments({ status: 'open' });
	return { open, doc: rows };
};

/** Accept: the record is made (marked as a suggestion, or as your AI's), searches see it now. */
export const acceptSuggestion = async (store: Store, id: string, by?: any, edits?: any) => {
	if (!mongoose.isValidObjectId(id)) throw new TenancyError(404, 'No such suggestion');
	const s: any = await SearchSuggestion.findOne({ _id: id }).lean();
	if (!s) throw new TenancyError(404, 'No such suggestion');
	if (s.status !== 'open') throw new TenancyError(409, s.status === 'accepted' ? 'Already accepted' : 'It was dismissed', 'suggestion_decided');
	const key = kindModel[s.kind as keyof typeof kindModel];
	if (!store.installed[key]) throw new TenancyError(409, 'Upgrade the store first: it has no place for this yet', 'store_upgrade_needed');
	const record = { ...(s.record || {}), ...(edits && typeof edits === 'object' ? edits : {}) };
	if (s.kind !== 'redirect') record.source = s.source === 'your-ai' ? 'your-ai' : 'suggested';
	const doc: any = await store.M(key).create(record);
	await rulesChanged(store, store.installed[key].name, doc.toObject ? doc.toObject() : doc, 'create');
	await SearchSuggestion.updateOne({ _id: id }, { $set: { status: 'accepted', made: doc._id, decidedAt: new Date(), ...(by && { decidedBy: by }) } });
	return { ok: true, kind: s.kind, made: doc._id, route: store.installed[key].route };
};

/** Dismiss: it goes, and the same suggestion isn't made again. */
export const dismissSuggestion = async (id: string, by?: any) => {
	if (!mongoose.isValidObjectId(id)) throw new TenancyError(404, 'No such suggestion');
	const r = await SearchSuggestion.updateOne({ _id: id, status: 'open' }, { $set: { status: 'dismissed', decidedAt: new Date(), ...(by && { decidedBy: by }) } });
	if (!r.matchedCount) throw new TenancyError(404, 'No such open suggestion');
	return { ok: true };
};

/** A suggestion from the owner's own AI (SI-18's save_search_suggestion): checked, then saved for the panel. */
export const saveAiSuggestion = async (store: Store, body: any) => {
	const kind = body?.kind;
	if (!['synonym', 'redirect', 'rule'].includes(kind)) throw new TenancyError(400, 'kind is synonym, redirect or rule');
	const r = body?.record && typeof body.record === 'object' ? body.record : {};
	const list = (v: any) => (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => String(x).trim()).filter(Boolean).slice(0, 20);
	let record: any;
	let title: string;
	if (kind === 'synonym') {
		const words = list(r.words);
		const to = list(r.to);
		const oneWay = r.kind === 'one-way' || to.length > 0;
		if (!words.length || (oneWay && !to.length) || (!oneWay && words.length < 2)) throw new TenancyError(400, 'A synonym needs words (two or more), or words and to (one way)');
		record = { kind: oneWay ? 'one-way' : 'same', words, ...(oneWay && { to }), active: true };
		title = oneWay ? `Let “${words.join(', ')}” also find “${to.join(', ')}”` : `Treat ${words.map(w => `“${w}”`).join(', ')} as the same`;
	} else if (kind === 'redirect') {
		const queries = list(r.queries);
		const url = String(r.url || '').trim();
		if (!queries.length || !url) throw new TenancyError(400, 'A redirect needs queries and a url');
		record = { queries, url, match: r.match === 'contains' ? 'contains' : 'exact', active: true };
		title = `Send “${queries.join('”, “')}” to ${url}`;
	} else {
		const action = String(r.action || '');
		if (!['pin', 'boost', 'bury', 'hide', 'filter'].includes(action)) throw new TenancyError(400, 'A rule’s action is pin, boost, bury, hide or filter');
		const when = ['exact', 'contains', 'category', 'always'].includes(r.when) ? r.when : 'exact';
		const queries = list(r.queries);
		if ((when === 'exact' || when === 'contains') && !queries.length) throw new TenancyError(400, 'A rule for searches needs queries');
		record = { ...r, when, action, ...(queries.length && { queries }), active: true };
		delete record.source;
		title = String(body?.title || '').trim() || `${action[0].toUpperCase()}${action.slice(1)} for ${queries.length ? `“${queries.join('”, “')}”` : when}`;
	}
	const key = `ai:${kind}:${JSON.stringify(record).toLowerCase()}`.slice(0, 400);
	const fresh = await offer({ kind, source: 'your-ai', key, title: String(body?.title || '').trim().slice(0, 200) || title, why: String(body?.why || '').trim().slice(0, 500), record });
	const doc: any = await SearchSuggestion.findOne({ key }).lean();
	return { ok: true, fresh, suggestion: doc };
};
