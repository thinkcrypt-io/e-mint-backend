import { getErrorMessage } from '../../../lib/index.js';
import { Shop } from '../../../models/index.js';
import { Response } from 'express';
import mongoose from 'mongoose';

const getThemeContent = (model: mongoose.Model<any>) => {
	return async (req: any, res: any): Promise<Response> => {
		try {
			const queryHelper = (req as any).queryHelper || {};

			let data = await model.findOne(queryHelper).populate('shop');

			if (!data) {
				const shop = await Shop.findOne({ _id: req.shop });
				const newStore = new model({
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
				data = await model.findOne({ _id: saved._id }).populate('shop');
			}

			return res.status(200).json(data);
		} catch (e: any) {
			const message = getErrorMessage(e);
			return res.status(500).json({ message });
		}
	};
};

export default getThemeContent;
