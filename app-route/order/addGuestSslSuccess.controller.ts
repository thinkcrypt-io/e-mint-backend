import { Response } from 'express';
import { PendingGuestPayment, reduceGuestProductStock, sendGuestOrderNotifications } from './addAppOrder.js';
import { Order, Shop } from '../../models/index.js';
// import { Order, Shop } from '../../models';

const addGuestSslSuccess = async (req: any, res: Response) => {
	try {
		// Find the pending payment record
		const pendingPayment = await PendingGuestPayment.findOne({
			transactionId: req.params.transId,
		});

		if (!pendingPayment) {
			return res
				.status(404)
				.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
		}

		// Create the actual order now that payment is successful
		const orderData = pendingPayment.orderData;
		const order = new Order(orderData);
		const savedOrder = await order.save();

		// Reduce stock quantities now that payment is successful
		await reduceGuestProductStock(pendingPayment.items);

		// Find shop for notifications
		const findShop = await Shop.findById(orderData.shop);

		// Send order notifications
		await sendGuestOrderNotifications(
			orderData.email || orderData.address.email || '',
			orderData.address.phone || '',
			savedOrder._id,
			savedOrder.invoice,
			orderData.total,
			findShop?.name || 'HINT'
		);

		// Remove the pending payment record
		await PendingGuestPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to success page
		res.redirect(`${process.env.WEBSITE}/payment/success/${savedOrder._id}`);
	} catch (error) {
		console.error('Error processing successful payment:', error);
		res
			.status(500)
			.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	}
};

export default addGuestSslSuccess;
