import mongoose from 'mongoose';
import OrganizationRole from '../models/tenancy/organizationRole.model.js';

/**
 * What a member of an organization may do (docs/multi-tenancy WO-05/06, WO-21).
 *
 * Permissions are strings on the member's OrganizationRole — the standard set
 * (WO-21), records first:
 *   '*'                       everything (owner, admin)
 *   records:view|create|edit|delete
 *                             every model's records — and the project's media,
 *                             customers and analytics — in the projects the
 *                             member can open (WO-22)
 *   build, manage-api-keys, create-projects, manage-projects,
 *   manage-members, manage-roles, manage-organization
 * There are no per-model keys: `grants` maps a route's view-/create-/edit-/
 * delete-<route> onto the record keys. The old `data:*` (all four) and
 * `data:view` are still read. Owner-only actions (handing over ownership,
 * deleting a project with data) are checked on the role's `system === 'owner'`.
 */
export const RECORD_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

export const ORG_PERMISSIONS = [
	{ key: 'records:view', group: 'Records', label: 'View', description: 'See records, media, customers and analytics' },
	{ key: 'records:create', group: 'Records', label: 'Add', description: 'Add records, import them, upload files' },
	{ key: 'records:edit', group: 'Records', label: 'Edit', description: 'Change records, archive them, move their status' },
	{ key: 'records:delete', group: 'Records', label: 'Delete', description: 'Delete and merge records, delete files' },
	{ key: 'build', group: 'Projects', label: 'Build', description: 'Models, pages, sidebar, dashboard, media and the public API' },
	{ key: 'manage-api-keys', group: 'Projects', label: 'AI keys', description: 'Create and revoke the keys AI assistants connect with' },
	{ key: 'create-projects', group: 'Projects', label: 'Create projects', description: 'Start new apps and websites' },
	{ key: 'manage-projects', group: 'Projects', label: 'Manage projects', description: 'Rename, archive and delete the projects they can open' },
	{ key: 'manage-members', group: 'Organization', label: 'Manage members', description: 'Invite people, change their roles and projects, remove them' },
	{ key: 'manage-roles', group: 'Organization', label: 'Manage roles', description: 'Create, edit and delete roles' },
	{ key: 'manage-organization', group: 'Organization', label: 'Edit the organization', description: 'Name, logo and business details' },
] as const;

export const ORG_PERMISSION_KEYS: string[] = ORG_PERMISSIONS.map(p => p.key);

const ALL_RECORDS = RECORD_ACTIONS.map(a => `records:${a}`);

/**
 * A role's permissions in today's keys: `data:*` / `data:view` become record
 * keys, per-model and unknown keys are dropped. Used when roles are read and saved.
 */
export const normalizePermissions = (permissions: string[] = []): string[] => {
	if (permissions.includes('*')) return ['*'];
	const out = new Set<string>();
	for (const p of permissions) {
		if (p === 'data:*') ALL_RECORDS.forEach(k => out.add(k));
		else if (p === 'data:view') out.add('records:view');
		else if (ORG_PERMISSION_KEYS.includes(p)) out.add(p);
	}
	return ORG_PERMISSION_KEYS.filter(k => out.has(k));
};

export const SYSTEM_ROLE_DEFAULTS = {
	owner: { name: 'Owner', description: 'Everything, including handing the organization over', permissions: ['*'] },
	admin: { name: 'Admin', description: 'Everything except handing the organization over', permissions: ['*'] },
	member: { name: 'Member', description: 'Works with the records in their projects, and starts projects', permissions: [...ALL_RECORDS, 'create-projects'] },
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
/** The media manager's keys (view-image…): building includes managing media. */
const MEDIA_ROUTE = 'image';

/** Whether a member's permissions grant any one of `wanted`. */
export const grants = (permissions: string[] = [], wanted: string[]) => {
	if (permissions.includes('*')) return true;
	return wanted.some(key => {
		if (permissions.includes(key)) return true;
		const record = key.match(RECORD_KEY);
		if (!record) return false;
		const [, action, route] = record;
		if (route === MEDIA_ROUTE && permissions.includes('build')) return true;
		if (permissions.includes(`records:${action}`)) return true;
		// Keys from before WO-21.
		if (permissions.includes('data:*')) return true;
		return action === 'view' && permissions.includes('data:view');
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
