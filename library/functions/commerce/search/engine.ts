/**
 * Store search — the engine (docs/search SI-04): a shopper's words → ranked products, with filters and their counts;
 * no words → a browse (a category page); a few letters → suggestions.
 *
 *   words → normalise → each word: known to the store? near spellings (typos)? Banglish key? a code?
 *         → candidates from the driver (documents with every word first, then some of the words, ≤ 2,000)
 *         → rank (rank.ts) → filters → sort → page
 *
 * Around it: query understanding (price phrases, sizes, brand names: SI-09), synonyms and redirects (SI-10), and no
 * dead ends — loosen step by step, "showing results for", did you mean, popular instead (SI-11, recover.ts).
 * Then the store's merchandising rules (SI-15, merch.ts): hide, show only, pin, boost / bury. `storeSearch` / `storeSuggest` run it for a store; the
 * public routes are SI-05's.
 */
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import type { Store } from '../store.js';
import { cleanFilters, facetCounts, passes, type FacetCounts, type Filters } from './facets.js';
import { codeKey, normaliseQuery } from './normalise.js';
import { explain, learnedBoost, rank, type Boost, type QToken, type Ranked } from './rank.js';
import { learnedFor, storeLearned } from './learn.js';
import { understand, understoodAnything, type Understood } from './understand.js';
import { clean } from './normalise.js';
import { searchSettingsOf, type SearchSettings } from './settings.js';
import { cachedVocab, completions, nearWords, typosFor, type Vocab } from './vocab.js';
import { nativeDriver } from './drivers/native.js';
import { countRedirect, countRules, findRedirect, NO_RULES, storeRules, type Rules } from './rules.js';
import { compileMerch, firedRules, merchOf, ruleLive, targets, withPins } from './merch.js';
import SearchDoc from '../../../models/tenancy/searchDoc.model.js';
import { popularStartingWith } from './events.js';
import { covering, fewerWords, nearestWord } from './recover.js';
import type { BrowseSort, Cond, SearchDriver } from './drivers/types.js';
import { rerank, RERANK_TOP } from './semantic/vector.js';
import { meaningAvailable } from './semantic/model.js';
import { storeMeaning } from './semantic/store.js';

/**
 * Search by meaning (SI-19, README SI23), as the engine is given it: the query's vector (null: too slow, or no model
 * yet — search goes on by words), how alike the query and some products are, and the nearest products.
 */
export type Meaning = {
	vector(q: string): Promise<ArrayLike<number> | null>;
	similar(qv: ArrayLike<number>, products: string[]): Promise<Map<string, number>>;
	nearest(qv: ArrayLike<number>, k: number): Promise<{ id: string; sim: number }[]>;
};
/** Products shown by meaning when nothing matched the words. */
const NEAREST = 24;

