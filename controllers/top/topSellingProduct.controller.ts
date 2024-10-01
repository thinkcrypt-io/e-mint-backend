import { Request, Response } from 'express';
import Order from '../../models/order/order.model.js'; // Assuming you have an Order model
import Product from '../../models/products/products.model.js'; // Assuming you have a Product model

const topSellingProductController = async (req: any, res: Response) => {
	try {
		const { sort, limit = 10, fields, skip }: any = req.meta;

		let query: any = req?.queryHelper || {};

		const doc = await Order.aggregate([
			{ $match: query },
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$items._id',
					totalQuantity: { $sum: '$items.qty' },
				},
			},
			{ $sort: { totalQuantity: -1 } },
			{ $skip: skip },
			{ $limit: limit },

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
			{ $sort: { totalQuantity: -1 } },
			{ $skip: skip },
			{ $limit: limit },

			{
				$project: {
					_id: '$_id',
					productId: '$_id',
					name: '$product.name',
					sku: '$product.sku',
					category: '$category.name',
					catId: '$category._id',
					price: '$product.price',
					totalQuantity: 1,
				},
			},
		]);

		const countPipeline = [
			{ $match: query },
			{ $unwind: '$items' },
			{
				$group: {
					_id: '$items._id',
				},
			},
		];

		const countResult = await Order.aggregate(countPipeline);
		const count = countResult.length;

		//const count: number = await Product.countDocuments();

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
