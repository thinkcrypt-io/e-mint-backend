/**
 * Store search — the store's own rules (docs/search SI13, SI-10): synonyms (words that mean the same) and redirects
 * (searches that open a page). Both are store models the owner edits (Search synonyms, Search redirects); here they're
 * compiled for the engine, cached per store and index version, kept named, and the starter packs are switched on/off.
 */
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import { currentScope } from '../../tenantScope.function.js';
import { TenancyError } from '../../tenancy.function.js';
import type { Store } from '../store.js';
import { normalise, type Token } from './normalise.js';
import { SYNONYM_PACKS } from './packs/synonyms.js';
import { compileMerch, isSentenceName, ruleSentence, type CompiledRule } from './merch.js';

export type CompiledRedirect = { id: string; url: string; match: 'exact' | 'contains'; queries: string[][] };
/** The store's synonyms and redirects (SI-10), and its merchandising rules (SI-15, merch.ts). */
export type Rules = { synonyms: Map<string, Set<string>>; redirects: CompiledRedirect[]; merch?: CompiledRule[] };
export const NO_RULES: Rules = { synonyms: new Map(), redirects: [], merch: [] };

/** A synonym entry as one word, or null (several words: not matched yet — the engine works word by word). */
const one = (w: any): Token | null => {
	const n = normalise(String(w ?? ''));
	return n.tokens.length === 1 ? n.tokens[0] : null;
};
const asList = (v: any): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map(x => String(x).trim()).filter(Boolean);

/** word or stem → the words (and stems) it also finds. */
export const compileSynonyms = (rows: any[]) => {
	const m = new Map<string, Set<string>>();
	const link = (from: Token, to: Token) => {
		for (const k of new Set([from.word, from.stem]))
			for (const v of new Set([to.word, to.stem])) {
				if (k === v || v === from.word || v === from.stem) continue;
				if (!m.has(k)) m.set(k, new Set());
				m.get(k)!.add(v);
			}
	};
	for (const r of rows) {
		if (r?.active === false) continue;
		const words = asList(r.words).map(one).filter((t): t is Token => !!t);
		if (r.kind === 'one-way') {
			const to = asList(r.to).map(one).filter((t): t is Token => !!t);
			for (const f of words) for (const t of to) link(f, t);
		} else for (const a of words) for (const b of words) if (a.word !== b.word) link(a, b);
	}
	return m;
};

/** The words of a redirect's search, as stems in order. */
const phrase = (q: string) => normalise(q).tokens.map(t => t.stem);

export const compileRedirects = (rows: any[], now = Date.now()): CompiledRedirect[] =>
	rows
		.filter(r => r?.active !== false && r?.url && (!r.startsAt || new Date(r.startsAt).getTime() <= now) && (!r.endsAt || new Date(r.endsAt).getTime() + 24 * 3600 * 1000 > now))
		.map(r => ({ id: String(r._id ?? ''), url: String(r.url).trim(), match: r.match === 'contains' ? ('contains' as const) : ('exact' as const), queries: asList(r.queries).map(phrase).filter(p => p.length) }))
		.filter(r => r.queries.length);

/** The redirect a search should follow, if any: the first whose search it is (exact) or holds (contains). */
export const findRedirect = (rules: Rules, q: string) => {
	const words = phrase(q);
	if (!words.length) return null;
	for (const r of rules.redirects)
		for (const p of r.queries) {
			const hit =
				r.match === 'exact'
					? p.length === words.length && p.every((w, i) => w === words[i])
					: words.some((_, i) => i + p.length <= words.length && p.every((w, k) => w === words[i + k]));
			if (hit) return { id: r.id, url: r.url };
		}
	return null;
};

/* ------------------------------------------------------------------ loading */

const cache = new Map<string, { at: number; rules: Rules }>();
const TTL_MS = 5 * 60 * 1000;

