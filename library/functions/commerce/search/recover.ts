/**
 * Store search — no dead ends (docs/search SI12, SI-11). Pure helpers for when a search finds nothing with every word:
 *
 *   • `fewerWords`: the best smaller set of the query's words that some products have all of — the most words, then
 *     the rarest (most telling) ones, then the most products; at least half the words. "red velvet saree" → "velvet
 *     saree".
 *   • `nearestWord`: for "did you mean", the store's own shown word closest to one the store doesn't know — one
 *     change, two from six letters on, and unlike typo matching the first letter may differ.
 *
 * The engine (engine.ts) runs the steps: understood filters set aside, looser typos, fewer words, then did-you-mean
 * with popular products.
 */
import { gramsOf } from './document.js';
import type { QToken, Ranked } from './rank.js';
import { editDistance, type Vocab } from './vocab.js';

type Scored = { d: any; r: Ranked };

/** The query words (their indexes in `plan`) a ranked document matched. */
const hitSet = (plan: QToken[], r: Ranked) => {
	const words = new Set(r.hits.map(h => h.token));
	return plan.map((t, i) => (words.has(t.word) ? i : -1)).filter(i => i >= 0);
};

/**
 * The best smaller set of words, from the documents found: null when no document matches even one word, or the query
 * has a single word (nothing to drop).
 */
export const fewerWords = (plan: QToken[], found: Scored[]): { keep: number[]; dropped: number[] } | null => {
	if (plan.length < 2) return null;
	const sets = new Map<string, { keep: number[]; docs: number }>();
	for (const x of found) {
		const keep = hitSet(plan, x.r);
		// At least half the words stay: "red velvet saree" never becomes just "red".
		if (keep.length < Math.ceil(plan.length / 2) || keep.length === plan.length) continue;
		const k = keep.join(',');
		sets.set(k, { keep, docs: (sets.get(k)?.docs || 0) + 1 });
	}
	if (!sets.size) return null;
	// A document matching more words also has every smaller set: count those too.
	const all = [...sets.values()].map(s => ({
		...s,
		docs: [...sets.values()].filter(o => s.keep.every(i => o.keep.includes(i))).reduce((n, o) => n + o.docs, 0),
		idf: s.keep.reduce((n, i) => n + plan[i].idf, 0),
	}));
	all.sort((a, b) => b.keep.length - a.keep.length || b.idf - a.idf || b.docs - a.docs || a.keep.join().localeCompare(b.keep.join()));
	const keep = all[0].keep;
	return { keep, dropped: plan.map((_, i) => i).filter(i => !keep.includes(i)) };
};

/** The documents matching every word of `keep`. */
export const covering = (plan: QToken[], keep: number[], found: Scored[]) => {
	const words = keep.map(i => plan[i].word);
	return found.filter(x => words.every(w => x.r.hits.some(h => h.token === w)));
};

/** The store's shown word nearest to `word`, for "did you mean" (null: nothing near enough, or the word is short). */
export const nearestWord = (vocab: Vocab, word: string): string | null => {
	const n = [...word].length;
	if (n < 3 || /\d/.test(word) || vocab.shown.has(word)) return null;
	// One change, two from six letters on — but unlike typo matching, the first letter may differ ("ackets").
	const max = n >= 6 ? 2 : 1;
	const seen = new Set<string>();
	let best: { w: string; d: number; df: number } | null = null;
	for (const g of new Set(gramsOf(word)))
		for (const w of vocab.byGram.get(g) || []) {
			if (seen.has(w)) continue;
			seen.add(w);
			const d = editDistance(word, w, max);
			if (d > max) continue;
			const df = vocab.df.get(w) || 0;
			if (!best || d < best.d || (d === best.d && df > best.df) || (d === best.d && df === best.df && w < best.w)) best = { w, d, df };
		}
	return best?.w ?? null;
};
