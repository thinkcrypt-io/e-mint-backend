import express from 'express';
import crypto from 'crypto';
import Joi from 'joi';
import TenantUser from '../../library/models/tenancy/tenantUser.model.js';
import { HEARD_FROM, ORG_GOALS, ORG_INDUSTRIES, ORG_TEAM_SIZES } from '../../library/models/tenancy/organization.model.js';
import { TenantPasskey, TenantTwoFactorChallenge } from '../../library/models/twoFactor/tenant.models.js';
import { tenantSessions } from '../../library/functions/sessions.function.js';
import { makeTwoFactor, deliver, shell, p } from '../../library/controllers/twoFactor/twoFactor.service.js';
import { makeTwoFactorRouter } from '../../library/controllers/twoFactor/twoFactor.router.js';
import { addOwnSessionRoutes } from '../../library/controllers/sessions/sessions.router.js';
import { tenantProtectAccount } from '../../middleware/tenant/protect.tenant.middleware.js';
import { rateLimit } from '../../library/functions/rateLimit.function.js';
import {
	TenancyError,
	createOrganization,
	handle,
	pickOrganization,
	publicUser,
	selfPayload,
} from '../../library/functions/tenancy.function.js';

/**
 * /tenant/api/auth — a tenant user's account (docs/multi-tenancy WO-05).
 *
 *   POST /register                 account + organization + onboarding answers → { token }
 *   POST /login                    { token } — or { twoFactor: ticket… } when 2FA is on
 *   /2fa/*                         two-factor sign-in and settings (same as the admin's)
 *   /sessions/*                    your signed-in devices
 *   GET  /self                     account, organization, role, organizations, projects
 *   PUT  /update/self  (and PUT /) name, phone, image, layout, theme
 *   PUT  /update/preferences       table columns per route { field, preferences }
 *   PUT  /change-password          { oldPassword, password }
 *   POST /forgot-password          { email } — always the same answer
 *   POST /reset-password/:token    { password }
 *   POST /logout                   signs this device out
 *
 * Tokens: `{ _id, kind:'tenant', org, sid }`. A token issued with no
 * organization (the user belongs to none) only reaches the account routes.
 */

const router = express.Router();

const tenantUrl = () => String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/** The token a finished sign-in gets: a new session, in the organization the user last used. */
const issue = async (req: any, user: any, method: string) => {
	const org = await pickOrganization(user);
	return tenantSessions.issueSession(user, req, method, org);
};

export const tenantTwoFactor = makeTwoFactor({
	User: TenantUser,
	Passkey: TenantPasskey,
	Challenge: TenantTwoFactorChallenge,
	ticketSalt: 'tenant-two-factor-ticket',
	issue,
	origins: () => String(process.env.TENANT_WEBAUTHN_ORIGIN || tenantUrl()),
	rpName: process.env.TENANT_WEBAUTHN_RP_NAME || 'MINT',
});

const authLimit = rateLimit({ name: 'tenant-auth', windowMs: 15 * 60 * 1000, max: 30 });

const password = Joi.string().min(8).max(200).required().messages({
	'string.min': 'Use at least 8 characters for the password',
	'any.required': 'A password is required',
});

const optionalPick = (list: readonly string[]) => Joi.string().valid(...list).allow('', null);

const onboardingSchema = Joi.object({
	businessName: Joi.string().trim().max(160).allow(''),
	industry: optionalPick(ORG_INDUSTRIES),
	teamSize: optionalPick(ORG_TEAM_SIZES),
	role: Joi.string().trim().max(80).allow(''),
	website: Joi.string().trim().max(300).allow(''),
	country: Joi.string().trim().max(80).allow(''),
	heardFrom: optionalPick(HEARD_FROM),
	heardFromOther: Joi.string().trim().max(200).allow(''),
	goals: Joi.array().items(Joi.string().valid(...ORG_GOALS)).max(ORG_GOALS.length),
});

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

/* -------------------------------------------------------------- sign-up */

router.post(
	'/register',
	authLimit,
	handle(async req => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120).required(),
				email: Joi.string().trim().lowercase().email().required(),
				password,
				organization: Joi.string().trim().min(1).max(120).required().messages({ 'any.required': 'Name your organization' }),
				onboarding: onboardingSchema.default({}),
			}),
			req.body
		);
		if (await TenantUser.exists({ email: body.email }))
			throw new TenancyError(400, 'An account with this email already exists — sign in instead.', 'email_taken');

		const user: any = await TenantUser.create({ name: body.name, email: body.email, password: body.password });
		try {
			const organization = await createOrganization({ name: body.organization, owner: user, onboarding: body.onboarding });
			user.lastOrganization = organization._id;
			await user.save();
			return { token: await tenantSessions.issueSession(user, req, 'password', organization._id) };
		} catch (e) {
			await TenantUser.deleteOne({ _id: user._id }).catch(() => undefined);
			throw e;
		}
	})
);

/* -------------------------------------------------------------- sign-in */

router.post(
	'/login',
	authLimit,
	handle(async req => {
		const body = check(
			Joi.object({ email: Joi.string().trim().lowercase().email().required(), password: Joi.string().required() }),
			req.body
		);
		const user: any = await TenantUser.findOne({ email: body.email }).select('+password');
		// One answer for "no such account" and "wrong password".
		if (!user || !(await user.checkPassword(body.password))) throw new TenancyError(400, 'That email and password don’t match.');
		if (user.isActive === false) throw new TenancyError(400, 'This account has been deactivated.');
		if (user.twoFactorEnabled) return { twoFactor: await tenantTwoFactor.startLogin(user) };
		return { token: await issue(req, user, 'password') };
	})
);

