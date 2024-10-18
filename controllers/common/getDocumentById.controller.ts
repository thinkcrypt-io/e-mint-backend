import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';

type EndwareType = {
	model: mongoose.Model<any>;
	populate?: any;
	select?: string;
	exclude?: string;
};

const getDocumentById = ({ model, populate, select, exclude }: EndwareType) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;
			const queryHelper = (req as any).queryHelper || {};
			// queryHelper.store = (req as any).store;
			queryHelper._id = id;

			let query = model.findOne(queryHelper);

			if (populate) {
				query = query.populate(populate);
			}
			if (exclude) {
				query = query.select(exclude && exclude);
			}

			const data = await query.exec();

			if (!data) {
				return res.status(404).json({ message: 'Document Not Found' });
			}

			return res.status(200).json(data);
		} catch (e: any) {
			const message = getErrorMessage(e);
			return res.status(500).json({ message });
		}
	};
};

export default getDocumentById;
