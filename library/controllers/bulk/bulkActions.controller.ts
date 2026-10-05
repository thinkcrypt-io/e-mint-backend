import { Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import DeletedRecord from '../../models/deleted-record/model.js';
import recordHistory from '../../functions/recordHistory.function.js';
import { ownRecordsOf } from '../../functions/projectIndexes.function.js';

/**
 * Bulk actions on the rows ticked in a table (admin selection bar):
 *
 *   POST /bulk/delete      { ids }                   → snapshot, delete; answers a `batch` for Undo
 *   POST /bulk/restore     { batch }                 → Undo: puts that batch back exactly
 *   POST /bulk/duplicate   { ids, overrides? }       → a copy of each, unique fields made unique
 *   POST /bulk/archive     { ids, archived }         → sets / clears `archivedAt` (route.archive on)
 *   POST /bulk/status      { ids, to, reason? }      → moves route.status.field, where allowed
 *   POST /bulk/merge/preview { keep, merge }         → how many linked records would move
 *   POST /bulk/merge       { keep, merge, values }   → keep one, repoint every link, remove the rest
 *
 * Every action is scoped to `req.queryHelper` — the list's access rules — so
 * an id the admin couldn't see isn't touched; on access-restricted routes
 * deleting and merging are also the owner's alone (`ownerOnly`). Changes go to
 * the records' History.
 */

const MAX_IDS = 1000;
const MAX_MERGE = 10;

type Opts = { Model: mongoose.Model<any>; ownerOnly?: boolean };

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const oid = (id: any) => new mongoose.Types.ObjectId(String(id));
const validIds = (ids: any): string[] =>
	Array.isArray(ids) ? [...new Set(ids.filter((id: any) => mongoose.isValidObjectId(id)).map(String))] : [];

/** Only the given ids the admin may act on. */
const scopeOf = (req: any, ids: string[], ownerOnly = false) => ({
	$and: [req.queryHelper || {}, { _id: { $in: ids.map(oid) } }, ...(ownerOnly ? [{ addedBy: req.user?._id }] : [])],
});

const settingsOf = (req: any): Record<string, any> => req.resolvedRoute?.settings || {};
const routeConfigOf = (req: any): any => req.resolvedRoute?.frontendConfig?.route || {};
const routeKeyOf = (req: any): string => req.resolvedRoute?.key || String(req.baseUrl || '').split('/').pop() || '';
const labelOf = (req: any, key: string) =>
	settingsOf(req)[key]?.schema?.label || settingsOf(req)[key]?.title || key.replace(/^./, c => c.toUpperCase());
const nameOf = (doc: any) => doc?.name || doc?.title || doc?.code || String(doc?._id || '');
const text = (v: any) => (v === undefined || v === null || v === '' ? 'empty' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

/* ------------------------------------------------------------------ delete */

export const bulkDelete = ({ Model, ownerOnly }: Opts) => async (req: any, res: Response) => {
	try {
		const ids = validIds(req.body?.ids);
		if (!ids.length) return fail(res, 400, 'Select at least one row');
		if (ids.length > MAX_IDS) return fail(res, 400, `At most ${MAX_IDS} rows at a time`);

		const docs = await Model.find(scopeOf(req, ids, ownerOnly)).lean();
		if (!docs.length) return fail(res, 404, ownerOnly ? 'None of these records are yours to delete' : 'None of these records were found');

		const batch = crypto.randomUUID();
		await DeletedRecord.insertMany(
			docs.map((doc: any) => ({
				batch,
				route: routeKeyOf(req),
				model: Model.modelName,
				docId: doc._id,
				doc,
				reason: 'delete',
				deletedBy: req.user?._id,
			}))
		);
		const { deletedCount } = await Model.deleteMany({ _id: { $in: docs.map((d: any) => d._id) } });
		docs.forEach(doc => recordHistory({ req, action: 'delete', model: Model.modelName, doc }));

		return res.status(200).json({ batch, deleted: deletedCount, skipped: ids.length - docs.length });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not delete these records');
	}
};

/** Undo a bulk delete — only the admin who deleted, only this route's batch. */
export const bulkRestore = ({ Model }: Opts) => async (req: any, res: Response) => {
	try {
		const batch = String(req.body?.batch || '');
		if (!batch) return fail(res, 400, 'Nothing to restore');
		const snaps = await DeletedRecord.find({
			batch,
			model: Model.modelName,
			reason: 'delete',
			deletedBy: req.user?._id,
		}).lean();
		if (!snaps.length) return fail(res, 404, 'That delete can’t be undone any more');

		const existing = new Set(
			(await Model.find({ _id: { $in: snaps.map((s: any) => s.docId) } }).distinct('_id')).map(String)
		);
		// A project model's records share one collection: each goes back marked
		// as its model's (a snapshot from before WO-43 has no `_model`).
		const own = ownRecordsOf(Model);
		const back = snaps.filter((s: any) => !existing.has(String(s.docId))).map((s: any) => ({ ...s.doc, ...own }));
		// Straight into the collection: exactly what was deleted, no hooks re-numbering codes.
		if (back.length) await Model.collection.insertMany(back as any[], { ordered: false });
		await DeletedRecord.deleteMany({ _id: { $in: snaps.map((s: any) => s._id) } });
		back.forEach(doc => recordHistory({ req, action: 'create', model: Model.modelName, doc }));

		return res.status(200).json({ restored: back.length });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not restore these records');
	}
};

/* --------------------------------------------------------------- duplicate */

const STRIP = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'archivedAt', 'archivedBy'];

export const bulkDuplicate = ({ Model }: Opts) => async (req: any, res: Response) => {
	try {
		const ids = validIds(req.body?.ids);
		if (!ids.length) return fail(res, 400, 'Select at least one row');
		if (ids.length > 200) return fail(res, 400, 'At most 200 rows at a time');

		// Optional: set these fields on every copy (a new date, a status back to draft).
		const allowEdits: string[] = req.resolvedRoute?.built?.EDITS?.allowEdits || [];
		const overrides = req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : {};
		const bad = Object.keys(overrides).filter(k => !allowEdits.includes(k));
		if (bad.length) return fail(res, 400, `These fields can’t be set: ${bad.join(', ')}`);

		const settings = settingsOf(req);
		const uniquePaths = new Set<string>([
			...Object.keys(settings).filter(k => settings[k]?.unique),
			...Object.entries(Model.schema.paths)
				.filter(([, p]: any) => p?.options?.unique)
				.map(([k]) => k),
		]);
		uniquePaths.delete('_id');

		const docs = await Model.find(scopeOf(req, ids)).lean();
		const created: string[] = [];
		const failed: { id: string; name: string; message: string }[] = [];

		for (const doc of docs as any[]) {
			const copy: any = { ...doc };
			STRIP.forEach(k => delete copy[k]);
			// Unique text gets a "-copy" suffix, numbered until free; unique numbers are dropped.
			for (const key of uniquePaths) {
				const v = copy[key];
				if (v === undefined || v === null || v === '') continue;
				if (typeof v !== 'string') {
					delete copy[key];
					continue;
				}
				let candidate = `${v}-copy`;
				for (let n = 2; await Model.exists({ [key]: candidate }); n++) candidate = `${v}-copy-${n}`;
				copy[key] = candidate;
			}
			Object.assign(copy, overrides);
			if ('addedBy' in doc && req.user?._id) copy.addedBy = req.user._id;
			try {
				const saved = await new Model(copy).save();
				created.push(String(saved._id));
				recordHistory({ req, action: 'create', model: Model.modelName, doc: saved });
			} catch (e: any) {
				failed.push({ id: String(doc._id), name: nameOf(doc), message: e?.message || 'Could not copy' });
			}
		}

		return res.status(200).json({ created, failed, skipped: ids.length - docs.length });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not duplicate these records');
	}
};

/* ----------------------------------------------------------------- archive */

export const bulkArchive = ({ Model }: Opts) => async (req: any, res: Response) => {
	try {
		if (!routeConfigOf(req).archive) return fail(res, 400, 'Archiving isn’t turned on for this list');
		const ids = validIds(req.body?.ids);
		if (!ids.length) return fail(res, 400, 'Select at least one row');
		if (ids.length > MAX_IDS) return fail(res, 400, `At most ${MAX_IDS} rows at a time`);
		const archive = req.body?.archived !== false;

		const docs = await Model.find(scopeOf(req, ids)).select('name title code archivedAt').lean();
		const targets = (docs as any[]).filter(d => (archive ? !d.archivedAt : !!d.archivedAt));
		const now = new Date();
		if (targets.length)
			await Model.updateMany(
				{ _id: { $in: targets.map(d => d._id) } },
				archive ? { $set: { archivedAt: now, archivedBy: req.user?._id } } : { $unset: { archivedAt: 1, archivedBy: 1 } },
				{ strict: false }
			);
		targets.forEach(doc =>
			recordHistory({
				req,
				action: 'update',
				model: Model.modelName,
				doc,
				changes: [{ field: 'archivedAt', label: 'Archived', from: archive ? 'No' : 'Yes', to: archive ? 'Yes' : 'No' }],
			})
		);

		return res.status(200).json({ changed: targets.length, skipped: ids.length - targets.length });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not archive these records');
	}
};

/* ------------------------------------------------------------------ status */

/**
 * `route.status` in the route's config: `{ field, transitions?, requireReason? }`.
 * `transitions` maps a status to the ones it may move to; a status missing from
 * it may move anywhere, and no `transitions` at all means any move is allowed.
 */
export const statusConfigOf = (req: any, Model: mongoose.Model<any>) => {
	const cfg = routeConfigOf(req).status;
	if (!cfg?.field) return null;
	const path: any = Model.schema.path(cfg.field);
	const settings = settingsOf(req)[cfg.field] || {};
	const options: string[] =
		(path?.enumValues?.length ? path.enumValues : null) ||
		(Array.isArray(settings?.options) ? settings.options.map((o: any) => String(o?.value ?? o)) : null) ||
		(Array.isArray(settings?.schema?.options) ? settings.schema.options.map((o: any) => String(o?.value ?? o)) : []);
	return { field: String(cfg.field), transitions: cfg.transitions || null, requireReason: !!cfg.requireReason, options };
};

export const bulkStatus = ({ Model }: Opts) => async (req: any, res: Response) => {
	try {
		const cfg = statusConfigOf(req, Model);
		if (!cfg) return fail(res, 400, 'This list has no status set up — choose its status field in the route builder');
		const ids = validIds(req.body?.ids);
		if (!ids.length) return fail(res, 400, 'Select at least one row');
		if (ids.length > MAX_IDS) return fail(res, 400, `At most ${MAX_IDS} rows at a time`);

		const to = String(req.body?.to ?? '');
		if (!to) return fail(res, 400, 'Pick the status to move to');
		if (cfg.options.length && !cfg.options.includes(to)) return fail(res, 400, `“${to}” isn’t one of this list’s statuses`);
		const reason = String(req.body?.reason || '').trim();
		if (cfg.requireReason && !reason) return fail(res, 400, 'A reason is required for this change');

		const docs = await Model.find(scopeOf(req, ids)).select(`name title code ${cfg.field}`).lean();
		const allowed: any[] = [];
		const skipped: { id: string; name: string; from: string; why: string }[] = [];
		for (const doc of docs as any[]) {
			const from = doc[cfg.field] === undefined || doc[cfg.field] === null ? '' : String(doc[cfg.field]);
			if (from === to) skipped.push({ id: String(doc._id), name: nameOf(doc), from, why: `already ${to}` });
			else if (cfg.transitions && from in cfg.transitions && !(cfg.transitions[from] || []).includes(to))
				skipped.push({ id: String(doc._id), name: nameOf(doc), from, why: `can’t move from ${from || 'empty'} to ${to}` });
			else allowed.push(doc);
		}
		if (allowed.length) await Model.updateMany({ _id: { $in: allowed.map(d => d._id) } }, { $set: { [cfg.field]: to } });
		const label = labelOf(req, cfg.field);
		allowed.forEach(doc =>
			recordHistory({
				req,
				action: 'update',
				model: Model.modelName,
				doc,
				changes: [{ field: cfg.field, label, from: text(doc[cfg.field]), to: reason ? `${to} (“${reason}”)` : to }],
			})
		);
		ids.filter(id => !(docs as any[]).some(d => String(d._id) === id)).forEach(id =>
			skipped.push({ id, name: id, from: '', why: 'not found or not yours to edit' })
		);

		return res.status(200).json({ changed: allowed.length, skipped });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not change the status');
	}
};

/* ------------------------------------------------------------------- merge */

type RefPath =
	| { M: mongoose.Model<any>; kind: 'single' | 'array'; path: string }
	| { M: mongoose.Model<any>; kind: 'subdoc'; path: string; parent: string; sub: string };

const SKIP_MODELS = new Set(['History', 'DeletedRecord', 'RouteVersion', 'RouteSettings', 'RouteConfig']);

/** Every field, in every model, that points at `modelName` — top level, lists, and one level into sub-document lists. */
const refPathsTo = (modelName: string): RefPath[] => {
	const out: RefPath[] = [];
	const refOf = (t: any) => t?.options?.ref || t?.caster?.options?.ref;
	for (const M of Object.values(mongoose.models)) {
		if (SKIP_MODELS.has(M.modelName)) continue;
		M.schema.eachPath((path: string, type: any) => {
			if (type?.instance === 'Array' && type?.schema) {
				type.schema.eachPath((sub: string, st: any) => {
					if (refOf(st) === modelName && st.instance !== 'Array')
						out.push({ M, kind: 'subdoc', path: `${path}.${sub}`, parent: path, sub });
				});
				return;
			}
			if (refOf(type) !== modelName) return;
			out.push({ M, kind: type?.instance === 'Array' ? 'array' : 'single', path });
		});
	}
	return out;
};

const mergeInput = async (req: any, Model: mongoose.Model<any>, ownerOnly?: boolean) => {
	const keep = mongoose.isValidObjectId(req.body?.keep) ? String(req.body.keep) : '';
	const merge = validIds(req.body?.merge).filter(id => id !== keep);
	if (!keep || !merge.length) return { error: 'Pick the record to keep and at least one to merge into it' };
	if (merge.length > MAX_MERGE) return { error: `At most ${MAX_MERGE} records can be merged at once` };
	const docs = await Model.find(scopeOf(req, [keep, ...merge], ownerOnly)).lean();
	const keepDoc: any = docs.find((d: any) => String(d._id) === keep);
	const mergeDocs: any[] = docs.filter((d: any) => String(d._id) !== keep);
	if (!keepDoc || mergeDocs.length !== merge.length)
		return { error: ownerOnly ? 'You can only merge records you own' : 'Some of these records weren’t found' };
	return { keep, merge, keepDoc, mergeDocs };
};

export const mergePreview = ({ Model, ownerOnly }: Opts) => async (req: any, res: Response) => {
	try {
		const input: any = await mergeInput(req, Model, ownerOnly);
		if (input.error) return fail(res, 400, input.error);
		const ids = input.merge.map(oid);
		const links: { model: string; path: string; count: number }[] = [];
		for (const r of refPathsTo(Model.modelName)) {
			const count = await r.M.collection.countDocuments({ ...ownRecordsOf(r.M), [r.path]: { $in: ids } });
			if (count) links.push({ model: r.M.modelName, path: r.path, count });
		}
		// The fields a merge may take from another record — the route's editable ones.
		const editable: string[] = req.resolvedRoute?.built?.EDITS?.allowEdits || [];
		return res.status(200).json({ links, total: links.reduce((n, l) => n + l.count, 0), editable });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not preview the merge');
	}
};

export const mergeRecords = ({ Model, ownerOnly }: Opts) => async (req: any, res: Response) => {
	try {
		const input: any = await mergeInput(req, Model, ownerOnly);
		if (input.error) return fail(res, 400, input.error);
		const { keep, merge, keepDoc, mergeDocs } = input;

		// Field values taken from a merged record: { field: idOfTheRecordWhoseValueWins }.
		const allowEdits: string[] = req.resolvedRoute?.built?.EDITS?.allowEdits || [];
		const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {};
		const set: Record<string, any> = {};
		const changes: any[] = [];
		for (const [field, from] of Object.entries(values)) {
			if (!allowEdits.includes(field) || String(from) === keep) continue;
			const src = mergeDocs.find((d: any) => String(d._id) === String(from));
			if (!src) continue;
			set[field] = src[field];
			changes.push({ field, label: labelOf(req, field), from: text(keepDoc[field]), to: text(src[field]) });
		}
		if (Object.keys(set).length) await Model.updateOne({ _id: keepDoc._id }, { $set: set });

		// Every link to a merged record now points at the kept one.
		const ids = merge.map(oid);
		const keepId = oid(keep);
		let moved = 0;
		for (const r of refPathsTo(Model.modelName)) {
			const coll = r.M.collection;
			// On a project's shared collection, only the linking model's records.
			const own = ownRecordsOf(r.M);
			if (r.kind === 'single') {
				moved += (await coll.updateMany({ ...own, [r.path]: { $in: ids } }, { $set: { [r.path]: keepId } })).modifiedCount;
			} else if (r.kind === 'array') {
				const hit = await coll.updateMany({ ...own, [r.path]: { $in: ids } }, { $addToSet: { [r.path]: keepId } } as any);
				await coll.updateMany({ ...own, [r.path]: { $in: ids } }, { $pullAll: { [r.path]: ids } } as any);
				moved += hit.matchedCount;
			} else if (r.kind === 'subdoc') {
				moved += (
					await coll.updateMany(
						{ ...own, [r.path]: { $in: ids } },
						{ $set: { [`${r.parent}.$[el].${r.sub}`]: keepId } },
						{ arrayFilters: [{ [`el.${r.sub}`]: { $in: ids } }] }
					)
				).modifiedCount;
			}
		}

		// The merged records: kept 30 days in case, then gone.
		const batch = crypto.randomUUID();
		await DeletedRecord.insertMany(
			mergeDocs.map((doc: any) => ({
				batch,
				route: routeKeyOf(req),
				model: Model.modelName,
				docId: doc._id,
				doc,
				reason: 'merge',
				mergedInto: keepId,
				deletedBy: req.user?._id,
			}))
		);
		await Model.deleteMany({ _id: { $in: ids } });

		recordHistory({
			req,
			action: 'update',
			model: Model.modelName,
			doc: keepDoc,
			changes: [
				...changes,
				{ field: '_merged', label: 'Merged in', from: '—', to: mergeDocs.map(nameOf).join(', ') },
			],
		});
		mergeDocs.forEach((doc: any) => recordHistory({ req, action: 'delete', model: Model.modelName, doc }));

		return res.status(200).json({ kept: keep, merged: merge.length, linksMoved: moved, batch });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not merge these records');
	}
};
