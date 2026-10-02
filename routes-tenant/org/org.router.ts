import express from 'express';
import crypto from 'crypto';
import Joi from 'joi';
import Organization from '../../library/models/tenancy/organization.model.js';
import OrganizationMember from '../../library/models/tenancy/organizationMember.model.js';
import OrganizationRole from '../../library/models/tenancy/organizationRole.model.js';
import OrganizationInvitation from '../../library/models/tenancy/organizationInvitation.model.js';
import TenantUser from '../../library/models/tenancy/tenantUser.model.js';
import TenantProject from '../../library/models/tenancy/tenantProject.model.js';
import ModelDefinition from '../../library/models/builder/modelDefinition.model.js';
import { runInScope } from '../../library/functions/tenantScope.function.js';
import { HEARD_FROM, ORG_GOALS, ORG_INDUSTRIES, ORG_TEAM_SIZES } from '../../library/models/tenancy/organization.model.js';
import { tenantSessions } from '../../library/functions/sessions.function.js';
import { deliver, shell, p } from '../../library/controllers/twoFactor/twoFactor.service.js';
import { signedInTenantUser, tenantProtect, tenantProtectAccount } from '../../middleware/tenant/protect.tenant.middleware.js';
import {
	ORG_PERMISSIONS,
	ORG_PERMISSION_KEYS,
	grants,
	normalizePermissions,
	ownerOnly,
	tenantPermissions,
} from '../../library/functions/tenantPermissions.function.js';
import { rateLimit } from '../../library/functions/rateLimit.function.js';
import { later, notifyTenant } from '../../library/functions/tenantNotify.function.js';
import {
	TenancyError,
	createOrganization,
	handle,
	isId,
	publicOrganization,
	selfPayload,
} from '../../library/functions/tenancy.function.js';

/**
 * /tenant/api/org — the organization the token works in (docs/multi-tenancy WO-06).
 *
 *   GET    /                         the organization + member/project counts
 *   PUT    /                         name, logo, onboarding        manage-organization
 *   GET    /list                     every organization you belong to (no org needed)
 *   POST   /                         a new organization, you its owner → { token } in it
 *   POST   /switch/:id               → { token } in that organization
 *   GET    /members                  members (and their roles)
 *   PUT    /members/:id              { role, allProjects, projects } manage-members
 *   DELETE /members/:id              remove (`me` = leave)         manage-members
 *   POST   /transfer-ownership       { member }                    owner
 *   GET    /roles · POST · PUT /:id · DELETE /:id                  manage-roles
 *   GET    /permissions              what a role can be given
 *   GET    /invitations · POST { email, name, role, allProjects, projects } · POST /:id/resend · DELETE /:id   manage-members
 *
 * Project access (WO-22): a member opens every project (`allProjects`, the
 * default) or only `projects`; Owner and Admin always open every one.
 *
 * Joining (invitationsRouter, /tenant/api/invitations):
 *   GET    /for-me · POST /for-me/:id/accept · DELETE /for-me/:id   in the app, verified email (WO-24)
 *   GET    /:token                 the emailed link: who it's for, which organization, which projects
 *   POST   /:token/accept          { name, phone, password } → { token } — or nothing, signed in as the invitee
 */

const router = express.Router();

const tenantUrl = () => String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

const optionalPick = (list: readonly string[]) => Joi.string().valid(...list).allow('', null);

/** A token in `organization` for this user: a new session; the one it came from is signed out. */
const switchTo = async (req: any, organization: any) => {
	await TenantUser.updateOne({ _id: req.user._id }, { $set: { lastOrganization: organization } });
	const token = await tenantSessions.issueSession(req.user, req, 'switch', organization);
	const row: any = await tenantSessions.Session.findOne({ sid: req.sessionId }).lean();
	if (row) await tenantSessions.revokeSessions([row], req.user._id, 'Switched organization');
	return { token };
};

/* ------------------------------------------------- organizations (account) */

router.get(
	'/list',
	tenantProtectAccount,
	handle(async req => ({ doc: (await selfPayload(req)).organizations }))
);

