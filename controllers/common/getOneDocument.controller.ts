import { Response } from 'express';
import { GetByIdRequestType } from '../../lib/types/controller.types.js';
import mongoose from 'mongoose';

type EndwareType = {
	model: mongoose.Model<any>;
	populate?: any;
	select?: string;
	conditions?: object;
};

const getOneDocument = ({ model, populate, select, conditions }: EndwareType) => {
	return async (req: GetByIdRequestType, res: Response): Promise<Response> => {
		try {
			const queryHelper = (req as any).queryHelper || {};

			let query = model.findOne({ ...queryHelper, ...conditions });

			if (populate) {
				query = query.populate(populate);
			}
			if (select) {
				query = query.select(select);
			}

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

export default getOneDocument;
