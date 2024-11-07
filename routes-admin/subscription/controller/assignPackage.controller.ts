import { Subscription, UserSubscription, Shop } from '../../../models/index.js';
import { Request, Response } from 'express';

const assignPackageController = async (req: any, res: Response) => {
	try {
		const { id: shop } = req.params;
		const { subscription, purchaseDate, isPaid } = req.body;

		const findPackage = await Subscription.findById(subscription);
		const findShop = await Shop.findById(shop);

		if (!findPackage) return res.status(404).json({ message: 'Package not found' });
		if (!findShop) return res.status(404).json({ message: 'Shop not found' });

		// Get the current date as the start date
		const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();

		// Calculate the end date by adding the duration in days to the start date
		const endDate = new Date(startDate);
		endDate.setDate(startDate.getDate() + findPackage.duration);

		const newSubscription = new UserSubscription({
			shop,
			subscription: subscription,
			start: startDate || Date.now(),
			end: endDate,
			renewal: endDate,
			purchaseDate: purchaseDate || Date.now(),
			isPaid: isPaid || true,
			isActive: true,
			addedBy: req.user._id,
			price: findPackage.amount,
		});

		const savedSubscription = await newSubscription.save();

		const prevPackage = await UserSubscription.findById(findShop.package);
		if (prevPackage) {
			prevPackage.isActive = false;
			await prevPackage.save();
		}

		findShop.package = savedSubscription._id;
		findShop.expire = endDate;
		findShop.isActive = true;
		const saveShop = await findShop.save();
		return res.status(200).json({ shop: saveShop, subscription: savedSubscription });
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default assignPackageController;