router.post(
	'/',
	tenantProtectAccount,
	handle(async req => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120).required().messages({ 'any.required': 'Name the organization' }),
				onboarding: Joi.object().unknown(true).default(undefined),
			}),
			req.body
		);
		const owned = await Organization.countDocuments({ owner: req.user._id, isActive: { $ne: false } });
		if (owned >= 20) throw new TenancyError(400, 'You own 20 organizations already.');
		const organization = await createOrganization({ name: body.name, owner: req.user, onboarding: body.onboarding });
		return { organization: publicOrganization(organization), ...(await switchTo(req, organization._id)) };
	})
);

router.post(
	'/switch/:id',
	tenantProtectAccount,
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(404, 'Organization not found');
		const member: any = await OrganizationMember.findOne({ organization: req.params.id, user: req.user._id, status: 'active' }).lean();
		const organization: any = member && (await Organization.findById(req.params.id).lean());
		if (!organization || organization.isActive === false) throw new TenancyError(404, 'Organization not found');
		return switchTo(req, organization._id);
	})
);

/* ------------------------------------------------- the current organization */

const inOrg = express.Router();
inOrg.use(tenantProtect);

inOrg.get(
	'/',
	handle(async req => {
		const [members, projects, websites] = await Promise.all([
			OrganizationMember.countDocuments({ organization: req.organization._id, status: 'active' }),
			TenantProject.countDocuments({ organization: req.organization._id, isActive: { $ne: false } }),
			TenantProject.countDocuments({ organization: req.organization._id, isActive: { $ne: false }, type: 'website' }),
		]);
		return { ...publicOrganization(req.organization), counts: { members, projects, websites } };
	})
);

inOrg.put(
	'/',
	tenantPermissions(['manage-organization']),
	handle(async req => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120),
				logo: Joi.string().trim().max(1000).allow(''),
				onboarding: Joi.object({
					businessName: Joi.string().trim().max(160).allow(''),
					industry: optionalPick(ORG_INDUSTRIES),
					teamSize: optionalPick(ORG_TEAM_SIZES),
					role: Joi.string().trim().max(80).allow(''),
					website: Joi.string().trim().max(300).allow(''),
					country: Joi.string().trim().max(80).allow(''),
					heardFrom: optionalPick(HEARD_FROM),
					heardFromOther: Joi.string().trim().max(200).allow(''),
					goals: Joi.array().items(Joi.string().valid(...ORG_GOALS)),
				}),
			}),
			req.body
		);
		const set: any = {};
		if (body.name) set.name = body.name;
		if (body.logo !== undefined) set.logo = body.logo;
		if (body.onboarding) for (const [k, v] of Object.entries(body.onboarding)) set[`onboarding.${k}`] = v;
		const organization = await Organization.findByIdAndUpdate(req.organization._id, { $set: set }, { new: true }).lean();
		return publicOrganization(organization);
	})
);

/* ---------------------------------------------------------------- members */

const memberView = (m: any) => ({
	_id: String(m._id),
	user: m.user && { _id: String(m.user._id), name: m.user.name, email: m.user.email, image: m.user.image || '', twoFactorEnabled: !!m.user.twoFactorEnabled },
	role: m.role && { _id: String(m.role._id), name: m.role.name, system: m.role.system || null },
	// Owner and Admin open every project whatever is stored (WO-22).
	allProjects: m.role?.system === 'owner' || m.role?.system === 'admin' || m.allProjects !== false,
	projects: (m.projects || []).map(String),
	status: m.status,
	joinedAt: m.joinedAt,
});

/** Project access from a request body (WO-22): every project, or these of this organization. */
const accessSchema = {
	allProjects: Joi.boolean(),
	projects: Joi.array().items(Joi.string()).max(200),
};
const checkAccess = async (req: any, body: any) => {
	if (body.allProjects === undefined && body.projects === undefined) return null;
	const allProjects = body.allProjects !== false;
	const ids = allProjects ? [] : [...new Set<string>((body.projects || []).filter((id: any) => isId(id)).map(String))];
	const found = ids.length ? await TenantProject.find({ _id: { $in: ids }, organization: req.organization._id }, { _id: 1 }).lean() : [];
	if (found.length !== ids.length) throw new TenancyError(400, 'Choose projects of this organization');
	return { allProjects, projects: allProjects ? [] : found.map((p: any) => p._id) };
};

inOrg.get(
	'/members',
	handle(async req => {
		const docs = await OrganizationMember.find({ organization: req.organization._id, status: 'active' })
			.populate('user', 'name email image twoFactorEnabled')
			.populate('role', 'name system')
			.sort({ joinedAt: 1 })
			.lean();
		return { doc: docs.map(memberView), total: docs.length };
	})
);

