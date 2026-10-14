import express from 'express';
import Joi from 'joi';
import OrganizationMember from '../library/models/tenancy/organizationMember.model.js';
import OrganizationRole from '../library/models/tenancy/organizationRole.model.js';
import OrganizationInvitation from '../library/models/tenancy/organizationInvitation.model.js';
import TenantUser from '../library/models/tenancy/tenantUser.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { PROJECT_INVITE_ROLES, grants, normalizePermissions, systemRole, tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { TenancyError, canOpenProject, handle, isId } from '../library/functions/tenancy.function.js';
import { addProjectRole, invitationView, sendInvite } from '../library/functions/tenantInvitations.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { later, notifyTenant } from '../library/functions/tenantNotify.function.js';

/**
 * /tenant/api/p/:projectId/people — who works in one project, and inviting
 * people into it (docs/multi-tenancy WO-47). Everyone in the project sees who
 * works in it (WO-48); the rest is for the owner, admins and anyone whose role
 * has `invite-to-projects` (or `manage-members`).
 *
 *   GET    /                         { doc: people, invitations, roles, models, canManage }   invitations, roles, models only for those who manage
 *   POST   /invitations              { email, name, role: 'full'|'member'|'developer'|<the project's role id> }
 *   POST   /invitations/:id/resend
 *   DELETE /invitations/:id
 *   PUT    /:memberId                { role }   their role in this project
 *   DELETE /:memberId                takes the project away from them
 *   POST   /roles                    { name, description, permissions }   the project's own role (WO-50)
 *   PUT    /roles/:id                the same
 *   DELETE /roles/:id                refused while someone has it
 *
 * A project's own roles say per model what its holder may do — view, add,
 * edit, delete — as view-/create-/edit-/delete-<route> keys, plus the media
 * library and History. Adding, editing or deleting a model's records includes
 * seeing them.
 *
 * Someone new joins the organization as a guest: they open this project only,
 * with the role they were invited with, and hold no organization-wide keys.
 * Someone already in the organization gets the project at once (no link).
 * People who open every project (the owner, admins, members with all
 * projects) are changed on the organization's Members page instead.
 */
const router = express.Router({ mergeParams: true });

const MANAGE = ['invite-to-projects', 'manage-members'];

/** A 400 pointing at the input it's about (`on`), shown under it. */
const invalid = (message: string, on: string) => Object.assign(new TenancyError(400, message), { extra: { on } });

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

/** Full access, Member and Developer, made if the organization is older than them. */
const inviteRoles = async (req: any) => Promise.all(PROJECT_INVITE_ROLES.map(system => systemRole(req.organization._id, system)));

/** The project's own roles (WO-50). */
const projectRoles = (req: any) => OrganizationRole.find({ organization: req.organization._id, project: req.project._id }).sort({ createdAt: 1 }).lean();

/** A standard role by its system name, or one of the project's own by id. */
const roleFor = async (req: any, value: any) => {
	if (PROJECT_INVITE_ROLES.includes(value)) return systemRole(req.organization._id, value);
	const own: any = isId(value) && (await OrganizationRole.findOne({ _id: value, organization: req.organization._id, project: req.project._id }).lean());
	if (!own) throw invalid('Choose a role', 'role');
	return own;
};

const roleView = (r: any) => ({
	_id: String(r._id),
	name: r.name,
	system: r.system || null,
	description: r.description || '',
	/** The project's own role, and what it allows (WO-50). */
	...(r.project && { custom: true, permissions: normalizePermissions(r.permissions || [], { models: true }) }),
});

/** What a project's own role can name: each model, the media library ('image') and History. */
const ROLE_EXTRAS = [
	{ route: 'image', name: 'Media library', actions: ['view', 'create', 'edit', 'delete'] },
	{ route: 'history', name: 'History', actions: ['view'] },
];
const roleTargets = async () => {
	const models: any[] = await ModelDefinition.find({}, { route: 1, title: 1, name: 1 }).sort({ title: 1 }).lean();
	return [...models.map(m => ({ route: m.route, name: m.title || m.name, actions: ['view', 'create', 'edit', 'delete'] })), ...ROLE_EXTRAS];
};

