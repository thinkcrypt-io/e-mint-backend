import express from 'express';
import { store, filter } from '../middlewares/index.js';

import { constructConfig, getDocumentById } from '../../imports.js';
import { Shop, shopSettings } from '../../imports.js';

const config = constructConfig({
	model: Shop,
	config: shopSettings,
});

const getStore = async (req: any, res: any): Promise<Response> => {
	try {
		let query = Shop.findById(req.shop).select('-package -owner -expire -trial');
		const data = await query.exec();
		if (!data) return res.status(404).json({ message: 'Shop Not Found' });

		return res.status(200).json(data);
	} catch (e: any) {
		return res.status(500).json({ message: e.message });
	}
};

const router = express.Router();

router.get('/', store, getStore);

export default router;