const loadMember = async (req: any) => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'Member not found');
	const member: any = await OrganizationMember.findOne({ _id: req.params.id, organization: req.organization._id, status: 'active' }).populate('role');
	if (!member) throw new TenancyError(404, 'Member not found');
	return member;
};

const loadRole = async (req: any, id: any) => {
	if (!isId(id)) throw new TenancyError(400, 'Choose a role');
	const role: any = await OrganizationRole.findOne({ _id: id, organization: req.organization._id });
	if (!role) throw new TenancyError(400, 'Choose a role');
	if (role.system === 'owner') throw new TenancyError(400, 'Hand over ownership with “Transfer ownership” instead.');
	return role;
};

inOrg.put(
	'/members/:id',
	tenantPermissions(['manage-members']),
	handle(async req => {
		const member = await loadMember(req);
		const body = check(Joi.object({ role: Joi.string(), ...accessSchema }), req.body);
		if (body.role && String(body.role) !== String(member.role?._id)) {
			if (member.role?.system === 'owner') throw new TenancyError(400, 'The owner’s role can’t change — transfer ownership first.');
			member.role = (await loadRole(req, body.role))._id;
		}
		const access = await checkAccess(req, body);
		const roleChanged = member.isModified('role');
		if (access) Object.assign(member, access);
		const accessChanged = member.isModified('allProjects') || member.isModified('projects');
		await member.save();
		// Tell them (WO-37): their new role, or the projects they can now open.
		if (roleChanged || accessChanged)
			later(async () => {
				const role: any = roleChanged ? await OrganizationRole.findById(member.role, { name: 1 }).lean() : null;
				const names = member.allProjects === false ? (await TenantProject.find({ _id: { $in: member.projects || [] } }, { name: 1 }).lean()).map((x: any) => x.name) : [];
				await notifyTenant([
					{
						recipient: member.user?._id || member.user,
						organization: req.organization._id,
						actor: req.user._id,
						actorName: req.user.name,
						type: 'member-changed',
						title: role ? `You’re now ${role.name} in ${req.organization.name}` : `Your projects in ${req.organization.name} changed`,
						message: accessChanged ? (member.allProjects === false ? `You can open: ${names.join(', ') || 'no projects yet'}` : 'You can open every project') : undefined,
						href: '/projects',
					},
				]);
			});
		return memberView(await OrganizationMember.findById(member._id).populate('user', 'name email image twoFactorEnabled').populate('role', 'name system').lean());
	})
);

inOrg.delete(
	'/members/:id',
	handle(async req => {
		const leaving = req.params.id === 'me' || req.params.id === String(req.member._id);
		if (leaving) req.params.id = String(req.member._id);
		else if (!grants(req.permissions, ['manage-members'])) throw new TenancyError(403, 'Your role doesn’t allow removing members');
		const member = await loadMember(req);
		if (member.role?.system === 'owner') throw new TenancyError(400, 'The owner can’t leave or be removed — transfer ownership first.');
		member.status = 'removed';
		member.removedAt = new Date();
		await member.save();
		// Their sessions in this organization stop working on the next request (tenantProtect).
		return { message: leaving ? 'You left the organization' : 'Removed' };
	})
);

inOrg.post(
	'/transfer-ownership',
	ownerOnly,
	handle(async req => {
		if (!isId(req.body?.member)) throw new TenancyError(400, 'Choose a member');
		const next: any = await OrganizationMember.findOne({ _id: req.body.member, organization: req.organization._id, status: 'active' });
		if (!next) throw new TenancyError(400, 'Choose a member');
		if (String(next.user) === String(req.user._id)) throw new TenancyError(400, 'You already own it');
		const roles: any[] = await OrganizationRole.find({ organization: req.organization._id, system: { $in: ['owner', 'admin'] } }).lean();
		const owner = roles.find(r => r.system === 'owner');
		const admin = roles.find(r => r.system === 'admin');
		await OrganizationMember.updateOne({ _id: req.member._id }, { $set: { role: admin._id } });
		await OrganizationMember.updateOne({ _id: next._id }, { $set: { role: owner._id } });
		await Organization.updateOne({ _id: req.organization._id }, { $set: { owner: next.user } });
		return { message: 'Ownership transferred — you are now an admin.' };
	})
);

