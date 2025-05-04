// import { Response } from "express";
// import { OrderType, Product, Order, Payment } from "../../imports.js";
// import sendMail from "../../controllers/mail/sendMail.controller.js";
// import sendSMS from "../../controllers/util/sendSms.controller.js";

// const addAppOrder = async (req: any, res: Response): Promise<Response> => {
//   const {
//     cart,
//     isPaid,
//     address,
//     paymentMethod,
//     customer,
//     orderDate,
//     paymentAmount,
//     paidAmount,
//     status,
//     note,
//     email,
//   } = req.body;

//   try {
//     const order = new Order({
//       // user: (req as any).user._id,
//       items: cart.items,
//       total: cart.total,
//       vat: cart.vat,
//       subTotal: cart.subTotal,
//       coupon: cart.couponId,
//       isPaid: isPaid || cart?.total == paymentAmount ? true : false,
//       address,
//       status: status || "pending",
//       paymentMethod,
//       customer: null,
//       orderDate,
//       paymentAmount,
//       origin: "mint-app",
//       email: req.body.email,
//       note,
//       paidAmount,
//       shippingCharge: cart.shipping,
//       dueAmount: isPaid ? 0 : Number(cart?.total) - Number(paymentAmount || 0),
//       discount: cart.discount,
//       profit: cart.profit,
//       shop: (req as any).shop,
//     }) as OrderType;

//     const saved = (await order.save()) as any;

//     sendMail({
//       title: "HINT",
//       to: address?.email,
//       subject: "Order Placed",
//       body: `Thank you for shopping at HINT. Your order has been placed successfully. Order id: ${saved._id}, Total: ${saved.total}. Download your invoice from here: https://mango-frontend-test.vercel.app/my-purchase/${saved?._id}/invoice `,
//     });

//     if (address?.phone) {
//       sendSMS({
//         receiver: address?.phone,
//         message: `Thank you for shopping at HINT. Invoice: ${saved._id}, Tk. ${saved.total}. Download your invoice from here: https://mango-frontend-test.vercel.app/my-purchase/${saved?._id}/invoice . Shop Online: ${process.env.WEBSITE}`,
//       });
//     }

//     // Reduce stock of items
//     for (const item of cart.items) {
//       const product = await Product.findById(item._id);
//       if (product) {
//         product.stock = product.stock - item.qty;
//         await product.save();
//       }
//     }
//     // if (paidAmount > 0) {
//     // 	const payment = new Payment({
//     // 		shop: (req as any).shop,
//     // 		invoice: saved.invoice,
//     // 		amount: paymentAmount,
//     // 		order: saved._id,
//     // 		date: orderDate,
//     // 		trnxId: 'POS',
//     // 		reference: saved.invoice,
//     // 		tags: ['order'],
//     // 		note,
//     // 		account: 'credit',
//     // 		customer: saved?.customer,
//     // 		paymentMethod,
//     // 		currency: 'BDT',
//     // 	});
//     // 	const savePayment = await payment.save();
//     // }

//     return res.status(201).json(saved);
//   } catch (e: any) {
//     console.error(e);
//     return res.status(500).json({ message: e.message });
//   }
// };

// export default addAppOrder;

import { Response } from 'express';
import { OrderType, Product, Order, Payment, Shop } from '../../imports.js';
import sendMail from '../../controllers/mail/sendMail.controller.js';
import sendSMS from '../../controllers/util/sendSms.controller.js';
import { v4 as uuidv4 } from 'uuid';
import SSLCommerzPayment from 'sslcommerz-lts';
import mongoose from 'mongoose';

// Create a schema for pending guest payments
const pendingGuestPaymentSchema = new mongoose.Schema({
	transactionId: { type: String, required: true, unique: true },
	orderData: { type: Object, required: true },
	items: { type: Array, required: true },
	createdAt: { type: Date, default: Date.now, expires: '24h' }, // Auto-expire after 24 hours
});

// Create model if it doesn't exist (prevents re-declaration error)
const PendingGuestPayment =
	mongoose.models.PendingGuestPayment ||
	mongoose.model('PendingGuestPayment', pendingGuestPaymentSchema);

