import Joi from 'joi';
import bcrypt from 'bcrypt';
import User from '../../models/user/user.model.js';
import { Request, Response } from 'express';
import Customer from '../../models/customer/customer.model.js';

// {
//     "name": "John Doe",
//     "email": "john.doe@example.com",
//     "password": "password123",
//     "confirm": "password123",
//     "role": "user",
//     "phone": "12345678901"
// }

const userRegisterController = async (req: any, res: Response): Promise<Response> => {
	const { error } = validate(req.body);
	if (error) return res.status(400).send({ message: error.details[0].message });

	if (req.body.password != req.body.confirm)
		return res.status(400).send({ message: 'Passwords do not match' });

	try {
		const { name, email, password, confirm } = req.body;
		let user = await Customer.findOne({ email, shop: req.shop });

		if (user?.isRegisteredOnline)
			return res.status(400).json({
				status: 'error',
				message: 'This email is already registered',
			});

		if (password !== confirm) {
			return res.status(400).json({ message: 'Passwords do not match' });
		}

		if (user) {
			user.name = name;
			user.isRegisteredOnline = true;
			user.isActive = true;
			const salt = await bcrypt.genSalt(10);
			user.password = await bcrypt.hash(password, salt);

			const saved = await user.save();
			const token = user.generateAuthToken();

			return res
				.status(200)
				.header('x-auth-token', token)
				.json({ token: `Bearer ${token}`, userId: saved._id, type: 'regular' });
		}

		user = new Customer({
			name,
			email,
			password,
			isRegisteredOnline: true,
			isActive: true,
			shop: req.shop,
		});

		const salt = await bcrypt.genSalt(10);
		user.password = await bcrypt.hash(user.password, salt);

		const saved = await user.save();
		const token = user.generateAuthToken();

		return res
			.status(200)
			.header('x-auth-token', token)
			.json({ token: `Bearer ${token}`, userId: saved._id, type: 'new' });
	} catch (e: any) {
		return res.status(500).json({ message: e.message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		name: Joi.string().min(2).max(50),
		email: Joi.string().max(255).required().email().messages({
			'any.required': 'Email is required',
			'string.email': 'Invalid Email, please enter a valid email address',
		}),
		password: Joi.string().min(6).max(255).required().messages({
			'any.required': 'Password is required',
			'string.min': 'Password must be 6 characters long',
		}),

		confirm: Joi.ref('password'),
		phone: Joi.string().min(11).allow(null, ''),
	});
	return schema.validate(data);
}

export default userRegisterController;
