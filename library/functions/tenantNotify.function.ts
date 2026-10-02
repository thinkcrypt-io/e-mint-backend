import TenantNotification from '../models/tenancy/tenantNotification.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import OrganizationMember from '../models/tenancy/organizationMember.model.js';
import { grants, normalizePermissions } from './tenantPermissions.function.js';
import { canOpenProject } from './tenancy.function.js';
import { runUnscoped } from './tenantScope.function.js';

/**
 * Tenant users' notifications (docs/multi-tenancy WO-37). Every sender here
 * is fire-and-forget: a notification that fails to store is logged, never
 * fails what it follows.
 */

export type TenantNotice = {
	recipient: any;
	organization?: any;
	project?: any;
	actor?: any;
	actorName?: string;
	type: string;
	title: string;
	message?: string;
	href?: string;
	route?: string;
	record?: any;
};

const same = (a: any, b: any) => !!a && !!b && String(a?._id || a) === String(b?._id || b);

/** Stores notifications (never to the person who caused them). */
export const notifyTenant = async (items: TenantNotice[]) => {
	const list = items.filter(i => i.recipient && !same(i.recipient, i.actor));
	if (!list.length) return;
	try {
		await runUnscoped(() => TenantNotification.insertMany(list, { ordered: false }));
	} catch (e: any) {
		console.error('notifyTenant:', e?.message);
	}
};

/** A panel address inside a project: `/<publicSlug><path>`. */
export const projectHrefFor = async (project: any, path = '') => {
	const p: any = project?.publicSlug ? project : await runUnscoped(() => TenantProject.findById(project, { publicSlug: 1 }).lean());
	return p?.publicSlug ? `/${p.publicSlug}${path}` : path || '/dashboard';
};

/**
 * The organization's active members who can open `project` and whose role
 * grants `permission` (e.g. 'view-<route>' → Records: View), as user ids.
 */
export const projectAudience = async ({ organization, project, permission }: { organization: any; project: any; permission: string }) => {
	const members: any[] = await runUnscoped(() =>
		OrganizationMember.find({ organization, status: 'active' }, { user: 1, role: 1, allProjects: 1, projects: 1 }).populate('role', 'permissions system').lean()
	);
	return members
		.filter(m => {
			const perms = normalizePermissions(m.role?.permissions || []);
			return canOpenProject(m, perms, project) && grants(perms, [permission]);
		})
		.map(m => m.user)
		.slice(0, 200);
};

/** In the background, after the response: `fn` never delays or fails the request. */
export const later = (fn: () => Promise<any>) =>
	setImmediate(() => {
		fn().catch((e: any) => console.error('notify:', e?.message));
	});
