import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import PanelAdmin from '../library/models/tenancy/panelAdmin.model.js';
import { tenantSessions } from '../library/functions/sessions.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { publicPanelAdmin } from '../library/functions/panelAdmin.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/panel-admins — an e-commerce project's store logins
 * for the commerce panel (docs/commerce-panel CP-01). The project's managers
 * (manage-projects, or invite-to-projects) make them with an email and a
 * password; one email is one login of one store.
 *
 *   GET    /             the project's store logins
 *   POST   /             { name, email, password, phone? }   409 email_taken
 *   PUT    /:id          { name?, phone?, isActive?, password? } — switching off or a new password signs them out
 *   DELETE /:id          removes the login and signs it out
 */
const router = express.Router({ mergeParams: true });

router.use((req: any, res: any, next: any) =>
	req.project?.type === 'ecommerce' ? next() : res.status(404).json({ message: 'Only e-commerce projects have store logins' })
);
router.use(tenantPermissions(['manage-projects', 'invite-to-projects']));
// A store login never manages store logins.
router.use((req: any, res: any, next: any) => (req.panelAdmin ? res.status(403).json({ message: 'Not allowed' }) : next()));

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
	const admin: any = await PanelAdmin.findOne({ _id: req.params.id, project: req.project._id }).select('+password');
	if (!admin) throw new TenancyError(404, 'Not found');
	return admin;
};

const taken = () => new TenancyError(409, 'This email is already a store login — one email opens one store.', 'email_taken');

router.get(
	'/',
	handle(async (req: any) => {
		const rows = await PanelAdmin.find({ project: req.project._id }).sort({ createdAt: 1 }).lean();
		return { doc: rows.map(publicPanelAdmin), totalDocs: rows.length };
	})
);

router.post(
	'/',
	handle(async (req: any, res: any) => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120).required().messages({ 'any.required': 'A name is required' }),
				email: Joi.string().trim().lowercase().email().required().messages({ 'any.required': 'An email is required' }),
				password: password.required().messages({ 'any.required': 'A password is required' }),
				phone: Joi.string().trim().max(40).allow(''),
			}),
			req.body
		);
		if (await PanelAdmin.exists({ email: body.email })) throw taken();
		let admin: any;
		try {
			admin = await PanelAdmin.create({ ...body, organization: req.organization._id, project: req.project._id, createdBy: req.user._id });
		} catch (e: any) {
			if (e?.code === 11000) throw taken();
			throw e;
		}
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: `added the store login ${admin.email}` });
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
				phone: Joi.string().trim().max(40).allow(''),
				isActive: Joi.boolean(),
				password: password.allow(''),
			}),
			req.body
		);
		const admin = await findOwn(req);
		const switchedOff = body.isActive === false && admin.isActive !== false;
		const newPassword = !!body.password;
		if (body.name !== undefined) admin.name = body.name;
		if (body.phone !== undefined) admin.phone = body.phone;
		if (body.isActive !== undefined) admin.isActive = body.isActive;
		if (newPassword) admin.password = body.password;
		await admin.save();
		if (switchedOff || newPassword) await signOutAll(admin._id, switchedOff ? 'Login switched off' : 'Password changed');
		const what = [switchedOff && 'switched off', body.isActive === true && 'switched on', newPassword && 'set a new password for', !switchedOff && !newPassword && body.isActive === undefined && 'changed'].filter(Boolean)[0];
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: `${what} the store login ${admin.email}` });
		return publicPanelAdmin(admin);
	})
);

router.delete(
	'/:id',
	handle(async (req: any) => {
		const admin = await findOwn(req);
		await signOutAll(admin._id, 'Login removed');
		await PanelAdmin.deleteOne({ _id: admin._id });
		recordProjectEvent({ req, model: 'PanelAdmin', modelPath: 'panel-admins', document: admin._id, name: admin.name, text: `removed the store login ${admin.email}` });
		return { message: 'Removed' };
	})
);

export default router;
