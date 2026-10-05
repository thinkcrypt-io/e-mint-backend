import express from 'express';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import { tenantProtect } from '../middleware/tenant/protect.tenant.middleware.js';
import { grants, tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { runInScope } from '../library/functions/tenantScope.function.js';
import { canOpenProject, publicProject, isId, projectPeople } from '../library/functions/tenancy.function.js';
import { makeBuilderRouter } from '../library/controllers/builder/_index.js';
import { makeDashboardRouter } from '../library/controllers/dashboard/_index.js';
import { buildSidebar } from '../library/controllers/config/getAdminSidebar.controller.js';
import { tenantLead, tenantNav } from '../library/functions/tenantNav.function.js';
import { dynamicModelsDispatcher } from '../library/functions/dynamicModels.function.js';
import defineRoutes from '../routes-admin/common/router.js';
import SidebarCategory from '../library/models/sidebarcategories/model.js';
import SidebarItem from '../library/models/sidebaritems/model.js';
import {
	sidebarCategorySettings,
	sidebarCategoryConfig,
	sidebarItemSettings,
	sidebarItemConfig,
	adminFileSettings,
	adminFileConfig,
} from '../library/models/_index.js';
import AdminFile from '../library/models/admin-file/model.js';
import ProjectCustomer from '../library/models/tenancy/projectCustomer.model.js';
import analyticsRouter from './analytics.router.js';
import siteRouter from './site.router.js';
import historyRouter from './history.router.js';
import webhooksRouter, { overviewRouter } from './webhooks.router.js';
import widgetsRouter from './widgets.router.js';
import projectCustomerSettings, { projectCustomerConfig } from '../library/models/tenancy/projectCustomer.settings.js';
import { uploadRoute, mediaRoute } from '../routes-admin/index.js';
import deleteMedia from '../routes-admin/file/deleteMedia.controller.js';
import { customQuery } from '../middleware/index.js';

/**
 * /tenant/api/p/:projectId — everything inside one project (docs/multi-tenancy WO-09).
 *
 * Signed in (tenantProtect), the project must belong to the token's
 * organization and be one the member can open (WO-22), and the rest of the request runs in the project's scope
 * (tenantScope): every builder collection query only sees this project's
 * documents and every insert carries its ids. The paths mirror the admin
 * API's, so the admin app's library components work unchanged:
 *
 *   /builder/*                    models, features, route builder, MCP keys    build / manage-api-keys
 *   /sidebar/:platform/:type      the project's sidebar, filtered by role
 *   /sidebarcategories, /sidebaritems   the sidebar builder's CRUD            build
 *   /dashboard                    the dashboard builder                       read; build to change
 *   /upload, /media, /files       uploads and the media manager over the project's own files —
 *                                 or the organization's shared library (mediaScope, WO-23)
 *                                 (the admin routers, with dual guards — middleware/tenant/dual)
 *   /webhooks, /api-overview      outgoing webhooks; an API project's dashboard (docs/templates T-09)   build; read
 *   /<route>                      the project's built models                  view-/create-/edit-/delete-<route>
 */
const router = express.Router({ mergeParams: true });

router.use(tenantProtect);

// The project, in this organization, active — by id, or by its publicSlug
// (the tenant panel's addresses are /<publicSlug>/<page>, D18).
router.use(async (req: any, res: any, next: any) => {
	try {
		const id = String(req.params.projectId || '');
		const which = isId(id) ? { _id: id } : /^[a-z0-9][a-z0-9-]*$/.test(id) ? { publicSlug: id } : null;
		const project: any = which ? await TenantProject.findOne({ ...which, organization: req.organization._id }).lean() : null;
		if (!project || !canOpenProject(req.member, req.permissions, project._id)) return res.status(404).json({ message: 'Project not found' });
		if (project.isActive === false && req.method !== 'GET')
			return res.status(400).json({ message: 'This project is archived — restore it to make changes.' });
		req.project = project;
		runInScope({ organization: req.organization._id, project: project._id }, () => next());
	} catch (e) {
		next(e);
	}
});

router.get('/', (req: any, res: any) => res.status(200).json(publicProject(req.project)));

const build = [tenantPermissions(['build'])];

router.use(
	'/builder',
	makeBuilderRouter({
		view: build,
		edit: build,
		keys: [tenantPermissions(['manage-api-keys'])],
		tenant: true,
	})
);

router.use('/dashboard', makeDashboardRouter({ read: [], edit: build }));

// The project's own sections, then the tenant panel's fixed ones (tenantNav).
// Only 'server' — the other types are the admin panel's built-in navigation.
router.get('/sidebar/:platform/:type', async (req: any, res: any) => {
	if (req.params.type !== 'server') return res.status(404).json({ message: 'Not found' });
	try {
		const items = await buildSidebar(req.permissions || [], (permissions, key) => grants(permissions, [key]));
		// The tenant panel serves project tables under /t/<route> (admin panel.ts pagePath).
		const project = items.map(i => (i.href === '/' ? i : { ...i, href: `/t${i.href}` }));
		// An API project leads with its API, straight after the dashboard (T-09).
		const [home, ...own] = project;
		const lead = tenantLead(req.permissions || [], req.project.type);
		return res.status(200).json([home, ...lead, ...own, ...tenantNav(req.permissions || [], { inProject: true, projectType: req.project.type })]);
	} catch (e: any) {
		console.error('tenant sidebar:', e?.message);
		return res.status(500).json({ message: 'Something went wrong' });
	}
});

// The sidebar builder: building is what edits the project's sidebar.
const auth = { protect: (_req: any, _res: any, next: any) => next(), hasPermission: () => tenantPermissions(['build']) };
router.use(
	'/sidebarcategories',
	defineRoutes({ Model: SidebarCategory, settings: sidebarCategorySettings, permission: 'sidebarcategories', frontendConfig: sidebarCategoryConfig, auth })
);
router.use(
	'/sidebaritems',
	defineRoutes({ Model: SidebarItem, settings: sidebarItemSettings, permission: 'sidebaritems', frontendConfig: sidebarItemConfig, auth })
);

// Files: the same routers as the super admin's, confined to the project's
// files by the scope (File and Folder are tenantScoped). Creating File records
// directly isn't needed — uploads make them.
// A project on the organization's shared library (mediaScope 'organization',
// WO-23) works on the files with no project: `{ organization, project: null }`.
const mediaLibrary = (req: any, _res: any, next: any) =>
	req.project.mediaScope === 'organization' ? runInScope({ organization: req.organization._id }, () => next()) : next();

router.use('/upload', mediaLibrary, uploadRoute);
router.use('/media', mediaLibrary, mediaRoute);
router.post('/files', (_req: any, res: any) => res.status(405).json({ message: 'Upload files instead' }));
router.use(
	'/files',
	mediaLibrary,
	defineRoutes({
		Model: AdminFile,
		settings: adminFileSettings,
		permission: 'files',
		route: 'files',
		frontendConfig: adminFileConfig,
		injectMiddleware: { getAll: [customQuery({ query: { trashedAt: null } })] },
		replaceController: { delete: deleteMedia(AdminFile) },
		auth: { protect: (_req: any, _res: any, next: any) => next(), hasPermission: tenantPermissions },
	})
);

// The project's customers — people signed up through its public API or login
// widget (routes-public). Created by signing up, never here.
router.post('/customers', (_req: any, res: any) => res.status(405).json({ message: 'Customers sign up through your site' }));
router.use(
	'/customers',
	defineRoutes({
		Model: ProjectCustomer,
		settings: projectCustomerSettings,
		permission: 'customers',
		route: 'customers',
		frontendConfig: projectCustomerConfig,
		// Customers are records like any other (WO-21): view-/edit-/delete-customers.
		auth: { protect: (_req: any, _res: any, next: any) => next(), hasPermission: tenantPermissions },
	})
);

// A website project's analytics (events from /public/track.js).
router.use('/analytics', analyticsRouter);
// …and its setup: tags, code, SEO, redirects, headers, domains (WO-34).
router.use('/', siteRouter);
// What happened in the project: records, models, the public API, the site setup (WO-36).
router.use('/history', historyRouter);
// Outgoing webhooks, and what an API project's dashboard shows (docs/templates T-09).
router.use('/webhooks', webhooksRouter);
// Site widgets (docs/widgets W-03): any project with a public API.
router.use('/widgets', widgetsRouter);
router.use('/api-overview', overviewRouter);

// Who a restricted model's records can be shared with (per-record access, D19):
// the organization's members who can open this project. Shaped like a list
// endpoint, as the record pickers read it — the tenant's /access-users.
router.get('/access-users', async (req: any, res: any) => {
	try {
		const doc = await projectPeople({ search: String(req.query.search || '').trim().slice(0, 100) });
		return res.status(200).json({ doc, totalDocs: doc.length, docsInPage: doc.length, totalPages: 1, page: 1 });
	} catch (e: any) {
		return res.status(500).json({ message: e.message });
	}
});
router.get('/access-users/:id', async (req: any, res: any) => {
	try {
		const [doc] = isId(req.params.id) ? await projectPeople({ id: req.params.id }) : [];
		return doc ? res.status(200).json(doc) : res.status(404).json({ message: 'Not found' });
	} catch (e: any) {
		return res.status(500).json({ message: e.message });
	}
});

// The project's built models, last: anything not answered above.
router.use(dynamicModelsDispatcher);

export default router;
