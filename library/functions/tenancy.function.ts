import crypto from 'crypto';
import mongoose from 'mongoose';
import Organization from '../models/tenancy/organization.model.js';
import OrganizationMember from '../models/tenancy/organizationMember.model.js';
import OrganizationRole from '../models/tenancy/organizationRole.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import { seedOrgRoles } from './tenantPermissions.function.js';

/**
 * Shared tenancy helpers (docs/multi-tenancy WO-05/06/07): making an
 * organization, choosing which organization a sign-in opens, and what the
 * tenant panel's `auth/self` returns.
 */

export class TenancyError extends Error {
	status: number;
	code?: string;
	constructor(status: number, message: string, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

/** Wraps a controller: JSON out, TenancyError → its status, anything else → 500. */
export const handle =
	(fn: (req: any, res: any) => Promise<any>) =>
	async (req: any, res: any) => {
		try {
			const out = await fn(req, res);
			// 200 unless the handler chose another (201 for a created record).
			if (!res.headersSent) res.json(out);
		} catch (e: any) {
			const status = e?.status || (e?.name === 'ValidationError' ? 400 : 500);
			if (status === 500) console.error('tenancy:', e);
			if (!res.headersSent)
				res.status(status).json({ message: status === 500 ? 'Something went wrong' : e?.message, ...(e?.code && { code: e.code }) });
		}
	};

export const slugify = (value: string) =>
	String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40) || 'org';

/**
 * The admin app's top-level pages (admin/src/app). The tenant panel's
 * addresses inside a project start with its publicSlug (/<publicSlug>/<page>,
 * D18), so a publicSlug is never one of these. Add a new page folder here.
 */
export const PANEL_PAGES = new Set([
	'adminroles', 'admins', 'analytics', 'auth', 'authors', 'bills', 'blogs', 'brands', 'builder', 'categories',
	'clickevents', 'clients', 'collections', 'components', 'contents', 'customer-ledger', 'customers', 'damages',
	'dashboard-builder', 'dashboard', 'deliveries', 'doc', 'docs', 'documents', 'emails', 'employees', 'expenses',
	'features', 'fgroups', 'groups', 'heroku-doc', 'herokus', 'images', 'invoices-old', 'invoices', 'issues',
	'jobapplications', 'jobposts', 'leads', 'leaves', 'maintenances', 'meetings', 'model-builder', 'modelattributes',
	'not-found', 'notifications', 'npmlibraries', 'offers', 'orders', 'org', 'packages', 'passkey', 'payments',
	'permissions', 'plannedfeatures', 'plannedmodels', 'plannedpages', 'plannedprojects', 'portfolios', 'print',
	'privacy-policy', 'products', 'projects', 'props', 'public-api', 'purchased-themes', 'qr', 'report-issue', 'repos',
	'resources', 'roles', 'sellers', 'servicecat', 'services', 'sessions', 'settings', 'shops', 'sidebar-builder',
	'sidebarcategories', 'sidebaritems', 'solutions', 'subscriptions', 'suppliers', 'support-tickets', 'support',
	'system-status', 't', 'tcclients', 'teams', 'techstacks', 'terms', 'test', 'themes', 'user-docs',
	'user-feedback-success', 'user-feedback', 'users', 'vercel-doc', 'vercels', 'view', 'views', 'api',
]);

/** `base`, or `base-2`, `base-3`… — the first `exists` says is free. */
export const uniqueSlug = async (base: string, exists: (slug: string) => Promise<any>) => {
	const root = slugify(base);
	for (let n = 1; n < 1000; n++) {
		const slug = n === 1 ? root : `${root}-${n}`;
		if (!(await exists(slug))) return slug;
	}
	return `${root}-${crypto.randomBytes(3).toString('hex')}`;
};

/** A new organization with its three system roles and `owner` as its owner. */
export const createOrganization = async ({ name, owner, onboarding }: { name: string; owner: any; onboarding?: any }) => {
	const slug = await uniqueSlug(name, s => Organization.exists({ slug: s }));
	const organization: any = await Organization.create({
		name: String(name).trim().slice(0, 120),
		slug,
		owner: owner._id,
		onboarding: { ...(onboarding || {}), ...(onboarding && { completedAt: new Date() }) },
	});
	try {
		const roles = await seedOrgRoles(organization._id);
		await OrganizationMember.create({ organization: organization._id, user: owner._id, role: roles.owner._id });
		return organization;
	} catch (e) {
		// Half an organization helps no one.
		await Promise.all([
			Organization.deleteOne({ _id: organization._id }),
			OrganizationRole.deleteMany({ organization: organization._id }),
			OrganizationMember.deleteMany({ organization: organization._id }),
		]).catch(() => undefined);
		throw e;
	}
};

/**
 * The organization a fresh sign-in opens: the one last used, if the user is
 * still an active member of it and it's active; else the first such. Null
 * when they belong to none.
 */
export const pickOrganization = async (user: any): Promise<string | null> => {
	const memberships: any[] = await OrganizationMember.find({ user: user._id, status: 'active' })
		.populate('organization', 'isActive')
		.sort({ joinedAt: 1 })
		.lean();
	const usable = memberships.filter(m => m.organization && m.organization.isActive !== false);
	const last = user.lastOrganization && usable.find(m => String(m.organization._id) === String(user.lastOrganization));
	const chosen = last || usable[0];
	return chosen ? String(chosen.organization._id) : null;
};

export const publicUser = (u: any) => ({
	_id: String(u._id),
	name: u.name,
	email: u.email,
	emailVerified: !!u.emailVerified,
	phone: u.phone || '',
	image: u.image || '',
	twoFactorEnabled: !!u.twoFactorEnabled,
	modalLayout: u.modalLayout || 'modal',
	theme: u.theme || null,
	preferences: u.preferences || {},
	createdAt: u.createdAt,
});

export const publicOrganization = (o: any) =>
	o && {
		_id: String(o._id),
		name: o.name,
		slug: o.slug,
		logo: o.logo || '',
		plan: o.plan || 'free',
		owner: String(o.owner),
		onboarding: o.onboarding || {},
		createdAt: o.createdAt,
	};

/**
 * What the tenant panel needs on every load (GET /tenant/api/auth/self): the
 * account, the organization it works in and its role there, every
 * organization it can switch to, and that organization's projects.
 */
export const selfPayload = async (req: any) => {
	const memberships: any[] = await OrganizationMember.find({ user: req.user._id, status: 'active' })
		.populate('organization', 'name slug logo isActive')
		.populate('role', 'name system')
		.lean();
	const organizations = memberships
		.filter(m => m.organization && m.organization.isActive !== false)
		.map(m => ({
			_id: String(m.organization._id),
			name: m.organization.name,
			slug: m.organization.slug,
			logo: m.organization.logo || '',
			role: m.role?.name,
			system: m.role?.system || null,
		}));
	const projects = req.organization
		? (
				await TenantProject.find({ organization: req.organization._id, isActive: { $ne: false }, ...projectAccessFilter(req.member, req.permissions) })
					.sort({ createdAt: 1 })
					.lean()
		  ).map(publicProject)
		: [];
	return {
		...publicUser(req.user),
		kind: 'tenant',
		organization: publicOrganization(req.organization) || null,
		role: req.role ? { _id: String(req.role._id), name: req.role.name, system: req.role.system || null, permissions: req.permissions || [] } : null,
		permissions: req.permissions || [],
		organizations,
		projects,
	};
};

export const publicProject = (p: any) => ({
	_id: String(p._id),
	name: p.name,
	slug: p.slug,
	publicSlug: p.publicSlug,
	type: p.type || 'app',
	description: p.description || '',
	icon: p.icon || '',
	color: p.color || '',
	domains: p.domains || [],
	mediaScope: p.mediaScope || 'project',
	isActive: p.isActive !== false,
	createdAt: p.createdAt,
});

export const isId = (v: any) => mongoose.isValidObjectId(v);

/* ------------------------------------------------------- project access */

/**
 * Whether a member opens every project of the organization (WO-22): Owner and
 * Admin always do; anyone else unless their membership lists projects.
 */
export const opensAllProjects = (member: any, permissions: string[] = []) => permissions.includes('*') || member?.allProjects !== false;

/** The projects a member can open, as a TenantProject filter to add (empty: all of them). */
export const projectAccessFilter = (member: any, permissions: string[] = []): Record<string, any> =>
	opensAllProjects(member, permissions) ? {} : { _id: { $in: member?.projects || [] } };

/** Whether a member can open this project. */
export const canOpenProject = (member: any, permissions: string[], projectId: any) =>
	opensAllProjects(member, permissions) || (member?.projects || []).some((p: any) => String(p) === String(projectId));
