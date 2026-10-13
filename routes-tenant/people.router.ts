import express from 'express';
import Joi from 'joi';
import OrganizationMember from '../library/models/tenancy/organizationMember.model.js';
import OrganizationRole from '../library/models/tenancy/organizationRole.model.js';
import OrganizationInvitation from '../library/models/tenancy/organizationInvitation.model.js';
import TenantUser from '../library/models/tenancy/tenantUser.model.js';
import { PROJECT_INVITE_ROLES, normalizePermissions, systemRole, tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { TenancyError, canOpenProject, handle, isId } from '../library/functions/tenancy.function.js';
import { addProjectRole, invitationView, sendInvite } from '../library/functions/tenantInvitations.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { later, notifyTenant } from '../library/functions/tenantNotify.function.js';

/**
 * /tenant/api/p/:projectId/people — who works in one project, and inviting
 * people into it (docs/multi-tenancy WO-47). For the owner, admins and anyone
 * whose role has `invite-to-projects` (or `manage-members`).
 *
 *   GET    /                         { doc: people, invitations, roles }
 *   POST   /invitations              { email, name, role: 'member'|'developer' }
 *   POST   /invitations/:id/resend
 *   DELETE /invitations/:id
 *   PUT    /:memberId                { role }   their role in this project
 *   DELETE /:memberId                takes the project away from them
 *
 * Someone new joins the organization as a guest: they open this project only,
 * with the role they were invited with, and hold no organization-wide keys.
 * Someone already in the organization gets the project at once (no link).
 * People who open every project (the owner, admins, members with all
 * projects) are changed on the organization's Members page instead.
 */
const router = express.Router({ mergeParams: true });

router.use(tenantPermissions(['invite-to-projects', 'manage-members']));

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

/** Member and Developer, made if the organization is older than them. */
const inviteRoles = async (req: any) => Promise.all(PROJECT_INVITE_ROLES.map(system => systemRole(req.organization._id, system)));

const roleFor = async (req: any, system: any) => {
	if (!PROJECT_INVITE_ROLES.includes(system)) throw new TenancyError(400, 'Choose Member or Developer');
	return systemRole(req.organization._id, system);
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
		const [members, roles, invitations]: any = await Promise.all([
			OrganizationMember.find({ organization: req.organization._id, status: 'active' })
				.populate('user', 'name email image')
				.populate('role', 'name system permissions')
				.sort({ joinedAt: 1 })
				.lean(),
			OrganizationRole.find({ organization: req.organization._id }, { name: 1, system: 1 }).lean(),
			OrganizationInvitation.find({ organization: req.organization._id, project: projectId, acceptedAt: null, cancelledAt: null })
				.populate('role', 'name')
				.populate('invitedBy', 'name')
				.sort({ createdAt: -1 })
				.lean(),
		]);
		const byId = new Map<string, any>(roles.map((r: any) => [String(r._id), r]));
		const here = members.filter((m: any) => m.user && canOpenProject(m, normalizePermissions(m.role?.permissions || []), projectId));
		const offered = await inviteRoles(req);
		return {
			doc: here.map((m: any) => personView(m, byId, projectId)),
			invitations: invitations.map(invitationView),
			roles: offered.map((r: any) => ({ _id: String(r._id), name: r.name, system: r.system, description: r.description || '' })),
		};
	})
);

router.post(
	'/invitations',
	rateLimit({ name: 'tenant-project-invite', windowMs: 60 * 60 * 1000, max: 100 }),
	handle(async req => {
		const body = check(
			Joi.object({
				email: Joi.string().trim().lowercase().email().required(),
				name: Joi.string().trim().max(120).allow(''),
				role: Joi.string().required().messages({ 'any.required': 'Choose Member or Developer' }),
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
		// Someone with an account sees it in the app too (WO-37); accepting is on Home.
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
						message: `In ${req.organization.name}, as ${role.name}. Accept it on your Home page.`,
						href: '/dashboard',
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
		const { role: system } = check(Joi.object({ role: Joi.string().required() }), req.body);
		const role: any = await roleFor(req, system);
		await addProjectRole(member._id, req.project._id, role._id);
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
		return { message: `Removed from ${req.project.name}` };
	})
);

export default router;
