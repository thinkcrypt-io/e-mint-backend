import mongoose from 'mongoose';
import OrganizationRole from '../models/tenancy/organizationRole.model.js';

/**
 * What a member of an organization may do (docs/multi-tenancy WO-05/06).
 *
 * Permissions are strings on the member's OrganizationRole:
 *   '*'                    everything (owner, admin)
 *   ORG_PERMISSIONS keys   organization-level actions below
 *   'data:*' / 'data:view' every built model's records, in every project —
 *                          all actions, or only reading
 *   view-<route> …         one model's records (the admin panel's key style),
 *                          in every project of the organization
 * Owner-only actions (deleting the organization, handing over ownership) are
 * checked on the role's `system === 'owner'`, not on a key.
 */
export const ORG_PERMISSIONS = [
	{ key: 'manage-organization', label: 'Edit the organization', description: 'Name, logo and business details' },
	{ key: 'manage-members', label: 'Manage members', description: 'Invite people, change their roles, remove them' },
	{ key: 'manage-roles', label: 'Manage roles', description: 'Create, edit and delete roles' },
	{ key: 'create-projects', label: 'Create projects', description: 'Start new apps and websites' },
	{ key: 'manage-projects', label: 'Manage projects', description: 'Rename, archive and delete any project' },
	{ key: 'build', label: 'Build', description: 'Models, pages, sidebar, dashboard and public API in every project' },
	{ key: 'manage-api-keys', label: 'MCP keys', description: 'Create and revoke the keys AI assistants connect with' },
	{ key: 'data:*', label: 'All records', description: 'See, add, edit and delete records in every model' },
	{ key: 'data:view', label: 'Read all records', description: 'See records in every model' },
] as const;

export const ORG_PERMISSION_KEYS = ORG_PERMISSIONS.map(p => p.key);

export const SYSTEM_ROLE_DEFAULTS = {
	owner: { name: 'Owner', description: 'Everything, including deleting the organization', permissions: ['*'] },
	admin: { name: 'Admin', description: 'Everything except deleting the organization or changing its owner', permissions: ['*'] },
	member: { name: 'Member', description: 'Works with the records in every project', permissions: ['data:*', 'create-projects'] },
} as const;

/** The three roles every organization starts with; returns them by system name. */
export const seedOrgRoles = async (organization: any, session?: mongoose.ClientSession) => {
	const out: Record<string, any> = {};
	for (const [system, def] of Object.entries(SYSTEM_ROLE_DEFAULTS)) {
		const role = await OrganizationRole.findOneAndUpdate(
			{ organization, system },
			{ $setOnInsert: { organization, system, ...def } },
			{ upsert: true, new: true, session }
		);
		out[system] = role;
	}
	return out;
};

const RECORD_KEY = /^(view|create|edit|delete)-(.+)$/;

/** Whether a member's permissions grant any one of `wanted`. */
export const grants = (permissions: string[] = [], wanted: string[]) => {
	if (permissions.includes('*')) return true;
	return wanted.some(key => {
		if (permissions.includes(key)) return true;
		const record = key.match(RECORD_KEY);
		if (!record) return false;
		if (permissions.includes('data:*')) return true;
		return record[1] === 'view' && permissions.includes('data:view');
	});
};

/** Express: 403 unless the member's role grants one of `wanted` (like adminPermissions). */
export const tenantPermissions = (wanted: string[]) => (req: any, res: any, next: any) =>
	grants(req.permissions, wanted)
		? next()
		: res.status(403).json({ message: 'Forbidden: your role in this organization doesn’t allow this' });

/** Express: only the organization's owner. */
export const ownerOnly = (req: any, res: any, next: any) =>
	req.role?.system === 'owner' ? next() : res.status(403).json({ message: 'Only the organization’s owner can do this' });
