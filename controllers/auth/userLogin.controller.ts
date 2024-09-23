import Joi from 'joi';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import Customer from '../../models/customer/customer.model.js';

type RequestType = Request & { body: any };

const userLoginController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		const { email, password }: any = req.body;

		if (error) return res.status(400).json({ message: error.details[0].message });
		let user = await Customer.findOne({ email, isRegisteredOnline: true });

		if (!user)
			return res.status(400).json({
				status: 'error',
				message: 'This email is not yet registered',
			});

		if (!user.isActive) {
			return res.status(400).json({
				status: 'error',
				message: 'Your account is deactivated ,please contact support',
			});
		}

		const validPassword = await bcrypt.compare(password, user.password);

		if (!validPassword)
			return res.status(400).json({ status: 'error', message: 'Incorrect password' });

		const token: string = user.generateAuthToken();

		return res.status(200).json({ token: `Bearer ${token}` });
	} catch (e: any) {
		return res.status(500).send({ status: 'error', message: e.message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		email: Joi.string().max(255).required().email().messages({
			'any.required': 'Email is required',
			'string.email': 'Invalid Email, please enter a valid email address',
		}),
		password: Joi.string().min(8).max(255).required().messages({
			'string.min': 'Password must be 8 characters long',
			'any.required': 'Password is required',
		}),
	});
	return schema.validate(data);
}

export default userLoginController;
