import mongoose from 'mongoose';
import OrganizationRole from '../models/tenancy/organizationRole.model.js';

/**
 * What a member of an organization may do (docs/multi-tenancy WO-05/06, WO-21).
 *
 * Permissions are strings on the member's OrganizationRole — the standard set
 * (WO-21), records first:
 *   '*'                       everything (owner, admin)
 *   records:view|create|edit|delete|publish
 *                             every model's records — and the project's media,
 *                             customers and analytics — in the projects the
 *                             member can open (WO-22); publish puts drafts live
 *                             on models with Drafts and publishing (docs/cms D11)
 *   build, manage-api-keys, create-projects, manage-projects,
 *   invite-to-projects, manage-members, manage-roles, manage-organization
 `grants` maps a route's view-/create-/edit-/delete-<route> onto the record
 * keys. A project's own roles (WO-50) hold per-model keys instead
 * (`create-deals`) — kept by normalizePermissions, matched as they are. The old `data:*` (all four) and
 * `data:view` are still read. Owner-only actions (handing over ownership,
 * deleting a project with data) are checked on the role's `system === 'owner'`.
 */
export const RECORD_ACTIONS = ['view', 'create', 'edit', 'delete', 'publish'] as const;

export const ORG_PERMISSIONS = [
	{ key: 'records:view', group: 'Records', label: 'View', description: 'See records, media, customers and analytics' },
	{ key: 'records:create', group: 'Records', label: 'Add', description: 'Add records, import them, upload files' },
	{ key: 'records:edit', group: 'Records', label: 'Edit', description: 'Change records, archive them, move their status' },
	{ key: 'records:delete', group: 'Records', label: 'Delete', description: 'Delete and merge records, delete files' },
	{ key: 'records:publish', group: 'Records', label: 'Publish', description: 'Put drafts live, take records off the site, throw changes away' },
	{ key: 'build', group: 'Projects', label: 'Build', description: 'Models, pages, sidebar, dashboard, media and the public API' },
	{ key: 'manage-api-keys', group: 'Projects', label: 'AI keys', description: 'Create and revoke the keys AI assistants connect with' },
	{ key: 'create-projects', group: 'Projects', label: 'Create projects', description: 'Start new apps and websites' },
	{ key: 'manage-projects', group: 'Projects', label: 'Manage projects', description: 'Rename, archive and delete the projects they can open' },
	{ key: 'invite-to-projects', group: 'Projects', label: 'Invite to projects', description: 'Invite people into the projects they can open, and make roles there' },
	{ key: 'manage-members', group: 'Organization', label: 'Manage members', description: 'Invite people, change their roles and projects, remove them' },
	{ key: 'manage-roles', group: 'Organization', label: 'Manage roles', description: 'Create, edit and delete roles' },
	{ key: 'manage-organization', group: 'Organization', label: 'Edit the organization', description: 'Name, logo and business details' },
] as const;

export const ORG_PERMISSION_KEYS: string[] = ORG_PERMISSIONS.map(p => p.key);

const ALL_RECORDS = RECORD_ACTIONS.map(a => `records:${a}`);

/** A per-model key — view-/create-/edit-/delete-/publish-<route> — of a project's own role (WO-50). */
export const isModelKey = (key: string) => !ORG_PERMISSION_KEYS.includes(key) && /^(view|create|edit|delete|publish)-[a-z0-9_-]+$/i.test(key);

/**
 * A role's permissions in today's keys: `data:*` / `data:view` become record
 * keys, unknown keys are dropped. Per-model keys are kept after the standard
 * ones only for a project's own role (`models`, WO-50) — an organization
 * role's old per-model keys (before WO-21) stay ignored. Used when roles are
 * read and saved.
 */
export const normalizePermissions = (permissions: string[] = [], { models: keepModels = false } = {}): string[] => {
	if (permissions.includes('*')) return ['*'];
	const out = new Set<string>();
	const models = new Set<string>();
	for (const p of permissions) {
		if (p === 'data:*') ALL_RECORDS.forEach(k => out.add(k));
		else if (p === 'data:view') out.add('records:view');
		else if (ORG_PERMISSION_KEYS.includes(p)) out.add(p);
		else if (keepModels && isModelKey(p)) models.add(p);
	}
	return [...ORG_PERMISSION_KEYS.filter(k => out.has(k)), ...models];
};

export const SYSTEM_ROLE_DEFAULTS = {
	owner: { name: 'Owner', description: 'Everything, including handing the organization over', permissions: ['*'] },
	admin: { name: 'Admin', description: 'Everything except handing the organization over', permissions: ['*'] },
	member: { name: 'Member', description: 'Works with the records in their projects, and starts projects', permissions: [...ALL_RECORDS, 'create-projects'] },
	/** WO-47: builds the projects they can open — models, pages, AI keys. */
	developer: { name: 'Developer', description: 'Works with the records and builds the projects they can open', permissions: [...ALL_RECORDS, 'build', 'manage-api-keys'] },
	/** WO-50: everything inside the projects they're given — its settings and who works in it too. */
	full: {
		name: 'Full access',
		description: 'Everything in the project: records, building, its settings and members',
		permissions: [...ALL_RECORDS, 'build', 'manage-api-keys', 'manage-projects', 'invite-to-projects'],
	},
} as const;

