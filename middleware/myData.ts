import { NextFunction, Response } from 'express';

const myData = ({ field = 'user' }: { field?: string }) => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			let query: any = req?.queryHelper || {};
			query[field] = req.user._id;
			req.queryHelper = query;
			next();
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default myData;
