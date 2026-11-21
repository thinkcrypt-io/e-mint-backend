import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import crypto from 'crypto';
import PanelAdmin from '../library/models/tenancy/panelAdmin.model.js';
import PanelRole from '../library/models/tenancy/panelRole.model.js';
import { tenantSessions } from '../library/functions/sessions.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { MANAGE_PANEL, USERNAME_HELP, USERNAME_RULE, panelLoginName, panelLoginTaken, publicPanelAdmin } from '../library/functions/panelAdmin.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/panel-admins (also /panel-users) — a project's panel
 * logins (docs/panel-users PU-02; docs/commerce-panel CP-01 for stores). The
 * project's managers (manage-projects, or invite-to-projects) make them with a
 * username and a password (PU-08; an email is optional and signs in too) — and so
 * can a panel super admin, from the panel app. One username is one login of one project.
 *
 * A store's logins open the commerce panel; any other project's open the panel
 * app (panel.tcrypt.site). Each has a panel role (panel-roles) or is a super
 * admin; a store login without either keeps the fixed store set.
 *
 *   GET    /             { doc: logins, totalDocs, roles }
 *   POST   /             { name, username, email?, password, phone?, role?, superAdmin? }   409 username_taken / email_taken
 *   PUT    /:id          { name?, username?, email?, phone?, isActive?, password?, role?, superAdmin? } — switching off or a new password signs them out
 *   DELETE /:id          removes the login and signs it out
 *   POST   /demo         { role?, superAdmin? } — the project's one demo login (DEMO_LOGINS.md), tenant managers only
 *   POST   /demo/new-link  a new key: the old link stops and its demos are signed out
 *
 * GET answers the demo login apart (`demo`, with its key) to tenant managers; it is never in `doc`,
 * and the panel apps' super admins neither see nor change it.
 *
 * A panel super admin can't switch off, demote or remove themselves.
 */
const router = express.Router({ mergeParams: true });

/** The project's managers, or a panel super admin of this project. */
export const panelManagers = (req: any, res: any, next: any) => {
	if (req.panelAdmin) return grants(req.permissions, [MANAGE_PANEL]) ? next() : res.status(403).json({ message: 'Only a super admin manages panel users' });
	return grants(req.permissions, ['manage-projects', 'invite-to-projects']) ? next() : res.status(403).json({ message: 'Forbidden: your role in this organization doesn’t allow this' });
};
router.use(panelManagers);

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

const password = Joi.string().min(8).max(200).messages({ 'string.min': 'Use at least 8 characters for the password' });

const signOutAll = async (id: any, why: string) => {
	const rows = await tenantSessions.Session.find({ admin: id, revokedAt: null }).lean();
	if (rows.length) await tenantSessions.revokeSessions(rows, id, why);
};

const findOwn = async (req: any) => {
	if (!mongoose.isValidObjectId(req.params.id)) throw new TenancyError(404, 'Not found');
	// The demo login is the tenant managers' alone (DEMO_LOGINS.md D6).
	const admin: any = await PanelAdmin.findOne({ _id: req.params.id, project: req.project._id, ...(req.panelAdmin && { demo: { $ne: true } }) }).select('+password');
	if (!admin) throw new TenancyError(404, 'Not found');
	return admin;
};

/** A role id of this project's panel roles, or null to clear it. */
const roleOf = async (req: any, value: any) => {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	if (!mongoose.isValidObjectId(value) || !(await PanelRole.exists({ _id: value }))) throw new TenancyError(400, 'Choose one of the project’s panel roles');
	return value;
};

/** Outside a store a login needs a role, unless it's a super admin. */
const needsRole = (req: any, role: any, superAdmin: boolean) => {
	if (req.project.type !== 'ecommerce' && !role && !superAdmin) throw new TenancyError(400, 'Choose a role, or make them a super admin');
};

