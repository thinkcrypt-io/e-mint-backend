import { Response } from 'express';
import sidebar from '../../data/sidebar.data.js';
import { Permission } from '../../models/_index.js';

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
			const adminPermissions = await Permission.find({ isActive: true }).sort('-name');
			const serverPermissions = transformServerPermissions(adminPermissions);
			const permissions = transformSidebarToPermissions(sidebar);
			return res.status(200).json(serverPermissions);
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

const transformServerPermissions = (sidebar: any[]): PermissionGroup[] => {
	// Create a map to avoid duplicates based on permission key
	const permissionMap = new Map<string, PermissionGroup>();

	sidebar.forEach(permission => {
		// Skip items that should be hidden
		// if (permission?.hide) return;

		const key = permission?.key;
		const label = permission?.name || key;

		const create = permission?.options?.create ? 'create' : null;
		const view = permission?.options?.view ? 'view' : null;
		const edit = permission?.options?.edit ? 'edit' : null;
		const deleteOption = permission?.options?.delete ? 'delete' : null;
		const options: any = [create, view, edit, deleteOption].filter(Boolean); // Filter out null values

		// Skip if already processed (avoid duplicates)
		if (permissionMap.has(key)) return;

		// Transform options to fields
		const fields: PermissionField[] = options.map((option: any) => ({
			label: option?.charAt(0).toUpperCase() + option?.slice(1) + ' ' + label,
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
