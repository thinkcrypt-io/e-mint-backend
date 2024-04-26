import { NextFunction, Request, Response } from 'express';

const myData = ({ field = 'user' }: { field: string }) => {
	return async (req: any, res: any, next: NextFunction) => {
		try {
			const myId = req.user._id;
			if (!myId) {
				return res.status(401).json({ message: 'User id not found' });
			}
			let query: any = req.queryHelper || {};
			query[field] = myId;
			req.queryHelper = query;

			next();
		} catch (e: any) {
			console.error(e);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	};
};

export default myData;
