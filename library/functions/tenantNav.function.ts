import { SidebarItemType } from '../controllers/config/getAdminSidebar.controller.js';
import { grants } from './tenantPermissions.function.js';

/**
 * The tenant panel's fixed sidebar sections (docs/multi-tenancy WO-14/15),
 * appended after the project's own sections: the media library, the
 * project's audience, building it (for roles with `build`) and the organization. Each entry only for the roles
 * that can use it. Icons are Lucide names.
 */
const section = (title: string, icon: string, items: Omit<SidebarItemType, 'path'>[]): SidebarItemType[] =>
	items.map((item, i) => ({
		...item,
		path: item.href.replace(/^\//, '').replace(/\//g, '-') || 'home',
		...(i === 0 && { startOfSection: true, sectionTitle: title, sectionIcon: icon }),
	}));

/** The public API's pages: its settings and reference, webhooks, and the customers who sign in to it. */
const apiItems = (can: (key: string) => boolean) => [
	...(can('build') ? [{ title: 'Public API', href: '/public-api', icon: 'webhook' }] : []),
	...(can('build') ? [{ title: 'Webhooks', href: '/webhooks', icon: 'send' }] : []),
	...(can('view-customers') ? [{ title: 'Customers', href: '/t/customers', icon: 'user-round' }] : []),
];

/**
 * What goes straight after the Dashboard, before the project's own sections:
 * an API project's API (docs/templates T-09, TD2) — it's what the project is.
 */
export const tenantLead = (permissions: string[], projectType?: string): SidebarItemType[] =>
	projectType === 'api' ? section('API', 'plug-zap', apiItems(key => grants(permissions, [key]))) : [];

export const tenantNav = (
	permissions: string[],
	{ inProject, projectType }: { inProject: boolean; projectType?: 'app' | 'website' | 'api' }
): SidebarItemType[] => {
	const can = (key: string) => grants(permissions, [key]);
	// A website: its analytics; any project: the customers of its public API.
	// A website's own pages (WO-34): its setup — tags, code, SEO, redirects, domains — and its analytics.
	const site =
		inProject && projectType === 'website'
			? section('Site', 'globe', [
					...(can('build') ? [{ title: 'Site setup', href: '/site-setup', icon: 'settings-2' }] : []),
					...(can('view-analytics') ? [{ title: 'Analytics', href: '/analytics', icon: 'chart-line' }] : []),
			  ])
			: [];
	// An API project has these at the top instead (tenantLead).
	const audience = inProject && projectType !== 'api' ? section('Audience', 'users-round', apiItems(can)) : [];
	// Everyone who works with records uses the media library, so it isn't kept under Build.
	const files = inProject && can('view-image') ? section('Files', 'folder', [{ title: 'Media library', href: '/images', icon: 'images' }]) : [];
	const build = inProject && can('build')
		? section('Build', 'hammer', [
				{ title: 'Models', href: '/model-builder', icon: 'boxes' },
				{ title: 'Pages', href: '/builder', icon: 'layout-template' },
				{ title: 'Sidebar', href: '/sidebar-builder', icon: 'panel-left' },
				{ title: 'Dashboard', href: '/dashboard-builder', icon: 'layout-dashboard' },
				...(can('manage-api-keys') ? [{ title: 'Connect AI', href: '/model-builder/connect', icon: 'plug' }] : []),
		  ])
		: [];
	// What happened in the project, for everyone who reads its records (WO-36).
	const activity = inProject && can('view-history') ? section('Activity', 'history', [{ title: 'History', href: '/activity', icon: 'history' }]) : [];
	const org = section('Organization', 'building-2', [
		{ title: 'Projects', href: '/projects', icon: 'folder-kanban' },
		{ title: 'Members', href: '/org/members', icon: 'users' },
		...(can('manage-roles') ? [{ title: 'Roles', href: '/org/roles', icon: 'shield-check' }] : []),
		...(can('manage-organization') ? [{ title: 'Settings', href: '/org/settings', icon: 'settings' }] : []),
	]);
	return [...site, ...files, ...audience, ...activity, ...build, ...org];
};
