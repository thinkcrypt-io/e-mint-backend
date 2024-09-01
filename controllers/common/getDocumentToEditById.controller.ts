import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';

const getDocumentToEditById = (model: mongoose.Model<any>) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;
			const queryHelper = (req as any).queryHelper || {};
			// queryHelper.store = (req as any).store;
			queryHelper._id = id;

			let query = model.findOne(queryHelper);

			const data = await query.exec();

			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			return res.status(200).json(data);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	};
};

export default getDocumentToEditById;
