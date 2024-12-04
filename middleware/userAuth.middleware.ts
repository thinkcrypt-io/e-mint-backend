import jwt from 'jsonwebtoken';
import User from '../models/user/user.model.js';
import { Request, Response, NextFunction } from 'express';
//import { DecodedTokenType } from '../lib/types/model.types.js';
import { SUPER_ADMIN } from '../lib/types/permissions.js';
import Customer from '../models/customer/customer.model.js';
import { Shop } from '../imports.js';

type RequestType = Request & {
	user?: unknown;
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

		const getShop = await Shop.findOne({ id: req.headers.store || '0001' });
		req.shop = getShop?._id;

		req.user = await Customer.findById(decoded?._id).select('-password');

		if (!req.user) {
			return res.status(401).json({ message: 'User was not found' });
		}

		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Not authorized, token failed' });
	}
};

export const shop = async (
	req: any,
	res: Response,
	next: NextFunction
): Promise<Response | void> => {
	try {
		const getShop = await Shop.findOne({ id: req.headers.store || '0001' });
		req.shop = getShop?._id;
		next();
	} catch (e: any) {
		console.error(e);
		return res.status(401).json({ message: 'Internal server error' });
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

// This is a middleware function for checking if the user is a super admin
export const superAdmin = async (
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

		req.user = await User.findById(decoded?._id).select('-password');

		// If the user exists on the request object and their role is SUPER_ADMIN
		if ((req as any).user?.role == SUPER_ADMIN) {
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

		req.user = await User.findById(decoded?._id).select('-password');

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