/** Opens every project, whatever the project's list says: the owner, admins, members with all projects. */
const opensEverything = (m: any) => m.role?.system === 'owner' || m.role?.system === 'admin' || (!m.guest && m.allProjects !== false);

const personView = (m: any, roles: Map<string, any>, projectId: any) => {
	const own = (m.projectRoles || []).find((r: any) => String(r.project) === String(projectId));
	const here = own && roles.get(String(own.role));
	const everything = opensEverything(m);
	return {
		_id: String(m._id),
		user: m.user && { _id: String(m.user._id), name: m.user.name, email: m.user.email, image: m.user.image || '' },
		/** Their role here: the project's, or their organization role. */
		role: here ? { _id: String(here._id), name: here.name, system: here.system || null } : m.role && { _id: String(m.role._id), name: m.role.name, system: m.role.system || null },
		organizationRole: m.role && { _id: String(m.role._id), name: m.role.name, system: m.role.system || null },
		/** 'organization': opens every project; 'project': this one was given to them. */
		access: everything ? 'organization' : 'project',
		guest: !!m.guest,
		joinedAt: m.joinedAt,
	};
};

router.get(
	'/',
	handle(async req => {
		const projectId = req.project._id;
		const canManage = grants(req.permissions, MANAGE);
		const [members, roles, invitations]: any = await Promise.all([
			OrganizationMember.find({ organization: req.organization._id, status: 'active' })
				.populate('user', 'name email image')
				.populate('role', 'name system permissions')
				.sort({ joinedAt: 1 })
				.lean(),
			OrganizationRole.find({ organization: req.organization._id }, { name: 1, system: 1 }).lean(),
			canManage
				? OrganizationInvitation.find({ organization: req.organization._id, project: projectId, acceptedAt: null, cancelledAt: null })
						.populate('role', 'name')
						.populate('invitedBy', 'name')
						.sort({ createdAt: -1 })
						.lean()
				: [],
		]);
		const byId = new Map<string, any>(roles.map((r: any) => [String(r._id), r]));
		const here = members.filter((m: any) => m.user && canOpenProject(m, normalizePermissions(m.role?.permissions || []), projectId));
		const [offered, own, models] = canManage ? await Promise.all([inviteRoles(req), projectRoles(req), roleTargets()]) : [[], [], []];
		return {
			doc: here.map((m: any) => personView(m, byId, projectId)),
			invitations: invitations.map(invitationView),
			roles: [...offered, ...own].map(roleView),
			models,
			canManage,
		};
	})
);

// Everything below changes who works in the project.
router.use(tenantPermissions(MANAGE));

router.post(
	'/invitations',
	rateLimit({ name: 'tenant-project-invite', windowMs: 60 * 60 * 1000, max: 100 }),
	handle(async req => {
		const body = check(
			Joi.object({
				email: Joi.string().trim().lowercase().email().required(),
				name: Joi.string().trim().max(120).allow(''),
				role: Joi.string().required().messages({ 'any.required': 'Choose a role' }),
			}),
			req.body
		);
		const role: any = await roleFor(req, body.role);
		const project = req.project;
		const existing: any = await TenantUser.findOne({ email: body.email }, { _id: 1, name: 1 }).lean();
		const member: any = existing && (await OrganizationMember.findOne({ organization: req.organization._id, user: existing._id, status: 'active' }).populate('role').lean());

		if (member) {
			if (opensEverything(member)) throw new TenancyError(400, 'They already open every project in this organization.');
			if (canOpenProject(member, [], project._id)) throw new TenancyError(400, 'They’re already in this project — change their role below.');
			// Already in the organization: the project is theirs now, no link needed.
			await addProjectRole(member._id, project._id, role._id);
			later(() =>
				notifyTenant([
					{
						recipient: existing._id,
						organization: req.organization._id,
						actor: req.user._id,
						actorName: req.user.name,
						type: 'member-changed',
						title: `${req.user.name || 'Someone'} added you to ${project.name}`,
						message: `In ${req.organization.name}, as ${role.name}.`,
						href: `/${project.publicSlug}`,
					},
				])
			);
			return { added: true, message: `${existing.name || body.email} can open ${project.name} now` };
		}

		// One open invitation per email and project: a second invite re-sends it with the new role.
		let invitation: any = await OrganizationInvitation.findOne({ organization: req.organization._id, project: project._id, email: body.email, acceptedAt: null, cancelledAt: null });
		if (!invitation)
			invitation = new OrganizationInvitation({ organization: req.organization._id, project: project._id, email: body.email, tokenHash: 'pending', expiresAt: new Date() });
		invitation.name = body.name || invitation.name;
		invitation.role = role._id;
		invitation.allProjects = false;
		invitation.projects = [project._id];
		invitation.invitedBy = req.user._id;
		await sendInvite(req, invitation, project.name);
		// Someone with an account sees it in the app too (WO-37); accepting or declining is on /invitations (WO-50).
		if (existing)
			later(() =>
				notifyTenant([
					{
						recipient: existing._id,
						organization: req.organization._id,
						actor: req.user._id,
						actorName: req.user.name,
						type: 'invitation',
						title: `${req.user.name || 'Someone'} invited you to ${project.name}`,
						message: `In ${req.organization.name}, as ${role.name}. Open it to accept or decline.`,
						// The page to accept or decline it (WO-50).
						href: `/invitations/${invitation._id}`,
					},
				])
			);
		return invitationView(
			await OrganizationInvitation.findById(invitation._id).populate('role', 'name').populate('project', 'name').populate('invitedBy', 'name').lean()
		);
	})
);

