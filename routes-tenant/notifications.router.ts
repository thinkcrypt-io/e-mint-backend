import express from 'express';
import mongoose from 'mongoose';
import TenantNotification from '../library/models/tenancy/tenantNotification.model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import { tenantProtectAccount } from '../middleware/tenant/protect.tenant.middleware.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { runUnscoped } from '../library/functions/tenantScope.function.js';

/**
 * /tenant/api/notifications — the signed-in person's own notifications
 * (docs/multi-tenancy WO-37), from every organization they're in. The same
 * shape as the super admin's /admin/api/notifications, so the panel's bell
 * and /notifications page serve both.
 *
 *   GET    /?page&limit&unread=true   newest first, with the unread count
 *   GET    /count                     { unread }
 *   PUT    /read-all
 *   PUT    /:id/read                  { read?: boolean }
 *   DELETE /:id
 */
const router = express.Router();
router.use(tenantProtectAccount);

const MAX_LIMIT = 100;
const isId = (v: any) => mongoose.isValidObjectId(v);

router.get(
	'/',
	handle(async req => {
		const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), MAX_LIMIT);
		const page = Math.max(Number(req.query.page) || 1, 1);
		const filter: any = { recipient: req.user._id, ...(req.query.unread === 'true' && { read: false }) };
		return runUnscoped(async () => {
			const [docs, totalDocs, unread] = await Promise.all([
				TenantNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
				TenantNotification.countDocuments(filter),
				TenantNotification.countDocuments({ recipient: req.user._id, read: false }),
			]);
			// Which organization each is from — named, as the list mixes them.
			const orgIds = [...new Set(docs.map((d: any) => String(d.organization || '')).filter(Boolean))];
			const orgs: any[] = orgIds.length ? await Organization.find({ _id: { $in: orgIds } }, { name: 1 }).lean() : [];
			const orgName = new Map(orgs.map(o => [String(o._id), o.name]));
			const doc = docs.map((d: any) => ({
				...d,
				actor: d.actorName ? { _id: d.actor, name: d.actorName } : null,
				organizationName: d.organization ? orgName.get(String(d.organization)) || '' : '',
			}));
			return { doc, totalDocs, unread, page, limit, totalPages: Math.ceil(totalDocs / limit) };
		});
	})
);

router.get(
	'/count',
	handle(async req => ({ unread: await runUnscoped(() => TenantNotification.countDocuments({ recipient: req.user._id, read: false })) }))
);

router.put(
	'/read-all',
	handle(async req => {
		const r: any = await runUnscoped(() => TenantNotification.updateMany({ recipient: req.user._id, read: false }, { $set: { read: true, readAt: new Date() } }));
		return { updated: r.modifiedCount };
	})
);

router.put(
	'/:id/read',
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(400, 'Invalid id');
		const read = req.body?.read !== false;
		const doc = await runUnscoped(() =>
			TenantNotification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { $set: { read, readAt: read ? new Date() : null } }, { new: true }).lean()
		);
		if (!doc) throw new TenancyError(404, 'Notification not found');
		return doc;
	})
);

router.delete(
	'/:id',
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(400, 'Invalid id');
		const gone = await runUnscoped(() => TenantNotification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id }));
		if (!gone) throw new TenancyError(404, 'Notification not found');
		return { message: 'Deleted' };
	})
);

export default router;
