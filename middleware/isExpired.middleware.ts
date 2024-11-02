import { NextFunction, Response } from 'express';

const isExpired = (req: any, res: Response, next: NextFunction): Response | void => {
	try {
		let expire = req.expire;
		let now = new Date().getTime();

		if (expire < now) {
			return res.status(401).json({ message: 'Subscription expired, please contact support' });
		}

		next();
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default isExpired;
