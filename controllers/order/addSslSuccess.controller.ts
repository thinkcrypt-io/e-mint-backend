import { Response } from "express";
import Order from '../../models/order/order.model.js';
import { Shop } from '../../imports.js';
import { PendingPayment, reduceProductStock, sendOrderNotifications } from "./addUserOrder.controller.js";

const addSslSuccess = async (req: any, res: Response) => {
	try {
		// Find the pending payment record
		const pendingPayment = await PendingPayment.findOne({
			transactionId: req.params.transId,
		});

		if (!pendingPayment) {
			return res.status(404).redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
		}

		// Create the actual order now that payment is successful
		const orderData = pendingPayment.orderData;
		const order = new Order(orderData);
		const savedOrder = await order.save();

		// Reduce stock quantities now that payment is successful
		await reduceProductStock(pendingPayment.items);

		// Find shop for notifications
		const findShop = await Shop.findById(orderData.shop);

		// Send order notifications
		await sendOrderNotifications(
			orderData.address.email || '',
			orderData.address.phone || '',
			savedOrder._id,
			orderData.total,
			findShop?.name || 'Shop'
		);

		// Remove the pending payment record
		await PendingPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to success page
		res.redirect(`${process.env.WEBSITE}/payment/success/${savedOrder._id}`);
	} catch (error) {
		console.error('Error processing successful payment:', error);
		res.status(500).redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	}
};

export default addSslSuccess;