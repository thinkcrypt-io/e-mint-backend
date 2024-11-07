import { Subscription, UserSubscription, Shop } from '../../../models/index.js';
import { Request, Response } from 'express';

const renewPackage = async (req: any, res: Response) => {
	try {
		const { id } = req.params;

		// Find the shop by ID
		const findShop = await Shop.findById(id).populate('package');
		if (!findShop) return res.status(404).json({ message: 'Shop not found' });

		// Check if the shop is already subscribed to a package
		if (!findShop.package)
			return res.status(404).json({ message: 'This shop is not subscribed to any package yet' });

		// Find the package associated with the shop
		const findPackage = await Subscription.findById(findShop?.package?.subscription);
		if (!findPackage) return res.status(404).json({ message: 'Package not found' });

		// Get the current date as the start date
		const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();

		// Calculate the end date by adding the duration in days to the previous expiration date
		const prevExpireDate = new Date(findShop.expire);
		const endDate = new Date(prevExpireDate);
		endDate.setDate(prevExpireDate.getDate() + findPackage.duration);

		const newSubscription = new UserSubscription({
			shop: id,
			subscription: findPackage._id,
			start: startDate || Date.now(),
			end: endDate,
			renewal: endDate,
			purchaseDate: Date.now(),
			isPaid: true,
			isActive: true,
			addedBy: req.user._id,
			price: findPackage.amount,
		});

		// Save the new subscription
		const savedSubscription = await newSubscription.save();

		// Deactivate the previous subscription
		const prevPackage = await UserSubscription.findById(findShop.package);
		if (prevPackage) {
			prevPackage.isActive = false;
			await prevPackage.save();
		}

		// Update the shop with the new subscription and expiration date
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

export default renewPackage;
