import { Response } from 'express';
import Store from '../../models/store/store.model.js';

const deleteProductList = async (req: any, res: any): Promise<Response> => {
	const id = req.params.id;

	try {
		const queryHelper = (req as any).queryHelper || {};
		let data = await Store.findOne(queryHelper);
		if (!data) {
			return res.status(404).json({ message: 'Store not found' });
		}

		// Ensure content.productList exists and is an array
		if (!Array.isArray(data.content.productList)) {
			return res.status(400).json({ message: 'Product list is not an array' });
		}

		// Filter out the item with the given id
		const newArr = data.content.productList.filter((product: any) => product._id != id);

		data.content.productList = newArr;

		const saved = await data.save();
		return res.status(200).json(saved);
	} catch (e: any) {
		console.log(e.message);
		const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
		return res.status(500).json({ message: message });
	}
};

export default deleteProductList;
