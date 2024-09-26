import { Response } from 'express';
import Store from '../../models/store/store.model.js';

const updateContent = async (req: any, res: any): Promise<Response> => {
	const type: string = req?.query?.type || 'content';
	const content = req.body;
	try {
		const data = await Store.findOne({});
		if (!data) {
			return res.status(404).json({ message: 'Store not found' });
		}

		// return res.status(200).json(Object.keys(content));
		// Assuming data and content are already defined
		Object.keys(content).forEach(key => {
			if (key in data[type]) {
				if (typeof content[key] === 'object' && content[key] !== null) {
					Object.keys(content[key]).forEach(subKey => {
						data[type][key][subKey] = content[key][subKey];
					});
				} else {
					data[type][key] = content[key];
				}
			}
		});
		const saved = await data.save();
		return res.status(200).json(saved);
	} catch (e: any) {
		console.log(e.message);
		const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default updateContent;