const loadInvitation = async (req: any) => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'Invitation not found');
	const invitation: any = await OrganizationInvitation.findOne({
		_id: req.params.id,
		organization: req.organization._id,
		project: req.project._id,
		acceptedAt: null,
		cancelledAt: null,
	});
	if (!invitation) throw new TenancyError(404, 'Invitation not found');
	return invitation;
};

router.post(
	'/invitations/:id/resend',
	handle(async req => {
		const invitation = await loadInvitation(req);
		if (invitation.lastSentAt && Date.now() - new Date(invitation.lastSentAt).getTime() < 60_000)
			throw new TenancyError(429, 'Sent a moment ago — wait a minute before sending again.');
		await sendInvite(req, invitation, req.project.name);
		return { message: 'Sent again' };
	})
);

router.delete(
	'/invitations/:id',
	handle(async req => {
		const invitation = await loadInvitation(req);
		invitation.cancelledAt = new Date();
		await invitation.save();
		return { message: 'Invitation cancelled' };
	})
);

/** Someone this project was given to — not someone who opens every project. */
const loadPerson = async (req: any) => {
	if (!isId(req.params.memberId)) throw new TenancyError(404, 'Not found');
	const member: any = await OrganizationMember.findOne({ _id: req.params.memberId, organization: req.organization._id, status: 'active' }).populate('role');
	if (!member || !canOpenProject(member, [], req.project._id)) throw new TenancyError(404, 'Not found');
	if (opensEverything(member)) throw new TenancyError(400, 'They open every project — change that on the organization’s Members page.');
	return member;
};

router.put(
	'/:memberId',
	handle(async req => {
		const member = await loadPerson(req);
		const { role: value } = check(Joi.object({ role: Joi.string().required() }), req.body);
		const role: any = await roleFor(req, value);
		await addProjectRole(member._id, req.project._id, role._id);
		// Tell them their role here changed.
		later(() =>
			notifyTenant([
				{
					recipient: member.user?._id || member.user,
					organization: req.organization._id,
					project: req.project._id,
					actor: req.user._id,
					actorName: req.user.name,
					type: 'member-changed',
					title: `You’re now ${role.name} in ${req.project.name}`,
					message: `In ${req.organization.name}.`,
					href: `/${req.project.publicSlug}`,
				},
			])
		);
		return { message: `Now ${role.name} in ${req.project.name}` };
	})
);

