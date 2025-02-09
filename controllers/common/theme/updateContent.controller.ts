import { Response } from 'express';
import mongoose from 'mongoose';

const updateContent = (model: mongoose.Model<any>) => {
	return async (req: any, res: any): Promise<Response> => {
		const type: string = req?.query?.type || 'content';
		const content = req.body;
		try {
			const queryHelper = (req as any).queryHelper || {};
			let data = await model.findOne(queryHelper);
			if (!data) {
				return res.status(404).json({ message: 'Store not found' });
			}

			if (type == 'all') {
				data.basic = content.basic;
				data.content = content.content;
			} else {
				Object.keys(content).forEach(key => {
					if (key in data[type]) {
						if (Array.isArray(content[key])) {
							// Replace the entire array
							data[type][key] = content[key];
						} else if (typeof content[key] === 'object' && content[key] !== null) {
							Object.keys(content[key]).forEach(subKey => {
								data[type][key][subKey] = content[key][subKey];
							});
						} else {
							data[type][key] = content[key];
						}
					}
				});
			}

			const saved = await data.save();
			return res.status(200).json(saved);
		} catch (e: any) {
			console.log(e.message);
			const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
			return res.status(500).json({ message: e.message });
		}
	};
};

export default updateContent;