router.use('/2fa', makeTwoFactorRouter(tenantTwoFactor, tenantProtectAccount));

const sessions = express.Router();
sessions.use(tenantProtectAccount);
addOwnSessionRoutes(sessions, tenantSessions);
router.use('/sessions', sessions);

/* ------------------------------------------------------------ passwords */

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

router.post(
	'/forgot-password',
	authLimit,
	handle(async req => {
		const { email } = check(Joi.object({ email: Joi.string().trim().lowercase().email().required() }), req.body);
		const user: any = await TenantUser.findOne({ email });
		if (user && user.isActive !== false) {
			const raw = crypto.randomBytes(32).toString('hex');
			user.resetPasswordToken = sha256(raw);
			user.resetPasswordExpires = new Date(Date.now() + RESET_TTL_MS);
			await user.save();
			const link = `${tenantUrl()}/auth/reset-password/${raw}`;
			await deliver(
				user.email,
				'Reset your MINT password',
				`Hi ${user.name},\n\nChoose a new password here — the link works for an hour:\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
				shell('Reset your password', p(`Hi ${user.name},`) + p(`Choose a new password with the link below. It works for an hour.`) + p(`<a href="${link}">${link}</a>`) + p("If you didn't ask for this, ignore this email."))
			);
		}
		// The same answer either way: this must not tell who has an account.
		return { message: 'If that email has an account, a reset link is on its way.' };
	})
);

router.post(
	'/reset-password/:token',
	authLimit,
	handle(async req => {
		const { password: next } = check(Joi.object({ password }), req.body);
		const user: any = await TenantUser.findOne({
			resetPasswordToken: sha256(String(req.params.token || '')),
			resetPasswordExpires: { $gt: new Date() },
		}).select('+resetPasswordToken +resetPasswordExpires');
		if (!user) throw new TenancyError(400, 'This reset link has expired or was already used. Ask for a new one.', 'reset_expired');
		user.password = next;
		user.resetPasswordToken = undefined;
		user.resetPasswordExpires = undefined;
		await user.save();
		// A new password signs out every device.
		const live = await tenantSessions.Session.find({ admin: user._id, revokedAt: null }).lean();
		await tenantSessions.revokeSessions(live, user._id, 'Password reset');
		return { message: 'Your password was changed. Sign in with the new one.' };
	})
);

/* -------------------------------------------------------- your account */

router.get('/self', tenantProtectAccount, handle(selfPayload));

const SELF_FIELDS = Joi.object({
	name: Joi.string().trim().min(1).max(120),
	phone: Joi.string().trim().max(40).allow(''),
	image: Joi.string().trim().max(1000).allow(''),
	modalLayout: Joi.string().valid('modal', 'drawer'),
	theme: Joi.string().trim().max(40).allow('', null),
});

const updateSelf = handle(async req => {
	const changes = check(SELF_FIELDS, req.body);
	await TenantUser.updateOne({ _id: req.user._id }, { $set: changes });
	req.user = await TenantUser.findById(req.user._id);
	return publicUser(req.user);
});
router.put('/update/self', tenantProtectAccount, updateSelf);
router.put('/', tenantProtectAccount, updateSelf);

router.put(
	'/update/preferences',
	tenantProtectAccount,
	handle(async req => {
		const { field, preferences } = req.body || {};
		if (typeof field !== 'string' || !/^[\w:./-]{1,120}$/.test(field)) throw new TenancyError(400, 'Which table?');
		if (!Array.isArray(preferences) || preferences.length > 200 || preferences.some((x: any) => typeof x !== 'string'))
			throw new TenancyError(400, 'Preferences are a list of column keys');
		// Keys can hold dots ("p:<id>.invoices" would nest): store under a safe key.
		await TenantUser.updateOne({ _id: req.user._id }, { $set: { [`preferences.${field.replace(/\./g, '_')}`]: preferences } });
		return { message: 'Saved' };
	})
);

router.put(
	'/change-password',
	tenantProtectAccount,
	handle(async req => {
		const body = check(Joi.object({ oldPassword: Joi.string().required(), password }), req.body);
		const user: any = await TenantUser.findById(req.user._id).select('+password');
		if (!(await user.checkPassword(body.oldPassword))) throw new TenancyError(400, 'Your current password isn’t right.', 'wrong_password');
		user.password = body.password;
		await user.save();
		// Every other device signs in again with the new password.
		const others = await tenantSessions.Session.find({ admin: user._id, revokedAt: null, sid: { $ne: req.sessionId } }).lean();
		await tenantSessions.revokeSessions(others, user._id, 'Password changed');
		return { message: 'Password changed' };
	})
);

router.post(
	'/logout',
	tenantProtectAccount,
	handle(async req => {
		const row: any = await tenantSessions.Session.findOne({ sid: req.sessionId }).lean();
		await tenantSessions.revokeSessions([row || { sid: req.sessionId, admin: req.user._id }], req.user._id, 'Signed out');
		return { message: 'Signed out' };
	})
);

export default router;
