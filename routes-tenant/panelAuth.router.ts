import express from 'express';
import Joi from 'joi';
import PanelAdmin from '../library/models/tenancy/panelAdmin.model.js';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import { tenantSessions } from '../library/functions/sessions.function.js';
import { tenantProtectAccount } from '../middleware/tenant/protect.tenant.middleware.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { panelSelfPayload, publicPanelAdmin } from '../library/functions/panelAdmin.function.js';
import { addOwnSessionRoutes } from '../library/controllers/sessions/sessions.router.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import ApiKey from '../library/models/builder/apiKey.model.js';
import { hashKey } from '../library/controllers/mcp/mcp.router.js';
import { runUnscoped } from '../library/functions/tenantScope.function.js';

/**
 * /tenant/api/panel/auth — a commerce panel store admin's own account
 * (docs/commerce-panel CP-01). The commerce panel sends its `auth/…` calls here.
 *
 *   POST /login                { email, password, app? } → { token, project }
 *                              app 'commerce' (default): a store's login; 'panel': any other project's
 *                              panel user, at the panel app (docs/panel-users PU-03)
 *   GET  /self                 the login, its organization and its one project (auth/self's shape)
 *   PUT  /update/self (and /)  name, phone, image, layout, theme
 *   PUT  /update/preferences   table columns per route
 *   PUT  /change-password      { oldPassword, password }
 *   POST /logout               signs this device out
 *   /sessions/*                your signed-in devices
 *   GET    /mcp-keys           your keys for your own AI (docs/commerce-panel CP-07)
 *   POST   /mcp-keys           { name, expiresInDays? } → { doc, secret } — the secret only in this answer
 *   DELETE /mcp-keys/:id       revoked at once
 *
 * No sign-up and no reset by email: the project's managers make the login and
 * set a new password from the tenant panel (Project → Panel admins).
 */
const router = express.Router();

const authLimit = rateLimit({ name: 'panel-auth', windowMs: 15 * 60 * 1000, max: 30 });

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

router.post(
	'/login',
	authLimit,
	handle(async req => {
		const body = check(
			Joi.object({ email: Joi.string().trim().lowercase().email().required(), password: Joi.string().required(), app: Joi.string().valid('commerce', 'panel').default('commerce') }),
			req.body
		);
		const admin: any = await PanelAdmin.findOne({ email: body.email }).select('+password');
		if (!admin || !(await admin.checkPassword(body.password))) throw new TenancyError(400, 'That email and password don’t match.');
		if (admin.isActive === false) throw new TenancyError(400, 'This login has been switched off. Ask the store’s owner.');
		const project: any = await TenantProject.findById(admin.project).lean();
		const organization: any = project && (await Organization.findById(project.organization, { isActive: 1 }).lean());
		if (!project || project.isActive === false || !organization || organization.isActive === false)
			throw new TenancyError(400, 'This project isn’t open any more.');
		// A store's logins use the commerce panel; every other project's, the panel app.
		if (body.app === 'commerce' && project.type !== 'ecommerce') throw new TenancyError(400, 'This login is for the panel app, not a store. Sign in at panel.tcrypt.site.', 'use_panel');
		if (body.app === 'panel' && project.type === 'ecommerce') throw new TenancyError(400, 'This is a store login. Sign in at the commerce panel.', 'use_commerce');
		await PanelAdmin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
		return {
			token: await tenantSessions.issueSession(admin, req, 'password', project.organization),
			project: { _id: String(project._id), publicSlug: project.publicSlug, name: project.name, type: project.type },
		};
	})
);

// Everything below: a panel token only (tenantProtectAccount signs either kind in).
router.use(tenantProtectAccount, (req: any, res: any, next: any) =>
	req.panelAdmin ? next() : res.status(403).json({ message: 'This is for store logins only.' })
);

router.get('/self', handle(panelSelfPayload));

const SELF_FIELDS = Joi.object({
	name: Joi.string().trim().min(1).max(120),
	phone: Joi.string().trim().max(40).allow(''),
	image: Joi.string().trim().max(1000).allow(''),
	modalLayout: Joi.string().valid('modal', 'drawer'),
	theme: Joi.string().trim().max(40).allow('', null),
});

const updateSelf = handle(async req => {
	await PanelAdmin.updateOne({ _id: req.user._id }, { $set: check(SELF_FIELDS, req.body) });
	return publicPanelAdmin(await PanelAdmin.findById(req.user._id).lean());
});
router.put('/update/self', updateSelf);
router.put('/', updateSelf);

