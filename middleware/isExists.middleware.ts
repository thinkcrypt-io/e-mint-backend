import { NextFunction, Request, Response } from 'express';
import { IfExistType } from '../lib/types/default.types.js';

const ifExists = ({ model, fields }: IfExistType) => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!fields) return next();

			const fieldArray = fields.split(' ');
			const conditions = fieldArray.map(field => ({
				[field]: req.body[field],
			}));

			const existingEntry = await model.findOne({ $or: conditions, shop: req.shop });

			if (existingEntry) {
				const duplicateFields = fieldArray.filter(
					field => req.body[field] === existingEntry[field]
				);
				const duplicateFieldsMessage = duplicateFields.join(', ');
				return res.status(400).json({
					message: `Duplicate entry exists for fields: ${duplicateFieldsMessage}`,
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

export default ifExists;
