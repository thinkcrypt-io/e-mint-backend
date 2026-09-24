import { NextFunction, Response } from 'express';
import mongoose from 'mongoose';

/**
 * Per-record access for models that opt in: each record has an owner
 * (`addedBy`), a `privacy` and an `access` list of admins.
 *
 *   only-me  — the owner alone
 *   private  — the owner, and the admins in `access`
 *   public   — everyone who may view the route
 *
 * This sits on top of the route's permissions, never instead of them: an
 * admin still needs view-<route> to see any record at all. Reading and
 * editing follow the rule above; deleting a record and changing who has
 * access to it are the owner's alone.
 *
 * Built models with "Restrict access" get these middlewares automatically
 * (dynamicModels.function.ts); a code route can opt in the same way with
 * `injectMiddleware: recordAccessMiddleware(Model)`.
 */

export const PRIVACY_OPTIONS = [
	{ value: 'private', label: 'Private' },
	{ value: 'only-me', label: 'Only me' },
	{ value: 'public', label: 'Public' },
];
export const PRIVACY_VALUES = PRIVACY_OPTIONS.map(o => o.value);
/** The paths an access-restricted model owns. */
export const ACCESS_KEYS = ['privacy', 'access', 'addedBy'];
/** Only the owner may change these. */
const OWNER_KEYS = ['privacy', 'access', 'addedBy'];

/** A model whose records carry an owner, a privacy and an access list. */
export const isAccessRestricted = (Model?: mongoose.Model<any> | null) =>
	!!(Model?.schema?.path('privacy') && Model.schema.path('access') && Model.schema.path('addedBy'));

/** The records a user may see. */
export const accessRule = (userId: any) => ({
	$or: [{ addedBy: userId }, { privacy: 'public' }, { privacy: 'private', access: userId }],
});

/** `query` narrowed to what the user may see — kept apart in an $and, so a later `$or` (search) can't replace it. */
export const withAccess = (query: any, userId: any) => {
	const rule = accessRule(userId);
	return query && Object.keys(query).length ? { $and: [query, rule] } : { $and: [rule] };
};

const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);

export const recordAccessMiddleware = (Model: mongoose.Model<any>) => {
	/** Lists, single reads, counts, exports: only what the user may see. */
	const read = (req: any, res: Response, next: NextFunction) => {
		req.queryHelper = withAccess(req.queryHelper, req.user?._id);
		next();
	};

	/** A new record is always its creator's; nobody sets another owner. */
	const create = (req: any, res: Response, next: NextFunction) => {
		if (req.body) delete req.body.addedBy;
		next();
	};

	/** Editing needs access to the record; changing its access needs owning it. */
	const update = async (req: any, res: Response, next: NextFunction) => {
		try {
			const doc: any = await Model.findOne({ _id: req.params.id, ...accessRule(req.user?._id) })
				.select('addedBy')
				.lean();
			if (!doc) return res.status(404).json({ message: 'Document Not Found' });
			if (req.body) delete req.body.addedBy;
			const touches = OWNER_KEYS.filter(k => req.body && k in req.body);
			if (touches.length && !same(doc.addedBy, req.user?._id))
				return res.status(403).json({ message: 'Only the owner can change who has access to this record' });
			next();
		} catch (e: any) {
			return res.status(500).json({ message: e.message });
		}
	};

	/** Deleting is the owner's alone. */
	const remove = async (req: any, res: Response, next: NextFunction) => {
		try {
			const doc: any = await Model.findOne({ _id: req.params.id, ...accessRule(req.user?._id) })
				.select('addedBy')
				.lean();
			if (!doc) return res.status(404).json({ message: 'Document Not Found' });
			if (!same(doc.addedBy, req.user?._id))
				return res.status(403).json({ message: 'Only the owner can delete this record' });
			next();
		} catch (e: any) {
			return res.status(500).json({ message: e.message });
		}
	};

	/**
	 * Bulk edits: never of access itself (it bypasses the owner check and the
	 * notifications), and only of the records the user may see.
	 */
	const bulk = async (req: any, res: Response, next: NextFunction) => {
		try {
			const updates = req.body?.updates || {};
			if (OWNER_KEYS.some(k => k in updates))
				return res.status(400).json({ message: 'Access can only be changed one record at a time, by its owner' });
			const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: any) => mongoose.isValidObjectId(id)) : [];
			const visible = await Model.find({ _id: { $in: ids }, ...accessRule(req.user?._id) }).distinct('_id');
			if (!visible.length) return res.status(404).json({ message: 'None of these records are yours to edit' });
			req.body.ids = visible;
			next();
		} catch (e: any) {
			return res.status(500).json({ message: e.message });
		}
	};

	return {
		post: [create],
		getAll: [read],
		getById: [read],
		getByCode: [read],
		getBySlug: [read],
		export: [read],
		count: [read],
		distinct: [read],
		copy: [read],
		update: [update],
		updateMany: [bulk],
		delete: [remove],
	};
};
