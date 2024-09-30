import { Request, Response } from 'express';
import Order from '../../models/order/order.model.js'; // Assuming you have an Order model
import Product from '../../models/products/products.model.js'; // Assuming you have a Product model

const topSellingProductController = async (req: any, res: Response) => {
	try {
		const { sort, limit = 10, fields, skip }: any = req.meta;
		//const skip = req.query.page ? Number(req.query.page) : 0;

		const doc = await Order.aggregate([
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$items._id',
					totalQuantity: { $sum: '$items.qty' },
				},
			},
			{ $sort: { totalQuantity: -1 } },
			{ $limit: limit || 5 },

			{
				$lookup: {
					from: 'products',
					localField: '_id',
					foreignField: '_id',
					as: 'product',
				},
			},
			{ $unwind: '$product' },
			{
				$lookup: {
					from: 'categories',
					localField: 'product.category',
					foreignField: '_id',
					as: 'category',
				},
			},
			{ $unwind: '$category' },
			{
				$project: {
					_id: '$_id',
					productId: '$_id',
					name: '$product.name',
					sku: '$product.sku',
					category: '$category.name',
					price: '$product.price',
					totalQuantity: 1,
				},
			},
		]);

		const count: number = await Product.countDocuments();

		req.meta.docsInPage = doc.length;
		req.meta.totalDocs = count;
		req.meta.totalPages = Math.ceil(count / limit);

		return res.status(200).json({ ...req.meta, doc: doc });
	} catch (error: any) {
		console.error(error);
		return res.status(500).json({ message: error.message });
	}
};

export default topSellingProductController;
