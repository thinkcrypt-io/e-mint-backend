import { PurchasedTheme, Shop } from '../../models/index.js';
import { Response } from 'express';

const getActiveTheme = async (req: any, res: Response) => {
	try {
		const getShop = await Shop.findById(req.shop);
		if (!getShop) return res.status(404).json({ message: 'Shop not found' });

		const activeThemeId = getShop.activeTheme;

		if (!activeThemeId)
			return res.status(404).json({ message: 'No active theme found for this shop' });

		const activeTheme = await PurchasedTheme.findById(activeThemeId).populate('theme deployment');
		if (!activeTheme) return res.status(404).json({ message: 'Active theme not found' });

		return res.status(200).json(activeTheme);
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default getActiveTheme;
