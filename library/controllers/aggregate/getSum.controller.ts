import { Response } from 'express';
import mongoose from 'mongoose';

const getSum = (model: mongoose.Model<any>) => {
	return async (req: any, res: any): Promise<Response> => {
		const field = req.params.field || 'total';
		const ids = req.query.ids ? req.query.ids.split(',') : [];

		try {
			let query: any = req?.queryHelper || {};

			// If ids are provided, filter by those specific ids
			if (ids.length > 0) {
				query._id = { $in: ids.map((id: string) => new mongoose.Types.ObjectId(id)) };
			}

			const result = await model.aggregate([
				{
					$match: query,
				},
				{
					$group: {
						_id: null,
						total: { $sum: `$${field}` },
					},
				},
			]);

			const total = result.length > 0 ? result[0].total : 0;
			return res.status(200).json({ total });
		} catch (e: any) {
			const msg = process.env.NODE_ENV === 'development' ? e.message : 'Internal Server Error';
			console.error(e.message);
			return res.status(500).json({ message: msg });
		}
	};
};

export default getSum;
