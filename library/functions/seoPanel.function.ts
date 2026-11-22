import WebsiteSettings from '../models/tenancy/websiteSettings.model.js';
import { connectionOf, connectionOpen } from './siteConfig.function.js';
import { grants } from './tenantPermissions.function.js';
import type { SidebarItemType } from '../controllers/config/getAdminSidebar.controller.js';

/**
 * The SEO panel (docs/seo-panel): an SEO project's panel logins (`edition: 'seo'`, D1), signed in at mint-seo with
 * `app: 'seo'`. They hold a fixed set of keys (D8), reach only the SEO panel's parts of the project API, and until
 * the site passes setup only the setup itself (the gate, D4).
 */

export const isSeoProject = (project: any) => project?.type === 'website' && project?.edition === 'seo';

/** What an SEO login holds (D8): its pages and their SEO, share images, the site's settings, analytics. */
export const SEO_PANEL_PERMISSIONS = [
	...['view', 'create', 'edit', 'delete', 'publish'].flatMap(a => [`${a}-pages`, `${a}-seo`]),
	'view-image',
	'create-image',
	'edit-image',
	'view-analytics',
	'manage-site',
];

export const SEO_PANEL_ROLE = { _id: 'seo', name: 'SEO admin', system: 'panel' };

/**
 * An SEO project's demo login (SP-11): visitors look around and change nothing — the site they'd be changing is a
 * real one, and `manage-site` would let them disconnect it or pause the Worker.
 */
export const SEO_DEMO_PERMISSIONS = ['view-pages', 'view-seo', 'view-image', 'view-analytics'];
export const SEO_DEMO_ROLE = { _id: 'seo-demo', name: 'View only', system: 'panel' };

/**
 * Where an SEO login may go inside its project (`req.path` on the project router). Anything else answers 403
 * SEO_PANEL_ONLY. `setup` marks what works before the site is live; the rest answers 409 NOT_CONNECTED until then.
 */
const ROUTES: { test: RegExp; setup?: boolean; methods?: string[] }[] = [
	{ test: /^\/?$/, setup: true, methods: ['GET'] },
	{ test: /^\/sidebar\//, setup: true, methods: ['GET'] },
	{ test: /^\/project-key\/?$/, setup: true, methods: ['GET'] },
	{ test: /^\/seo-setup(\/|$)/, setup: true },
	{ test: /^\/site-config\/?$/, setup: true, methods: ['GET'] },
	{ test: /^\/site-config\/connection\/?$/, setup: true, methods: ['POST'] },
	{ test: /^\/site-config(\/|$)/ },
	{ test: /^\/analytics(\/|$)/ },
	{ test: /^\/(pages|seo)(\/|$)/ },
	{ test: /^\/(upload|media|files)(\/|$)/ },
	{ test: /^\/history(\/|$)/, methods: ['GET'] },
	{ test: /^\/search\/?$/, methods: ['GET'] },
	// A super admin can add a colleague (say, their developer) before the site is live.
	{ test: /^\/panel-users(\/|$)/, setup: true },
];

/** Express middleware for the project router: passes everyone who isn't an SEO project's panel login. */
export const seoPanelGuard = async (req: any, res: any, next: any) => {
	if (!req.panelAdmin || !isSeoProject(req.project)) return next();
	try {
		const path = String(req.path || '/');
		const route = ROUTES.find(r => r.test.test(path) && (!r.methods || r.methods.includes(req.method)));
		if (!route) return res.status(403).json({ message: 'The SEO panel doesn’t open this.', code: 'SEO_PANEL_ONLY' });
		if (route.setup) return next();
		const settings = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
		if (!connectionOpen(settings))
			return res.status(409).json({ message: 'Finish setting up your site first.', code: 'NOT_CONNECTED', connection: connectionOf(settings).status });
		return next();
	} catch (e) {
		next(e);
	}
};

const item = (title: string, href: string, icon: string, section?: [string, string]): SidebarItemType => ({
	title,
	href,
	icon,
	path: href.replace(/^\//, '').replace(/[/?=&]/g, '-') || 'home',
	...(section && { startOfSection: true, sectionTitle: section[0], sectionIcon: section[1] }),
});

/**
 * The SEO panel's sidebar (README "After setup"). Before the site is live: Setup, Panel users (super admins) and Help. Addresses are the
 * mint-seo app's pages (most are mint-tenant's own, shared by the copy).
 */
export const seoNav = (permissions: string[], open: boolean): SidebarItemType[] => {
	const can = (key: string) => grants(permissions, [key]);
	const users = can('manage-panel-users') ? [item('Panel users', '/panel-users', 'user-cog')] : [];
	if (!open) return [item('Set up your site', '/setup', 'rocket'), ...users, item('Help', '/help', 'life-buoy')];
	return [
		item('Home', '/', 'house'),
		...(can('view-seo')
			? [
					item('Pages & SEO', '/t/seo', 'search', ['SEO', 'search']),
					item('Pages', '/t/pages', 'files'),
					item('Defaults', '/site-setup?tab=seo', 'sliders-horizontal'),
					item('Link previews', '/site-setup?tab=previews', 'share-2'),
			  ]
			: []),
		...(can('view-image') ? [item('Media', '/images', 'images')] : []),
		...(can('manage-site')
			? [item('Redirects', '/site-setup?tab=redirects', 'corner-up-right'), item('Tracking', '/site-setup?tab=tracking', 'radar')]
			: []),
		...(can('view-analytics') ? [item('Analytics', '/analytics', 'chart-line', ['Visitors', 'chart-line'])] : []),
		item('Connection', '/connection', 'plug', ['Site', 'globe']),
		...users,
		item('Help', '/help', 'life-buoy'),
	];
};

/** The sidebar for an SEO login, in the project's scope: closed until the site is live. */
export const seoSidebar = async (permissions: string[]) => {
	const settings = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
	return seoNav(permissions, connectionOpen(settings));
};
