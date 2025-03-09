import { NextFunction, Request, Response } from 'express';
import { getErrorMessage } from '../lib/index.js';

type QueryType = {
	allowSort?: string[];
	allowSearch?: string[];
};

const extendRequestBody = ({ query }: any) => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			req.body = { ...(req.body || {}), ...query };

			next();
		} catch (error: any) {
			// In case of any errors,
			// extract the error message and return a 500 Internal Server Error response.
			const message = getErrorMessage(error);
			return res.status(500).json({ message });
		}
	};
};

export default extendRequestBody;