router.put(
	'/update/preferences',
	handle(async req => {
		const { field, preferences } = req.body || {};
		if (typeof field !== 'string' || !/^[\w:./-]{1,120}$/.test(field)) throw new TenancyError(400, 'Which table?');
		if (!Array.isArray(preferences) || preferences.length > 200 || preferences.some((x: any) => typeof x !== 'string'))
			throw new TenancyError(400, 'Preferences are a list of column keys');
		await PanelAdmin.updateOne({ _id: req.user._id }, { $set: { [`preferences.${field.replace(/\./g, '_')}`]: preferences } });
		return { message: 'Saved' };
	})
);

router.put(
	'/change-password',
	handle(async req => {
		const body = check(
			Joi.object({
				oldPassword: Joi.string().required(),
				password: Joi.string().min(8).max(200).required().messages({ 'string.min': 'Use at least 8 characters for the password' }),
			}),
			req.body
		);
		const admin: any = await PanelAdmin.findById(req.user._id).select('+password');
		if (!(await admin.checkPassword(body.oldPassword))) throw new TenancyError(400, 'Your current password isn’t right.', 'wrong_password');
		admin.password = body.password;
		await admin.save();
		const others = await tenantSessions.Session.find({ admin: admin._id, revokedAt: null, sid: { $ne: req.sessionId } }).lean();
		await tenantSessions.revokeSessions(others, admin._id, 'Password changed');
		return { message: 'Password changed' };
	})
);

router.post(
	'/logout',
	handle(async req => {
		const row: any = await tenantSessions.Session.findOne({ sid: req.sessionId }).lean();
		await tenantSessions.revokeSessions([row || { sid: req.sessionId, admin: req.user._id }], req.user._id, 'Signed out');
		return { message: 'Signed out' };
	})
);

// Keys for the store login's own AI (docs/commerce-panel CP-07): /tenant/commerce-mcp, the store's records only.
const ownKeys = (req: any) => ({ panelAdmin: req.user._id, project: req.user.project });
const plainKey = (k: any) => ({ _id: String(k._id), name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null, expiresAt: k.expiresAt || null, revokedAt: k.revokedAt || null });

router.get(
	'/mcp-keys',
	handle(async req => {
		const rows = await runUnscoped(() => ApiKey.find(ownKeys(req)).sort({ createdAt: -1 }).lean());
		return { doc: rows.map(plainKey) };
	})
);

router.post(
	'/mcp-keys',
	handle(async (req: any, res: any) => {
		const body = check(Joi.object({ name: Joi.string().trim().min(1).max(80).required().messages({ 'any.required': 'Name the key (e.g. “Claude”)' }), expiresInDays: Joi.number().integer().min(0).max(3650) }), req.body);
		const live = await runUnscoped(() => ApiKey.countDocuments({ ...ownKeys(req), revokedAt: null }));
		if (live >= 10) throw new TenancyError(400, 'Up to 10 keys — revoke one you don’t use.');
		const secret = `emk_${crypto.randomBytes(24).toString('base64url')}`;
		const doc: any = await runUnscoped(() =>
			ApiKey.create({
				name: body.name,
				prefix: secret.slice(0, 10),
				hash: hashKey(secret),
				scopes: ['data'],
				createdBy: req.user._id,
				panelAdmin: req.user._id,
				organization: req.organization._id,
				project: req.user.project,
				...(body.expiresInDays > 0 && { expiresAt: new Date(Date.now() + body.expiresInDays * 86400000) }),
			})
		);
		res.status(201);
		return { doc: plainKey(doc), secret };
	})
);

router.delete(
	'/mcp-keys/:id',
	handle(async req => {
		if (!mongoose.isValidObjectId(req.params.id)) throw new TenancyError(404, 'Not found');
		const r = await runUnscoped(() => ApiKey.updateOne({ _id: req.params.id, ...ownKeys(req), revokedAt: null }, { $set: { revokedAt: new Date() } }));
		if (!r.matchedCount) throw new TenancyError(404, 'Key not found, or already revoked');
		return { message: 'Key revoked' };
	})
);

const sessions = express.Router();
addOwnSessionRoutes(sessions, tenantSessions);
router.use('/sessions', sessions);

export default router;
