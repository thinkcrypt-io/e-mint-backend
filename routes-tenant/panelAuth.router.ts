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

/**
 * /tenant/api/panel/auth — a commerce panel store admin's own account
 * (docs/commerce-panel CP-01). The commerce panel sends its `auth/…` calls here.
 *
 *   POST /login                { email, password } → { token, project }
 *   GET  /self                 the login, its organization and its one project (auth/self's shape)
 *   PUT  /update/self (and /)  name, phone, image, layout, theme
 *   PUT  /update/preferences   table columns per route
 *   PUT  /change-password      { oldPassword, password }
 *   POST /logout               signs this device out
 *   /sessions/*                your signed-in devices
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
		const body = check(Joi.object({ email: Joi.string().trim().lowercase().email().required(), password: Joi.string().required() }), req.body);
		const admin: any = await PanelAdmin.findOne({ email: body.email }).select('+password');
		if (!admin || !(await admin.checkPassword(body.password))) throw new TenancyError(400, 'That email and password don’t match.');
		if (admin.isActive === false) throw new TenancyError(400, 'This login has been switched off. Ask the store’s owner.');
		const project: any = await TenantProject.findById(admin.project).lean();
		const organization: any = project && (await Organization.findById(project.organization, { isActive: 1 }).lean());
		if (!project || project.isActive === false || project.type !== 'ecommerce' || !organization || organization.isActive === false)
			throw new TenancyError(400, 'This store isn’t open any more.');
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

const sessions = express.Router();
addOwnSessionRoutes(sessions, tenantSessions);
router.use('/sessions', sessions);

export default router;
