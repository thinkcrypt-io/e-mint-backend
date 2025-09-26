import { NextFunction, Response } from 'express';

const active = (req: any, res: Response, next: NextFunction): Response | void => {
	try {
		let query: any = req?.queryHelper || {};
		query.isActive = true;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default active;
