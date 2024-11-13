import { Request, Response, NextFunction } from 'express';
import Store from '../../models/store/store.model.js';

interface CustomRequest extends Request {
	store?: any;
}

const storeMiddleware = async (req: CustomRequest, res: Response, next: NextFunction) => {
	try {
		const apiKey = req.headers['api-key'] as string;
		const storeId = req.headers['store-id'] as string;

		if (!apiKey && !storeId) {
			return res.status(400).json({ message: 'Store not found' });
		}

		let store;

		if (apiKey) {
			store = await Store.findOne({ apiKey });
		} else if (storeId) {
			store = await Store.findById(storeId);
		}

		if (!store) {
			return res.status(404).json({ message: 'Store not found' });
		}

		req.store = store;
		next();
	} catch (error) {
		console.error('Error in storeMiddleware:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

export default storeMiddleware;
