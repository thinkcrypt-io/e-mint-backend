/**
 * Store search — ranking (docs/search SI10, SI14). Pure: a query plan and a search document in, a score and its
 * explanation out.
 *
 *   score = Σ over query words of (best part weight × match quality × how rare the word is)
 *           × coverage²                 (the share of the query's words found — all-words matches first)
 *           × phrase / name bonuses     (the words together in the name; the name is the query)
 *           × business multiplier       (in stock, popularity, new, on sale, learned — each a store dial)
 *
 *           (learned: per search, SI16 — a lift from the engine)
 *
 * Match quality: exact 1.0 · stem 0.9 · Banglish key 0.6 · prefix of the last word 0.7 · one typo 0.5 · two 0.25.
 * A SKU or barcode hit is worth more than any word (it's the product the shopper means).
 */
import type { Token } from './normalise.js';
import { dialStrength, type SearchSettings } from './settings.js';

/** How much a match in each part of a product counts (SI4). */
export const WEIGHTS = { name: 10, brand: 6, category: 5, keyword: 5, option: 4, collection: 3, custom: 2, description: 1 } as const;
export type PartName = keyof typeof WEIGHTS;
const PART_NAMES = Object.keys(WEIGHTS) as PartName[];
const CODE_SCORE = 14;

export const QUALITY = { exact: 1, stem: 0.9, synonym: 0.8, prefix: 0.7, phon: 0.6, typo1: 0.5, typo2: 0.25 } as const;
export type MatchKind = keyof typeof QUALITY | 'code';

/** One query word, with what the engine worked out for it. */
export type QToken = Token & {
	/** The last word of the query: a prefix of it counts (as you type). */
	last: boolean;
	/** Shortest prefix that counts (search 2, suggestions 1). */
	minPrefix: number;
	/** The store has this word (or its stem) exactly: no typos tried. */
	known: boolean;
	/** The store's words a typo or two away (only for unknown words). */
	near: { word: string; typos: number }[];
	/** The store's synonyms of it (SI13): its words and stems. */
	syn: string[];
	/**
	 * The Banglish key (SI7): 'any' part — a Bangla word, or a Latin word the store doesn't have and has no near
	 * spelling of ("shari"); 'cross' — only parts written in Bangla (a known Latin word still finds its Bangla
	 * spelling: "jamdani" → জামদানি); 'none'. The key is lossy, so it never stands in for a real word of the same script.
	 */
	phonMode: 'any' | 'cross' | 'none';
	/** A code or number to look for among SKUs and barcodes. */
	code: string | null;
	/** How rare the word is in this store, 0.6–1.4. */
	idf: number;
};

export type Hit = { token: string; part: PartName | 'code'; kind: MatchKind; matched: string; points: number };
export type Ranked = { score: number; relevance: number; coverage: number; hits: Hit[]; multipliers: { name: string; x: number }[] };

const has = (xs: any, w: string) => Array.isArray(xs) && xs.includes(w);
const BANGLA = /[\u0980-\u09FF]/;
const bangla = (xs: any) => Array.isArray(xs) && xs.some((w: string) => BANGLA.test(w));
const startsWithAny = (xs: any, p: string) => (Array.isArray(xs) ? xs.find((w: string) => w !== p && w.startsWith(p)) : undefined);

/** The best match of one query word in one document. */
export const matchToken = (t: QToken, doc: any): Hit | null => {
	if (t.code && has(doc.codes, t.code)) return { token: t.word, part: 'code', kind: 'code', matched: t.code, points: CODE_SCORE };
	let best: Hit | null = null;
	const consider = (part: PartName, kind: keyof typeof QUALITY, matched: string) => {
		const points = WEIGHTS[part] * QUALITY[kind];
		if (!best || points > best.points) best = { token: t.word, part, kind, matched, points };
	};
	for (const part of PART_NAMES) {
		const f = doc.fields?.[part];
		if (!f) continue;
		if (has(f.words, t.word)) {
			consider(part, 'exact', t.word);
			continue;
		}
		if (t.stem !== t.word ? has(f.stems, t.stem) || has(f.words, t.stem) : has(f.stems, t.word)) consider(part, 'stem', t.stem);
		if (t.phonMode !== 'none' && t.phon && has(f.phon, t.phon) && (t.phonMode === 'any' || bangla(f.words))) consider(part, 'phon', t.phon);
		if (t.last && part !== 'description' && [...t.word].length >= t.minPrefix) {
			const w = startsWithAny(f.words, t.word) ?? startsWithAny(f.stems, t.word);
			if (w) consider(part, 'prefix', w);
		}
		for (const sy of t.syn) if (has(f.words, sy) || has(f.stems, sy)) consider(part, 'synonym', sy);
		for (const n of t.near) if (has(f.words, n.word) || has(f.stems, n.word)) consider(part, n.typos === 1 ? 'typo1' : 'typo2', n.word);
	}
	return best;
};

