import { SidebarItemType } from '../controllers/config/getAdminSidebar.controller.js';
import { grants } from './tenantPermissions.function.js';

/**
 * The tenant panel's fixed sidebar sections (docs/multi-tenancy WO-14/15),
 * appended after the project's own sections: building the project (for
 * roles with `build`) and the organization. Each entry only for the roles
 * that can use it. Icons are Lucide names.
 */
const section = (title: string, icon: string, items: Omit<SidebarItemType, 'path'>[]): SidebarItemType[] =>
	items.map((item, i) => ({
		...item,
		path: item.href.replace(/^\//, '').replace(/\//g, '-') || 'home',
		...(i === 0 && { startOfSection: true, sectionTitle: title, sectionIcon: icon }),
	}));

export const tenantNav = (permissions: string[], { inProject }: { inProject: boolean }): SidebarItemType[] => {
	const can = (key: string) => grants(permissions, [key]);
	const build = inProject && can('build')
		? section('Build', 'hammer', [
				{ title: 'Models', href: '/model-builder', icon: 'boxes' },
				{ title: 'Pages', href: '/builder', icon: 'layout-template' },
				{ title: 'Sidebar', href: '/sidebar-builder', icon: 'panel-left' },
				{ title: 'Dashboard', href: '/dashboard-builder', icon: 'layout-dashboard' },
				{ title: 'Media', href: '/images', icon: 'images' },
				...(can('manage-api-keys') ? [{ title: 'Connect AI', href: '/model-builder/connect', icon: 'plug' }] : []),
		  ])
		: [];
	const org = section('Organization', 'building-2', [
		{ title: 'Projects', href: '/projects', icon: 'folder-kanban' },
		{ title: 'Members', href: '/org/members', icon: 'users' },
		...(can('manage-roles') ? [{ title: 'Roles', href: '/org/roles', icon: 'shield-check' }] : []),
		...(can('manage-organization') ? [{ title: 'Settings', href: '/org/settings', icon: 'settings' }] : []),
	]);
	return [...build, ...org];
};
