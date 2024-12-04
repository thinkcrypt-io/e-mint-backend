import { Response } from 'express';
import Store from '../../models/store/store.model.js';

const getStore = async (req: any, res: any): Promise<Response> => {
	try {
		const data = await Store.findOne({
			shop: req.shop || '0001',
		});
		if (!data) {
			return res.status(404).json({ message: 'Store not found' });
		}
		return res.status(200).json(data);
	} catch (e: any) {
		console.log(e.message);
		const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
		return res.status(500).json({ message: message });
	}
};

export default getStore;
