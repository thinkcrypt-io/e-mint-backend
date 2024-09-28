import { NextFunction, Request, Response } from 'express';
import moment from 'moment';

type QueryType = {
	allowSort?: string[];
	allowSearch?: string[];
};

const customQuery = ({ query }: any) => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			(req as any).queryHelper = query;

			let customQuery: any = query || {};
			req.queryHelper = customQuery;

			next();
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default customQuery;