/** A panel super admin can't lock themselves out. */
const notSelf = (req: any, admin: any, body: any) => {
	if (!req.panelAdmin || String(req.panelAdmin._id) !== String(admin._id)) return;
	if (body === 'delete' || body.isActive === false || body.superAdmin === false) throw new TenancyError(400, 'You can’t switch off, demote or remove your own login');
};

const username = Joi.string().trim().lowercase().pattern(USERNAME_RULE).messages({ 'string.pattern.base': USERNAME_HELP, 'string.empty': 'A username is required' });
const email = Joi.string().trim().lowercase().email().allow('').messages({ 'string.email': 'That isn’t an email address' });

/** 409 when the username or email is another login's (either one signs in). */
const refuseTaken = async (fields: { username?: string; email?: string }, except?: any) => {
	const t = await panelLoginTaken(fields, except);
	if (t) throw Object.assign(new TenancyError(409, t.message, t.code), { extra: { on: t.on } });
};
const raceTaken = () => new TenancyError(409, 'That username or email is already a panel login.', 'username_taken');

/* ------------------------------------------------------------ demo login */

const newDemoKey = () => crypto.randomBytes(24).toString('base64url');

/** The project's demo login with its key, or null. */
const demoOf = async (req: any) => {
	const a: any = await PanelAdmin.findOne({ project: req.project._id, demo: true }).select('+demoKey').lean();
	return a ? { ...publicPanelAdmin(a), demoKey: a.demoKey } : null;
};

/** Demo routes: the project's managers in the tenant panel only. */
const tenantManagersOnly = (req: any) => {
	if (req.panelAdmin) throw new TenancyError(403, 'The demo login is made in the tenant panel.');
};

router.post(
	'/demo',
	handle(async (req: any, res: any) => {
		tenantManagersOnly(req);
		const body = check(Joi.object({ role: Joi.string().allow('', null), superAdmin: Joi.boolean().default(false) }), req.body);
		body.role = (await roleOf(req, body.role)) || undefined;
		needsRole(req, body.role, body.superAdmin);
		if (await PanelAdmin.exists({ project: req.project._id, demo: true })) throw new TenancyError(409, 'This project has a demo login already.', 'demo_exists');
		let admin: any;
		try {
			admin = await PanelAdmin.create({
				name: 'Demo',
				username: `demo-${crypto.randomBytes(6).toString('hex')}`,
				demo: true,
				demoKey: newDemoKey(),
				role: body.role,
				superAdmin: body.superAdmin,
				organization: req.organization._id,
				project: req.project._id,
				createdBy: req.user._id,
			});
		} catch (e: any) {
			if (e?.code === 11000) throw new TenancyError(409, 'This project has a demo login already.', 'demo_exists');
			throw e;
		}
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: 'made the demo login' });
		res.status(201);
		return { demo: await demoOf(req) };
	})
);

router.post(
	'/demo/new-link',
	handle(async (req: any) => {
		tenantManagersOnly(req);
		const admin: any = await PanelAdmin.findOne({ project: req.project._id, demo: true });
		if (!admin) throw new TenancyError(404, 'This project has no demo login.');
		await PanelAdmin.updateOne({ _id: admin._id }, { $set: { demoKey: newDemoKey() } });
		await signOutAll(admin._id, 'New demo link');
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: 'made a new demo link' });
		return { demo: await demoOf(req) };
	})
);

router.get(
	'/',
	handle(async (req: any) => {
		const [rows, roles, demo] = await Promise.all([
			PanelAdmin.find({ project: req.project._id, demo: { $ne: true } }).sort({ createdAt: 1 }).lean(),
			PanelRole.find({}).sort({ name: 1 }).select('name').lean(),
			req.panelAdmin ? null : demoOf(req),
		]);
		return {
			doc: rows.map(publicPanelAdmin),
			totalDocs: rows.length,
			roles: roles.map((r: any) => ({ _id: String(r._id), name: r.name })),
			...(!req.panelAdmin && { demo }),
		};
	})
);