export type SearchSort = 'relevance' | BrowseSort;
export type SearchRequest = { q?: string; page?: number; limit?: number; sort?: SearchSort; filters?: Filters; facets?: boolean; explain?: boolean };
export type SearchResult = {
	doc: any[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	facets?: FacetCounts;
	/** The words as the engine read them, and the near spellings it tried. */
	/** The words as the engine read them, the spellings it tried, and the store's synonyms it used. */
	query: { words: string[]; typos: { word: string; tried: string[] }[]; synonyms?: { word: string; with: string[] }[] };
	/** A store redirect for this search (SI13): the page to open instead. */
	redirect?: { id: string; url: string };
	/** What the query asked for besides its words (SI8): shown as chips a shopper can remove. */
	understood?: UnderstoodOut;
	/**
	 * No product had every word (SI12), so these results are for other words: "No exact results for ‘red velvet
	 * saree’. Showing results for ‘velvet saree’." `typos`: spellings further away; `fewer words`: `dropped` left out;
	 * `some words`: no smaller set works, so products with any of `q`'s words (each ranked by how many it has).
	 */
	showing?: { q: string; reason: 'typos' | 'fewer words' | 'some words' | 'meaning'; dropped?: string[] };
	/** Nothing found at all: the nearest words the store has ("Did you mean …?"). */
	didYouMean?: string;
	/** Nothing found at all: products to show instead — popular in the category the query named, or in the store. */
	fallback?: { kind: 'category' | 'popular'; category?: { _id: string; name: string }; doc: any[] };
	/** With `explain`: the store's search rules this search set off (SI-15), and how many results are pinned. */
	rules?: { _id: string; name: string; action: string }[];
	pinned?: number;
	/** This search's id in the store's search log (SI17, public route only): sent back with clicks, the bag and the order. */
	searchId?: string;
	/** With `explain`: what search by meaning did — re-ranked the top results, found these by meaning, or wasn't used (and why). */
	meaning?: { used: 'reranked' | 'nearest' | 'no'; why?: string; moved?: number };
	ms: number;
};

export type UnderstoodOut = {
	words: string;
	price?: { gte?: number; lte?: number };
	sort?: string;
	inStock?: boolean;
	onSale?: boolean;
	options?: { name: string; value: string; as: 'filter' | 'boost' }[];
	brand?: { _id: string; name: string };
	category?: { _id: string; name: string };
	dropped?: string[];
	/** The query is the SKU or barcode of exactly this product: a storefront may go straight to it. */
	product?: any;
	/** A brand or size the query named left nothing, so it was set aside. */
	relaxed?: boolean;
};

/** The understood filters on top of the shopper's own (theirs win), and the lifts. */
const applyUnderstood = (u: Understood, filters: Filters, sort: SearchSort) => {
	const opts: Record<string, string[]> = {};
	for (const o of u.options.filter(o => o.as === 'filter')) opts[o.key] = [...(opts[o.key] || []), o.value];
	const hard: Filters = {
		...(u.brand && !filters.brands?.length && { brands: [u.brand._id] }),
		...(Object.keys(opts).length && { opts: { ...opts, ...(filters.opts || {}) } }),
	};
	const soft: Filters = {
		...(u.price && !filters.price && { price: u.price }),
		...(u.inStock && { inStock: true }),
		...(u.onSale && { onSale: true }),
	};
	const boosts: Boost[] = [
		...u.options.filter(o => o.as === 'boost').map(o => ({ name: `${o.name} ${o.label}`, x: 1.3, test: (d: any) => !!d.facets?.opts?.includes(`${o.key}=${o.value}`) })),
		...(u.category ? [{ name: `in ${u.category.name}`, x: 1.15, test: (d: any) => (d.facets?.categories || []).some((c: any) => String(c) === u.category!._id) }] : []),
	];
	return {
		all: cleanFilters({ ...filters, ...soft, ...hard }),
		withoutHard: cleanFilters({ ...filters, ...soft }),
		/** The shopper's own filters only: everything read from the words set aside. */
		own: filters,
		hasHard: Object.keys(hard).length > 0,
		hasSoft: Object.keys(soft).length > 0,
		sort: sort !== 'relevance' ? sort : ((u.sort as SearchSort) ?? 'relevance'),
		boosts,
	};
};

const understoodOut = (u: Understood, extra: Partial<UnderstoodOut> = {}): UnderstoodOut | undefined => {
	if (!understoodAnything(u) && !u.dropped.length && !extra.product && !extra.relaxed) return undefined;
	return {
		words: u.text,
		...(u.price && { price: u.price }),
		...(u.sort && { sort: u.sort }),
		...(u.inStock && { inStock: true }),
		...(u.onSale && { onSale: true }),
		...(u.options.length && { options: u.options.map(o => ({ name: o.name, value: o.label, as: o.as })) }),
		...(u.brand && { brand: u.brand }),
		...(u.category && { category: u.category }),
		...(u.dropped.length && { dropped: u.dropped }),
		...extra,
	};
};

const MAX_WORDS = 8;
const CAP = 2000;
const PARTIAL_BELOW = 200;
const PARTIAL_CAP = 600;
const MAX_LIMIT = 60;
/** Products shown instead when a search finds nothing (SI12). */
const FALLBACK = 8;

/* ---------------------------------------------------------------- planning */

const idfOf = (vocab: Vocab, df: number) => {
	if (!vocab.n || !df) return 1;
	const x = Math.log((vocab.n + 1) / (df + 1)) / Math.log(vocab.n + 1);
	return 0.6 + 0.8 * Math.max(0, Math.min(1, x));
};

/** The query's words, each with what may match it. `prefixLast`: the last word may be unfinished. */
export const planQuery = (q: string, vocab: Vocab, s: SearchSettings, { prefixLast = true, minPrefix = 2 } = {}, rules: Rules = NO_RULES) => {
	const nq = normaliseQuery(q);
	const seen = new Set<string>();
	const tokens = nq.tokens.filter(t => !seen.has(t.word) && seen.add(t.word)).slice(0, MAX_WORDS);
	const open = prefixLast && !/\s$/.test(String(q ?? ''));
	const plan: QToken[] = tokens.map((t, i) => {
		const syn = [...new Set([...(rules.synonyms.get(t.word) || []), ...(rules.synonyms.get(t.stem) || [])])].filter(x => x !== t.word && x !== t.stem);
		// A word the store doesn't have but whose synonym it does is known: no typos tried for it.
		const known = vocab.df.has(t.word) || vocab.df.has(t.stem) || syn.some(x => vocab.df.has(x));
		const wordy = t.kind === 'word' || t.kind === 'bn';
		let near: { word: string; typos: number }[] = [];
		if (!known && wordy) {
			const max = typosFor(t.word, s.typos);
			const byWord = nearWords(vocab, t.word, max);
			const byStem = t.stem !== t.word ? nearWords(vocab, t.stem, max) : [];
			const m = new Map<string, number>();
			for (const n of [...byWord, ...byStem]) m.set(n.word, Math.min(m.get(n.word) ?? 9, n.typos));
			near = [...m].map(([word, typos]) => ({ word, typos })).sort((a, b) => a.typos - b.typos).slice(0, 8);
		}
		const phonMode: QToken['phonMode'] =
			!s.banglish || !t.phon || !vocab.phon.has(t.phon) ? 'none' : t.kind === 'bn' || (!known && !near.length && s.typos !== 'off') ? 'any' : 'cross';
		const df = vocab.df.get(t.word) ?? vocab.df.get(t.stem) ?? Math.max(0, ...[...near.map(n => n.word), ...syn].map(w => vocab.df.get(w) || 0));
		return {
			...t,
			last: open && i === tokens.length - 1 && wordy,
			minPrefix,
			known,
			near,
			syn,
			phonMode,
			code: t.kind === 'code' || t.kind === 'num' ? codeKey(t.word) : null,
			idf: idfOf(vocab, df),
		};
	});
	return { plan, codes: nq.codes, words: tokens.map(t => t.word) };
};

/** A word's condition for the driver; null when nothing in the store could match it. */
const condOf = (t: QToken, vocab: Vocab): Cond | null => {
	const prefix = t.last && [...t.word].length >= t.minPrefix ? t.word : undefined;
	const usePhon = t.phonMode !== 'none';
	const possible = t.known || t.near.length || t.syn.length || usePhon || t.code || (prefix && completions(vocab, prefix, 1).length);
	if (!possible) return null;
	return {
		terms: [...new Set([t.word, t.stem, ...t.near.map(n => n.word), ...t.syn])],
		...(prefix && { prefix }),
		...(usePhon && { phon: t.phon }),
		...(t.code && { code: t.code }),
	};
};

/** The words as the best result spells them: a typo'd word as the store writes it ("jaket" → "jacket"). */
const spelled = (pl: QToken[], found: { d: any; r: Ranked }[]) => {
	const top = [...found].sort((a, b) => b.r.score - a.r.score)[0];
	return pl.map(t => top?.r.hits.find(h => h.token === t.word && (h.kind === 'typo1' || h.kind === 'typo2'))?.matched ?? t.word).join(' ');
};

/* -------------------------------------------------------------------- cache */

const CACHE_MS = 30 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: any }>();
const cached = async <T>(key: string | null, make: () => Promise<T>): Promise<T> => {
	if (!key) return make();
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_MS) {
		cache.delete(key);
		cache.set(key, hit); // most recently used last
		return hit.value;
	}
	const value = await make();
	cache.set(key, { at: Date.now(), value });
	while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
	return value;
};
export const clearSearchCache = () => cache.clear();

