import express, { Response } from 'express';
import mongoose from 'mongoose';
import { adminProtect } from '../../../middleware/index.js';
import Notification from '../../models/notifications/notification.model.js';
import Admin from '../../models/admin/model.js';

/**
 * /admin/api/notifications — the signed-in admin's own notifications. No
 * permission beyond being signed in: everyone reads only their own.
 *
 * /admin/api/access-users — the admins a record can be shared with, for the
 * access picker. Name and email only, for any signed-in admin: sharing a
 * record mustn't need the right to manage admins.
 */

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const MAX_LIMIT = 100;

export const notificationsRouter = express.Router();
notificationsRouter.use(adminProtect);

/** GET /notifications?page=1&limit=20&unread=true */
notificationsRouter.get('/', async (req: any, res: Response) => {
	try {
		const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), MAX_LIMIT);
		const page = Math.max(Number(req.query.page) || 1, 1);
		const filter: any = { recipient: req.user._id, ...(req.query.unread === 'true' && { read: false }) };
		const [doc, totalDocs, unread] = await Promise.all([
			Notification.find(filter)
				.sort({ createdAt: -1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.populate('actor', 'name email')
				.lean(),
			Notification.countDocuments(filter),
			Notification.countDocuments({ recipient: req.user._id, read: false }),
		]);
		return res.status(200).json({ doc, totalDocs, unread, page, limit, totalPages: Math.ceil(totalDocs / limit) });
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});

/** GET /notifications/count — unread, for the bell. */
notificationsRouter.get('/count', async (req: any, res: Response) => {
	try {
		const unread = await Notification.countDocuments({ recipient: req.user._id, read: false });
		return res.status(200).json({ unread });
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});

/** PUT /notifications/read-all */
notificationsRouter.put('/read-all', async (req: any, res: Response) => {
	try {
		const r = await Notification.updateMany({ recipient: req.user._id, read: false }, { $set: { read: true, readAt: new Date() } });
		return res.status(200).json({ updated: r.modifiedCount });
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});

/** PUT /notifications/:id/read  { read?: boolean } */
notificationsRouter.put('/:id/read', async (req: any, res: Response) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const read = req.body?.read !== false;
		const doc = await Notification.findOneAndUpdate(
			{ _id: req.params.id, recipient: req.user._id },
			{ $set: { read, readAt: read ? new Date() : null } },
			{ new: true }
		).lean();
		if (!doc) return fail(res, 404, 'Notification not found');
		return res.status(200).json({ doc });
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});

/** DELETE /notifications/:id */
notificationsRouter.delete('/:id', async (req: any, res: Response) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const r = await Notification.deleteOne({ _id: req.params.id, recipient: req.user._id });
		if (!r.deletedCount) return fail(res, 404, 'Notification not found');
		return res.status(200).json({ message: 'Deleted' });
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});

export const accessUsersRouter = express.Router();
accessUsersRouter.use(adminProtect);

/** GET /access-users?search= — shaped like a list endpoint, so the record pickers can read it. */
accessUsersRouter.get('/', async (req: any, res: Response) => {
	try {
		const search = String(req.query.search || '').trim();
		const filter: any = { isActive: { $ne: false } };
		if (search) {
			const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			filter.$or = [{ name: rx }, { email: rx }];
		}
		const doc = await Admin.find(filter).select('name email').sort({ name: 1 }).limit(1000).lean();
		return res.status(200).json({ doc, totalDocs: doc.length, docsInPage: doc.length, totalPages: 1, page: 1 });
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});

/** GET /access-users/:id — one, for pickers that load a saved value by id. */
accessUsersRouter.get('/:id', async (req: any, res: Response) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const doc = await Admin.findById(req.params.id).select('name email').lean();
		if (!doc) return fail(res, 404, 'Not found');
		return res.status(200).json(doc);
	} catch (e: any) {
		return fail(res, 500, e.message);
	}
});
