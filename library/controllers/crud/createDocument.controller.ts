import { Response } from 'express';
import mongoose from 'mongoose';
import recordHistory from '../../functions/recordHistory.function.js';

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body, addedBy: req?.user?._id });
			const saved = await document.save();

			recordHistory({ req, action: 'create', model: model.modelName, doc: saved });

			return res.status(201).json({
				message: `${model.modelName} with id: ${saved._id} added successfully`,
				doc: saved,
			});
		} catch (e: any) {
			console.log(e?.message);

			return res.status(500).json({ message: e?.message || 'Internal Server Error' });
		}
	};
};

export default createDocument;
