import { NextFunction, Request, Response } from 'express';
import { IsDeletePossibleType } from '../lib/types/default.types.js';

const isDeletePossible = ({ model, field, error }: IsDeletePossibleType) => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!field) return next();
			const { id } = req.params;

			const existingEntry = await model.findOne({ [field]: id });

			if (existingEntry) {
				return res.status(400).json({
					message: error || 'Cannot delete this entry as it is being used in other documents',
				});
			}
			next();
		} catch (e: any) {
			console.error(e);
			const message = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message });
		}
	};
};

export default isDeletePossible;