/* ------------------------------------------------------------------ roles */

const roleView = (r: any, members = 0) => ({
	_id: String(r._id),
	name: r.name,
	description: r.description || '',
	permissions: normalizePermissions(r.permissions || []),
	system: r.system || null,
	members,
});

/**
 * The standard keys (ORG_PERMISSIONS, WO-21). Old keys a role still holds
 * (`data:*`, per-model `view-<route>`…) are accepted and normalized away, so
 * saving an old role cleans it.
 */
const PERMISSION_PATTERN = new RegExp(
	`^(${ORG_PERMISSION_KEYS.map(k => k.replace(/[*:]/g, '\\$&')).join('|')}|data:\\*|data:view|(view|create|edit|delete)-[a-z0-9-]{1,60})$`
);
const roleBody = Joi.object({
	name: Joi.string().trim().min(1).max(60).required(),
	description: Joi.string().trim().max(300).allow(''),
	permissions: Joi.array().items(Joi.string().pattern(PERMISSION_PATTERN).messages({ 'string.pattern.base': 'Unknown permission' })).max(100).default([]),
});

inOrg.get(
	'/roles',
	handle(async req => {
		const [roles, counts] = await Promise.all([
			OrganizationRole.find({ organization: req.organization._id }).sort({ createdAt: 1 }).lean(),
			OrganizationMember.aggregate([
				{ $match: { organization: req.organization._id, status: 'active' } },
				{ $group: { _id: '$role', n: { $sum: 1 } } },
			]),
		]);
		const n = new Map(counts.map((c: any) => [String(c._id), c.n]));
		return { doc: roles.map(r => roleView(r, n.get(String(r._id)) || 0)) };
	})
);

/** What a role can be given: the standard keys, in their groups (WO-21). */
inOrg.get(
	'/permissions',
	handle(async () => ({ organization: ORG_PERMISSIONS }))
);

inOrg.post(
	'/roles',
	tenantPermissions(['manage-roles']),
	handle(async req => {
		const body = check(roleBody, req.body);
		body.permissions = normalizePermissions(body.permissions).filter(k => k !== '*');
		if (await OrganizationRole.exists({ organization: req.organization._id, name: body.name }))
			throw new TenancyError(400, 'A role with this name exists');
		const role = await OrganizationRole.create({ ...body, organization: req.organization._id });
		return roleView(role);
	})
);

inOrg.put(
	'/roles/:id',
	tenantPermissions(['manage-roles']),
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(404, 'Role not found');
		const role: any = await OrganizationRole.findOne({ _id: req.params.id, organization: req.organization._id });
		if (!role) throw new TenancyError(404, 'Role not found');
		const body = check(roleBody, req.body);
		body.permissions = normalizePermissions(body.permissions).filter(k => k !== '*');
		// Owner and admin are everything by definition; their names and descriptions can change.
		if (role.system === 'owner' || role.system === 'admin') delete body.permissions;
		if (body.name !== role.name && (await OrganizationRole.exists({ organization: req.organization._id, name: body.name })))
			throw new TenancyError(400, 'A role with this name exists');
		Object.assign(role, body);
		await role.save();
		return roleView(role);
	})
);

inOrg.delete(
	'/roles/:id',
	tenantPermissions(['manage-roles']),
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(404, 'Role not found');
		const role: any = await OrganizationRole.findOne({ _id: req.params.id, organization: req.organization._id });
		if (!role) throw new TenancyError(404, 'Role not found');
		if (role.system) throw new TenancyError(400, 'Owner, Admin and Member can’t be deleted');
		const inUse = await OrganizationMember.countDocuments({ organization: req.organization._id, role: role._id, status: 'active' });
		if (inUse) throw new TenancyError(400, `${inUse} member${inUse === 1 ? ' has' : 's have'} this role — give them another first`);
		if (await OrganizationInvitation.exists({ organization: req.organization._id, role: role._id, acceptedAt: null, cancelledAt: null, expiresAt: { $gt: new Date() } }))
			throw new TenancyError(400, 'A pending invitation uses this role — cancel it first');
		await OrganizationRole.deleteOne({ _id: role._id });
		return { message: 'Role deleted' };
	})
);

