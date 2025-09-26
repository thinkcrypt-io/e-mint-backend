import { NextFunction, Request, Response } from 'express';

type QueryType = {
	allowSort?: string[];
	allowSearch?: string[];
};

const customQuery = ({ query }: any) => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			req.queryHelper = { ...(req.queryHelper || {}), ...query };

			next();
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default customQuery;
