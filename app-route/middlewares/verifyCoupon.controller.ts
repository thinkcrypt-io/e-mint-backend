import { Request, Response } from 'express';

// import { ProductType } from '../../lib/types/model.types.js';

import Order from '../../models/order/order.model.js';
import Product from '../../models/products/products.model.js';
import Coupon from '../../models/coupon/coupon.model.js';

const verifyCoupon = async (req: Request, res: Response): Promise<Response> => {
	try {
		const { coupon } = req.body;

		const couponData = await Coupon.findOne({
			code: coupon,
			shop: (req as any).shop,
			isActive: true,
			validTill: { $gte: new Date() },
		});

		if (!couponData)
			return res.status(400).json({ message: `Coupon ${coupon} is invalid or is expired` });

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
				.json({ message: `Coupon ${coupon} has been used maximum number of times` });

		return res.status(200).json({ coupon: couponData });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default verifyCoupon;
