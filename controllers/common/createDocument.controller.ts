import { Response } from 'express';
import mongoose from 'mongoose';
import { getErrorMessage } from '../../imports.js';

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			console.log('body doc::', req.body);
			const document = new model({
				...req.body,
				shop: req.shop,
				addedBy: req.user._id,
			});
			console.log('saved doc:', document);
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

export default createDocument;
