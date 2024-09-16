import { Response } from 'express';
import Store from '../../models/store/store.model.js';
import Joi from 'joi';
import Category from '../../models/category/category.model.js';
import Collection from '../../models/collection/collection.model.js';

const addProductList = async (req: any, res: any): Promise<Response> => {
	const { error } = validate(req.body);
	const { type, title, subTitle, id, priority } = req.body;

	try {
		const data = await Store.findOne({});
		if (!data) {
			return res.status(404).json({ message: 'Store not found' });
		}

		if (type === 'category') {
			const ifCategoryExist = await Category.findById(id);
			if (!ifCategoryExist) {
				return res.status(404).json({ message: 'Category not found' });
			}
		} else if (type === 'collection') {
			const ifCollectionExist = await Collection.findById(id);
			if (!ifCollectionExist) {
				return res.status(404).json({ message: 'Collection not found' });
			}
		} else {
			return res.status(400).json({ message: 'Invalid type' });
		}

		if (!Array.isArray(data.content.productList)) {
			data.content.productList = [];
		}

		data.content.productList.push({ type, title, subTitle, id, priority });

		const saved = await data.save();
		return res.status(200).json(saved);
	} catch (e: any) {
		console.log(e.message);
		const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : e.message;
		return res.status(500).json({ message: message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		type: Joi.string().max(255).required().messages({
			'any.required': 'Type is required',
		}),
		title: Joi.string().max(255).allow(''),
		subTitle: Joi.string().max(255).allow(''),
		id: Joi.string().max(255).required().messages({
			'any.required': 'Id is required',
		}),
		priority: Joi.number().messages({
			'number.base': 'Priority must be a number',
		}),
	});
	return schema.validate(data);
}

export default addProductList;
