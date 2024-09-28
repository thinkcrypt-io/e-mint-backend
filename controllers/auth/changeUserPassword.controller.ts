import Joi from 'joi';
import User from '../../models/user/user.model.js';
import { Response } from 'express';
import bcrypt from 'bcrypt';
import Customer from '../../models/customer/customer.model.js';

const changeUserPassword = async (req: any, res: Response): Promise<Response> => {
	const { error } = validate(req.body);
	if (error) return res.status(400).json({ message: error.details[0].message });
	try {
		const id: string = req.user._id;

		const { oldPassword, password, confirm } = req.body;
		if (password != confirm) return res.status(400).send({ message: 'Passwords do not match' });
		const data = (await Customer.findById(id)) as any;

		const validPassword = await bcrypt.compare(oldPassword, data.password);
		if (!validPassword) return res.status(400).json({ message: 'Incorrect Password' });

		const ifSame = await bcrypt.compare(password, data.password);
		if (ifSame)
			return res
				.status(400)
				.json({ message: 'New password cannot be the same as the old password' });

		const salt = await bcrypt.genSalt(10);
		data.password = await bcrypt.hash(password, salt);

		const saved = await data.save();

		return res.status(200).json(saved);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		oldPassword: Joi.string().min(6).max(255).required().messages({
			'any.required': 'Old Password is required',
			'string.min': 'Old Password must be 6 characters long',
		}),
		password: Joi.string().min(6).max(255).required().messages({
			'any.required': 'Password is required',
			'string.min': 'Password must be 6 characters long',
		}),
		confirm: Joi.ref('password'),
	});
	return schema.validate(data);
}

export default changeUserPassword;
