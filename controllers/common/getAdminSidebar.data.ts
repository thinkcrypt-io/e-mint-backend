import { Response } from 'express';
import sidebar from '../../lib/data/sidebar.data.js';
import { SidebarItem } from '../../imports.js';

type SidebarItemType = {
	title: string;
	href: string;
	icon: string;
	path: string;
	startOfSection?: boolean;
	sectionTitle?: string;
	isLocked?: boolean;
	permission?: {
		hide?: boolean;
		key?: string;
		label?: string;
		options?: string[];
	};
};

const getSidebar = () => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { type } = req.params;
			const permissions = req?.permissions || [];
			const sidebarData = await SidebarItem.find({
				isActive: true,
			})
				.populate({ path: 'category', select: 'name priority isActive' })
				.sort({ priority: -1 }); // Sort by item priority first (descending - higher priority first)

			// Group items by category and sort categories by priority
			const categorizedItems = sidebarData.reduce((acc: any, item: any) => {
				// Skip if category is not active
				if (!item.category.isActive) {
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
					icon: 'dashboard',
					path: 'dashboard',
				},
			];

			sortedCategories.forEach((categoryGroup: any, categoryIndex: number) => {
				const { category, items } = categoryGroup;

				// Sort items within category by priority (descending - higher priority first)
				const sortedItems = items.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

				sortedItems.forEach((item: any, itemIndex: number) => {
					const sidebarItem: SidebarItemType = {
						title: item.name,
						href: `/${item.href}`,
						icon: item.icon || 'default',
						path: item.href.replace('/', '') || item.name.toLowerCase().replace(/\s+/g, ''),
					};

					// Add section info for first item in each category
					if (itemIndex === 0) {
						sidebarItem.startOfSection = true;
						sidebarItem.sectionTitle = category.name;
					}

					if (!item?.permissionProtected) structuredSidebar.push(sidebarItem);
					else {
						if (permissions.includes('*')) structuredSidebar.push(sidebarItem);
						else if (permissions.includes(item?.permission)) structuredSidebar.push(sidebarItem);
					}
				});
			});

			if (type == 'server') {
				return res.status(200).json(structuredSidebar);
			}

			return res.status(200).json(sidebar);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getSidebar;