/* -------------------------------------------------------------------- search */

const cardOf = (d: any, r?: Ranked | null, withExplain = false, pin = 0) => ({
	_id: d.product,
	...(d.card || {}),
	...(withExplain && r && { score: +r.score.toFixed(4), explain: explain(r) }),
	...(withExplain && pin && { pinned: pin, ...(!r && { explain: `pinned #${pin} by a search rule` }) }),
});
const pid = (d: any) => String(d?.product ?? '');
/** Popularity as one number, for ordering a category page with boosts (SI-15). */
const popularity = (d: any) => 1 + (Number(d.signals?.sold30) || 0) + 0.1 * (Number(d.signals?.views) || 0) + 0.1 * (Number(d.signals?.wishes) || 0);

const orderBy: Record<SearchSort, (a: { d: any; r: Ranked }, b: { d: any; r: Ranked }) => number> = {
	relevance: (a, b) => b.r.score - a.r.score || String(a.d.card?.name || '').length - String(b.d.card?.name || '').length,
	popular: (a, b) => (b.d.signals?.sold30 || 0) - (a.d.signals?.sold30 || 0) || b.r.score - a.r.score,
	price: (a, b) => (a.d.facets?.price ?? Infinity) - (b.d.facets?.price ?? Infinity),
	'-price': (a, b) => (b.d.facets?.price ?? -Infinity) - (a.d.facets?.price ?? -Infinity),
	newest: (a, b) => new Date(b.d.signals?.createdAt || 0).getTime() - new Date(a.d.signals?.createdAt || 0).getTime(),
	name: (a, b) => String(a.d.card?.name || '').localeCompare(String(b.d.card?.name || '')),
};

