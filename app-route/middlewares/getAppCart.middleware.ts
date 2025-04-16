import { Request, Response } from 'express';

// import { ProductType } from '../../lib/types/model.types.js';

import Order from '../../models/order/order.model.js';
import Product from '../../models/products/products.model.js';
import Coupon from '../../models/coupon/coupon.model.js';

const getAppCart = async (req: Request, res: Response): Promise<Response> => {
	try {
		let subTotal = 0;
		let vat = 0;
		let cartItems = [];
		let discount = 0;
		let couponId;
		let totalItems = 0;

		const { coupon, shipping = 0 } = req.body;

		const couponData = await Coupon.findOne({
			code: coupon,
			shop: (req as any).shop,
			isActive: true,
			validTill: { $gte: new Date() },
		});

		if (coupon) {
			if (!couponData)
				return res
					.status(400)
					.json({ message: `Coupon ${coupon} is invalid or is expired` });

			// const orders = await Order.countDocuments({
			// 	user: (req as any).user._id,
			// 	coupon: couponData._id,
			// 	shop: (req as any).shop,
			// });

			// if (orders >= couponData.maxUsePerUser)
			// 	return res
			// 		.status(400)
			// 		.json({ message: `Coupon ${coupon} has been used maximum number of times` });

			const totalCouponUse = await Order.countDocuments({
				coupon: couponData._id,
				shop: (req as any).shop,
			});

			if (totalCouponUse >= couponData.maxUse)
				return res
					.status(400)
					.json({
						message: `Coupon ${coupon} has been used maximum number of times`,
					});

			couponId = couponData._id;
		}

		const items = req.body.items || []; // Extract the array of objects from req.body

		for (const item of items) {
			const product = (await Product.findById(item.id)) as any; // Fetch the product from the database

			if (!product)
				return res
					.status(400)
					.json({ message: `Product ${item.id} not found` });

			// if (product.price === item.price) {
			// Compare the prices
			subTotal += item.price * item.qty; // Add to the total
			const itemVat = (item.price * item.qty * product.vat) / 100;
			vat += itemVat;
			totalItems = totalItems + item.qty;
			const cartItem = {
				_id: product._id,
				name: product.name,
				image: product.image,
				totalPrice: product.price * item.qty,
				vat: itemVat,
				qty: item.qty,
				unitPrice: item.price,
			};
			cartItems.push(cartItem);
			// } else {
			// 	return res.status(400).json({ message: `Price mismatch for product ${item.id}` });
			// }
		}

		if (couponData) {
			if (couponData.isFlat) {
				discount = couponData.maxAmount;
			} else {
				const calculatedDiscount =
					(subTotal * (couponData as any).percentage) / 100;
				discount = Math.min(calculatedDiscount, couponData.maxAmount);
			}
		}

		const isOrderValueValid = couponData
			? subTotal >= couponData.minOrderValue
			: true;

		let total = isOrderValueValid
			? subTotal + vat - discount + shipping - (req?.body?.discount || 0)
			: subTotal + vat + shipping;

		return res.json({
			subTotal,
			total,
			vat,
			discount: isOrderValueValid ? discount + (req.body.discount || 0) : 0,
			coupon,
			couponId,
			shipping,
			totalItems,
			items: cartItems,
		});
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default getAppCart;
