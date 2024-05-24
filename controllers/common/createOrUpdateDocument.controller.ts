import { Request, Response } from 'express';
import mongoose from 'mongoose';

type CustomRequest = Request & {
	body: mongoose.Document;
	restaurant?: string;
};

const createOrUpdateDocument = (model: mongoose.Model<any>) => {
	return async (req: CustomRequest, res: Response): Promise<Response> => {
		const documentData = req.body;

		try {
			let document = await model.findOne({ restaurant: req.restaurant });

			if (document) {
				// Update existing document
				document = await model.findOneAndUpdate(
					{ restaurant: req.restaurant },
					{ $set: documentData },
					{ new: true }
				);
			} else {
				// Create new document
				document = new model({ restaurant: req.restaurant, ...documentData });
				await document.save();
			}

			return res.status(200).json(document);
		} catch (e: any) {
			console.error(e);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	};
};

export default createOrUpdateDocument;
