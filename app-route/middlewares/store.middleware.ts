import { Shop } from '../../models/index.js';
import { NextFunction, Response } from 'express';

const appStoreMiddleware = async (req: any, res: Response, next: NextFunction) => {
	try {
		const { storeId } = req.query;

		if (!storeId) return res.status(400).json({ message: 'Store not found' });

		const findStore = await Shop.findOne({ id: storeId });

		if (!findStore) return res.status(400).json({ message: 'Store not found' });

		req.shop = findStore._id;

		let query: any = (req as any).queryHelper || {};
		query.shop = req.shop;
		req.queryHelper = query;

		next();
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default appStoreMiddleware;
