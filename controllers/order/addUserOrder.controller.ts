import { Response } from 'express';
import Order from '../../models/order/order.model.js';
import Product from '../../models/products/products.model.js';
import sendMail from '../../library/controllers/marketing/mail/sendMail.controller.js';
import sendSMS from '../util/sendSms.controller.js';
import { Shop } from '../../imports.js';

const addUserOrder = async (req: any, res: Response): Promise<Response> => {
	const { cart, isPaid, address, paymentMethod, paymentAmount, paidAmount, status, note } =
		req.body;

	try {
		const order = new Order({
			// store: (req as any).store,
			user: (req as any).user._id,
			items: cart.items,
			total: cart.total,
			vat: cart.vat,
			subTotal: cart.subTotal,
			coupon: cart.couponId,
			isPaid: false,
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
		});

		const findShop = await Shop.findById(req.shop);

		const saved = (await order.save()) as any;

		sendMail({
			title: findShop?.name,
			to: req.user.email,
			subject: 'Order Placed',
			body: `Your order has been placed successfully. Order id: ${saved._id}, Total: ${saved.total}`,
		});

		if (address?.phone) {
			sendSMS({
				receiver: address?.phone,
				message: `Thank you for shopping at ${findShop?.name}. Invoice: ${saved._id}, Tk. ${saved.total}. Details: ${process.env.WEBSITE}/invoice/${saved._id}. Shop Online: ${process.env.WEBSITE}`,
			});
		}

		// Reduce stock of items
		for (const item of cart.items) {
			const product = await Product.findById(item._id);
			if (product) {
				product.stock = product.stock - item.qty;
				await product.save();
			}
		}

		return res
			.status(201)
			.json({ message: `Order id: ${saved._id} added successfully`, order: saved });
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default addUserOrder;
