import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

type Type = {
	model: mongoose.Model<any>;
	fields: String;
	message: String;
};

const existCondition = ({ model, fields, message }: Type) => {
	return async (req: any, res: Response, next: NextFunction) => {
		try {
			if (!fields || !model) return next();

			const fieldArray = fields.split(' ');

			const conditions = fieldArray.reduce((acc, field) => {
				if (req.body[field]) {
					acc[field] = req.body[field];
				}
				return acc;
			}, {} as Record<string, any>);

			console.log(conditions);

			const existingEntry = await model.findOne(conditions);

			if (existingEntry) {
				return res.status(400).json({
					message: message || `Duplicate Entry Exists`,
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

export default existCondition;
