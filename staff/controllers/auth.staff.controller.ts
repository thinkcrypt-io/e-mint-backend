import jwt from 'jsonwebtoken';
import Staff from '../../models/staff/staff.model.js';
import { Request, Response, NextFunction } from 'express';
//import { DecodedTokenType } from '../lib/types/model.types.js';
import { SUPER_ADMIN } from '../../lib/types/permissions.js';

type RequestType = Request & {
	user?: unknown;
};

export const productProtect = async (
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

		if (!decoded.shop || !decoded.location) {
			return res.status(401).json({ message: 'Not authorized, token failed, no location or shop' });
		}

		req.user = await Staff.findById(decoded?._id).select('-password').populate('shop');

		req.shop = req?.user?.shop?._id;
		// req.location = req?.user?.location._id;

		if (!req.user) {
			return res.status(401).json({ message: 'User was not found' });
		}

		console.log(req.user);

		let query: any = (req as any).queryHelper || {};
		query.shop = req.shop;
		query['inventory.location'] = req.user.location;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed', error: e.message });
	}
};

export const transferProtect = async (
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

		if (!decoded.shop || !decoded.location) {
			return res.status(401).json({ message: 'Not authorized, token failed' });
		}

		req.user = await Staff.findById(decoded?._id).select('-password').populate('shop');

		req.shop = req?.user?.shop?._id;
		req.location = req?.user?.location;

		if (!req.user) {
			return res.status(401).json({ message: 'User was not found' });
		}

		let query: any = (req as any).queryHelper || {};
		query.shop = req.shop;

		query.destination = req.location;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed' });
	}
};

export const protect = async (
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

		if (!decoded.shop || !decoded.location) {
			return res.status(401).json({ message: 'Not authorized, token failed' });
		}

		req.user = await Staff.findById(decoded?._id).select('-password').populate('shop');

		req.shop = req?.user?.shop?._id;
		req.location = req?.user?.location;
		req.destination = req?.user?.location;

		if (!req.user) {
			return res.status(401).json({ message: 'User was not found' });
		}

		let query: any = (req as any).queryHelper || {};
		query.shop = req.shop;
		query.location = req.location;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed' });
	}
};

export const soft = async (
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

		if (!decoded.shop || !decoded.location) {
			return res.status(401).json({ message: 'Not authorized, token failed' });
		}

		req.user = await Staff.findById(decoded?._id).select('-password');

		req.shop = req?.user?.shop;

		if (!req.user) {
			return res.status(401).json({ message: 'User was not found' });
		}

		let query: any = (req as any).queryHelper || {};
		query.shop = req.shop;
		query.isActive = true;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed' });
	}
};

export const self = (req: any, res: Response, next: NextFunction): Response | void => {
	try {
		let query: any = req?.queryHelper || {};
		query.user = req.user._id;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export const admin = async (
	req: RequestType, // The request object
	res: Response, // The response object
	next: NextFunction // The next middleware function in the stack
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

		req.user = await Staff.findById(decoded?._id).select('-password');

		// If the user exists on the request object and their role is SUPER_ADMIN
		if ((req as any).user?.role == 'admin' || (req as any).user?.role == 'super-admin') {
			next(); // Call the next middleware function
		} else {
			// If the user is not a super admin, return a 401 Unauthorized status code and a message
			return res.status(401).json({ message: 'You need to be a superadmin to open stores' });
		}
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed' });
	}
};

export const softProtect = (req: RequestType, res: Response, next: NextFunction): void => {
	const authHeader = req.headers.authorization;

	try {
		if (!authHeader || !authHeader.startsWith('Bearer')) {
			next();
		} else {
			const token: string = authHeader.split(' ')[1];
			const decoded = jwt.verify(
				token,
				process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
			) as any;

			req.user = decoded;

			next();
		}
	} catch (e: any) {
		console.error(e);
		next();
	}
};
