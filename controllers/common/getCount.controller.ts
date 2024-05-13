import { Response } from 'express';
import mongoose from 'mongoose';

const getCount = (model: mongoose.Model<any>) => {
	return async (req: any, res: any): Promise<Response> => {
		try {
			const doc = await model.countDocuments({ restaurant: req.restaurant });
			return res.status(200).json(doc);
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: 'Internal Server Error' });
		}
	};
};

export default getCount;
