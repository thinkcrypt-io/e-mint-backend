import { NextFunction, Request, Response } from 'express';
import moment from 'moment';

type QueryType = {
	allowSort?: string[];
	allowSearch?: string[];
};

const extendRequestBody = ({ query }: any) => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			req.body = { ...(req.body || {}), ...query };

			console.log(req.body);

			next();
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default extendRequestBody;