router.post(
	'/',
	handle(async (req: any, res: any) => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120).required().messages({ 'any.required': 'A name is required' }),
				username: username.required().messages({ 'any.required': 'A username is required' }),
				email,
				password: password.required().messages({ 'any.required': 'A password is required' }),
				phone: Joi.string().trim().max(40).allow(''),
				role: Joi.string().allow('', null),
				superAdmin: Joi.boolean().default(false),
			}),
			req.body
		);
		body.role = (await roleOf(req, body.role)) || undefined;
		needsRole(req, body.role, body.superAdmin);
		if (!body.email) delete body.email;
		await refuseTaken(body);
		let admin: any;
		try {
			admin = await PanelAdmin.create({ ...body, organization: req.organization._id, project: req.project._id, createdBy: req.user._id });
		} catch (e: any) {
			if (e?.code === 11000) throw raceTaken();
			throw e;
		}
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: `added the panel login ${panelLoginName(admin)}` });
		res.status(201);
		return publicPanelAdmin(admin);
	})
);

router.put(
	'/:id',
	handle(async (req: any) => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120),
				username,
				email,
				phone: Joi.string().trim().max(40).allow(''),
				isActive: Joi.boolean(),
				password: password.allow(''),
				role: Joi.string().allow('', null),
				superAdmin: Joi.boolean(),
			}),
			req.body
		);
		const admin = await findOwn(req);
		notSelf(req, admin, body);
		// A demo login's access and on/off only: it has no name, username or password to change (DEMO_LOGINS.md D2).
		if (admin.demo) ['name', 'username', 'email', 'phone', 'password'].forEach(k => delete body[k]);
		const role = await roleOf(req, body.role);
		const nextRole = role === undefined ? admin.role : role;
		const nextSuper = body.superAdmin === undefined ? !!admin.superAdmin : body.superAdmin;
		needsRole(req, nextRole, nextSuper);
		const accessChanged = (role !== undefined && String(role || '') !== String(admin.role || '')) || nextSuper !== !!admin.superAdmin;
		if (role !== undefined) admin.role = role || undefined;
		if (body.superAdmin !== undefined) admin.superAdmin = body.superAdmin;
		const switchedOff = body.isActive === false && admin.isActive !== false;
		const newPassword = !!body.password;
		if (body.name !== undefined) admin.name = body.name;
		if (body.phone !== undefined) admin.phone = body.phone;
		// A new username or email (PU-08): either signs in, so neither may be another login's.
		const changed: any = {};
		if (body.username !== undefined && body.username !== admin.username) changed.username = body.username;
		if (body.email !== undefined && body.email !== (admin.email || '')) changed.email = body.email;
		if (changed.username || changed.email) await refuseTaken(changed, admin._id);
		if (changed.username) admin.username = changed.username;
		if (changed.email !== undefined) admin.email = changed.email || undefined;
		if (!admin.username && !admin.email) throw Object.assign(new TenancyError(400, 'Give them a username to sign in with'), { extra: { on: 'username' } });
		if (body.isActive !== undefined) admin.isActive = body.isActive;
		if (newPassword) admin.password = body.password;
		try {
			await admin.save();
		} catch (e: any) {
			if (e?.code === 11000) throw raceTaken();
			throw e;
		}
		if (switchedOff || newPassword) await signOutAll(admin._id, switchedOff ? 'Login switched off' : 'Password changed');
		const what = [switchedOff && 'switched off', body.isActive === true && 'switched on', newPassword && 'set a new password for', accessChanged && 'changed the role of', 'changed'].filter(Boolean)[0];
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: `${what} ${admin.demo ? 'the demo login' : `the panel login ${panelLoginName(admin)}`}` });
		return publicPanelAdmin(admin);
	})
);

router.delete(
	'/:id',
	handle(async (req: any) => {
		const admin = await findOwn(req);
		notSelf(req, admin, 'delete');
		await signOutAll(admin._id, 'Login removed');
		await PanelAdmin.deleteOne({ _id: admin._id });
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: admin.demo ? 'removed the demo login' : `removed the panel login ${panelLoginName(admin)}` });
		return { message: 'Removed' };
	})
);

export default router;
