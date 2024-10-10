import { Response } from 'express';
import { Order, Payment } from '../../imports.js';

const addPayment = async (req: any, res: any): Promise<Response> => {
	try {
		const { invoice, amount } = req.body;

		console.log(req.body);

		if (invoice) {
			const getOrder: any = await Order.findById(invoice).populate('customer');

			if (!getOrder) {
				return res.status(404).json({ message: 'Order not found' });
			}

			if (getOrder) {
				if (getOrder.dueAmount < amount) {
					return res.status(400).json({ message: 'Amount exceeds due amount' });
				}
				getOrder.paidAmount = getOrder.paidAmount + Number(amount);
				getOrder.dueAmount = getOrder.dueAmount - Number(amount);

				if (getOrder.dueAmount <= 0) {
					getOrder.isPaid = true;
				}
			}
			const saved = await getOrder.save();
			const payment = new Payment({
				...req.body,
				order: getOrder?._id,
				invoice: getOrder?.invoice,
				customer: getOrder?.customer,
			});
			const savedPayment = await payment.save();
			return res.status(201).json({ message: 'Payment added successfully', savedPayment });
		} else {
			const payment = new Payment({
				...req.body,
			});

			const savedPayment = await payment.save();
			return res.status(201).json({ message: 'Payment added successfully', savedPayment });
		}
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default addPayment;
