import express from 'express';
import mongoose from 'mongoose';
import History from '../library/models/history/model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { displayModelName } from '../library/functions/routeRegistry.function.js';

/**
 * /tenant/api/p/:projectId/history — a project's History (docs/multi-tenancy
 * WO-36): who created, changed or deleted what — records, models, the public
 * API, the site setup. Entries are written by recordHistory / recordProjectEvent
 * and are scoped to the project (History is tenantScoped).
 *
 *   GET /history?model&action&user&from&to&search&page&limit   newest first
 *   GET /history/facets                                        the kinds and people to filter by
 *   GET /history/g/document/:id                                one record's timeline (the record page's History tab)
 *
 * Reading needs view-history — Records: View (WO-21).
 */
const router = express.Router();
router.use(tenantPermissions(['view-history']));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

// Entries written before WO-36 carry a project model's internal name (`T<projectId>_Client`), in the text too.
const INTERNAL = /\bt[0-9a-f]{24}_/gi;

/** An entry as the panel reads it (the person's name is the snapshot taken when it happened). */
const view = (h: any) => ({
	_id: String(h._id),
	action: h.action,
	model: displayModelName(h.model),
	modelPath: h.modelPath,
	document: h.document ? String(h.document) : null,
	documentName: h.documentName || '',
	documentCode: h.documentCode || '',
	text: String(h.text || '').replace(INTERNAL, ''),
	changes: h.changes || [],
	user: h.user ? { _id: String(h.user), name: h.userName } : null,
	userName: h.userName,
	createdAt: h.createdAt,
});

router.get(
	'/',
	handle(async req => {
		const q = req.query;
		const query: any = {};
		if (q.model) query.model = { $in: [String(q.model), `T${req.project._id}_${String(q.model).replace(/\s+/g, '')}`] };
		if (q.action && ['create', 'update', 'delete'].includes(String(q.action))) query.action = String(q.action);
		if (q.user && isId(q.user)) query.user = q.user;
		if (q.document && isId(q.document)) query.document = q.document;
		if (q.from || q.to) {
			const from = q.from ? new Date(String(q.from)) : null;
			const to = q.to ? new Date(String(q.to)) : null;
			if ((from && isNaN(+from)) || (to && isNaN(+to))) throw new TenancyError(400, 'Choose valid dates');
			if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to.setUTCHours(23, 59, 59, 999);
			query.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
		}
		const search = String(q.search || '').trim().slice(0, 100);
		if (search) query.text = { $regex: escape(search), $options: 'i' };
		const limit = Math.min(Math.max(parseInt(String(q.limit), 10) || 50, 1), 1000);
		const page = Math.max(parseInt(String(q.page), 10) || 1, 1);
		const [docs, totalDocs] = await Promise.all([
			History.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
			History.countDocuments(query),
		]);
		return { doc: docs.map(view), totalDocs, docsInPage: docs.length, page, limit, totalPages: Math.ceil(totalDocs / limit) || 1 };
	})
);

router.get(
	'/facets',
	handle(async () => {
		const [models, people]: any = await Promise.all([
			History.distinct('model'),
			History.aggregate([{ $match: { user: { $ne: null } } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$user', name: { $first: '$userName' } } }, { $limit: 200 }]),
		]);
		return {
			models: [...new Set<string>(models.filter(Boolean).map((m: string) => displayModelName(m)))].sort(),
			people: people.map((p: any) => ({ _id: String(p._id), name: p.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
		};
	})
);

// The record page's History tab (the admin panel's /history/g/document/:id, same shape).
router.get(
	'/g/document/:id',
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(400, 'Invalid Document ID');
		const limit = Math.min(Number(req.query.limit) || 50, 1000);
		const page = Math.max(Number(req.query.page) || 1, 1);
		const [docs, totalDocs] = await Promise.all([
			History.find({ document: req.params.id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
			History.countDocuments({ document: req.params.id }),
		]);
		return { doc: docs.map(view), docsInPage: docs.length, totalDocs, page, totalPages: Math.ceil(totalDocs / limit) };
	})
);

export default router;
