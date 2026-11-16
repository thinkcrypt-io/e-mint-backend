import Organization from '../models/tenancy/organization.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import PanelAdmin from '../models/tenancy/panelAdmin.model.js';
import { publicOrganization, publicProject } from './tenancy.function.js';

/**
 * The commerce panel's store admins (docs/commerce-panel): PanelAdmin logins of
 * one e-commerce project each, signed in at commerce.mintapp.shop.
 *
 * What they hold, fixed: every record of the store (orders, products, POS,
 * returns, customers, media), its couriers and its email accounts. Never
 * `build` (models, pages, sidebar, automations, the public API), never
 * `manage-projects` (project and store settings), nothing organization-wide.
 * `manage-couriers` / `manage-email` are panel-only keys the courier and
 * email routes accept next to manage-projects; roles never hold them.
 */
export const PANEL_PERMISSIONS = [
	'records:view',
	'records:create',
	'records:edit',
	'records:delete',
	'records:publish',
	'manage-couriers',
	'manage-email',
];

export const PANEL_ROLE = { _id: 'panel', name: 'Store admin', system: 'panel' };

/**
 * Where a panel token may go: its project's API (/tenant/api/p/<project>/…,
 * where the project router checks it is theirs) and its own account
 * (/tenant/api/panel/auth/…). Nothing about organizations, other projects or
 * the tenant's own account routes.
 */
export const panelMayReach = (req: any) => {
	const path = String(req.originalUrl || '').split('?')[0];
	return /^\/tenant\/api\/(p\/[^/]+|panel\/auth)(\/|$)/.test(path);
};

/**
 * Signs a panel token's request in (called by tenantProtect for `kind: 'panel'`):
 * the login is active, its project is an active e-commerce project and its
 * organization is switched on. Fills req like a guest member of that one project.
 * Returns an error to answer with, or null.
 */
export const signInPanel = async (req: any, decoded: any): Promise<{ status: number; message: string; code?: string } | null> => {
	if (!panelMayReach(req)) return { status: 403, message: 'A store login only opens its store.', code: 'PANEL_ONLY' };
	const admin: any = await PanelAdmin.findById(decoded._id).select('-password');
	if (!admin) return { status: 401, message: 'User was not found' };
	if (admin.isActive === false) return { status: 401, message: 'This login has been switched off. Ask the store’s owner.', code: 'PANEL_DISABLED' };
	const project: any = await TenantProject.findById(admin.project).lean();
	if (!project || project.isActive === false || project.type !== 'ecommerce')
		return { status: 401, message: 'This store isn’t open any more.', code: 'PANEL_PROJECT_GONE' };
	const organization: any = await Organization.findById(project.organization).lean();
	if (!organization || organization.isActive === false)
		return { status: 401, message: 'This store isn’t open any more.', code: 'PANEL_PROJECT_GONE' };

	req.user = admin;
	req.panelAdmin = admin;
	req.organization = organization;
	// A guest of the one project: canOpenProject / projectAccessFilter keep them in it.
	req.member = { user: admin._id, organization: organization._id, guest: true, allProjects: false, projects: [project._id], panel: true, status: 'active' };
	req.role = { ...PANEL_ROLE, permissions: PANEL_PERMISSIONS };
	req.permissions = [...PANEL_PERMISSIONS];
	return null;
};

/** A panel admin as the panels show them. */
export const publicPanelAdmin = (a: any) => ({
	_id: String(a._id),
	name: a.name,
	email: a.email,
	phone: a.phone || '',
	image: a.image || '',
	isActive: a.isActive !== false,
	lastLoginAt: a.lastLoginAt || null,
	project: String(a.project),
	createdAt: a.createdAt,
	updatedAt: a.updatedAt,
});

/**
 * GET /tenant/api/panel/auth/self — shaped like the tenant's auth/self (one
 * organization, one project), so the panel's workspace code reads it unchanged.
 */
export const panelSelfPayload = async (req: any) => {
	const a = req.user;
	const project: any = await TenantProject.findById(a.project).lean();
	const ref = { _id: String(project._id), name: project.name, publicSlug: project.publicSlug, type: project.type, description: project.description || '' };
	const org = publicOrganization(req.organization);
	return {
		_id: String(a._id),
		name: a.name,
		email: a.email,
		emailVerified: true,
		phone: a.phone || '',
		image: a.image || '',
		twoFactorEnabled: false,
		modalLayout: a.modalLayout || 'modal',
		theme: a.theme || null,
		preferences: a.preferences || {},
		createdAt: a.createdAt,
		kind: 'panel',
		panel: true,
		organization: org,
		role: { ...PANEL_ROLE, permissions: req.permissions },
		permissions: req.permissions,
		organizations: [{ _id: org._id, name: org.name, slug: org.slug, logo: org.logo, role: PANEL_ROLE.name, system: 'panel', guest: true, projects: [ref] }],
		projects: [publicProject(project)],
	};
};
