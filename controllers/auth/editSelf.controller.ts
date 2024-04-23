import Joi from 'joi';
import User from '../../models/user/user.model.js';
import { Response } from 'express';

const editSelfController = async (req: any, res: Response): Promise<Response> => {
	const { error } = validate(req.body);

	if (error) return res.status(400).json({ message: error.details[0].message });

	try {
		const { name } = req.body;

		const data = (await User.findById(req.user._id).select('-password')) as any;

		data.name = name;
		const saved = await data.save();

		return res.status(200).json(saved);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		name: Joi.string().min(4).required().messages({
			'any.required': 'Name is required',
			'string.min': 'Name must be at least 4 characters long',
			'string.empty': 'Name Cannot be empty',
		}),
	});
	return schema.validate(data);
}

export default editSelfController;
