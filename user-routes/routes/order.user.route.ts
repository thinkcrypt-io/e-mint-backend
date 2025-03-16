import express from 'express';
import constructConfig from '../../lib/configurator/constructConfig.js';
import {
	getAllDocuments,
	getDocumentById,
} from '../../controllers/common/index.js';
import addUserOrder, {
	PendingPayment,
	reduceProductStock,
	sendOrderNotifications,
} from '../../controllers/order/addUserOrder.controller.js';
import getOrderTotal from '../../controllers/order/getOrderTotal.js';
import Order, { settings } from '../../models/order/order.model.js';
import { Shop } from '../../imports.js';
import {
	myData,
	userProtect as protect,
	sort,
	query,
} from '../../middleware/index.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Order,
	config: settings,
});

router.post('/', protect, addUserOrder);
router.get('/:id', getDocumentById({ model: Order }));

router.post('/cart-total', getOrderTotal);
router.get(
	'/',
	protect,
	myData({ field: 'customer' }),
	sort,
	query(config.FILTER_OPTIONS),
	getAllDocuments(config.QUERY_OPTIONS)
);

// Handle successful payment
router.post('/success/:transId', async (req, res) => {
	try {
		// Find the pending payment record
		const pendingPayment = await PendingPayment.findOne({
			transactionId: req.params.transId,
		});

		if (!pendingPayment) {
			return res.status(404).redirect(`${process.env.WEBSITE}/payment/error`);
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
		res.redirect(
			`${process.env.WEBSITE}/payment/success/${req.params.transId}`
		);
	} catch (error) {
		console.error('Error processing successful payment:', error);
		res.status(500).redirect(`${process.env.WEBSITE}/payment/error`);
	}
});

// Handle failed payment
router.post('/fail/:transId', async (req, res) => {
	try {
		// Delete the pending payment record (no order was created yet)
		await PendingPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to failure page
		res.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	} catch (error) {
		console.error('Error handling payment failure:', error);
		res.status(500).redirect(`${process.env.WEBSITE}/payment/error`);
	}
});

// Handle canceled payment (similar to fail)
router.post('/cancel/:transId', async (req, res) => {
	try {
		// Delete the pending payment record (no order was created yet)
		await PendingPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to cancel page
		res.redirect(`${process.env.WEBSITE}/payment/cancel/${req.params.transId}`);
	} catch (error) {
		console.error('Error handling payment cancellation:', error);
		res.status(500).redirect(`${process.env.WEBSITE}/payment/error`);
	}
});

// IPN (Instant Payment Notification) handler
router.post('/ipn/:transId', async (req, res) => {
	// Handle IPN validation if needed
	res.status(200).end();
});

export default router;
