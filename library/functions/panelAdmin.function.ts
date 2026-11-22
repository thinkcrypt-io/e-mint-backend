import Organization from '../models/tenancy/organization.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import PanelAdmin from '../models/tenancy/panelAdmin.model.js';
import PanelRole from '../models/tenancy/panelRole.model.js';
import { publicOrganization, publicProject } from './tenancy.function.js';
import { RECORD_ACTIONS, isModelKey } from './tenantPermissions.function.js';
import { runUnscoped } from './tenantScope.function.js';
import { SEO_PANEL_PERMISSIONS, SEO_PANEL_ROLE, isSeoProject } from './seoPanel.function.js';

/**
 * The commerce panel's store admins (docs/commerce-panel): PanelAdmin logins of
 * one e-commerce project each, signed in at commerce.mintapp.shop.
 *
 * What they hold, fixed: every record of the store (orders, products, POS,
 * returns, customers, media), its couriers, its email accounts, the store's
 * settings (store, products, search, delivery, POS, printer, payments — not
 * building the store again) and its site settings (Site setup, not domains).
 * Never `build` (models, pages, sidebar, automations, the public API), never
 * `manage-projects` (project settings, members), nothing organization-wide.
 * `manage-couriers` / `manage-email` / `manage-store` / `manage-site` are
 * panel-only keys the routes accept next to manage-projects (or build, for the
 * site); roles never hold them.
 */
export const PANEL_PERMISSIONS = [
	'records:view',
	'records:create',
	'records:edit',
	'records:delete',
	'records:publish',
	'manage-couriers',
	'manage-email',
	// Store settings → every page but Set up your store (docs/commerce-panel CP-06).
	'manage-store',
	// Site setup: identity, SEO, tracking, tags, redirects — never domains (CP-06).
	'manage-site',
];

export const PANEL_ROLE = { _id: 'panel', name: 'Store admin', system: 'panel' };

/**
 * Panel users (docs/panel-users): the same PanelAdmin logins, in any kind of
 * project, signed in at the panel app (panel.tcrypt.site) — or the commerce
 * panel for a store. What they hold comes from their PanelRole; a super admin
 * holds every record and report and manages the project's panel users and
 * roles. Never `build` or anything of the project's settings (PU-02).
 */
export const PANEL_REPORT_KEYS = ['reports:view', 'reports:export'];
/** A panel super admin's own key: the project's panel users and panel roles. */
export const MANAGE_PANEL = 'manage-panel-users';
const ALL_RECORDS = RECORD_ACTIONS.map(a => `records:${a}`);

/** What a panel role may hold: per-model keys and the report keys — nothing else, whatever was saved. */
export const cleanPanelKeys = (keys: string[] = []) => [...new Set(keys.filter(k => isModelKey(k) || PANEL_REPORT_KEYS.includes(k)))];

