import { Response } from 'express';
import Order from '../../models/order/order.model.js';

const getMyOrders = async (req: any, res: Response): Promise<Response> => {
	try {
		const { sort, limit = 10, skip = 0, fields } = (req as any).meta;
		let query: any = (req as any)?.queryHelper || {};

		query.store = (req as any).store._id;

		const store = (req as any).store;
		query.store = store;

		const orders: any = await Order.find(query)
			.select(fields)
			.populate([
				{
					path: 'user',
					select: 'name email',
				},
				{
					path: 'delivery',
				},
				{
					path: 'coupon',
				},
			])
			.sort(sort)
			.limit(limit)
			.skip(skip);

		const count: number = await Order.countDocuments(query);

		(req as any).meta.docsInPage = orders.length;
		(req as any).meta.totalDocs = count;
		(req as any).meta.totalPages = Math.ceil(count / limit);

		return res.status(200).json({ ...(req as any).meta, doc: orders });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default getMyOrders;
