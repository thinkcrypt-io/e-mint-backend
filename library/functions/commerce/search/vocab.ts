/**
 * Store search — a store's vocabulary, and typo matching against it (docs/search SI9).
 *
 * The vocabulary is every word the store's search documents hold, with how many documents hold it (`df`, for how
 * rare a word is), plus the words shoppers are shown (all parts but the description) indexed by trigram, so a typed
 * word finds its near spellings fast. A store's vocabulary is cached for a minute and refreshed in the background, so
 * a search never waits for it except the very first.
 */
import { gramsOf } from './document.js';
import { optPart } from './facets.js';
import { normalise } from './normalise.js';
import { emptyKnowledge, type Knowledge } from './understand.js';

export type Vocab = {
	/** Documents in the store. */
	n: number;
	/** word or stem → number of documents holding it (any part). */
	df: Map<string, number>;
	/** The words of the parts shoppers see, by trigram. */
	byGram: Map<string, string[]>;
	/** The words of the parts shoppers see. */
	shown: Set<string>;
	/** Banglish keys present. */
	phon: Set<string>;
	/** What the store sells, for reading queries (understand.ts): option values, brands, categories. */
	knows: Knowledge;
};

/** The store's option values as written ("Size=M"), brands and categories (each `{ _id, name }`). */
export type Known = { labels?: string[]; brands?: { _id: any; name: string }[]; categories?: { _id: any; name: string }[] };

const knowledgeOf = (x: Known = {}): Knowledge => {
	const k = emptyKnowledge();
	for (const l of x.labels || []) {
		const [n, v] = String(l).split('=');
		if (!n || !v) continue;
		const key = optPart(n);
		const value = optPart(v);
		if (!key || !value) continue;
		if (!k.options.has(key)) k.options.set(key, { name: n, values: new Map() });
		if (!k.options.get(key)!.values.has(value)) k.options.get(key)!.values.set(value, v);
	}
	const named = (xs: { _id: any; name: string }[] = []) =>
		xs.filter(b => b?._id && b.name).map(b => ({ _id: String(b._id), name: b.name, words: normalise(b.name).words })).filter(b => b.words.length);
	k.brands = named(x.brands);
	k.categories = named(x.categories);
	return k;
};

/** A vocabulary from raw lists (each driver gathers them its own way). */
export const makeVocab = (n: number, df: [string, number][], shown: string[], phon: string[], known?: Known): Vocab => {
	const byGram = new Map<string, string[]>();
	const shownSet = new Set<string>();
	for (const w of shown) {
		if (!w || shownSet.has(w) || /\d/.test(w)) continue;
		shownSet.add(w);
		for (const g of new Set(gramsOf(w))) {
			if (!byGram.has(g)) byGram.set(g, []);
			byGram.get(g)!.push(w);
		}
	}
	return { n, df: new Map(df), byGram, shown: shownSet, phon: new Set(phon), knows: knowledgeOf(known) };
};

/**
 * Optimal-string-alignment distance (Damerau–Levenshtein with adjacent swaps), stopping early once it passes `max`.
 * By code point, so Bangla letters count once.
 */
export const editDistance = (a: string, b: string, max = 2): number => {
	const s = [...a];
	const t = [...b];
	if (Math.abs(s.length - t.length) > max) return max + 1;
	const rows: number[][] = [];
	for (let i = 0; i <= s.length; i++) rows.push([i, ...new Array(t.length).fill(0)]);
	for (let j = 0; j <= t.length; j++) rows[0][j] = j;
	for (let i = 1; i <= s.length; i++) {
		let best = Infinity;
		for (let j = 1; j <= t.length; j++) {
			const cost = s[i - 1] === t[j - 1] ? 0 : 1;
			let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
			rows[i][j] = v;
			if (v < best) best = v;
		}
		if (best > max) return max + 1;
	}
	return rows[s.length][t.length];
};

/** Typos allowed for a word of this length (SI9): none under 4 letters, 1 for 4–7, 2 for 8 or more. */
export const typosFor = (word: string, mode: 'off' | 'normal' | 'loose') => {
	if (mode === 'off') return 0;
	const n = [...word].length;
	const base = n < 4 ? 0 : n <= 7 ? 1 : 2;
	return mode === 'loose' ? Math.min(2, base + (n >= 3 ? 1 : 0)) : base;
};

/**
 * The store's words within the typos allowed of `word`, nearest first (at most 8). The first letter must match —
 * except for a swap of the first two ("hsirt"). Words the store already has exactly need no typos (the caller
 * checks that first).
 */
export const nearWords = (vocab: Vocab, word: string, maxTypos: number): { word: string; typos: number }[] => {
	if (maxTypos <= 0 || /\d/.test(word)) return [];
	const grams = [...new Set(gramsOf(word))];
	const shared = new Map<string, number>();
	for (const g of grams) for (const w of vocab.byGram.get(g) || []) shared.set(w, (shared.get(w) || 0) + 1);
	// A word one edit away shares all but a few of the typed word's trigrams (a swap of two letters breaks up to 4).
	const need = Math.max(1, grams.length - 4 * maxTypos);
	const w0 = [...word];
	const out: { word: string; typos: number; df: number }[] = [];
	for (const [w, n] of shared) {
		if (n < need || w === word) continue;
		const c = [...w];
		if (c[0] !== w0[0] && !(c[0] === w0[1] && c[1] === w0[0])) continue;
		const d = editDistance(word, w, maxTypos);
		if (d <= maxTypos) out.push({ word: w, typos: d, df: vocab.df.get(w) || 0 });
	}
	return out
		.sort((a, b) => a.typos - b.typos || b.df - a.df || a.word.localeCompare(b.word))
		.slice(0, 8)
		.map(({ word, typos }) => ({ word, typos }));
};

/** The store's shown words starting with this prefix, commonest first (for "did you mean" and query suggestions). */
export const completions = (vocab: Vocab, prefix: string, max = 6) => {
	if (!prefix) return [];
	const out: { word: string; df: number }[] = [];
	for (const w of vocab.shown) if (w.startsWith(prefix) && w !== prefix) out.push({ word: w, df: vocab.df.get(w) || 0 });
	return out.sort((a, b) => b.df - a.df || a.word.length - b.word.length || a.word.localeCompare(b.word)).slice(0, max);
};

/* -------------------------------------------------------------------- cache */

const TTL_MS = 60 * 1000;
type Entry = { vocab: Vocab; at: number; loading?: Promise<Vocab> };
const cache = new Map<string, Entry>();

/**
 * The cached vocabulary for a store (`key` = its project id), loading it with `load` the first time and refreshing it
 * in the background once it is a minute old.
 */
export const cachedVocab = async (key: string, load: () => Promise<Vocab>): Promise<Vocab> => {
	const e = cache.get(key);
	const fresh = () => {
		const p = load().then(
			v => (cache.set(key, { vocab: v, at: Date.now() }), v),
			err => {
				const cur = cache.get(key);
				if (cur) cur.loading = undefined;
				throw err;
			}
		);
		return p;
	};
	if (!e) {
		const loading = fresh();
		cache.set(key, { vocab: makeVocab(0, [], [], []), at: 0, loading });
		return loading;
	}
	if (e.at === 0 && e.loading) return e.loading;
	if (Date.now() - e.at > TTL_MS && !e.loading) e.loading = fresh().catch(() => e.vocab);
	return e.vocab;
};

/** For tests and a rebuild: forget a store's vocabulary. */
export const dropVocab = (key?: string) => (key ? cache.delete(key) : cache.clear());
