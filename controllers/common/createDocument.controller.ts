import { Request, Response } from 'express';
import mongoose from 'mongoose';

type CustomRequest = Request & {
	body: mongoose.Document;
	store?: string;
};

const createDocument = (model: mongoose.Model<any>) => {
	return async (req: CustomRequest, res: Response): Promise<Response> => {
		try {
			const document = new model({ ...req.body, store: req.store });
			const saved = await document.save();

			return res.status(201).json({
				message: `${model.modelName} with id: ${saved._id} added successfully`,
				doc: saved,
			});
		} catch (e: any) {
			console.error(e);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	};
};

export default createDocument;
