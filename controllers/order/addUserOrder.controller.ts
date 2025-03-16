import { Response } from 'express';
import Order from '../../models/order/order.model.js';
import Product from '../../models/products/products.model.js';
import sendMail from '../mail/sendMail.controller.js';
import sendSMS from '../util/sendSms.controller.js';
import { Shop } from '../../imports.js';
import { v4 as uuidv4 } from 'uuid';
import SSLCommerzPayment from 'sslcommerz-lts';
// const SSLCommerzPayment = require('sslcommerz-lts');

const addUserOrder = async (req: any, res: Response) => {
	const {
		cart,
		isPaid,
		address,
		paymentMethod,
		paymentAmount,
		paidAmount,
		status,
		note,
	} = req.body;

	console.log('cart', cart);
	

	try {
		// Generate a unique transaction ID
		const transactionId = uuidv4();

		// Create order object
		const orderData = {
			user: (req as any).user._id,
			items: cart.items,
			total: cart.total,
			vat: cart.vat,
			subTotal: cart.subTotal,
			coupon: cart.couponId,
			isPaid: paymentMethod === 'cash on delivery' ? false : isPaid,
			address,
			origin: 'website',
			status: status || 'pending',
			paymentMethod,
			customer: req.user._id,
			orderDate: Date.now(),
			paymentAmount,
			note,
			paidAmount,
			shippingCharge: cart.shipping,
			dueAmount: isPaid ? 0 : Number(cart?.total) - Number(paymentAmount || 0),
			discount: cart.discount,
			shop: req.shop,
			trnxRef: transactionId,
		};

		// Handle different payment methods
		if (paymentMethod === 'cash on delivery') {
			// Process cash on delivery order
			const order = new Order(orderData);
			const saved = (await order.save()) as any;

			const findShop: any = await Shop.findById(req.shop);

			// Send notifications
			sendOrderNotifications(
				req.user.email,
				address?.phone,
				saved._id,
				saved.total,
				findShop?.name
			);

			// Reduce stock of items
			await reduceProductStock(cart.items);

			return res.status(201).json({
				message: `Order id: ${saved._id} added successfully`,
				order: saved,
			});
		} else if (paymentMethod === 'sslcommerz') {
			// First save the order with pending payment status
			const order = new Order({
				...orderData,
				isPaid: false,
				status: 'pending',
			});

			const saved = (await order.save()) as any;
			
			const findShop = await Shop.findById(req.shop);

			// Initialize SSLCommerz payment
			const store_id = process.env.STORE_ID;
			const store_passwd = process.env.STORE_PASS;
			const is_live = false; // true for live, false for sandbox

			// Prepare data for SSLCommerz
			const sslData = {
				total_amount: cart.total,
				currency: 'BDT',
				tran_id: transactionId,
				success_url: `${process.env.API_URL}/user-api/orders/success/${transactionId}`,
				fail_url: `${process.env.API_URL}/user-api/orders/fail/${transactionId}`,
				cancel_url: `${process.env.API_URL}/user-api/orders/cancel/${transactionId}`,
				ipn_url: `${process.env.API_URL}/user-api/orders/ipn/${transactionId}`,
				shipping_method: 'Courier',
				// product_name: 'product',
				product_name: cart.items
					.map((item: any) => item.title)
					.join(', ')
					.substring(0, 50) || 'Product',

				product_category: 'Mixed',
				product_profile: 'general',
				cus_name: address.name || 'Customer',
				cus_email: address.email || req.user.email,
				cus_add1: address.name || 'Address',
				cus_add2: '',
				cus_city: '',
				cus_state: '',
				cus_postcode: '',
				cus_country: 'Bangladesh',
				cus_phone: address.phone || '',
				cus_fax: '',
				ship_name: address.name || 'Customer',
				ship_add1: address.name || 'Address',
				ship_add2: '',
				ship_city: 'Dhaka',
				ship_state: 'Dhaka',
				ship_postcode: '1220',
				ship_country: 'Bangladesh',
			};

			const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

			// Initialize SSLCommerz payment
			const apiResponse = await sslcz.init(sslData);
			// console.log('check', apiResponse);

			// Get the redirect URL from SSLCommerz
			const redirectUrl = await apiResponse?.GatewayPageURL;

			await reduceProductStock(cart.items);

			return res.send({
				url: apiResponse?.GatewayPageURL,
				orderId: saved._id,
				transactionId: transactionId,
			});

			// if (redirectUrl) {

			// 	return res.status(200).json({
			// 		url: redirectUrl,
			// orderId: saved._id,
			// transactionId: transactionId,
			// 	});
			// } else {
			// 	// If SSLCommerz initialization fails, delete the order
			// 	await Order.findByIdAndDelete(saved._id);
			// 	return res.status(400).json({
			// 		message: 'Payment initialization failed',
			//     res: apiResponse
			// 	});
			// }
		} else {
			return res.status(400).json({
				message: 'Invalid payment method',
			});
		}
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

// Helper function to send order notifications
const sendOrderNotifications = async (
	email: string,
	phone: string,
	orderId: string,
	total: number,
	shopName: string
) => {
	// Send email notification
	sendMail({
		title: shopName || 'Shop',
		to: email,
		subject: 'Order Placed',
		body: `Thank you for shopping at ${shopName}. Your order has been placed successfully. Order id: ${orderId}, Total: ${total}. Download your invoice from here: ${process.env.WEBSITE}/my-purchase/${orderId}/invoice`,
	});

	// Send SMS notification if phone number is available
	if (phone) {
		sendSMS({
			receiver: phone,
			message: `Thank you for shopping at ${shopName}. Invoice: ${orderId}, Tk. ${total}. Details: ${process.env.WEBSITE}/invoice/${orderId}. Shop Online: ${process.env.WEBSITE}`,
		});
	}
};

// Helper function to reduce product stock
const reduceProductStock = async (items: any[]) => {
	for (const item of items) {
		const product = await Product.findById(item._id);
		if (product) {
			product.stock = product.stock - item.qty;
			await product.save();
		}
	}
};

const restoreProductStock = async (items: any[]) => {
	try {
		for (const item of items) {
			const product = await Product.findById(item._id);
			if (product) {
				product.stock = product.stock + item.qty;
				await product.save();
			}
		}
	} catch (error) {
		console.error('Error restoring product stock:', error);
		throw error;
	}
};

export { restoreProductStock };

export default addUserOrder;