router.delete(
	'/:memberId',
	handle(async req => {
		const member = await loadPerson(req);
		const projectId = req.project._id;
		member.projects = (member.projects || []).filter((p: any) => String(p) !== String(projectId));
		member.projectRoles = (member.projectRoles || []).filter((r: any) => String(r.project) !== String(projectId));
		// A guest with no project left is no longer in the organization.
		if (member.guest && !member.projects.length) {
			member.status = 'removed';
			member.removedAt = new Date();
		}
		await member.save();
		later(() =>
			notifyTenant([
				{
					recipient: member.user?._id || member.user,
					organization: req.organization._id,
					actor: req.user._id,
					actorName: req.user.name,
					type: 'member-changed',
					title: `You were removed from ${req.project.name}`,
					message: `In ${req.organization.name}.`,
					href: '/projects',
				},
			])
		);
		return { message: `Removed from ${req.project.name}` };
	})
);

// The project's own roles (WO-50). Defined before /:memberId's routes would matter: these have two segments.
const roleBody = Joi.object({
	name: Joi.string().trim().min(1).max(60).required().messages({ 'string.empty': 'Give the role a name', 'any.required': 'Give the role a name' }),
	description: Joi.string().trim().max(300).allow(''),
	permissions: Joi.array().items(Joi.string()).max(2000).default([]),
});

/** Only keys for this project's models and extras, in their order; adding, editing or deleting includes viewing. */
const cleanRoleKeys = async (keys: string[]) => {
	const wanted = new Set(keys);
	const out: string[] = [];
	for (const t of await roleTargets()) {
		const acts = t.actions.filter(a => wanted.has(`${a}-${t.route}`));
		if (acts.length && !acts.includes('view')) acts.unshift('view');
		out.push(...t.actions.filter(a => acts.includes(a)).map(a => `${a}-${t.route}`));
	}
	if (!out.length) throw invalid('Tick at least one thing this role can do', 'permissions');
	return out;
};

const nameTaken = async (req: any, name: string, except?: any) => {
	const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
	const clash = await OrganizationRole.exists({
		organization: req.organization._id,
		$or: [{ project: req.project._id }, { system: { $in: [...PROJECT_INVITE_ROLES] } }],
		name: rx,
		...(except && { _id: { $ne: except } }),
	});
	if (clash) throw invalid('There’s a role with that name already', 'name');
};

const loadRole = async (req: any) => {
	const role: any = isId(req.params.id) && (await OrganizationRole.findOne({ _id: req.params.id, organization: req.organization._id, project: req.project._id }));
	if (!role) throw new TenancyError(404, 'Role not found');
	return role;
};

router.post(
	'/roles',
	handle(async (req, res) => {
		const body = check(roleBody, req.body);
		await nameTaken(req, body.name);
		const role = await OrganizationRole.create({
			organization: req.organization._id,
			project: req.project._id,
			name: body.name,
			description: body.description || '',
			permissions: await cleanRoleKeys(body.permissions),
		});
		res.status(201);
		return roleView(role);
	})
);

router.put(
	'/roles/:id',
	handle(async req => {
		const role = await loadRole(req);
		const body = check(roleBody, req.body);
		await nameTaken(req, body.name, role._id);
		role.name = body.name;
		role.description = body.description || '';
		role.permissions = await cleanRoleKeys(body.permissions);
		await role.save();
		return roleView(role);
	})
);

router.delete(
	'/roles/:id',
	handle(async req => {
		const role = await loadRole(req);
		const [holders, invited] = await Promise.all([
			OrganizationMember.countDocuments({ organization: req.organization._id, status: 'active', 'projectRoles.role': role._id }),
			OrganizationInvitation.countDocuments({ organization: req.organization._id, role: role._id, acceptedAt: null, cancelledAt: null }),
		]);
		if (holders || invited)
			throw new TenancyError(
				400,
				`${holders ? `${holders} ${holders === 1 ? 'person has' : 'people have'} this role` : `${invited} pending invitation${invited === 1 ? '' : 's'} give${invited === 1 ? 's' : ''} it`} — give them another one first.`
			);
		// A guest who joined with it keeps it as their organization role (shown in the organization list): Member instead.
		const member: any = await systemRole(req.organization._id, 'member');
		await OrganizationMember.updateMany({ organization: req.organization._id, role: role._id }, { $set: { role: member._id } });
		await role.deleteOne();
		return { message: 'Role deleted' };
	})
);

export default router;