/* ------------------------------------------------------------ invitations */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const invitationView = (i: any) => ({
	_id: String(i._id),
	email: i.email,
	name: i.name || '',
	role: i.role && { _id: String(i.role._id || i.role), name: i.role.name },
	allProjects: i.allProjects !== false,
	projects: (i.projects || []).map(String),
	invitedBy: i.invitedBy && typeof i.invitedBy === 'object' ? { _id: String(i.invitedBy._id), name: i.invitedBy.name } : null,
	expiresAt: i.expiresAt,
	expired: new Date(i.expiresAt) < new Date(),
	lastSentAt: i.lastSentAt || i.createdAt,
	createdAt: i.createdAt,
});

/** A fresh link for the invitation, emailed. The link's token is only ever in the email. */
const sendInvite = async (req: any, invitation: any) => {
	const raw = crypto.randomBytes(32).toString('hex');
	invitation.tokenHash = sha256(raw);
	invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
	invitation.lastSentAt = new Date();
	await invitation.save();
	const link = `${tenantUrl()}/auth/accept-invitation/${raw}`;
	const org = req.organization.name;
	const by = req.user.name;
	await deliver(
		invitation.email,
		`${by} invited you to ${org} on MINT`,
		`Hi${invitation.name ? ` ${invitation.name}` : ''},\n\n${by} invited you to join ${org} on MINT. Accept within 7 days:\n\n${link}`,
		shell(`Join ${org}`, p(`${by} invited you to join <b>${org}</b> on MINT.`) + p(`<a href="${link}">Accept the invitation</a> — the link works for 7 days.`))
	);
	return raw;
};

inOrg.get(
	'/invitations',
	tenantPermissions(['manage-members']),
	handle(async req => {
		const docs = await OrganizationInvitation.find({ organization: req.organization._id, acceptedAt: null, cancelledAt: null })
			.populate('role', 'name')
			.populate('invitedBy', 'name')
			.sort({ createdAt: -1 })
			.lean();
		return { doc: docs.map(invitationView) };
	})
);

inOrg.post(
	'/invitations',
	tenantPermissions(['manage-members']),
	rateLimit({ name: 'tenant-invite', windowMs: 60 * 60 * 1000, max: 100 }),
	handle(async req => {
		const body = check(
			Joi.object({
				email: Joi.string().trim().lowercase().email().required(),
				name: Joi.string().trim().max(120).allow(''),
				role: Joi.string().required().messages({ 'any.required': 'Choose a role' }),
				...accessSchema,
			}),
			req.body
		);
		const role = await loadRole(req, body.role);
		const access = (await checkAccess(req, body)) || { allProjects: true, projects: [] };
		const existing: any = await TenantUser.findOne({ email: body.email }, { _id: 1 }).lean();
		if (existing && (await OrganizationMember.exists({ organization: req.organization._id, user: existing._id, status: 'active' })))
			throw new TenancyError(400, 'They are already a member');
		// One open invitation per email: a second invite re-sends it with the new role.
		let invitation: any = await OrganizationInvitation.findOne({ organization: req.organization._id, email: body.email, acceptedAt: null, cancelledAt: null });
		if (!invitation)
			invitation = new OrganizationInvitation({ organization: req.organization._id, email: body.email, tokenHash: 'pending', expiresAt: new Date() });
		invitation.name = body.name || invitation.name;
		invitation.role = role._id;
		invitation.allProjects = access.allProjects;
		invitation.projects = access.projects;
		invitation.invitedBy = req.user._id;
		await sendInvite(req, invitation);
		// Someone who already has an account also sees it in the app (WO-37); accepting is on Home.
		if (existing)
			later(() =>
				notifyTenant([
					{
						recipient: existing._id,
						organization: req.organization._id,
						actor: req.user._id,
						actorName: req.user.name,
						type: 'invitation',
						title: `${req.user.name || 'Someone'} invited you to join ${req.organization.name}`,
						message: `As ${role.name}. Accept it on your Home page.`,
						href: '/dashboard',
					},
				])
			);
		return invitationView(await OrganizationInvitation.findById(invitation._id).populate('role', 'name').populate('invitedBy', 'name').lean());
	})
);

const loadInvitation = async (req: any) => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'Invitation not found');
	const invitation: any = await OrganizationInvitation.findOne({ _id: req.params.id, organization: req.organization._id, acceptedAt: null, cancelledAt: null });
	if (!invitation) throw new TenancyError(404, 'Invitation not found');
	return invitation;
};

