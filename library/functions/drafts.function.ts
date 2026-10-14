import mongoose from 'mongoose';
import { compiledModel } from './dynamicModels.function.js';
import { MODEL_KEY } from './projectIndexes.function.js';

/**
 * Drafts and publishing (docs/cms D5, CMS-05). A model with
 * `draftAndPublish` keeps each record as its **draft** — what the panel shows
 * and edits — and its live version as a snapshot on the same document:
 *
 *   _published      { data: <the record as published>, by, byName }   (select: false)
 *   _publishedAt    when it was last published (none: never, or taken off)
 *   _publishedFrom  the draft's updatedAt it was published from
 *
 * Status: Draft (never published), Published, Modified (the draft is newer).
 * Everything the outside sees — the public API, the site's lists and pages —
 * reads the snapshot through `liveFind` / `liveFindOne` / `liveCount`, which
 * run the same filters, rules and sorts on `_published.data.*`. Ids,
 * references and unique indexes stay the record's own, so links and linked
 * relationships don't change.
 */

export const DATA = '_published.data';

export const isDraftModel = (def: any) => !!def?.draftAndPublish;

/** Keys that stay on the record itself, never the snapshot: ids, scope, owner and sharing. */
const TOP = new Set(['_id', '_model', MODEL_KEY, 'organization', 'project', '_customer', 'privacy', 'access', 'addedBy', '_publishedAt']);

/** A query on the record's fields as the same query on its published snapshot. */
export const prefixQuery = (q: any): any => {
	if (Array.isArray(q)) return q.map(prefixQuery);
	if (!q || typeof q !== 'object' || q instanceof Date || q instanceof mongoose.Types.ObjectId) return q;
	const out: any = {};
	for (const [k, v] of Object.entries(q)) {
		if (k === '$and' || k === '$or' || k === '$nor') out[k] = (v as any[]).map(prefixQuery);
		else if (k.startsWith('$') || TOP.has(k.split('.')[0])) out[k] = v;
		else out[`${DATA}.${k}`] = v;
	}
	return out;
};

const prefixSort = (sort: Record<string, any> = {}) => Object.fromEntries(Object.entries(sort).map(([k, v]) => [k === '_id' ? k : `${DATA}.${k}`, v]));

/** Only published records, with the query on their published values. */
const liveQuery = (query: any) => ({ ...prefixQuery(query || {}), [`${DATA}._id`]: { $exists: true } });

/** The published values, with only `keys` (and links filled in as `populate` says — by hand: a snapshot is plain data). */
const liveDocs = async (def: any, Model: any, rows: any[], keys: string[] | null, populate: any[] = []) => {
	let docs = rows.map(r => r?._published?.data).filter(Boolean);
	if (keys?.length) docs = docs.map(d => Object.fromEntries(Object.entries(d).filter(([k]) => k === '_id' || keys.includes(k))));
	for (const p of populate) {
		const target = (def.fields || []).find((f: any) => f.key === p.path)?.ref;
		const ref = target && compiledModel(target);
		if (ref) await Model.populate(docs, { path: p.path, select: p.select, model: ref });
	}
	return docs;
};

type Find = { query: any; keys?: string[] | null; sort?: any; skip?: number; limit?: number; populate?: any[] };

/** A page of records as the outside sees them: published values for a drafts model, the records as they are otherwise. */
export const liveFind = async (def: any, Model: any, { query, keys, sort, skip = 0, limit = 20, populate = [] }: Find) => {
	if (!isDraftModel(def)) {
		let q = Model.find(query);
		if (keys?.length) q = q.select(keys.join(' '));
		return q.sort(sort || { createdAt: -1 }).skip(skip).limit(limit).populate(populate).lean();
	}
	const rows = await Model.find(liveQuery(query)).select('_published').sort(prefixSort(sort || { createdAt: -1 })).skip(skip).limit(limit).lean();
	return liveDocs(def, Model, rows, keys || null, populate);
};

export const liveFindOne = async (def: any, Model: any, { query, keys, sort, populate = [] }: Omit<Find, 'skip' | 'limit'>) =>
	(await liveFind(def, Model, { query, keys, sort, limit: 1, populate }))[0] || null;

export const liveCount = (def: any, Model: any, query: any) => (isDraftModel(def) ? Model.countDocuments(liveQuery(query)) : Model.countDocuments(query));

/* ------------------------------------------------------------ actions */

/** The record as a snapshot: everything but the snapshot itself. */
const snapshotOf = (doc: any) => {
	const o = typeof doc.toObject === 'function' ? doc.toObject({ depopulate: true }) : { ...doc };
	delete o._published;
	delete o._publishedAt;
	delete o._publishedFrom;
	return o;
};

/** Puts the draft live. Doesn't touch updatedAt, so the record reads Published. */
export const publishRecord = async (Model: any, id: any, user?: any) => {
	const doc: any = await Model.findById(id);
	if (!doc) return null;
	const at = new Date();
	await Model.updateOne(
		{ _id: doc._id },
		{ $set: { _published: { data: snapshotOf(doc), by: user?._id, byName: user?.name || '' }, _publishedAt: at, _publishedFrom: doc.updatedAt } },
		{ timestamps: false, strict: false }
	);
	return { _id: String(doc._id), publishedAt: at, status: 'published' as const, doc: snapshotOf(doc) };
};

/** Takes it off the site and API; the draft stays. */
export const unpublishRecord = async (Model: any, id: any) => {
	const r = await Model.updateOne({ _id: id }, { $unset: { _published: 1, _publishedAt: 1, _publishedFrom: 1 } }, { timestamps: false, strict: false });
	return r.matchedCount ? { _id: String(id), status: 'draft' as const } : null;
};

/** Throws the draft's changes away: the record goes back to what's published. */
export const discardDraft = async (Model: any, id: any) => {
	const doc: any = await Model.findById(id).select('+_published').lean();
	if (!doc) return null;
	const live = doc._published?.data;
	if (!live) return { error: 'It has never been published — there’s nothing to go back to.' };
	const $set: any = { ...live, updatedAt: doc._publishedFrom || doc.updatedAt };
	delete $set._id;
	const $unset: any = {};
	for (const k of Object.keys(doc)) if (!(k in live) && !TOP.has(k) && !k.startsWith('_published') && !['createdAt', 'updatedAt', '__v'].includes(k)) $unset[k] = 1;
	await Model.updateOne({ _id: doc._id }, { $set, ...(Object.keys($unset).length && { $unset }) }, { timestamps: false, strict: false });
	return { _id: String(doc._id), status: 'published' as const };
};

/** A record's status from its draft and snapshot dates. */
export const statusOf = (doc: any): 'draft' | 'published' | 'modified' => {
	if (!doc?._publishedAt) return 'draft';
	const from = doc._publishedFrom ? new Date(doc._publishedFrom).getTime() : 0;
	return doc.updatedAt && new Date(doc.updatedAt).getTime() > from ? 'modified' : 'published';
};