/** The standard roles a project invitation can give (WO-47, WO-50) — and the project's own roles. */
export const PROJECT_INVITE_ROLES = ['full', 'member', 'developer'] as const;

/**
 * What a guest — someone invited into projects, not the organization (WO-47) —
 * can ever hold: work inside a project — with Full access, its settings and
 * members (WO-50). Nothing organization-wide.
 */
export const PROJECT_KEYS = [...ALL_RECORDS, 'build', 'manage-api-keys', 'manage-projects', 'invite-to-projects'];

const onlyProjectKeys = (permissions: string[]) =>
	permissions.includes('*') ? [...PROJECT_KEYS] : permissions.filter(k => PROJECT_KEYS.includes(k));

/**
 * A member's permissions in the organization (no project open): their role's,
 * a guest's cut to the project keys (WO-47).
 */
export const memberPermissions = (member: any, rolePermissions: string[] = []) => {
	const own = normalizePermissions(rolePermissions);
	return member?.guest ? onlyProjectKeys(own) : own;
};

/**
 * The role a member has in one project (WO-47), if they were invited to it —
 * its id, from `projectRoles`.
 */
export const projectRoleOf = (member: any, projectId: any) =>
	(member?.projectRoles || []).find((r: any) => String(r.project) === String(projectId))?.role || null;

/**
 * A member's permissions inside a project (WO-47): a guest has the role they
 * were invited with there, alone; a full member their organization's, plus the
 * project's role when they have one.
 */
export const projectPermissions = (member: any, orgPermissions: string[], projectRole: any) => {
	if (!projectRole) return orgPermissions;
	const own = normalizePermissions(projectRole.permissions || [], { models: !!projectRole.project });
	const here = [...onlyProjectKeys(own), ...own.filter(isModelKey)];
	if (member?.guest) return here;
	if (orgPermissions.includes('*')) return orgPermissions;
	return [...ORG_PERMISSION_KEYS.filter(k => orgPermissions.includes(k) || here.includes(k)), ...here.filter(isModelKey)];
};

/** The signed-in member's permissions inside one project — its role there counts (for routes outside /p/:project). */
export const requestPermissionsIn = async (req: any, projectId: any) => {
	const roleId = projectRoleOf(req.member, projectId);
	if (!roleId) return req.permissions || [];
	const role: any = await OrganizationRole.findById(roleId, { permissions: 1, project: 1 }).lean();
	return projectPermissions(req.member, req.permissions || [], role);
};

/**
 * A member's permissions in a project, from the member row alone (its `role`
 * populated with permissions): for code outside a request — MCP keys,
 * notifications (WO-47).
 */
export const permissionsInProject = async (member: any, projectId: any) => {
	const own = memberPermissions(member, member?.role?.permissions || []);
	const roleId = projectRoleOf(member, projectId);
	if (!roleId) return own;
	const role: any = await OrganizationRole.findById(roleId, { permissions: 1, project: 1 }).lean();
	return projectPermissions(member, own, role);
};

/**
 * One system role of an organization — made if it's missing (Developer came
 * later, WO-47). Role names are unique in an organization, so if the
 * organization already made its own "Developer", the system one is
 * "Developer (standard)" rather than failing every invite.
 */
export const systemRole = async (organization: any, system: keyof typeof SYSTEM_ROLE_DEFAULTS, session?: mongoose.ClientSession) => {
	const def = SYSTEM_ROLE_DEFAULTS[system];
	for (const name of [def.name, `${def.name} (standard)`, `${def.name} (standard 2)`]) {
		try {
			return await OrganizationRole.findOneAndUpdate(
				{ organization, system },
				{ $setOnInsert: { organization, system, ...def, name } },
				{ upsert: true, new: true, session }
			);
		} catch (e: any) {
			if (e?.code !== 11000) throw e;
		}
	}
	throw new Error(`Couldn't make the ${def.name} role`);
};

/** The roles every organization starts with; returns them by system name. */
export const seedOrgRoles = async (organization: any, session?: mongoose.ClientSession) => {
	const out: Record<string, any> = {};
	for (const system of Object.keys(SYSTEM_ROLE_DEFAULTS)) {
		out[system] = await systemRole(organization, system as keyof typeof SYSTEM_ROLE_DEFAULTS, session);
	}
	return out;
};

const RECORD_KEY = /^(view|create|edit|delete|publish)-(.+)$/;
/** The media manager's keys (view-image…): building includes managing media. */
const MEDIA_ROUTE = 'image';

/** Whether a member's permissions grant any one of `wanted`. */
export const grants = (permissions: string[] = [], wanted: string[]) => {
	if (permissions.includes('*')) return true;
	return wanted.some(key => {
		if (permissions.includes(key)) return true;
		// A standard key is never a record key: create-projects isn't "create" on a model called projects.
		if (ORG_PERMISSION_KEYS.includes(key)) return false;
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
