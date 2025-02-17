import { NextFunction, Request, Response } from 'express';

const hasAccess = () => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			console.log('injecting hasAccess middleware');

			const access = { $or: [{ access: { $in: [req.user._id] } }, { addedBy: req.user._id }] };
			req.queryHelper = { ...(req.queryHelper || {}), ...access };

			next();
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default hasAccess;
