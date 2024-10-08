import { Response } from 'express';
import mongoose from 'mongoose';

const getInventoryCount = (model: mongoose.Model<any>) => {
	return async (req: any, res: any): Promise<Response> => {
		const field = req.params.field || 'total';

		try {
			let query: any = req?.queryHelper || {};

			const result = await model.aggregate([
				{
					$match: query,
				},
				{
					$addFields: {
						inventoryCostPrice: { $multiply: ['$cost', '$stock'] },
						inventorySellPrice: { $multiply: ['$price', '$stock'] },
					},
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

export default getInventoryCount;
