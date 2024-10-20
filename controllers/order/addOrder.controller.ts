import { Response } from 'express';
import { OrderType, Product, Order, Payment } from '../../imports.js';

const addOrder = async (req: any, res: Response): Promise<Response> => {
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
	} = req.body;

	try {
		const order = new Order({
			user: (req as any).user._id,
			items: cart.items,
			total: cart.total,
			vat: cart.vat,
			subTotal: cart.subTotal,
			coupon: cart.couponId,
			isPaid: isPaid || cart?.total == paymentAmount ? true : false,
			address,
			status: status || 'pending',
			paymentMethod,
			customer: customer == 'guest' ? null : customer ? customer : (req as any).user._id,
			orderDate,
			paymentAmount,
			origin: 'pos',
			note,
			paidAmount,
			shippingCharge: cart.shipping,
			dueAmount: isPaid ? 0 : Number(cart?.total) - Number(paymentAmount || 0),
			discount: cart.discount,
			profit: cart.profit,
			shop: (req as any).shop,
		}) as OrderType;

		const saved = (await order.save()) as any;

		// Reduce stock of items
		for (const item of cart.items) {
			const product = await Product.findById(item._id);
			if (product) {
				product.stock = product.stock - item.qty;
				await product.save();
			}
		}
		if (paidAmount > 0) {
			const payment = new Payment({
				shop: (req as any).shop,
				invoice: saved.invoice,
				amount: paymentAmount,
				order: saved._id,
				date: orderDate,
				trnxId: 'POS',
				reference: saved.invoice,
				tags: ['order'],
				note,
				account: 'credit',
				customer: saved?.customer,
				paymentMethod,
				currency: 'BDT',
			});
			const savePayment = await payment.save();
		}

		return res.status(201).json(saved);
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default addOrder;