/** The store's compiled rules, cached per index version (a rule saved bumps it). */
export const storeRules = async (store: Store, version: number): Promise<Rules> => {
	const key = `${currentScope()?.project}:${version}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.rules;
	const [syn, red, merch] = await Promise.all([
		store.installed.searchSynonym ? store.M('searchSynonym').find({ active: { $ne: false } }).lean() : Promise.resolve([] as any[]),
		store.installed.searchRedirect ? store.M('searchRedirect').find({ active: { $ne: false } }).lean() : Promise.resolve([] as any[]),
		store.installed.searchRule ? store.M('searchRule').find({ active: { $ne: false } }).sort({ order: 1, createdAt: 1 }).lean() : Promise.resolve([] as any[]),
	]);
	const rules = { synonyms: compileSynonyms(syn as any[]), redirects: compileRedirects(red as any[]), merch: compileMerch(merch as any[]) };
	cache.set(key, { at: Date.now(), rules });
	if (cache.size > 300) cache.delete(cache.keys().next().value as string);
	return rules;
};

/** A redirect followed: counted, in the background. */
export const countRedirect = (store: Store, id: string) => {
	if (!id || !store.installed.searchRedirect) return;
	store
		.M('searchRedirect')
		.updateOne({ _id: id }, { $inc: { hits: 1 } }, { timestamps: false })
		.catch(() => undefined);
};

/** Search rules that answered a search: counted, in the background (SI-15). */
export const countRules = (store: Store, ids: string[]) => {
	if (!ids.length || !store.installed.searchRule) return;
	store
		.M('searchRule')
		.updateMany({ _id: { $in: ids } }, { $inc: { hits: 1 }, $set: { lastHitAt: new Date() } }, { timestamps: false })
		.catch(() => undefined);
};

/** A rule's names for its sentence: its products, brands, categories, collections and category page. */
export const ruleNames = async (store: Store, r: any) => {
	const names = async (key: string, v: any) => {
		const list = (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => x?._id ?? x).filter(Boolean);
		if (!list.length || !store.installed[key as keyof typeof store.installed]) return [];
		const rows: any[] = await store.M(key as any).find({ _id: { $in: list } }, { name: 1 }).lean();
		const by = new Map(rows.map(x => [String(x._id), x.name]));
		return list.map((id: any) => by.get(String(id))).filter(Boolean) as string[];
	};
	const [products, brands, categories, collections, category] = await Promise.all([
		names('product', r.products),
		names('brand', r.brands),
		names('category', r.categories),
		names('collection', r.collections),
		names('category', r.category),
	]);
	return { products, brands, categories, collections, category: category[0] };
};

const bump = () => CommerceSettings.updateOne({}, { $inc: { 'search.index.version': 1 } });

/** From a store record's save or delete (fireCommerce): a rule changed — searches see it now; a nameless one is named. */
export const rulesChanged = async (store: Store, model: string, doc: any, event: string) => {
	const syn = store.is('searchSynonym', model);
	const red = store.is('searchRedirect', model);
	const rule = !!store.installed.searchRule && store.is('searchRule', model);
	if (!syn && !red && !rule) return false;
	if (rule) {
		// A rule without a name is named by its sentence: “Searches for “dress”: boost collection Eid ×2”. A name that is
		// such a sentence is written again on every save, so it keeps saying what the rule does.
		const named = String(doc?.name || '').trim();
		if (event !== 'delete' && (!named || isSentenceName(named))) {
			const name = ruleSentence(doc, await ruleNames(store, doc));
			if (name !== named) await store.M('searchRule').updateOne({ _id: doc._id }, { $set: { name } }, { timestamps: false });
		}
	} else if (event !== 'delete' && !String(doc?.name || '').trim()) {
		const name = asList(syn ? doc.words : doc.queries).join(', ').slice(0, 120);
		if (name) await store.M(syn ? 'searchSynonym' : 'searchRedirect').updateOne({ _id: doc._id }, { $set: { name } }, { timestamps: false });
	}
	await bump();
	return true;
};

/* -------------------------------------------------------------------- packs */

const packRows = (id: string) => {
	const p = SYNONYM_PACKS.find(x => x.id === id)!;
	return [
		...p.same.map(words => ({ name: words.join(', '), kind: 'same', words, active: true, source: 'pack', pack: id })),
		...(p.oneWay || []).map(([from, to]) => ({ name: `${from.join(', ')} → ${to.join(', ')}`, kind: 'one-way', words: from, to, active: true, source: 'pack', pack: id })),
	];
};

/** Each starter pack, and how many of its synonyms this store has. */
export const packList = async (store: Store) => {
	const have = new Map<string, number>();
	if (store.installed.searchSynonym)
		for (const r of (await store.M('searchSynonym').find({ source: 'pack' }, { pack: 1 }).lean()) as any[]) have.set(r.pack, (have.get(r.pack) || 0) + 1);
	return SYNONYM_PACKS.map(p => ({ id: p.id, name: p.name, about: p.about, size: p.same.length + (p.oneWay?.length || 0), installed: have.get(p.id) || 0, on: (have.get(p.id) || 0) > 0 }));
};

/** Switches a pack on (its synonyms become the store's own, source "pack") or off (they go). */
export const setPack = async (store: Store, id: string, on: boolean) => {
	if (!SYNONYM_PACKS.some(p => p.id === id)) throw new TenancyError(404, 'There’s no starter pack by that name');
	if (!store.installed.searchSynonym) throw new TenancyError(409, 'Upgrade the store first: it has no Search synonyms yet', 'store_upgrade_needed');
	const M = store.M('searchSynonym');
	if (on) {
		const there = new Set(((await M.find({ source: 'pack', pack: id }, { name: 1 }).lean()) as any[]).map(r => r.name));
		const rows = packRows(id).filter(r => !there.has(r.name));
		if (rows.length) await M.insertMany(rows);
	} else await M.deleteMany({ source: 'pack', pack: id });
	await bump();
	return packList(store);
};