/** The query's words found side by side, in order, in these words (stems allowed). */
const inOrder = (tokens: QToken[], words: string[] = [], stems: string[] = []) => {
	if (tokens.length < 2) return false;
	const n = Math.max(words.length, stems.length);
	for (let i = 0; i + tokens.length <= n; i++)
		if (tokens.every((t, k) => words[i + k] === t.word || stems[i + k] === t.stem || (t.last && (words[i + k] || '').startsWith(t.word)))) return true;
	return false;
};

const DAY = 24 * 3600 * 1000;

/** The business multiplier (SI14), each part a store dial. */
export const business = (doc: any, s: SearchSettings, now = Date.now()) => {
	const out: { name: string; x: number }[] = [];
	if (doc.facets?.inStock === false) out.push({ name: 'out of stock', x: 0.3 });
	const sig = doc.signals || {};
	const pop = dialStrength(s.dials.popularity);
	if (pop) {
		const raw = 0.6 * Math.log1p(Number(sig.sold30) || 0) + 0.25 * Math.log1p((Number(sig.views30 ?? sig.views) || 0) / 10) + 0.15 * Math.log1p(Number(sig.wishes) || 0);
		const x = 1 + 0.3 * Math.tanh(raw / 3) * pop;
		if (x > 1.005) out.push({ name: 'popular', x });
	}
	const fresh = dialStrength(s.dials.freshness);
	if (fresh && sig.createdAt && now - new Date(sig.createdAt).getTime() < 14 * DAY) out.push({ name: 'new', x: 1 + 0.1 * fresh });
	const sale = dialStrength(s.dials.sale);
	if (sale && doc.facets?.onSale) out.push({ name: 'on sale', x: 1 + 0.05 * sale });
	// Learned (SI16) is per search, not per product: the engine adds it as a lift (learnedBoost below).
	return out;
};

/** A document's score for a query plan. Null when no query word matches it at all. */
/** A lift for documents passing `test` (understood sizes / colours said as plain words, a category named). */
export type Boost = { name: string; x: number; test: (doc: any) => boolean; xOf?: (doc: any) => number };

/**
 * What shoppers taught the store for this search (SI16, learn.ts): × 0.85 … × 1.25 per product, raised to the store's
 * "learned" dial. Only multiplies products the words found.
 */
export const learnedBoost = (byProduct: Map<string, number> | null, s: SearchSettings): Boost[] => {
	const ls = dialStrength(s.dials.learned);
	if (!byProduct?.size || !ls || !s.learning) return [];
	const x = (d: any) => Math.pow(Math.min(1.25, Math.max(0.85, byProduct.get(String(d.product)) ?? 1)), ls);
	return [{ name: 'learned', x: 1, test: (d: any) => byProduct.has(String(d.product)), xOf: x }];
};

export const rank = (tokens: QToken[], doc: any, s: SearchSettings, now = Date.now(), boosts: Boost[] = []): Ranked | null => {
	const hits: Hit[] = [];
	let relevance = 0;
	for (const t of tokens) {
		const h = matchToken(t, doc);
		if (!h) continue;
		hits.push(h);
		relevance += h.points * (h.kind === 'code' ? 1 : t.idf);
	}
	if (!hits.length) return null;
	const coverage = hits.length / tokens.length;
	const multipliers: { name: string; x: number }[] = [];
	multipliers.push({ name: `coverage ${hits.length}/${tokens.length}`, x: coverage * coverage });
	const name = doc.fields?.name || {};
	if (inOrder(tokens, name.words, name.stems)) multipliers.push({ name: 'phrase in the name', x: 1.2 });
	else if (tokens.length > 1 && hits.length === tokens.length && hits.every(h => h.part === 'name')) multipliers.push({ name: 'all words in the name', x: 1.1 });
	const nameWords: string[] = name.words || [];
	if (nameWords.length && nameWords.length === tokens.length && tokens.every((t, i) => nameWords[i] === t.word || name.stems?.[i] === t.stem)) multipliers.push({ name: 'the name itself', x: 1.25 });
	for (const b of boosts) if (b.test(doc)) multipliers.push({ name: b.name, x: b.xOf ? b.xOf(doc) : b.x });
	multipliers.push(...business(doc, s, now));
	const score = multipliers.reduce((acc, m) => acc * m.x, relevance);
	return { score, relevance, coverage, hits, multipliers };
};

const KIND_TEXT: Record<MatchKind, string> = { exact: 'exact', stem: 'word form', synonym: 'synonym', prefix: 'starts with', phon: 'sounds like', typo1: '1 typo', typo2: '2 typos', code: 'code' };

/** "name exact “shirt” 10 · category word form “shirt” 4.5 · coverage 2/2 ×1 · popular ×1.12" */
export const explain = (r: Ranked) =>
	[
		...r.hits.map(h => `${h.part} ${KIND_TEXT[h.kind]} “${h.matched}” ${+h.points.toFixed(2)}`),
		...r.multipliers.filter(m => m.x !== 1).map(m => `${m.name} ×${+m.x.toFixed(2)}`),
		`= ${+r.score.toFixed(2)}`,
	].join(' · ');