/** One search with a driver and settings (`version`: the store's index version — with it, answers are cached 30 s). */
export const searchWith = async (driver: SearchDriver, s: SearchSettings, req: SearchRequest, version?: number, rules: Rules = NO_RULES, meaning?: Meaning): Promise<SearchResult> => {
	const started = Date.now();
	const page = Math.max(1, Math.floor(Number(req.page) || 1));
	const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(req.limit) || 24)));
	const sort: SearchSort = (['relevance', 'popular', 'price', '-price', 'newest', 'name'] as const).includes(req.sort as any) ? (req.sort as SearchSort) : 'relevance';
	const filters = cleanFilters(req.filters);
	const key = version == null ? null : `${driver.key}:${version}:${JSON.stringify([req.q ?? '', page, limit, sort, filters, !!req.facets, !!req.explain, s])}`;
	return cached(key, async () => {
		const hide = s.outOfStock === 'hide';
		const q = String(req.q ?? '').slice(0, 100);
		const vocab = await cachedVocab(driver.key, () => driver.vocabulary());
		// Prices, sorting, sizes, brands… out of the words first (SI8); what's left is matched.
		const u = understand(q, vocab.knows);
		const ua = applyUnderstood(u, filters, sort);
		const { plan, codes, words } = planQuery(u.text, vocab, s, {}, rules);
		const redirect = findRedirect(rules, q) || undefined;
		// The store's rules (SI-15): pins and boosts give way to a sort the shopper picked; hide and show only don't.
		const browsing = !plan.length && !codes.filter(Boolean).length;
		const m = merchOf(firedRules(rules.merch || [], browsing ? '' : q, filters.categories));
		const ordered = ua.sort === 'relevance';
		const boosts = [...ua.boosts, ...(ordered ? m.boosts : [])];
		const pins = ordered ? m.pins : [];
		const rulesOut = req.explain && m.fired.length ? { rules: m.fired.map(r => ({ _id: r.id, name: r.name, action: r.action })) } : {};
		const pinnedDocs = async (have: Set<string>, f: Filters) => {
			const missing = pins.filter(id => !have.has(id));
			if (!missing.length || !driver.byProducts) return [];
			return (await driver.byProducts(missing, hide)).filter(d => !m.hidden(d) && passes(d, f));
		};
		const synonyms = plan.filter(t => t.syn.length).map(t => ({ word: t.word, with: t.syn.filter((x, i, a) => a.indexOf(x) === i) }));
		const typos = plan.filter(t => t.near.length).map(t => ({ word: t.word, tried: t.near.map(n => n.word) }));

		if (browsing) {
			// No words (or only a price, a sort…): a browse.
			// With rules, the whole page set is fetched and ordered here (≤ 2,000), else the database pages it.
			const withRules = m.fired.length > 0;
			const browse = (f: Filters) =>
				driver.browse({ hideOutOfStock: hide, filters: f, sort: ua.sort === 'relevance' ? 'popular' : ua.sort, skip: withRules ? 0 : (page - 1) * limit, limit: withRules ? CAP : limit, facets: !!req.facets });
			let b = await browse(ua.all);
			let used = ua.all;
			const relaxed = !b.total && ua.hasHard;
			if (relaxed) (b = await browse(ua.withoutHard)), (used = ua.withoutHard);
			if (withRules) {
				const beyond = Math.max(0, b.total - b.docs.length);
				let docs = m.filter(
					b.docs.filter(d => !m.hidden(d)),
					d => d
				);
				if (ordered && boosts.length) {
					const x = (d: any) => boosts.reduce((acc, bo) => (bo.test(d) ? acc * bo.x : acc), 1);
					docs = docs.map((d, i) => ({ d, i, s: popularity(d) * x(d) })).sort((a, b2) => b2.s - a.s || a.i - b2.i).map(o => o.d);
				}
				const p = withPins(docs, pins, pid, await pinnedDocs(new Set(docs.map(pid)), used));
				const pinned = p.pinned;
				const total = p.list.length + beyond;
				return {
					doc: p.list.slice((page - 1) * limit, page * limit).map((d, i) => cardOf(d, null, req.explain, (page - 1) * limit + i < pinned ? (page - 1) * limit + i + 1 : 0)),
					total,
					page,
					limit,
					totalPages: Math.max(1, Math.ceil(total / limit)),
					...(req.facets && { facets: facetCounts((b.facetDocs || []).filter(d => !m.hidden(d)), used) }),
					query: { words: [], typos: [] },
					...(redirect && { redirect }),
					...(q.trim() && { understood: understoodOut(u, relaxed ? { relaxed } : {}) }),
					...rulesOut,
					...(req.explain && pinned && { pinned }),
					ms: Date.now() - started,
				};
			}
			return {
				doc: b.docs.map(d => cardOf(d)),
				total: b.total,
				page,
				limit,
				totalPages: Math.max(1, Math.ceil(b.total / limit)),
				...(req.facets && { facets: facetCounts(b.facetDocs || [], used) }),
				query: { words: [], typos: [] },
				...(redirect && { redirect }),
				...(q.trim() && { understood: understoodOut(u, relaxed ? { relaxed } : {}) }),
				ms: Date.now() - started,
			};
		}

		const now = Date.now();
		// Search by meaning: the query's vector is made while the words are searched (it's only waited for later).
		const mean = s.semantic && meaning ? meaning : undefined;
		const qvP = mean ? mean.vector(u.text || q).catch(() => null) : Promise.resolve(null);
		let meaningOut: SearchResult['meaning'] = mean ? undefined : { used: 'no', why: s.semantic ? 'the model isn’t on this server' : 'turned off for this store' };
		// What shoppers taught the store for this search (SI16): only on relevance, like the rules' boosts.
		const wordBoosts = [...boosts, ...(ordered ? learnedBoost(learnedFor(rules.learned, q), s) : [])];
		const found = async (pl: QToken[]) => {
			const conds = pl.map(t => condOf(t, vocab)).filter((c): c is Cond => !!c);
			const raw = await driver.candidates({ hideOutOfStock: hide, all: conds, codes: codes.filter(Boolean), cap: CAP, partialBelow: PARTIAL_BELOW, partialCap: PARTIAL_CAP });
			// Rules: hidden products never come back; "show only" keeps its products, unless that leaves none.
			const docs = m.filter(
				raw.filter(d => !m.hidden(d)),
				d => d
			);
			const out: { d: any; r: Ranked }[] = [];
			for (const d of docs) {
				const r = rank(pl, d, s, now, wordBoosts);
				if (r) out.push({ d, r });
			}
			return out;
		};
		let ranked = await found(plan);
		let used = ua.all;
		let relaxed = false;
		let showing: SearchResult['showing'];
		let didYouMean: string | undefined;
		let fallback: SearchResult['fallback'];
		let typosOut = typos;
		// The whole query is one product's SKU or barcode.
		const whole = codeKey(clean(q));
		const byCode = (r: typeof ranked) => (whole ? r.filter(x => x.d.codes?.includes(whole)) : []);
		const everyWord = (r: typeof ranked, f: Filters) => r.some(x => (x.r.coverage === 1 || x.r.hits.some(h => h.kind === 'code')) && passes(x.d, f));
		// Filters read from the words, loosest last: a brand or size first, then a price / in stock / on sale too.
		const loosen = [ua.all, ...(ua.hasHard ? [ua.withoutHard] : []), ...(ua.hasHard || ua.hasSoft ? [ua.own] : [])];
		const firstWith = (r: typeof ranked, test: (r: typeof ranked, f: Filters) => boolean) => loosen.find(f => test(r, f));

		const nearestByMeaning = async () => {
			const qv = await qvP;
			if (!qv) return (meaningOut = { used: 'no', why: 'the query wasn’t ready in time' }), false;
			const near = await mean!.nearest(qv, NEAREST);
			if (!near.length || !driver.byProducts) return (meaningOut = { used: 'no', why: 'nothing close enough in meaning' }), false;
			const sim = new Map(near.map(n => [n.id, n.sim]));
			const docs = (await driver.byProducts(near.map(n => n.id), hide)).filter(d => !m.hidden(d) && passes(d, ua.own));
			if (!docs.length) return (meaningOut = { used: 'no', why: 'nothing close enough in meaning' }), false;
			ranked = docs.map(d => {
				const x = sim.get(pid(d)) || 0;
				return { d, r: { score: x, relevance: x, coverage: 0, hits: [], multipliers: [{ name: 'close in meaning', x }] } };
			});
			used = ua.own;
			relaxed = false;
			showing = { q: u.text || q, reason: 'meaning' };
			meaningOut = { used: 'nearest' };
			return true;
		};

		// No dead ends (SI12): nothing with every word → loosen, step by step, and say so.
		if (!everyWord(ranked, used)) {
			const f = firstWith(ranked, everyWord);
			if (f) (used = f), (relaxed = f !== ua.all);
			else if (s.typos === 'normal') {
				// 1. Spellings further away.
				// Two typos only between words of six letters or more ("kicks" must not become "kit").
				const loose = planQuery(u.text, vocab, { ...s, typos: 'loose' }, {}, rules).plan.map(t => ({
					...t,
					near: t.near.filter(n => n.typos === 1 || Math.min([...t.word].length, [...n.word].length) >= 6),
				}));
				if (loose.some((t, i) => t.near.length > plan[i].near.length)) {
					const r2 = await found(loose);
					const f2 = firstWith(r2, everyWord);
					if (f2) {
						ranked = r2;
						(used = f2), (relaxed = f2 !== ua.all);
						typosOut = loose.filter(t => t.near.length).map(t => ({ word: t.word, tried: t.near.map(n => n.word) }));
						showing = { q: spelled(loose, r2.filter(x => x.r.coverage === 1 && passes(x.d, f2))), reason: 'typos' };
					}
				}
			}
			if (!showing && !everyWord(ranked, used)) {
				// 2. Fewer words: the most words some products have all of, the rarest kept.
				const fm = firstWith(ranked, (r, f) => !!fewerWords(plan, r.filter(x => passes(x.d, f))));
				const fw = fm && fewerWords(plan, ranked.filter(x => passes(x.d, fm)));
				if (fm && fw) {
					const sub = fw.keep.map(i => plan[i]);
					ranked = covering(plan, fw.keep, ranked).map(x => ({ d: x.d, r: rank(sub, x.d, s, now, wordBoosts)! }));
					(used = fm), (relaxed = fm !== ua.all);
					showing = { q: spelled(sub, ranked.filter(x => passes(x.d, fm))), reason: 'fewer words', dropped: fw.dropped.map(i => plan[i].word) };
				} else if (firstWith(ranked, (r, f) => r.some(x => passes(x.d, f)))) {
					const f3 = firstWith(ranked, (r, f) => r.some(x => passes(x.d, f)))!;
					// 3. Products with some of the words ("jacket coat boots": each has one): shown, and said.
					(used = f3), (relaxed = f3 !== ua.all);
					const hit = new Set(ranked.filter(x => passes(x.d, f3)).flatMap(x => x.r.hits.map(h => h.token)));
					if (!byCode(ranked).length)
						showing = { q: plan.filter(t => hit.has(t.word)).map(t => t.word).join(' '), reason: 'some words', dropped: plan.filter(t => !hit.has(t.word)).map(t => t.word) };
				} else {
					// 4. Nothing by its words: the nearest words the store has ("Did you mean …?")…
					const near = plan.map(t => (t.known || t.code ? t.word : nearestWord(vocab, t.word) ?? t.word));
					if (near.some((w, i) => w !== plan[i].word)) didYouMean = near.join(' ');
				}
				// …and the products closest in meaning (SI-19, at least 0.45 alike), else something to look at.
				if (!showing && !ranked.some(x => passes(x.d, used)) && !(mean && (await nearestByMeaning()))) {
					const cat = u.category;
					const pop = async (f: Filters) => (await driver.browse({ hideOutOfStock: hide, filters: f, sort: 'popular', skip: 0, limit: FALLBACK, facets: false })).docs.map(d => cardOf(d));
					const inCat = cat ? await pop({ categories: [cat._id] }) : [];
					fallback = inCat.length ? { kind: 'category', category: cat, doc: inCat } : { kind: 'popular', doc: await pop({}) };
					if (!fallback.doc.length) fallback = undefined;
				}
			}
		}

		let sorted = ranked.filter(x => passes(x.d, used));
		sorted.sort((a, b) => orderBy[ua.sort](a, b) || orderBy.relevance(a, b) || String(a.d.product).localeCompare(String(b.d.product)));
		// Meaning mixed into the top 50 text results at 25% (SI-19): on relevance only, and only if the vector came in time.
		if (mean && showing?.reason !== 'meaning' && ua.sort === 'relevance' && sorted.length > 1) {
			const qv = await qvP;
			if (!qv) meaningOut = { used: 'no', why: 'the query wasn’t ready in time' };
			else {
				const sims = await mean.similar(qv, sorted.slice(0, RERANK_TOP).map(x => pid(x.d)));
				const before = sorted.slice(0, RERANK_TOP).map(x => pid(x.d));
				const r = rerank(sorted, x => x.r.score, x => sims.get(pid(x.d)) ?? null);
				const byId = new Map(r.mixed.map(o => [pid(o.x.d), o]));
				sorted = r.items.map(x => {
					const o = byId.get(pid(x.d));
					if (!o || o.m == null) return x;
					return { d: x.d, r: { ...x.r, multipliers: [...x.r.multipliers, { name: `meaning ${o.m.toFixed(2)}`, x: o.t > 0 ? o.mix / o.t : 1 }] } };
				});
				meaningOut = { used: 'reranked', moved: sorted.slice(0, RERANK_TOP).filter((x, i) => pid(x.d) !== before[i]).length };
			}
		}
		// Pins (SI-15): the rule's products at the top, in its order — found by the words or not.
		const pinnedX = await pinnedDocs(new Set(sorted.map(x => pid(x.d))), used);
		const wp = withPins<{ d: any; r: Ranked | null }>(sorted, pins, x => pid(x.d), pinnedX.map(d => ({ d, r: null })));
		const matched = wp.list;
		const pinned = wp.pinned;
		if (pinned) (fallback = undefined), (didYouMean = undefined);
		const total = matched.length;
		const exact = byCode(sorted);
		const product = exact.length === 1 ? cardOf(exact[0].d) : undefined;
		return {
			doc: matched.slice((page - 1) * limit, page * limit).map((x, i) => cardOf(x.d, x.r, req.explain, (page - 1) * limit + i < pinned ? (page - 1) * limit + i + 1 : 0)),
			total,
			page,
			limit,
			totalPages: Math.max(1, Math.ceil(total / limit)),
			...(req.facets && { facets: facetCounts(ranked.map(x => x.d), used) }),
			query: { words, typos: typosOut, ...(synonyms.length && { synonyms }) },
			...(redirect && { redirect }),
			...((): { understood?: UnderstoodOut } => {
				const out = understoodOut(u, { ...(product && { product }), ...(relaxed && { relaxed }) });
				return out ? { understood: out } : {};
			})(),
			...(showing && { showing }),
			...(didYouMean && { didYouMean }),
			...(fallback && { fallback }),
			...rulesOut,
			...(req.explain && pinned && { pinned }),
			...(req.explain && meaningOut && { meaning: meaningOut }),
			ms: Date.now() - started,
		};
	});
};

