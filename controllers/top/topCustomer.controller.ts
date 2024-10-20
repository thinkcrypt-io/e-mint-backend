import { Request, Response } from 'express';
import Order from '../../models/order/order.model.js'; // Assuming you have an Order model

export const getTopCustomers = async (req: any, res: Response) => {
	try {
		const { sort, limit = 10, fields, skip }: any = req.meta;

		let query: any = req?.queryHelper || {};
		query.isCancelled = false;

		const doc = await Order.aggregate([
			{ $match: query },
			{
				$group: {
					_id: '$customer',
					totalOrders: { $sum: 1 },
					totalOrderValue: { $sum: '$total' },
					totalProductsBought: { $sum: { $sum: '$items.qty' } },
				},
			},
			{ $sort: { totalOrderValue: -1 } },
			{ $limit: limit },
			{
				$lookup: {
					from: 'customers',
					localField: '_id',
					foreignField: '_id',
					as: 'customer',
				},
			},
			{ $unwind: '$customer' },
			{
				$project: {
					customerId: '$_id',
					_id: '$_id',
					name: '$customer.name',
					email: '$customer.email',
					phone: '$customer.phone',
					totalOrders: 1,
					totalOrderValue: 1,
					totalProductsBought: 1,
				},
			},
		]);

		// Aggregation pipeline for counting documents
		const countPipeline = [
			{ $match: query },
			{
				$group: {
					_id: '$customer',
				},
			},
		];

		// Execute the count aggregation pipeline
		const countResult = await Order.aggregate(countPipeline);
		const count = countResult.length;

		req.meta.docsInPage = doc.length;
		req.meta.totalDocs = count;
		req.meta.totalPages = Math.ceil(count / limit);

		return res.status(200).json({ ...req.meta, doc: doc, query });
	} catch (e: any) {
		console.error(e);
		res.status(500).json({ message: e.message });
	}
};
