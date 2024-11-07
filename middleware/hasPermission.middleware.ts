import { NextFunction, Response } from 'express';
import Role from '../models/role/role.model.js';

const hasPermission = (permissions: string[]) => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			const role = req?.user?.role;
			const getPermissions = await Role.findById(role).select('permissions');

			if (!getPermissions) {
				return res.status(400).json({ message: 'Role not found' });
			}

			// If getPermissions includes '*', immediately call next()
			if (getPermissions.permissions.includes('*')) {
				return next();
			}

			const hasAnyPermission = permissions.some(permission =>
				getPermissions.permissions.includes(permission)
			);

			if (!hasAnyPermission) {
				return res
					.status(403)
					.json({ message: 'Forbidden: You do not have the required permissions' });
			}

			next();
		} catch (e: any) {
			console.error(e);
			const message = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message });
		}
	};
};

export default hasPermission;