/* --------------------------------------------------------------- suggestions */

export type Suggestions = {
	queries: string[];
	products: any[];
	categories: { _id: any; name: string; count: number }[];
	brands: { _id: any; name: string; count: number }[];
	ms: number;
};

/** As the shopper types (SI11): finished queries, a few products, categories and brands. */
export const suggestWith = async (driver: SearchDriver, s: SearchSettings, q: string, version?: number, { products = 4 } = {}, rules: Rules = NO_RULES): Promise<Suggestions> => {
	const started = Date.now();
	const text = String(q ?? '').slice(0, 100);
	const key = version == null ? null : `${driver.key}:${version}:suggest:${text}:${products}:${JSON.stringify(s)}`;
	return cached(key, async () => {
		const vocab = await cachedVocab(driver.key, () => driver.vocabulary());
		const { plan, codes, words } = planQuery(understand(text, vocab.knows).text || text, vocab, s, { minPrefix: 1 }, rules);
		if (!plan.length) return { queries: [], products: [], categories: [], brands: [], ms: Date.now() - started };
		const conds = plan.map(t => condOf(t, vocab)).filter((c): c is Cond => !!c);
		const docs = await driver.candidates({ hideOutOfStock: s.outOfStock === 'hide', all: conds, codes: codes.filter(Boolean), cap: 300, partialBelow: 0, partialCap: 0 });
		const ranked = docs
			.map(d => ({ d, r: rank(plan, d, s) }))
			.filter((x): x is { d: any; r: Ranked } => !!x.r && x.r.coverage === 1)
			.sort((a, b) => orderBy.relevance(a, b));

		// Finished queries: the last word completed with the store's own words, commonest first.
		const last = plan[plan.length - 1];
		const head = words.slice(0, -1).join(' ');
		const queries = last?.last ? completions(vocab, last.word, 6).map(c => (head ? `${head} ${c.word}` : c.word)) : [];

		const count = (pick: (d: any) => any) => {
			const m = new Map<string, { _id: any; name: string; count: number }>();
			for (const { d } of ranked) {
				const x = pick(d);
				if (!x?._id || !x.name) continue;
				const k = String(x._id);
				m.set(k, { _id: x._id, name: x.name, count: (m.get(k)?.count || 0) + 1 });
			}
			return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
		};
		return {
			queries,
			products: ranked.slice(0, products).map(x => cardOf(x.d)),
			categories: count(d => d.card?.category).slice(0, 3),
			brands: count(d => d.card?.brand).slice(0, 2),
			ms: Date.now() - started,
		};
	});
};