const addAppOrder = async (req: any, res: Response): Promise<Response> => {
	const {
		cart,
		isPaid,
		address,
		paymentMethod,
		customer,
		orderDate,
		paymentAmount,
		paidAmount,
		status,
		note,
		email,
	} = req.body;

	try {
		// Generate a unique transaction ID
		const transactionId = uuidv4();

		// Create base order data object
		const orderData = {
			// user: null for guest user
			items: cart.items,
			total: cart.total,
			vat: cart.vat,
			subTotal: cart.subTotal,
			coupon: cart.couponId,
			address,
			origin: 'mint-app',
			paymentMethod,
			customer: null, // Guest user
			orderDate: orderDate || Date.now(),
			paymentAmount,
			note,
			paidAmount,
			email: email || address?.email,
			shippingCharge: cart.shipping,
			discount: cart.discount,
			profit: cart.profit,
			shop: req.shop,
			trnxRef: transactionId,
		};

		const findShop: any = await Shop.findById(req.shop);

		// Handle different payment methods
		if (paymentMethod === 'cash on delivery') {
			// For COD, create order immediately with isPaid=false
			const codOrderData = {
				...orderData,
				isPaid: false,
				status: status || 'pending',
				dueAmount: Number(cart?.total) - Number(paymentAmount || 0),
			};

			const order = new Order(codOrderData) as OrderType;
			const saved = (await order.save()) as any;

			// Send notifications
			await sendGuestOrderNotifications(
				address?.email || email,
				address?.phone,
				saved._id,
				saved.invoice,
				saved.total,
				findShop?.name || 'HINT'
			);

			// Reduce stock of items
			await reduceGuestProductStock(cart.items);

			return res.status(201).json(saved);
		} else if (paymentMethod === 'sslcommerz') {
			// For SSL, store order data temporarily without creating actual order
			// and without reducing stock yet
			//
			// Initialize SSLCommerz payment
			const store_id = process.env.STORE_ID;
			const store_passwd = process.env.STORE_PASS;
			const is_live = false; // true for live, false for sandbox

			// Prepare data for SSLCommerz
			const sslData = {
				total_amount: cart.total,
				currency: 'BDT',
				tran_id: transactionId,
				success_url: `${process.env.API_URL}/app-api/orders/success/${transactionId}`,
				fail_url: `${process.env.API_URL}/app-api/orders/fail/${transactionId}`,
				cancel_url: `${process.env.API_URL}/app-api/orders/cancel/${transactionId}`,
				ipn_url: `${process.env.API_URL}/app-api/orders/ipn/${transactionId}`,
				shipping_method: 'Courier',
				product_name:
					cart.items
						.map((item: any) => item.title)
						.join(', ')
						.substring(0, 50) || 'Product',
				product_category: 'Mixed',
				product_profile: 'general',
				cus_name: address.name || 'Guest Customer',
				cus_email: address.email || email || 'guest@example.com',
				cus_add1: address.address || 'Address',
				cus_add2: '',
				cus_city: '',
				cus_state: '',
				cus_postcode: '',
				cus_country: 'Bangladesh',
				cus_phone: address.phone || '',
				cus_fax: '',
				ship_name: address.name || 'Guest Customer',
				ship_add1: address.address || 'Address',
				ship_add2: '',
				ship_city: 'Dhaka',
				ship_state: 'Dhaka',
				ship_postcode: '1220',
				ship_country: 'Bangladesh',
			};

			const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

			// Store order data in pending payments collection
			const completeOrderData = {
				...orderData,
				isPaid: true, // Will be true when payment succeeds
				status: 'processing', // Status for paid orders
				dueAmount: 0, // Fully paid
			};

			const savePayment = await PendingGuestPayment.create({
				transactionId,
				orderData: completeOrderData,
				items: cart.items,
			});

			// Initialize SSLCommerz payment
			const apiResponse = await sslcz.init(sslData);
			const redirectUrl = apiResponse?.GatewayPageURL;

			return res.status(200).json({
				url: redirectUrl,
				transactionId: transactionId,
			});
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

// Helper function to send guest order notifications
const sendGuestOrderNotifications = async (
	email: string,
	phone: string,
	orderId: string | any,
	invoiceId: string | any,
	total: number,
	shopName: string
) => {
	// Send email notification
	sendMail({
		title: shopName,
		to: email,
		subject: 'Order Placed',
		body: `Thank you for shopping at ${shopName}. Your order has been placed successfully. Order id: ${invoiceId}, Total: ${total}. Download your invoice from here: ${process.env.WEBSITE}/my-purchase/${orderId}/invoice`,
	});

	// Send SMS notification if phone number is available
	if (phone) {
		sendSMS({
			receiver: phone,
			message: `Thank you for shopping at ${shopName}. Invoice: ${invoiceId}, Tk. ${total}. Details: ${process.env.WEBSITE}/my-purchase/${orderId}/invoice. Shop Online: ${process.env.WEBSITE}`,
		});
	}
};

// Helper function to reduce stock quantities for guest orders
const reduceGuestProductStock = async (items: any[]) => {
	for (const item of items) {
		try {
			// Find the product
			const product = await Product.findById(item._id);

			if (!product) {
				console.error(`Product not found: ${item._id}`);
				continue;
			}

			// Check if the product has variations
			if (
				product.variations &&
				product.variations.length > 0 &&
				item.variantId
			) {
				// Find the specific variant
				const variantIndex = product.variations.findIndex(
					(variant: any) => variant._id.toString() === item.variantId
				);

				if (variantIndex === -1) {
					console.error(
						`Variant not found for product ${item._id}: ${item.variantId}`
					);
					continue;
				}

				// Reduce stock for the specific variant
				product.variations[variantIndex].stock -= item.qty;

				// Update total stock
				product.stock = product.variations.reduce(
					(total: number, variant: any) => total + variant.stock,
					0
				);
			} else {
				// If no variations, reduce the main product stock
				product.stock -= item.qty;
			}

			// Save the updated product
			await product.save();
		} catch (error) {
			console.error(`Error reducing stock: ${error}`);
			throw error;
		}
	}
};

export {
	PendingGuestPayment,
	reduceGuestProductStock,
	sendGuestOrderNotifications,
};
export default addAppOrder;