/** A panel login's permissions and the role it shows, in `project`. */
export const panelAccess = async (admin: any, project: any): Promise<{ permissions: string[]; role: any }> => {
	const store = project.type === 'ecommerce';
	// An SEO project's logins (docs/seo-panel D8): the fixed SEO keys, no roles; a super admin also manages the logins.
	if (isSeoProject(project))
		return {
			permissions: [...SEO_PANEL_PERMISSIONS, ...(admin.superAdmin && !admin.demo ? [MANAGE_PANEL] : [])],
			role: admin.superAdmin ? { ...SEO_PANEL_ROLE, _id: 'seo-super-admin', name: 'Super admin' } : SEO_PANEL_ROLE,
		};
	// A demo login never manages panel users, even as a super admin (DEMO_LOGINS.md D5): a visitor can't make real logins.
	if (admin.superAdmin)
		return {
			permissions: [...(store ? PANEL_PERMISSIONS : ALL_RECORDS), ...PANEL_REPORT_KEYS, ...(admin.demo ? [] : [MANAGE_PANEL])],
			role: { _id: 'panel-super-admin', name: 'Super admin', system: 'panel' },
		};
	const role: any = admin.role && (await runUnscoped(() => PanelRole.findOne({ _id: admin.role, project: project._id }).lean()));
	if (role) return { permissions: cleanPanelKeys(role.permissions), role: { _id: String(role._id), name: role.name, system: 'panel' } };
	// A store login made before panel roles: the fixed store set.
	if (store) return { permissions: [...PANEL_PERMISSIONS, ...PANEL_REPORT_KEYS], role: PANEL_ROLE };
	return { permissions: [], role: { _id: 'panel', name: 'No role', system: 'panel' } };
};

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
	if (!project || project.isActive === false) return { status: 401, message: 'This project isn’t open any more.', code: 'PANEL_PROJECT_GONE' };
	const organization: any = await Organization.findById(project.organization).lean();
	if (!organization || organization.isActive === false)
		return { status: 401, message: 'This store isn’t open any more.', code: 'PANEL_PROJECT_GONE' };

	req.user = admin;
	req.panelAdmin = admin;
	req.organization = organization;
	// A guest of the one project: canOpenProject / projectAccessFilter keep them in it.
	req.member = { user: admin._id, organization: organization._id, guest: true, allProjects: false, projects: [project._id], panel: true, status: 'active' };
	const access = await panelAccess(admin, project);
	req.role = { ...access.role, permissions: access.permissions };
	req.permissions = [...access.permissions];
	return null;
};

/**
 * Usernames (PU-08): what a panel login signs in with — 3 to 120 of a–z, 0–9 and
 * . _ - @ +, so an email works as a username. Stored lowercase.
 */
export const USERNAME_RULE = /^[a-z0-9][a-z0-9._@+-]{2,119}$/;
export const USERNAME_HELP = 'A username is 3 or more letters, numbers or . _ - @ +';

/** The login someone means by what they typed: a username, or an email (logins from before usernames). */
export const findPanelLogin = async (typed: string, select = '') => {
	const id = String(typed || '').trim().toLowerCase();
	if (!id) return null;
	return (await PanelAdmin.findOne({ username: id }).select(select)) || (await PanelAdmin.findOne({ email: id }).select(select));
};

/**
 * Why `username` / `email` can't be this login's, or null. Either signs in, so
 * neither may be another login's username or email.
 */
export const panelLoginTaken = async ({ username, email }: { username?: string; email?: string }, except?: any) => {
	const notMe = except ? { _id: { $ne: except } } : {};
	const used = async (v?: string) => !!v && !!(await PanelAdmin.exists({ $or: [{ username: v }, { email: v }], ...notMe }));
	if (await used(username)) return { message: 'That username is taken — pick another.', on: 'username', code: 'username_taken' };
	if (await used(email)) return { message: 'This email is already a panel login — one email opens one project.', on: 'email', code: 'email_taken' };
	return null;
};

/** How a login is named in History and lists: its username, else its email. */
export const panelLoginName = (a: any) => a?.username || a?.email || '';

/** A panel admin as the panels show them. */
export const publicPanelAdmin = (a: any) => ({
	_id: String(a._id),
	name: a.name,
	username: a.username || a.email || '',
	email: a.email || '',
	phone: a.phone || '',
	image: a.image || '',
	isActive: a.isActive !== false,
	role: a.role ? String(a.role?._id || a.role) : null,
	superAdmin: !!a.superAdmin,
	demo: !!a.demo,
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
		superAdmin: !!a.superAdmin,
		demo: !!a.demo,
		organization: org,
		role: { ...(req.role || PANEL_ROLE), permissions: req.permissions },
		permissions: req.permissions,
		organizations: [{ _id: org._id, name: org.name, slug: org.slug, logo: org.logo, role: req.role?.name || PANEL_ROLE.name, system: 'panel', guest: true, projects: [ref] }],
		projects: [publicProject(project)],
	};
};
