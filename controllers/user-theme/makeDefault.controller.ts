import { PurchasedTheme, Shop } from '../../models/index.js';
import { Response } from 'express';

const makeDefault = async (req: any, res: Response) => {
	try {
		const { id } = req.params;

		const getShop = await Shop.findById(req.shop);
		if (!getShop) return res.status(404).json({ message: 'Shop not found' });

		const getPurchasedTheme = await PurchasedTheme.findById(id);
		if (!getPurchasedTheme) return res.status(404).json({ message: 'Purchased theme not found' });

		getShop.activeTheme = getPurchasedTheme._id;
		getShop.dateActivated = new Date();

		getPurchasedTheme.isActivated = true;

		// Activate the selected purchased theme
		getShop.activeTheme = getPurchasedTheme._id;
		getShop.dateActivated = new Date();

		const savePurchase = await getPurchasedTheme.save();

		// Deactivate all other purchased themes for the shop
		await PurchasedTheme.updateMany(
			{ shop: req.shop, _id: { $ne: id } },
			{ $set: { isActivated: false, activatedAt: null } }
		);

		const saveShop = await getShop.save();

		return res.status(200).json(savePurchase);
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default makeDefault;
