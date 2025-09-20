import { Admin } from '../../models/_index.js';
import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';

const genericProtect = ({ model = Admin, populate }: { model?: any; populate?: any }) => {
	return async (req: any, res: Response, next: NextFunction): Promise<Response | void> => {
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

			req.user = await model
				.findById(decoded?._id)
				.select('-password')
				.populate(populate || '');

			if (!req.user) return res.status(401).json({ message: 'User was not found' });

			populate && (req.permissions = req.user?.role?.permissions || []);

			next();
		} catch (e: any) {
			console.error(e);
			return res.status(401).json({ message: 'Not authorized, token failed' });
		}
	};
};

export default genericProtect;
