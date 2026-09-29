import express, { Response } from 'express';
import mongoose from 'mongoose';
import Admin from '../../models/admin/model.js';
import AdminSession from '../../models/sessions/adminSession.model.js';
import { adminProtect } from '../../../imports.js';
import { revokeSessions } from '../../functions/sessions.function.js';

/**
 * /admin/api/auth/sessions — where an admin is signed in, and signing out.
 *
 * Your own (any signed-in admin):
 *   GET    /           your signed-in devices, most recently active first
 *   DELETE /current    sign out here (Logout calls it)
 *   DELETE /others     sign out everywhere but here
 *   DELETE /:id        sign out one of your devices
 *
 * Everyone's (super admin — `*` — or the Login sessions permission: view-sessions
 * to see them, delete-sessions to sign them out):
 *   GET    /all?status=active|signed-out|all&admin=<id>&search=&page=&limit=
 *   DELETE /all/:id            sign out any session
 *   DELETE /all/admin/:adminId sign out every device of one admin
 *
 * A signed-out session's token is blacklisted (BlacklistedToken); its next
 * request gets 401 `{ code: 'SESSION_REVOKED' }` and the admin app signs out.
 */

const router = express.Router();
router.use(adminProtect);

const ONLINE_MS = 5 * 60 * 1000;

const handle =
	(fn: (req: any, res: Response) => Promise<any>) =>
	async (req: any, res: Response) => {
		try {
			const out = await fn(req, res);
			if (!res.headersSent) res.status(200).json(out);
		} catch (e: any) {
			const status = e?.status || 500;
			if (status === 500) console.error('sessions:', e?.message);
			return res.status(status).json({ message: e?.message || 'Something went wrong' });
		}
	};

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

const view = (s: any, currentSid?: string) => ({
	_id: String(s._id),
	current: !!currentSid && s.sid === currentSid,
	method: s.method,
	browser: s.browser || 'Unknown browser',
	os: s.os || 'Unknown OS',
	deviceType: s.deviceType || 'unknown',
	ip: s.lastIp || s.ip || '',
	signedInAt: s.createdAt,
	lastActiveAt: s.lastActiveAt || s.createdAt,
	online: !!s.lastActiveAt && Date.now() - new Date(s.lastActiveAt).getTime() < ONLINE_MS && !s.revokedAt,
	revokedAt: s.revokedAt || null,
	revokeReason: s.revokeReason || null,
	...(s.admin && typeof s.admin === 'object' && s.admin._id
		? { admin: { _id: String(s.admin._id), name: s.admin.name, email: s.admin.email, role: s.admin.role?.name } }
		: {}),
	...(s.revokedBy && typeof s.revokedBy === 'object' ? { revokedBy: { _id: String(s.revokedBy._id), name: s.revokedBy.name } } : {}),
});

/* ------------------------------------------------------------- your own */

router.get(
	'/',
	handle(async req => {
		const docs = await AdminSession.find({ admin: req.user._id, revokedAt: null }).sort({ lastActiveAt: -1 }).limit(100).lean();
		// The current device first, then by last activity.
		const list = docs.map(s => view(s, req.sessionId)).sort((a, b) => Number(b.current) - Number(a.current));
		return { doc: list };
	})
);

/** This device — Logout. A token from before sessions may have no row yet; it's blacklisted all the same. */
router.delete(
	'/current',
	handle(async req => {
		const row: any = await AdminSession.findOne({ sid: req.sessionId }).lean();
		await revokeSessions([row || { sid: req.sessionId, admin: req.user._id }], req.user._id, 'Signed out');
		return { message: 'Signed out' };
	})
);

router.delete(
	'/others',
	handle(async req => {
		const others = await AdminSession.find({ admin: req.user._id, revokedAt: null, sid: { $ne: req.sessionId } }).lean();
		const count = await revokeSessions(others, req.user._id, 'Signed out from another device');
		return { message: `Signed out of ${count} other device${count === 1 ? '' : 's'}`, count };
	})
);

router.delete(
	'/:id',
	handle(async (req, res) => {
		if (req.params.id === 'all') return res.status(404).json({ message: 'Not found' });
		if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Session not found');
		const row: any = await AdminSession.findOne({ _id: req.params.id, admin: req.user._id }).lean();
		if (!row) throw fail(404, 'Session not found');
		await revokeSessions([row], req.user._id, row.sid === req.sessionId ? 'Signed out' : 'Signed out from another device');
		return { message: 'Signed out', current: row.sid === req.sessionId };
	})
);

/* ------------------------------------------------------------ everyone's */

/** Super admin (`*`), or the Login sessions permission: View to see everyone's, Delete to sign them out. */
const superOnly = (req: any, action: 'view' | 'delete' = 'view') => {
	const p: string[] = req.permissions || [];
	if (!p.includes('*') && !p.includes(`${action}-sessions`))
		throw fail(403, action === 'view' ? 'Only a super admin can see everyone’s sessions' : 'Only a super admin can sign other admins out');
};

router.get(
	'/all',
	handle(async req => {
		superOnly(req);
		const q = req.query || {};
		const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
		const page = Math.max(parseInt(q.page, 10) || 1, 1);
		const status = ['active', 'signed-out', 'all'].includes(q.status) ? q.status : 'active';

		const filter: any = {};
		if (status === 'active') filter.revokedAt = null;
		if (status === 'signed-out') filter.revokedAt = { $ne: null };
		if (q.admin && mongoose.isValidObjectId(q.admin)) filter.admin = q.admin;
		const search = String(q.search || '').trim();
		if (search) {
			const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			const admins = await Admin.find({ $or: [{ name: re }, { email: re }] }, { _id: 1 }).limit(500).lean();
			filter.$or = [{ admin: { $in: admins.map((a: any) => a._id) } }, { browser: re }, { os: re }, { lastIp: re }, { ip: re }];
		}

		const [docs, total, active, online] = await Promise.all([
			AdminSession.find(filter)
				.sort({ lastActiveAt: -1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.populate({ path: 'admin', select: 'name email role', populate: { path: 'role', select: 'name' } })
				.populate('revokedBy', 'name')
				.lean(),
			AdminSession.countDocuments(filter),
			AdminSession.countDocuments({ revokedAt: null }),
			AdminSession.distinct('admin', { revokedAt: null, lastActiveAt: { $gte: new Date(Date.now() - ONLINE_MS) } }),
		]);
		return {
			doc: docs.map(s => view(s, req.sessionId)),
			total,
			page,
			limit,
			summary: { activeSessions: active, adminsOnline: online.length },
		};
	})
);

router.delete(
	'/all/admin/:adminId',
	handle(async req => {
		superOnly(req, 'delete');
		if (!mongoose.isValidObjectId(req.params.adminId)) throw fail(404, 'Admin not found');
		const rows = await AdminSession.find({ admin: req.params.adminId, revokedAt: null }).lean();
		const count = await revokeSessions(rows, req.user._id, 'Signed out by an administrator');
		return { message: `Signed out of ${count} device${count === 1 ? '' : 's'}`, count };
	})
);

router.delete(
	'/all/:id',
	handle(async req => {
		superOnly(req, 'delete');
		if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Session not found');
		const row: any = await AdminSession.findById(req.params.id).lean();
		if (!row) throw fail(404, 'Session not found');
		await revokeSessions([row], req.user._id, row.sid === req.sessionId ? 'Signed out' : 'Signed out by an administrator');
		return { message: 'Signed out', current: row.sid === req.sessionId };
	})
);

export default router;
