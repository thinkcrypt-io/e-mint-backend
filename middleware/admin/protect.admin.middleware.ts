import { Admin } from '../../imports.js';
import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';

const adminProtect = async (
	req: any,
	res: Response,
	next: NextFunction
): Promise<Response | void> => {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer')) {
		return res.status(401).json({ message: 'Not authorized, no token' });
	}
	try {
		const token: string = authHeader.split(' ')[1];
		const decoded = jwt.verify(
			token,
			process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
		) as any;

		req.user = await Admin.findById(decoded?._id).select('-password').populate('role');

		if (!req.user) {
			return res.status(401).json({ message: 'User was not found' });
		}

		/**
		 * Deactivation has to be enforced here, not only at login.
		 *
		 * `adminLoginController` refuses to issue a token to a deactivated
		 * admin, which locks the front door — but `generateAuthToken` signs
		 * without `expiresIn`, so a token handed out before the deactivation
		 * never stops being valid on its own. Without this check, revoking
		 * someone's access locked them out of logging in again and left their
		 * existing session running indefinitely, with every permission their
		 * role carries.
		 *
		 * The record is re-read from the database on every request (above), so
		 * this takes effect on the deactivating admin's very next request rather
		 * than whenever a cached claim expires.
		 *
		 * `isDeleted` is defensive: the generic delete is a hard
		 * `findByIdAndDelete`, so a deleted admin already fails the check above
		 * — but the field exists on the model, and a soft-delete flow added
		 * later must not silently reopen this.
		 */
		if (req.user.isActive === false || req.user.isDeleted === true) {
			return res.status(401).json({
				message: 'This account has been deactivated. Contact an administrator.',
			});
		}

		req.permissions = req.user?.role?.permissions || [];

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed' });
	}
};

export default adminProtect;
