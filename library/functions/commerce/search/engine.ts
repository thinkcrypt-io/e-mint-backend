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
 * Merchandising rules (SI-15) come later. `storeSearch` / `storeSuggest` run it for a store; the
 * public routes are SI-05's.
 */
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import type { Store } from '../store.js';
import { cleanFilters, facetCounts, passes, type FacetCounts, type Filters } from './facets.js';
import { codeKey, normaliseQuery } from './normalise.js';
import { explain, rank, type Boost, type QToken, type Ranked } from './rank.js';
import { understand, understoodAnything, type Understood } from './understand.js';
import { clean } from './normalise.js';
import { searchSettingsOf, type SearchSettings } from './settings.js';
import { cachedVocab, completions, nearWords, typosFor, type Vocab } from './vocab.js';
import { nativeDriver } from './drivers/native.js';
import { countRedirect, findRedirect, NO_RULES, storeRules, type Rules } from './rules.js';
import { popularStartingWith } from './events.js';
import { covering, fewerWords, nearestWord } from './recover.js';
import type { BrowseSort, Cond, SearchDriver } from './drivers/types.js';

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
	showing?: { q: string; reason: 'typos' | 'fewer words' | 'some words'; dropped?: string[] };
	/** Nothing found at all: the nearest words the store has ("Did you mean …?"). */
	didYouMean?: string;
	/** Nothing found at all: products to show instead — popular in the category the query named, or in the store. */
	fallback?: { kind: 'category' | 'popular'; category?: { _id: string; name: string }; doc: any[] };
	/** This search's id in the store's search log (SI17, public route only): sent back with clicks, the bag and the order. */
	searchId?: string;
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

const cardOf = (d: any, r?: Ranked | null, withExplain = false) => ({
	_id: d.product,
	...(d.card || {}),
	...(withExplain && r && { score: +r.score.toFixed(4), explain: explain(r) }),
});

const orderBy: Record<SearchSort, (a: { d: any; r: Ranked }, b: { d: any; r: Ranked }) => number> = {
	relevance: (a, b) => b.r.score - a.r.score || String(a.d.card?.name || '').length - String(b.d.card?.name || '').length,
	popular: (a, b) => (b.d.signals?.sold30 || 0) - (a.d.signals?.sold30 || 0) || b.r.score - a.r.score,
	price: (a, b) => (a.d.facets?.price ?? Infinity) - (b.d.facets?.price ?? Infinity),
	'-price': (a, b) => (b.d.facets?.price ?? -Infinity) - (a.d.facets?.price ?? -Infinity),
	newest: (a, b) => new Date(b.d.signals?.createdAt || 0).getTime() - new Date(a.d.signals?.createdAt || 0).getTime(),
	name: (a, b) => String(a.d.card?.name || '').localeCompare(String(b.d.card?.name || '')),
};

/** One search with a driver and settings (`version`: the store's index version — with it, answers are cached 30 s). */
export const searchWith = async (driver: SearchDriver, s: SearchSettings, req: SearchRequest, version?: number, rules: Rules = NO_RULES): Promise<SearchResult> => {
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
		const synonyms = plan.filter(t => t.syn.length).map(t => ({ word: t.word, with: t.syn.filter((x, i, a) => a.indexOf(x) === i) }));
		const typos = plan.filter(t => t.near.length).map(t => ({ word: t.word, tried: t.near.map(n => n.word) }));

		if (!plan.length && !codes.filter(Boolean).length) {
			// No words (or only a price, a sort…): a browse.
			const browse = (f: Filters) => driver.browse({ hideOutOfStock: hide, filters: f, sort: ua.sort === 'relevance' ? 'popular' : ua.sort, skip: (page - 1) * limit, limit, facets: !!req.facets });
			let b = await browse(ua.all);
			let used = ua.all;
			const relaxed = !b.total && ua.hasHard;
			if (relaxed) (b = await browse(ua.withoutHard)), (used = ua.withoutHard);
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
		const found = async (pl: QToken[]) => {
			const conds = pl.map(t => condOf(t, vocab)).filter((c): c is Cond => !!c);
			const docs = await driver.candidates({ hideOutOfStock: hide, all: conds, codes: codes.filter(Boolean), cap: CAP, partialBelow: PARTIAL_BELOW, partialCap: PARTIAL_CAP });
			const out: { d: any; r: Ranked }[] = [];
			for (const d of docs) {
				const r = rank(pl, d, s, now, ua.boosts);
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
					ranked = covering(plan, fw.keep, ranked).map(x => ({ d: x.d, r: rank(sub, x.d, s, now, ua.boosts)! }));
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
					// 4. Nothing at all: the nearest words the store has, and something to look at.
					const near = plan.map(t => (t.known || t.code ? t.word : nearestWord(vocab, t.word) ?? t.word));
					if (near.some((w, i) => w !== plan[i].word)) didYouMean = near.join(' ');
					const cat = u.category;
					const pop = async (f: Filters) => (await driver.browse({ hideOutOfStock: hide, filters: f, sort: 'popular', skip: 0, limit: FALLBACK, facets: false })).docs.map(d => cardOf(d));
					const inCat = cat ? await pop({ categories: [cat._id] }) : [];
					fallback = inCat.length ? { kind: 'category', category: cat, doc: inCat } : { kind: 'popular', doc: await pop({}) };
					if (!fallback.doc.length) fallback = undefined;
				}
			}
		}

		let matched = ranked.filter(x => passes(x.d, used));
		matched.sort((a, b) => orderBy[ua.sort](a, b) || orderBy.relevance(a, b) || String(a.d.product).localeCompare(String(b.d.product)));
		const total = matched.length;
		const exact = byCode(matched);
		const product = exact.length === 1 ? cardOf(exact[0].d) : undefined;
		return {
			doc: matched.slice((page - 1) * limit, page * limit).map(x => cardOf(x.d, x.r, req.explain)),
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

const storeState = async () => {
	const c: any = await CommerceSettings.findOne({}, { search: 1 }).lean();
	return { settings: searchSettingsOf(c?.search), version: Number(c?.search?.index?.version) || 0 };
};

/** A search in the current store (its scope), on the native driver. */
export const storeSearch = async (store: Store, req: SearchRequest) => {
	const { settings, version } = await storeState();
	const r = await searchWith(nativeDriver(), settings, req, version, await storeRules(store, version));
	if (r.redirect && !req.explain) countRedirect(store, r.redirect.id);
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
