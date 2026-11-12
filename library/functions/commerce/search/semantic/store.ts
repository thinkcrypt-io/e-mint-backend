/**
 * Store search by meaning — a store's vectors (docs/search SI-19, README SI23), in the store's scope.
 *
 *  - **Indexing.** buildDocs (document.ts) keeps each product's meaning text and marks the document `vecDue` when the
 *    text changed. The search tick (indexer.ts) turns due texts into vectors here, a batch at a time, and saves them
 *    as 384 int8 bytes (`vec`).
 *  - **Searching.** `storeMeaning(key, version)` is what the engine is given: the query's vector (cached per store for
 *    10 minutes), similarity for the top results, and the nearest products. A store's vectors are read once per index
 *    version and kept in memory (≈0.4 KB a product) for 10 minutes.
 */
import SearchDoc from '../../../../models/tenancy/searchDoc.model.js';
import CommerceSettings from '../../../../models/tenancy/commerceSettings.model.js';
import { searchSettingsOf } from '../settings.js';
import { embedQuery, embedTexts, meaningAvailable } from './model.js';
import { nearest, pack, similarity, unpack, NEAREST_FLOOR } from './vector.js';

const TEN_MIN = 10 * 60 * 1000;
/** A store bigger than this is searched by meaning only among its first so many products (nearest), the rest by words. */
const MAX_ROWS = 50000;
const BATCH = 64;

const lru = <V>(max: number) => {
	const map = new Map<string, { at: number; v: V }>();
	return {
		get(k: string) {
			const hit = map.get(k);
			if (!hit || Date.now() - hit.at > TEN_MIN) return undefined;
			map.delete(k);
			map.set(k, hit);
			return hit.v;
		},
		set(k: string, v: V) {
			map.set(k, { at: Date.now(), v });
			while (map.size > max) map.delete(map.keys().next().value as string);
		},
		clear: () => map.clear(),
	};
};

const queries = lru<Promise<Float32Array | null>>(2000);
const matrices = lru<Promise<{ id: string; vec: Int8Array }[]>>(30);

/** The store's vectors (active products), for this index version. */
const rowsOf = (key: string, version: number) => {
	const k = `${key}:${version}`;
	let p = matrices.get(k);
	if (!p) {
		p = SearchDoc.find({ status: 'active', vec: { $ne: null } }, { product: 1, vec: 1 })
			.limit(MAX_ROWS)
			.lean()
			.then((docs: any[]) => docs.map(d => ({ id: String(d.product), vec: unpack(d.vec) })).filter((r): r is { id: string; vec: Int8Array } => !!r.vec));
		p.catch(() => matrices.set(k, undefined as any));
		matrices.set(k, p);
	}
	return p;
};

/** What the engine is given (engine.ts `Meaning`). */
export const storeMeaning = (key: string, version: number) => ({
	async vector(q: string) {
		const text = String(q || '').trim().toLowerCase();
		if (!text) return null;
		const k = `${key}:${text}`;
		let p = queries.get(k);
		if (!p) {
			p = embedQuery(text);
			// A query let go (slow, or the model still loading) isn't kept: the next one tries again.
			p.then(v => !v && queries.set(k, undefined as any));
			queries.set(k, p);
		}
		return p;
	},
	async similar(qv: ArrayLike<number>, products: string[]) {
		const want = new Set(products);
		const out = new Map<string, number>();
		for (const r of await rowsOf(key, version)) if (want.has(r.id)) out.set(r.id, similarity(qv, r.vec));
		return out;
	},
	async nearest(qv: ArrayLike<number>, k: number) {
		return nearest(qv, await rowsOf(key, version), k, NEAREST_FLOOR);
	},
});

/** Whether this store searches by meaning: the platform has the model, and the store hasn't turned it off. */
export const storeUsesMeaning = async () => {
	if (!meaningAvailable()) return false;
	const c: any = await CommerceSettings.findOne({}, { search: 1 }).lean();
	return searchSettingsOf(c?.search).semantic;
};

/**
 * The store's due meaning texts → vectors (the search tick). Returns how many were made. Does nothing where the
 * platform has no model, or the store turned meaning off.
 */
export const embedDue = async (rounds = 8) => {
	if (!(await storeUsesMeaning())) return 0;
	let n = 0;
	for (let i = 0; i < rounds; i++) {
		const due: any[] = await SearchDoc.find({ vecDue: true }, { _id: 1, vecText: 1, vecKey: 1 }).limit(BATCH).lean();
		if (!due.length) break;
		const vecs = await embedTexts(due.map(d => String(d.vecText || '')));
		if (!vecs) break;
		// bulkWrite isn't confined by the tenant plugin, but these are _ids read in the store's scope.
		await SearchDoc.bulkWrite(
			due.map((d, j) => ({
				updateOne: {
					// Only if the text is still the one turned into numbers (a save in between marks it due again).
					filter: { _id: d._id, vecKey: d.vecKey },
					update: { $set: { vec: pack(vecs[j]) }, $unset: { vecDue: 1 } },
				},
			})),
			{ ordered: false }
		);
		n += due.length;
		if (due.length < BATCH) break;
	}
	return n;
};

/** How many of the store's products have a vector (the status card). */
export const meaningCounts = async () => {
	const [withVec, due] = await Promise.all([SearchDoc.countDocuments({ status: 'active', vec: { $ne: null } }), SearchDoc.countDocuments({ vecDue: true })]);
	return { vectors: withVec, due };
};

export const clearMeaningCaches = () => (queries.clear(), matrices.clear());
