import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import PanelRole from '../library/models/tenancy/panelRole.model.js';
import PanelAdmin from '../library/models/tenancy/panelAdmin.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { PANEL_REPORT_KEYS } from '../library/functions/panelAdmin.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { panelManagers } from './panelAdmins.router.js';

/**
 * /tenant/api/p/:projectId/panel-roles — what a project's panel users may do
 * (docs/panel-users PU-01). For the project's managers, and a panel super admin.
 *
 *   GET    /        { doc: roles (with how many logins hold each), targets, reports }
 *                   targets: [{ route, name, actions }] — each model (Publish where it has drafts), Media library, History
 *                   reports: [{ key, label }] — reports:view, reports:export
 *   POST   /        { name, description?, permissions }
 *   PUT    /:id     the same
 *   DELETE /:id     refused while a login holds it
 *
 * Keys are per model, like a project's own roles (WO-50): view-/create-/edit-/
 * delete-/publish-<route>. Adding, editing or deleting a model's records includes
 * seeing them. Nothing a role holds builds the project — panel users are never developers.
 */
const router = express.Router({ mergeParams: true });
router.use(panelManagers);

const EXTRAS = [
	{ route: 'image', name: 'Media library', actions: ['view', 'create', 'edit', 'delete'] },
	{ route: 'history', name: 'History', actions: ['view'] },
];
const REPORTS = [
	{ key: 'reports:view', label: 'See reports', description: 'Open the project’s reports on the models this role can view' },
	{ key: 'reports:export', label: 'Download reports', description: 'Download reports as CSV, Excel or PDF, where the report allows it' },
];

export const panelRoleTargets = async () => {
	const models: any[] = await ModelDefinition.find({}, { route: 1, title: 1, name: 1, draftAndPublish: 1 }).sort({ title: 1 }).lean();
	const actions = (m: any) => ['view', 'create', 'edit', 'delete', ...(m.draftAndPublish ? ['publish'] : [])];
	return [...models.map(m => ({ route: m.route, name: m.title || m.name, actions: actions(m) })), ...EXTRAS];
};

/** Only keys of this project's models, the extras and the report keys, in their order. */
export const cleanPanelRoleKeys = async (keys: string[]) => {
	const wanted = new Set(keys);
	const out: string[] = [];
	for (const t of await panelRoleTargets()) {
		const acts = t.actions.filter(a => wanted.has(`${a}-${t.route}`));
		if (acts.length && !acts.includes('view')) acts.unshift('view');
		out.push(...t.actions.filter(a => acts.includes(a)).map(a => `${a}-${t.route}`));
	}
	const reports = PANEL_REPORT_KEYS.filter(k => wanted.has(k));
	// Downloading a report is seeing it too.
	if (reports.includes('reports:export') && !reports.includes('reports:view')) reports.unshift('reports:view');
	if (!out.length) throw Object.assign(new TenancyError(400, 'Tick at least one thing this role can do'), { extra: { on: 'permissions' } });
	return [...out, ...reports];
};

const body = Joi.object({
	name: Joi.string().trim().min(1).max(60).required().messages({ 'string.empty': 'Give the role a name', 'any.required': 'Give the role a name' }),
	description: Joi.string().trim().max(300).allow(''),
	permissions: Joi.array().items(Joi.string()).max(2000).default([]),
});
const check = (value: any) => {
	const { error, value: out } = body.validate(value || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return out;
};

const view = (r: any, holders = 0) => ({
	_id: String(r._id),
	name: r.name,
	description: r.description || '',
	permissions: r.permissions || [],
	holders,
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
});

const nameTaken = async (name: string, except?: any) => {
	const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
	if (await PanelRole.exists({ name: rx, ...(except && { _id: { $ne: except } }) }))
		throw Object.assign(new TenancyError(400, 'There’s a panel role with that name already'), { extra: { on: 'name' } });
};

const load = async (req: any) => {
	const role: any = mongoose.isValidObjectId(req.params.id) && (await PanelRole.findById(req.params.id));
	if (!role) throw new TenancyError(404, 'Role not found');
	return role;
};

router.get(
	'/',
	handle(async (req: any) => {
		const [roles, counts, targets] = await Promise.all([
			PanelRole.find({}).sort({ createdAt: 1 }).lean(),
			PanelAdmin.aggregate([{ $match: { project: req.project._id, role: { $ne: null } } }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
			panelRoleTargets(),
		]);
		const held = new Map(counts.map((c: any) => [String(c._id), c.n]));
		return { doc: roles.map((r: any) => view(r, held.get(String(r._id)) || 0)), totalDocs: roles.length, targets, reports: REPORTS };
	})
);

router.post(
	'/',
	handle(async (req: any, res: any) => {
		const b = check(req.body);
		await nameTaken(b.name);
		const role = await PanelRole.create({ name: b.name, description: b.description || '', permissions: await cleanPanelRoleKeys(b.permissions), createdBy: req.user._id });
		recordProjectEvent({ req, model: 'PanelRole', modelPath: 'panel-roles', document: role._id, name: role.name, text: `added the panel role ${role.name}` });
		res.status(201);
		return view(role);
	})
);

router.put(
	'/:id',
	handle(async (req: any) => {
		const role = await load(req);
		const b = check(req.body);
		await nameTaken(b.name, role._id);
		role.name = b.name;
		role.description = b.description || '';
		role.permissions = await cleanPanelRoleKeys(b.permissions);
		await role.save();
		recordProjectEvent({ req, model: 'PanelRole', modelPath: 'panel-roles', document: role._id, name: role.name, text: `changed the panel role ${role.name}` });
		return view(role);
	})
);

router.delete(
	'/:id',
	handle(async (req: any) => {
		const role = await load(req);
		const holders = await PanelAdmin.countDocuments({ project: req.project._id, role: role._id });
		if (holders) throw new TenancyError(400, `${holders} ${holders === 1 ? 'login has' : 'logins have'} this role — give them another one first.`);
		await role.deleteOne();
		recordProjectEvent({ req, model: 'PanelRole', modelPath: 'panel-roles', document: role._id, name: role.name, text: `deleted the panel role ${role.name}` });
		return { message: 'Role deleted' };
	})
);

export default router;
