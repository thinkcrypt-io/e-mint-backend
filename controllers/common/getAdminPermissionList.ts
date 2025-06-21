import { Response } from 'express';
import sidebar from '../../lib/data/sidebar.data.js';

type PermissionField = {
	label: string;
	value: string;
};

type PermissionGroup = {
	title: string;
	fields: PermissionField[];
};

const getAdminPermissionList = () => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const permissions = transformSidebarToPermissions(sidebar);
			return res.status(200).json(permissions);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

const transformSidebarToPermissions = (sidebar: any[]): PermissionGroup[] => {
	// Create a map to avoid duplicates based on permission key
	const permissionMap = new Map<string, PermissionGroup>();

	sidebar.forEach(item => {
		const { permission } = item;

		// Skip items that should be hidden
		if (permission?.hide) return;

		const key = permission?.key || item.path;
		const label = permission?.label || item.title || key;
		const options = permission?.options || ['create', 'view', 'edit', 'delete'];

		// Skip if already processed (avoid duplicates)
		if (permissionMap.has(key)) return;

		// Transform options to fields
		const fields: PermissionField[] = options.map((option: any) => ({
			label: option.charAt(0).toUpperCase() + option.slice(1), // Capitalize first letter
			value: `${option}-${key}`, // Format: "create-shops", "view-shops", etc.
		}));

		// Add to map
		permissionMap.set(key, {
			title: label,
			fields,
		});
	});

	// Convert map to array
	return Array.from(permissionMap.values());
};

export default getAdminPermissionList;