/* -------------------------------------------------------------- for a store */

/** The store's rules with what it learned (SI16), when learning is on. */
const withLearned = async (rules: Rules, settings: SearchSettings, version: number): Promise<Rules> =>
	settings.learning ? { ...rules, learned: await storeLearned(version).catch(() => undefined) } : rules;

const storeState = async () => {
	const c: any = await CommerceSettings.findOne({}, { search: 1 }).lean();
	return { settings: searchSettingsOf(c?.search), version: Number(c?.search?.index?.version) || 0 };
};

/** A search in the current store (its scope), on the native driver. */
export const storeSearch = async (store: Store, req: SearchRequest) => {
	const { settings, version } = await storeState();
	const rules = await withLearned(await storeRules(store, version), settings, version);
	const driver = nativeDriver();
	const r = await searchWith(driver, settings, req, version, rules, settings.semantic && meaningAvailable() ? storeMeaning(driver.key, version) : undefined);
	if (!req.explain) {
		if (r.redirect) countRedirect(store, r.redirect.id);
		// Rules that answered a search are counted once per search (its first page).
		if (rules.merch?.length && (Number(req.page) || 1) <= 1) {
			const fired = firedRules(rules.merch, r.query.words.length ? String(req.q ?? '') : '', cleanFilters(req.filters).categories);
			countRules(store, fired.map(x => x.id));
		}
	}
	return r;
};

