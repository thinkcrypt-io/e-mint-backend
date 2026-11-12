/**
 * Store search by meaning — the pure part (docs/search SI-19, README SI23): a product's meaning text, vectors packed
 * as int8, similarity, the top-50 re-rank and the nearest products. No model here (model.ts has it), so it's tested
 * with a fake embedder.
 *
 * The model gives 384 numbers per text, already normalised (length 1), so the dot product is the cosine. Saved, each
 * number is ×127 and rounded into one byte: 0.4 KB a product, and the cosine moves by less than 0.01.
 */
import crypto from 'crypto';

export const DIMS = 384;
/** Meaning is mixed into the top text results at this share (a text match always stays a match). */
export const RERANK_WEIGHT = 0.25;
export const RERANK_TOP = 50;
/** Nearest products by meaning, shown when nothing matched: at least this similar. */
export const NEAREST_FLOOR = 0.45;

const clean = (v: any) =>
	String(v ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/** What a product means, as one text: name, category path, brand, option values, keywords (the description is left out: too long, too noisy). */
export const meaningText = (p: { name?: any; categories?: any[]; brand?: any; options?: any[]; keywords?: any }) => {
	const kw = Array.isArray(p.keywords) ? p.keywords.join(', ') : clean(p.keywords);
	return [clean(p.name), (p.categories || []).map(clean).filter(Boolean).join(' > '), clean(p.brand), (p.options || []).map(clean).filter(Boolean).join(', '), clean(kw)]
		.filter(Boolean)
		.join(' · ')
		.slice(0, 400);
};

/** The text's key: a product's vector is made again only when its text changed. */
export const textKey = (text: string) => crypto.createHash('sha1').update(text).digest('base64').slice(0, 16);

/** A normalised vector → 384 bytes. */
export const pack = (v: ArrayLike<number>): Buffer => {
	const out = Buffer.alloc(v.length);
	for (let i = 0; i < v.length; i++) out.writeInt8(Math.max(-127, Math.min(127, Math.round(v[i] * 127))), i);
	return out;
};

/** Saved bytes (a Buffer, or Mongo's Binary) → int8 numbers. */
export const unpack = (b: any): Int8Array | null => {
	const buf: Buffer | null = Buffer.isBuffer(b) ? b : b?.buffer && Buffer.isBuffer(b.buffer) ? b.buffer : b?.buffer instanceof Uint8Array ? Buffer.from(b.buffer) : null;
	if (!buf || buf.length !== DIMS) return null;
	return new Int8Array(buf.buffer, buf.byteOffset, buf.length);
};

/** The cosine of a query vector (floats, normalised) and a saved one (int8). */
export const similarity = (q: ArrayLike<number>, v: Int8Array) => {
	let s = 0;
	for (let i = 0; i < v.length; i++) s += q[i] * v[i];
	return s / 127;
};

/**
 * The top results again with meaning mixed in: each one's share of the best text score, 75%, and its similarity, 25%.
 * Only the first `top` move, among themselves; everything after stays where it was. `sim` is null for a product
 * without a vector yet: it keeps its text share only (no penalty beyond that).
 */
export const rerank = <T>(items: T[], score: (x: T) => number, sim: (x: T) => number | null, { weight = RERANK_WEIGHT, top = RERANK_TOP } = {}) => {
	const head = items.slice(0, top);
	const best = Math.max(1e-9, ...head.map(score));
	const mixed = head.map((x, i) => {
		const t = score(x) / best;
		const m = sim(x);
		return { x, i, t, m, mix: (1 - weight) * t + weight * Math.max(0, m ?? 0) };
	});
	mixed.sort((a, b) => b.mix - a.mix || a.i - b.i);
	return { items: [...mixed.map(o => o.x), ...items.slice(top)], mixed };
};

/** The `k` products most like the query, at least `floor` similar, most similar first. */
export const nearest = (q: ArrayLike<number>, rows: { id: string; vec: Int8Array }[], k: number, floor = NEAREST_FLOOR) => {
	const out: { id: string; sim: number }[] = [];
	for (const r of rows) {
		const sim = similarity(q, r.vec);
		if (sim >= floor) out.push({ id: r.id, sim });
	}
	return out.sort((a, b) => b.sim - a.sim || a.id.localeCompare(b.id)).slice(0, k);
};
