import { Theme, PurchasedTheme } from '../../models/index.js';
import { Response } from 'express';

const purchaseTheme = async (req: any, res: Response) => {
	try {
		const { theme } = req.body;

		const getTheme = await Theme.findById(theme);
		if (!getTheme) return res.status(404).json({ message: 'Theme not found' });

		const makePurchase = new PurchasedTheme({
			theme: getTheme._id,
			shop: req.shop,
			price: getTheme.price,
			name: getTheme.name,
			isActivated: false,
			isDeployed: false,
		});

		const savePurchase = await makePurchase.save();
		if (!savePurchase) return res.status(400).json({ message: 'Failed to purchase theme' });

		return res.status(200).json(savePurchase);
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default purchaseTheme;
