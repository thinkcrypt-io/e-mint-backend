import { Request, Response } from 'express';
import Order from '../../models/order/order.model.js'; // Assuming you have an Order model
import Customer from '../../models/customer/customer.model.js';

export const getTopCustomers = async (req: any, res: Response) => {
	try {
		const { sort, limit = 10, fields, skip }: any = req.meta;

		const doc = await Order.aggregate([
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
					totalOrders: 1,
					totalOrderValue: 1,
					totalProductsBought: 1,
				},
			},
		]);

		const count: number = await Customer.countDocuments();

		req.meta.docsInPage = doc.length;
		req.meta.totalDocs = count;
		req.meta.totalPages = Math.ceil(count / limit);

		return res.status(200).json({ ...req.meta, doc: doc });
	} catch (e: any) {
		console.error(e);
		res.status(500).json({ message: e.message });
	}
};
