import { Request, Response, RequestHandler } from 'express';
import mongoose from 'mongoose';

const updateThemeProductList = (model: mongoose.Model<any>): RequestHandler => {
	return async (req: Request, res: Response): Promise<Response> => {
		const { title, subTitle, id, type, priority } = req.body;
		const findId = req.params.id;

		try {
			const queryHelper = (req as any).queryHelper || {};
			let data = await model.findOne(queryHelper);
			if (!data) {
				return res.status(404).json({ message: 'Store not found' });
			}

			// Ensure content.productList exists and is an array
			if (!Array.isArray(data.content.productList)) {
				return res.status(400).json({ message: 'Product list is not an array' });
			}

			// Filter out the item with the given id
			let productToEdit = data.content.productList.find(
				(product: any) => product._id.toString() == findId
			);

			if (!productToEdit) {
				return res.status(404).json({ message: data.content.productList });
			}

			let newArr = data.content.productList.filter((product: any) => product._id != findId);

			// Update the product properties
			productToEdit.title = title || productToEdit.title;
			productToEdit.subTitle = subTitle || productToEdit.subTitle;
			productToEdit.type = type || productToEdit.type;
			productToEdit.id = id || productToEdit.id;
			productToEdit.priority = Number(priority) || productToEdit.priority;

			newArr.push(productToEdit);

			data.content.productList = newArr;

			const saved = await data.save();
			return res.status(200).json(saved);
		} catch (e: any) {
			console.log(e.message);
			const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
			return res.status(500).json({ message: message });
		}
	};
};

export default updateThemeProductList;
