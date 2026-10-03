import express from 'express';
import Joi from 'joi';
import TenantProject, { MEDIA_SCOPES, PROJECT_TYPES } from '../../library/models/tenancy/tenantProject.model.js';
import OrganizationMember from '../../library/models/tenancy/organizationMember.model.js';
import OrganizationInvitation from '../../library/models/tenancy/organizationInvitation.model.js';
import ModelDefinition from '../../library/models/builder/modelDefinition.model.js';
import { tenantProtect } from '../../middleware/tenant/protect.tenant.middleware.js';
import { tenantPermissions } from '../../library/functions/tenantPermissions.function.js';
import { runInScope } from '../../library/functions/tenantScope.function.js';
import { TenancyError, canOpenProject, handle, isId, opensAllProjects, projectAccessFilter, publicProject } from '../../library/functions/tenancy.function.js';
import { createProject, removeProjectContents } from '../../library/functions/projectLifecycle.function.js';

/**
 * /tenant/api/projects — the organization's projects (docs/multi-tenancy WO-07).
 *
 *   GET    /             every active project the member can open (archived with ?archived=1)
 *   POST   /             { name, type: 'app'|'website'|'api', description, icon, color, domains, mediaScope }   create-projects
 *   GET    /:id
 *   PUT    /:id          name, description, icon, color, domains, mediaScope, isActive                   manage-projects
 *   DELETE /:id          refused while it has models; ?force=1 (owner) deletes everything in it
 *
 * Only the projects the member can open (WO-22): Owner and Admin open every
 * one; others every one unless their membership lists projects. Another
 * project answers 404, as if it didn't exist.
 *
 * A new project gets an empty "Pages" sidebar section and an empty dashboard,
 * written inside its own scope (tenantScope) — so they carry its ids.
 */

const router = express.Router();
router.use(tenantProtect);

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

const domain = Joi.string()
	.trim()
	.lowercase()
	.max(253)
	.pattern(/^(localhost(:\d+)?|([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?)$/)
	.messages({ 'string.pattern.base': 'A domain looks like example.com' });

const fields = {
	name: Joi.string().trim().min(1).max(80),
	description: Joi.string().trim().max(500).allow(''),
	icon: Joi.string().trim().max(40).allow(''),
	color: Joi.string().trim().max(30).allow(''),
	domains: Joi.array().items(domain).max(20),
	/** Whose media library it uses (WO-23): its own, or the organization's shared one. */
	mediaScope: Joi.string().valid(...MEDIA_SCOPES),
};

/** Projects in this organization, that this member can open. */
const loadProject = async (req: any) => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'Project not found');
	const project: any = await TenantProject.findOne({ _id: req.params.id, organization: req.organization._id });
	if (!project || !canOpenProject(req.member, req.permissions, project._id)) throw new TenancyError(404, 'Project not found');
	return project;
};

router.get(
	'/',
	handle(async req => {
		const filter: any = { organization: req.organization._id, ...projectAccessFilter(req.member, req.permissions) };
		if (req.query.archived !== '1') filter.isActive = { $ne: false };
		const docs: any[] = await TenantProject.find(filter).sort({ createdAt: 1 }).lean();
		const counts = await Promise.all(
			docs.map(p => runInScope({ organization: req.organization._id, project: p._id }, () => ModelDefinition.countDocuments({})))
		);
		return { doc: docs.map((p, i) => ({ ...publicProject(p), models: counts[i] })) };
	})
);

router.post(
	'/',
	tenantPermissions(['create-projects']),
	handle(async req => {
		const body = check(
			Joi.object({
				...fields,
				name: fields.name.required().messages({ 'any.required': 'Name the project' }),
				type: Joi.string().valid(...PROJECT_TYPES).default('app'),
			}),
			req.body
		);
		const active = await TenantProject.countDocuments({ organization: req.organization._id, isActive: { $ne: false } });
		if (active >= 100) throw new TenancyError(400, 'This organization has 100 projects — archive one first.');
		const project: any = await createProject(req, req.organization._id, body, { createdBy: req.user._id });
		// A member limited to some projects can open the ones they start (WO-22).
		if (!opensAllProjects(req.member, req.permissions))
			await OrganizationMember.updateOne({ _id: req.member._id }, { $addToSet: { projects: project._id } });
		return publicProject(project);
	})
);

router.get(
	'/:id',
	handle(async req => {
		const project = await loadProject(req);
		const models = await runInScope({ organization: req.organization._id, project: project._id }, () => ModelDefinition.countDocuments({}));
		return { ...publicProject(project), models };
	})
);

router.put(
	'/:id',
	tenantPermissions(['manage-projects']),
	handle(async req => {
		const project = await loadProject(req);
		const body = check(Joi.object({ ...fields, isActive: Joi.boolean() }), req.body);
		Object.assign(project, body);
		await project.save();
		return publicProject(project);
	})
);

router.delete(
	'/:id',
	tenantPermissions(['manage-projects']),
	handle(async req => {
		const project = await loadProject(req);
		const scope = { organization: req.organization._id, project: project._id };
		const models = await runInScope(scope, () => ModelDefinition.countDocuments({}));
		if (models && req.query.force !== '1')
			throw new TenancyError(400, `This project has ${models} model${models === 1 ? '' : 's'} and their records. Archive it, or delete it for good (owner only).`, 'has_models');
		if (models && req.role?.system !== 'owner') throw new TenancyError(403, 'Only the organization’s owner can delete a project with data');
		await removeProjectContents(req.organization._id, project._id);
		await TenantProject.deleteOne({ _id: project._id });
		// Nobody's access list or invitation names it any more (WO-22).
		await OrganizationMember.updateMany({ organization: req.organization._id }, { $pull: { projects: project._id } });
		await OrganizationInvitation.updateMany({ organization: req.organization._id }, { $pull: { projects: project._id } });
		return { message: 'Project deleted' };
	})
);

export default router;
