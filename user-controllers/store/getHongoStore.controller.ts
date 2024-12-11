import { Response } from 'express';
import Shop from '../../models/shop/shop.model.js';
import Hongo from '../../models/store/hongo.model.js';

const getHongoStore = async (req: any, res: any): Promise<Response> => {
	try {
		let data = await Hongo.findOne({
			shop: req.shop || '0001',
		}).populate('shop');
		if (!data) {
			const shop = await Shop.findOne({ id: req.shop });
			const newStore = new Hongo({
				shop: req.shop,
				basic: {
					name: shop?.name,
					logo: shop?.logo,
					phone: shop?.phone,
					email: shop?.email,
				},
				socials: {
					facebook: shop?.facebook,
					twitter: shop?.twitter,
					instagram: shop?.instagram,
					linkedin: shop?.linkedin,
					youtube: shop?.youtube,
				},
				isActive: true,
			});
			const saved = await newStore.save();
			data = await Hongo.findOne({ _id: saved._id }).populate('shop');
		}
		return res.status(200).json(data);
	} catch (e: any) {
		console.log(e.message);
		const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
		return res.status(500).json({ message: message });
	}
};

export default getHongoStore;
