import { Response } from 'express';
import { sidebarData as sidebar } from '../../data/_index.js';
import SidebarItem from '../../models/sidebaritems/model.js';

export type SidebarItemType = {
	title: string;
	href: string;
	icon: string;
	path: string;
	startOfSection?: boolean;
	sectionTitle?: string;
	sectionIcon?: string;
	isLocked?: boolean;
	permission?: {
		hide?: boolean;
		key?: string;
		label?: string;
		options?: string[];
	};
};

/** Whether a permission list includes `key` — the admin's rule; tenants pass their role's (docs/multi-tenancy). */
export type Can = (permissions: string[], key: string) => boolean;
const adminCan: Can = (permissions, key) => permissions.includes('*') || permissions.includes(key);

/**
 * The sidebar from the DB (SidebarCategory / SidebarItem): a Dashboard entry,
 * then each active section's items by priority, permission-protected items
 * only for those whose permissions allow them.
 */
export const buildSidebar = async (permissions: string[], can: Can = adminCan): Promise<SidebarItemType[]> => {
	const sidebarData = await SidebarItem.find({
		isActive: true,
	})
		.populate({ path: 'category', select: 'name priority isActive icon' })
		.sort({ priority: -1 }); // Sort by item priority first (descending - higher priority first)

	// Group items by category and sort categories by priority
	const categorizedItems = sidebarData.reduce((acc: any, item: any) => {
		// Skip if category is not active
		if (!item.category?.isActive) {
			return acc;
		}

		const categoryId = item.category._id.toString();
		if (!acc[categoryId]) {
			acc[categoryId] = {
				category: item.category,
				items: [],
			};
		}
		acc[categoryId].items.push(item);
		return acc;
	}, {});

	// Sort categories by priority and convert to desired structure
	const sortedCategories = Object.values(categorizedItems).sort(
		(a: any, b: any) => (b.category.priority || 0) - (a.category.priority || 0)
	);

	const structuredSidebar: SidebarItemType[] = [
		{
			title: 'Dashboard',
			href: '/',
			icon: 'layout-dashboard',
			path: 'dashboard',
		},
	];

	sortedCategories.forEach((categoryGroup: any) => {
		const { category, items } = categoryGroup;

		// Sort items within category by priority (descending - higher priority first)
		const sortedItems = items.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
		let first = true;

		sortedItems.forEach((item: any) => {
			// Permission-protected items only for those allowed them
			if (item?.permissionProtected && !can(permissions, item?.permission)) return;

			const sidebarItem: SidebarItemType = {
				title: item.name,
				href: `/${item.href}`,
				icon: item.icon || 'circle-question-mark',
				path: item.href.replace('/', '') || item.name.toLowerCase().replace(/\s+/g, ''),
			};

			// Section info on the first item shown in each category
			if (first) {
				sidebarItem.startOfSection = true;
				sidebarItem.sectionTitle = category.name;
				sidebarItem.sectionIcon = category.icon || 'folder';
				first = false;
			}
			structuredSidebar.push(sidebarItem);
		});
	});

	return structuredSidebar;
};

const getSidebar = (can: Can = adminCan) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { type } = req.params;
			const structuredSidebar = await buildSidebar(req?.permissions || [], can);

			// Add sidebar items from DB
			if (type == 'server') return res.status(200).json(structuredSidebar);

			// Add the default sidebar items
			return res.status(200).json(sidebar);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getSidebar;