inOrg.post(
	'/invitations/:id/resend',
	tenantPermissions(['manage-members']),
	handle(async req => {
		const invitation = await loadInvitation(req);
		if (invitation.lastSentAt && Date.now() - new Date(invitation.lastSentAt).getTime() < 60_000)
			throw new TenancyError(429, 'Sent a moment ago — wait a minute before sending again.');
		await sendInvite(req, invitation);
		return { message: 'Sent again' };
	})
);

inOrg.delete(
	'/invitations/:id',
	tenantPermissions(['manage-members']),
	handle(async req => {
		const invitation = await loadInvitation(req);
		invitation.cancelledAt = new Date();
		await invitation.save();
		return { message: 'Invitation cancelled' };
	})
);

router.use('/', inOrg);

/* ------------------------------------- joining: the emailed link, and in the app */

/**
 * Makes `user` a member from an invitation — its role and project access
 * (WO-22) — marks it accepted, and opens the organization next time they sign
 * in. Their email is now proven (the link was emailed to it, or they verified
 * it), WO-24.
 */
const joinFromInvitation = async (invitation: any, user: any) => {
	await OrganizationMember.findOneAndUpdate(
		{ organization: invitation.organization._id, user: user._id },
		{
			$set: {
				role: invitation.role._id,
				allProjects: invitation.allProjects !== false,
				projects: invitation.allProjects === false ? invitation.projects || [] : [],
				status: 'active',
				invitedBy: invitation.invitedBy,
				joinedAt: new Date(),
			},
			$unset: { removedAt: 1 },
		},
		{ upsert: true }
	);
	invitation.acceptedAt = new Date();
	invitation.acceptedBy = user._id;
	await invitation.save();
	await TenantUser.updateOne({ _id: user._id }, { $set: { lastOrganization: invitation.organization._id, emailVerified: true } });
	// Whoever invited them hears they joined (WO-37).
	if (invitation.invitedBy)
		later(() =>
			notifyTenant([
				{
					recipient: invitation.invitedBy,
					organization: invitation.organization._id,
					actor: user._id,
					actorName: user.name,
					type: 'member-joined',
					title: `${user.name || user.email} joined ${invitation.organization.name}`,
					message: `As ${invitation.role?.name || 'a member'}.`,
					href: '/org/members',
				},
			])
		);
};

/** An invitation's projects by name, for the person invited. */
const projectNames = async (invitation: any) =>
	invitation.allProjects === false ? (await TenantProject.find({ _id: { $in: invitation.projects || [] } }, { name: 1 }).lean()).map((p: any) => p.name) : [];

export const invitationsRouter = express.Router();

/*
 * In the app (WO-24): invitations sent to the signed-in account's email —
 * listed only once that email is verified, so nobody signing up with another
 * person's address sees, or takes, their invitations.
 *
 *   GET    /tenant/api/invitations/for-me              { verified, doc }
 *   POST   /tenant/api/invitations/for-me/:id/accept   → { token } in that organization
 *   DELETE /tenant/api/invitations/for-me/:id          decline
 */
const pendingFor = (user: any) => ({ email: user.email, acceptedAt: null, cancelledAt: null, expiresAt: { $gt: new Date() } });

const loadMine = async (req: any) => {
	if (!req.user.emailVerified) throw new TenancyError(403, 'Verify your email first.', 'email_unverified');
	if (!isId(req.params.id)) throw new TenancyError(404, 'Invitation not found');
	const invitation: any = await OrganizationInvitation.findOne({ _id: req.params.id, ...pendingFor(req.user) })
		.populate('organization', 'name logo isActive')
		.populate('role', 'name system');
	if (!invitation || invitation.organization?.isActive === false) throw new TenancyError(404, 'Invitation not found');
	return invitation;
};

