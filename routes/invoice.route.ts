import { sort } from '../middleware/index.js';
import { Order } from '../models/index.js';
import express from 'express';

const router = express.Router();

router.get('/', sort, async (req: any, res: any) => {
	try {
		const query = {
			invoice: { $regex: req.query.search, $options: 'i' },
		};
		const { sort, limit = 10, skip = 0, fields }: any = req.meta;
		const doc = await Order.find({
			invoice: { $regex: req.query.search, $options: 'i' },
		}).sort('invoice');

		const count: number = await Order.countDocuments(query);

		req.meta.docsInPage = doc.length;
		req.meta.totalDocs = count;
		req.meta.totalPages = Math.ceil(count / limit);

		return res.status(200).json({ ...req.meta, doc: doc });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
});

export default router;
