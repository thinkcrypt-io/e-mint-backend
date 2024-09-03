import { Response } from 'express';
import mongoose from 'mongoose';

const getCount = (model: mongoose.Model<any>) => {
	return async (req: any, res: any): Promise<Response> => {
		let query: any = req?.queryHelper || {};
		try {
			const doc: number = await model.countDocuments(query);
			return res.status(200).json(doc);
		} catch (e: any) {
			console.error(e.message);
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			return res.status(500).json({ message: msg });
		}
	};
};

export default getCount;