/**
 * Suggestions in the current store. The store's own popular searches that start with what's typed come first (SI11:
 * only searches 3 visitors or more made, that found something), then the store's words.
 */
export const storeSuggest = async (store: Store, q: string) => {
	const { settings, version } = await storeState();
	const [r, popular] = await Promise.all([suggestWith(nativeDriver(), settings, q, version, {}, await storeRules(store, version)), popularStartingWith(q).catch(() => [])]);
	if (!popular.length) return r;
	return { ...r, queries: [...new Set([...popular, ...r.queries])].slice(0, 6) };
};

/* ------------------------------------------------------- rules in the panel */

/**
 * A search rule tried before it's saved (SI-15, the panel's rule editor): the same search without it and with it,
 * explained. `rule` is a Search rule record as the form holds it; its dates and switch are ignored, so a rule for next
 * week shows what it will do. `q` is the search to try (a category rule tries its category page).
 */
export const previewRule = async (store: Store, rule: any, { q = '', limit = 12 }: { q?: string; limit?: number } = {}) => {
	const { settings, version } = await storeState();
	const rules = await withLearned(await storeRules(store, version), settings, version);
	const id = String(rule?._id ?? '');
	const others = (rules.merch || []).filter(r => !id || r.id !== id);
	const [mine] = compileMerch([{ ...rule, _id: id || 'preview', name: String(rule?.name || '').trim() || 'This rule', active: true, startsAt: null, endsAt: null }]);
	const words = rule?.when === 'category' ? '' : String(q || (Array.isArray(rule?.queries) ? rule.queries[0] : '') || '');
	const req: SearchRequest = {
		q: words,
		limit: Math.min(24, Math.max(1, Number(limit) || 12)),
		explain: true,
		...(rule?.when === 'category' && rule?.category && { filters: { categories: [String(rule.category?._id ?? rule.category)] } }),
	};
	const driver = nativeDriver();
	const [before, after] = await Promise.all([
		searchWith(driver, settings, req, undefined, { ...rules, merch: others }),
		mine ? searchWith(driver, settings, req, undefined, { ...rules, merch: [...others, mine].sort((a, b) => order(a) - order(b)) }) : Promise.resolve(null),
	]);
	const short = (r: SearchResult | null) => r && { doc: r.doc, total: r.total, rules: r.rules || [], pinned: r.pinned || 0 };
	return {
		q: words,
		category: req.filters?.categories?.[0] || null,
		ready: !!mine,
		// Why the rule does nothing yet: no searches, no category, nothing picked.
		...(mine ? {} : { missing: missingOf(rule) }),
		fires: !!mine && !!after?.rules?.some(r => r._id === mine.id),
		before: short(before),
		after: short(after),
	};
};
const order = (r: { action: string }) => ({ hide: 0, filter: 1, pin: 2, boost: 3, bury: 3 })[r.action as 'hide'] ?? 4;
const missingOf = (r: any) => {
	if (!r?.action) return 'Pick what it does';
	if ((r.when === 'exact' || r.when === 'contains') && !(Array.isArray(r.queries) ? r.queries : []).filter((x: any) => String(x).trim()).length) return 'Type a search it’s for';
	if (r.when === 'category' && !r.category) return 'Pick the category page';
	return r.action === 'pin' ? 'Pick the products to pin' : 'Pick products, brands, categories, collections or “on sale”';
};

/**
 * The store's Search rules that touch a search (`q`: it sets them off) or a product (they name it, its brand, category
 * or collection, or it's on sale and they say so) — on or not, for the Insights drawer and the product's Search tab.
 */
export const rulesTouching = async (store: Store, { q, product }: { q?: string; product?: string }) => {
	if (!store.installed.searchRule) return [];
	const rows: any[] = await store.M('searchRule').find({}).sort({ createdAt: -1 }).limit(500).lean();
	const doc = product ? await SearchDoc.findOne({ product }, { product: 1, facets: 1 }).lean() : null;
	const out: any[] = [];
	for (const row of rows) {
		const [c] = compileMerch([{ ...row, active: true, startsAt: null, endsAt: null }]);
		if (!c) continue;
		const hit = q != null && q !== '' ? firedRules([c], q).length > 0 : product ? (doc ? targets(c, doc) : c.products.includes(String(product))) : false;
		if (!hit) continue;
		out.push({ _id: row._id, name: row.name, when: row.when, action: row.action, active: row.active !== false, live: ruleLive(row), startsAt: row.startsAt, endsAt: row.endsAt, hits: row.hits || 0 });
	}
	return out;
};
