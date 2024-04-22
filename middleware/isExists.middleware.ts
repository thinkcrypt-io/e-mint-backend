import { NextFunction, Request, Response } from 'express';
import { IfExistType } from '../lib/types/default.types.js';

const ifExists = ({ model, fields }: IfExistType) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const fieldArray = fields.split(' ');
			const conditions = fieldArray.reduce((acc, field) => {
				if (req.body[field]) {
					acc[field] = req.body[field];
				}
				return acc;
			}, {} as Record<string, any>);

			const existingEntry = await model.findOne(conditions);
			if (existingEntry) {
				return res.status(400).json({ message: 'Duplicate entry exists' });
			}
			next();
		} catch (e: any) {
			console.error(e);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	};
};

export default ifExists;
