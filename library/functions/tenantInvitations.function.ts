import crypto from 'crypto';
import OrganizationMember from '../models/tenancy/organizationMember.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import TenantUser from '../models/tenancy/tenantUser.model.js';
import { deliver, shell, p } from '../controllers/twoFactor/twoFactor.service.js';
import { later, notifyTenant } from './tenantNotify.function.js';

/**
 * Invitations into an organization (WO-06/24) or into one of its projects
 * (WO-47) — both are OrganizationInvitation rows; a project's has `project`.
 * Shared by /tenant/api/org (org.router.ts) and /tenant/api/p/:id/people
 * (people.router.ts).
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const tenantUrl = () => String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

export const invitationView = (i: any) => ({
	_id: String(i._id),
	email: i.email,
	name: i.name || '',
	role: i.role && { _id: String(i.role._id || i.role), name: i.role.name },
	allProjects: i.allProjects !== false,
	projects: (i.projects || []).map(String),
	/** An invitation into one project (WO-47). */
	project: i.project ? { _id: String(i.project._id || i.project), name: i.project.name || '' } : null,
	invitedBy: i.invitedBy && typeof i.invitedBy === 'object' ? { _id: String(i.invitedBy._id), name: i.invitedBy.name } : null,
	expiresAt: i.expiresAt,
	expired: new Date(i.expiresAt) < new Date(),
	lastSentAt: i.lastSentAt || i.createdAt,
	createdAt: i.createdAt,
});

/**
 * A fresh link for the invitation, emailed. The link's token is only ever in
 * the email. `projectName` for an invitation into a project.
 */
export const sendInvite = async (req: any, invitation: any, projectName?: string) => {
	const raw = crypto.randomBytes(32).toString('hex');
	invitation.tokenHash = sha256(raw);
	invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
	invitation.lastSentAt = new Date();
	await invitation.save();
	const link = `${tenantUrl()}/auth/accept-invitation/${raw}`;
	const org = req.organization.name;
	const by = req.user.name;
	const what = projectName ? `${projectName} in ${org}` : org;
	const whatHtml = projectName ? `<b>${projectName}</b> in ${org}` : `<b>${org}</b>`;
	await deliver(
		invitation.email,
		`${by} invited you to ${what} on MINT`,
		`Hi${invitation.name ? ` ${invitation.name}` : ''},\n\n${by} invited you to join ${what} on MINT. Accept within 7 days:\n\n${link}`,
		shell(`Join ${projectName || org}`, p(`${by} invited you to join ${whatHtml} on MINT.`) + p(`<a href="${link}">Accept the invitation</a> — the link works for 7 days.`))
	);
	return raw;
};

/** An invitation's projects by name, for the person invited. */
export const projectNames = async (invitation: any) => {
	if (invitation.project) {
		const project: any = await TenantProject.findById(invitation.project._id || invitation.project, { name: 1 }).lean();
		return project ? [project.name] : [];
	}
	return invitation.allProjects === false ? (await TenantProject.find({ _id: { $in: invitation.projects || [] } }, { name: 1 }).lean()).map((x: any) => x.name) : [];
};

/**
 * Gives a member a project with its role (WO-47): it joins their list, and
 * the role is theirs there (replacing an earlier one).
 */
export const addProjectRole = (memberId: any, project: any, role: any) =>
	OrganizationMember.updateOne({ _id: memberId }, [
		{
			$set: {
				projects: { $setUnion: [{ $ifNull: ['$projects', []] }, [project]] },
				projectRoles: {
					$concatArrays: [
						{ $filter: { input: { $ifNull: ['$projectRoles', []] }, cond: { $ne: ['$$this.project', project] } } },
						[{ project, role }],
					],
				},
			},
		},
	]);

/**
 * Makes `user` a member from an invitation — its role and project access
 * (WO-22) — marks it accepted, and opens the organization next time they sign
 * in. Their email is now proven (the link was emailed to it, or they verified
 * it), WO-24.
 *
 * A project's invitation (WO-47) makes a new person a guest who opens that
 * project only; someone already in the organization gets the project added.
 */
export const joinFromInvitation = async (invitation: any, user: any) => {
	const organization = invitation.organization._id;
	const projectId = invitation.project?._id || invitation.project;
	if (projectId) {
		const existing: any = await OrganizationMember.findOne({ organization, user: user._id }).lean();
		if (existing && existing.status === 'active') {
			// Someone opening every project already opens this one; the role still applies there.
			await addProjectRole(existing._id, projectId, invitation.role._id);
		} else {
			await OrganizationMember.findOneAndUpdate(
				{ organization, user: user._id },
				{
					$set: {
						role: invitation.role._id,
						guest: true,
						allProjects: false,
						projects: [projectId],
						projectRoles: [{ project: projectId, role: invitation.role._id }],
						status: 'active',
						invitedBy: invitation.invitedBy,
						joinedAt: new Date(),
					},
					$unset: { removedAt: 1 },
				},
				{ upsert: true }
			);
		}
	} else {
		await OrganizationMember.findOneAndUpdate(
			{ organization, user: user._id },
			{
				$set: {
					role: invitation.role._id,
					guest: false,
					allProjects: invitation.allProjects !== false,
					projects: invitation.allProjects === false ? invitation.projects || [] : [],
					status: 'active',
					invitedBy: invitation.invitedBy,
					joinedAt: new Date(),
				},
				$unset: { removedAt: 1, projectRoles: 1 },
			},
			{ upsert: true }
		);
	}
	invitation.acceptedAt = new Date();
	invitation.acceptedBy = user._id;
	await invitation.save();
	await TenantUser.updateOne({ _id: user._id }, { $set: { lastOrganization: organization, emailVerified: true } });
	// Whoever invited them hears they joined (WO-37).
	if (invitation.invitedBy)
		later(async () => {
			const names = projectId ? await projectNames(invitation) : [];
			await notifyTenant([
				{
					recipient: invitation.invitedBy,
					organization,
					actor: user._id,
					actorName: user.name,
					type: 'member-joined',
					title: `${user.name || user.email} joined ${names[0] || invitation.organization.name}`,
					message: `As ${invitation.role?.name || 'a member'}.`,
					href: projectId ? '/projects' : '/org/members',
				},
			]);
		});
};