invitationsRouter.get(
	'/for-me',
	tenantProtectAccount,
	handle(async req => {
		if (!req.user.emailVerified) return { verified: false, email: req.user.email, doc: [] };
		const [docs, memberships]: any = await Promise.all([
			OrganizationInvitation.find(pendingFor(req.user))
				.populate('organization', 'name logo isActive')
				.populate('role', 'name')
				.populate('invitedBy', 'name')
				.sort({ createdAt: -1 })
				.lean(),
			OrganizationMember.find({ user: req.user._id, status: 'active' }, { organization: 1 }).lean(),
		]);
		const mine = new Set(memberships.map((m: any) => String(m.organization)));
		const open = docs.filter((i: any) => i.organization && i.organization.isActive !== false && !mine.has(String(i.organization._id)));
		return {
			verified: true,
			email: req.user.email,
			doc: await Promise.all(
				open.map(async (i: any) => ({
					_id: String(i._id),
					organization: { _id: String(i.organization._id), name: i.organization.name, logo: i.organization.logo || '' },
					role: i.role?.name,
					invitedBy: i.invitedBy?.name || '',
					allProjects: i.allProjects !== false,
					projects: await projectNames(i),
					expiresAt: i.expiresAt,
				}))
			),
		};
	})
);

invitationsRouter.post(
	'/for-me/:id/accept',
	tenantProtectAccount,
	handle(async req => {
		const invitation = await loadMine(req);
		await joinFromInvitation(invitation, req.user);
		return { message: `Welcome to ${invitation.organization.name}`, ...(await switchTo(req, invitation.organization._id)) };
	})
);

invitationsRouter.delete(
	'/for-me/:id',
	tenantProtectAccount,
	handle(async req => {
		const invitation = await loadMine(req);
		invitation.cancelledAt = new Date();
		await invitation.save();
		return { message: 'Invitation declined' };
	})
);

/* The emailed link (no session needed). */

const openInvitation = async (token: any) => {
	const invitation: any = await OrganizationInvitation.findOne({ tokenHash: sha256(String(token || '')) })
		.select('+tokenHash')
		.populate('organization', 'name logo isActive')
		.populate('role', 'name system');
	if (!invitation || invitation.acceptedAt || invitation.cancelledAt || new Date(invitation.expiresAt) < new Date() || invitation.organization?.isActive === false)
		throw new TenancyError(400, 'This invitation link is invalid or has expired. Ask for a new one.', 'invitation_invalid');
	return invitation;
};

invitationsRouter.get(
	'/:token',
	handle(async req => {
		const invitation = await openInvitation(req.params.token);
		const existingAccount = !!(await TenantUser.exists({ email: invitation.email }));
		// Signed in as the person invited: one click joins (WO-24).
		const me = await signedInTenantUser(req);
		return {
			email: invitation.email,
			name: invitation.name || '',
			organization: { name: invitation.organization.name, logo: invitation.organization.logo || '' },
			role: invitation.role?.name,
			// What they'll open: every project, or these (WO-22).
			allProjects: invitation.allProjects !== false,
			projects: await projectNames(invitation),
			existingAccount,
			signedInAsInvitee: !!me && me.email === invitation.email,
			expiresAt: invitation.expiresAt,
		};
	})
);

invitationsRouter.post(
	'/:token/accept',
	rateLimit({ name: 'tenant-invite-accept', windowMs: 15 * 60 * 1000, max: 30 }),
	handle(async req => {
		const invitation = await openInvitation(req.params.token);
		const me = await signedInTenantUser(req);
		let user: any;
		if (me && me.email === invitation.email) {
			// The link came to their email and they're signed in to that account: nothing more to prove.
			user = me;
		} else {
			user = await TenantUser.findOne({ email: invitation.email }).select('+password');
			if (user) {
				// An existing account proves it's theirs with its password.
				if (!(await user.checkPassword(req.body?.password))) throw new TenancyError(400, 'That password isn’t right for this account.', 'wrong_password');
				if (user.isActive === false) throw new TenancyError(400, 'This account has been deactivated.');
			} else {
				const body = check(
					Joi.object({
						name: Joi.string().trim().min(1).max(120).required(),
						phone: Joi.string().trim().max(40).allow(''),
						password: Joi.string().min(8).max(200).required().messages({ 'string.min': 'Use at least 8 characters for the password' }),
					}),
					req.body
				);
				user = await TenantUser.create({ name: body.name, phone: body.phone, email: invitation.email, password: body.password, emailVerified: true });
			}
		}
		await joinFromInvitation(invitation, user);
		return { message: `Welcome to ${invitation.organization.name}`, token: await tenantSessions.issueSession(user, req, 'invitation', invitation.organization._id) };
	})
);

export default router;
