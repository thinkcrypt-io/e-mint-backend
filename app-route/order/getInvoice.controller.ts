import { Response } from 'express';
import { Order } from '../../imports.js';

const getInvoice = async (req: any, res: Response): Promise<Response> => {
	try {
		const { id } = req.params;
		const order = await Order.findById(id).populate('shop');
		if (!order) {
			return res.status(404).json({ message: 'Order not found' });
		}
		return res.status(200).json(order);
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default getInvoice;
