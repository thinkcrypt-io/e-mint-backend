import { Response } from 'express';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';

const createAdminDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body });
			const saved = await document.save();

			return res.status(201).json({
				message: `${model.modelName} with id: ${saved._id} added successfully`,
				doc: saved,
			});
		} catch (e: any) {
			console.error(e);
			const message = getErrorMessage(e);
			return res.status(500).json({ message });
		}
	};
};

export default createAdminDocument;
