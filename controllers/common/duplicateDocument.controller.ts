import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';

type EndwareType = {
	model: mongoose.Model<any>;
	populate?: any;
	select?: string;
};

const duplicateDocument = ({ model, unique = '' }: any) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const fieldArray = unique.split(' ');

			const { id } = req.params;
			const queryHelper = (req as any).queryHelper || {};
			// queryHelper.store = (req as any).store;
			queryHelper._id = id;

			let data = await model.findOne(queryHelper).lean();

			//const data = await query.exec();

			const { ...rest } = data;

			// Modify the fields that are in the uniqueFields array
			fieldArray.forEach((field: any) => {
				if (rest[field]) {
					rest[field] = `${rest[field]}-copy`;
				}
			});

			const newDocument = new model({
				...rest,
				_id: new mongoose.Types.ObjectId(), // Ensure a new unique identifier
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const saved = await newDocument.save();

			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			return res.status(200).json('saved');
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default duplicateDocument;
