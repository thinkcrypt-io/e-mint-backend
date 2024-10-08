import { Request, Response } from 'express';
import { ProductType, Order, Product, Coupon } from '../../imports.js';

const getOrderTotal = async (req: any, res: Response): Promise<Response> => {
	try {
		let subTotal = 0;
		let vat = 0;
		let cartItems = [];
		let discount = 0;
		let couponId;
		let totalItems = 0;
		let profit = 0;

		const { coupon, shipping = 0 } = req.body;

		const couponData = await Coupon.findOne({
			code: coupon,
			// store: req.store,
			isActive: true,
			validTill: { $gte: new Date() },
		});

		if (coupon && req.user) {
			if (!couponData)
				return res.status(400).json({ message: `Coupon ${coupon} is invalid or is expired` });

			const orders = await Order.countDocuments({
				user: (req as any).user._id,
				coupon: couponData._id,
				// store: (req as any).store._id,
			});

			if (orders >= couponData.maxUsePerUser)
				return res
					.status(400)
					.json({ message: `Coupon ${coupon} has been used maximum number of times` });

			const totalCouponUse = await Order.countDocuments({
				coupon: couponData._id,
				store: (req as any).store._id,
			});

			if (totalCouponUse >= couponData.maxUse)
				return res
					.status(400)
					.json({ message: `Coupon ${coupon} has been used maximum number of times` });

			couponId = couponData._id;
		}

		const items = req.body.items || []; // Extract the array of objects from req.body

		for (const item of items) {
			const product = (await Product.findById(item?.id)) as ProductType; // Fetch the product from the database

			if (!product) return res.status(400).json({ message: `Product ${item.id} not found` });

			// if (product.price === item.price) {
			// Compare the prices

			// Calculate the total price of the product
			subTotal += item.price * item.qty; // Add to the total

			// Calculate the VAT
			const itemVat = (item.price * item.qty * (product.vat || 0)) / 100;
			vat += itemVat;

			// Calculate the total number of items
			totalItems = totalItems + item.qty;

			// Calculate the profit per unit
			const unitProfit = item.price - product.cost;
			const profit = unitProfit * item.qty;

			const cartItem = {
				_id: product._id,
				name: product.name,
				image: product.image,
				totalPrice: product.price * item.qty,
				vat: itemVat,
				qty: item.qty,
				unitPrice: item.price,
				unitProfit,
				profit,
			};
			cartItems.push(cartItem);
			// } else {
			// 	return res.status(400).json({ message: `Price mismatch for product ${item.id}` });
			// }
		}

		if (couponData && (req as any).user) {
			if (couponData.isFlat) {
				discount = couponData.maxAmount;
			} else {
				const calculatedDiscount = (subTotal * (couponData as any).percentage) / 100;
				discount = Math.min(calculatedDiscount, couponData.maxAmount);
			}
		}

		let total = subTotal + vat - discount + shipping - (req?.body?.discount || 0);
		const totalProfit = cartItems.reduce((total: number, item: any) => total + item.profit, 0);

		const totalDiscount = discount + (req.body.discount || 0);

		return res.json({
			subTotal,
			total,
			vat,
			discount: totalDiscount,
			coupon,
			couponId,
			shipping,
			totalItems,
			items: cartItems,
			profit: totalProfit - totalDiscount,
		});
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default getOrderTotal;
