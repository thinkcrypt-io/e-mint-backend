import { Response } from 'express';
import Order from '../../models/order/order.model.js';
//import { allowCancel } from '../../models/order/config.js';

export const allowCancel = ['pending', 'processing', 'order-placed'];

const cancelOrder = async (req: any, res: Response): Promise<Response> => {
	try {
		const { _id } = req.user;
		const { id } = req.params;

		const myOrder = (await Order.findOne({ user: _id, _id: id })) as any;

		if (!myOrder) {
			return res.status(404).json({ message: 'Order not found' });
		}

		if (myOrder.status === 'cancelled') {
			return res.status(400).json({ message: 'Order already cancelled' });
		}

		if (!allowCancel.includes(myOrder.status)) {
			return res
				.status(400)
				.json({ message: 'Order can not be cancelled now, please contact helpline' });
		}

		myOrder.status = 'cancelled';
		const saved = await myOrder.save();

		return res.status(200).json({ doc: saved });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default cancelOrder;
