import { NextFunction, Request, Response } from 'express';

/**
 * Scenarios where access is granted:
 * - User's ID exists in the access array
 * - User is the one who added/created the resource
 * - Resource has privacy set to 'public'
 */

const hasAccess = () => {
	return (req: any, res: Response, next: NextFunction): any => {
		try {
			const existingQuery = req.queryHelper || {};

			const access = {
				$or: [
					{
						$and: [
							{ access: { $in: [req.user._id] } },
							{ privacy: { $ne: 'only-me' } },
							{ ...existingQuery },
						],
					},
					{
						$and: [{ addedBy: req.user._id }, { ...existingQuery }],
					},
					{
						$and: [{ privacy: 'public' }, { ...existingQuery }],
					},
				],
			};

			req.queryHelper = access;
			next();
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default hasAccess;
