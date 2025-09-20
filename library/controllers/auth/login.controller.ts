import Joi from 'joi';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';

type Body = {
	email: string;
	password: string;
};

type RequestType = Request & {
	body: Body;
};

const loginController = ({ model, checkActive = true }: { model: any; checkActive?: boolean }) => {
	return async (req: RequestType, res: Response): Promise<Response> => {
		try {
			const { error } = validate(req.body);
			const { email, password }: Body = req.body;

			if (error) return res.status(400).json({ message: error.details[0].message });
			let user = (await model.findOne({ email })) as any;

			if (!user)
				return res.status(400).json({
					message: 'This email is not yet registered',
				});

			if (checkActive && !user.isActive)
				return res.status(400).json({
					message: 'Your account is deactivated ,please contact support',
				});

			const validPassword = await bcrypt.compare(password, user.password);

			if (!validPassword) return res.status(400).json({ message: 'Incorrect password' });

			const token: string = user?.generateAuthToken();

			return res.status(200).json({ token: `Bearer ${token}` });
		} catch (e: any) {
			const message = e.message || 'Something went wrong';
			console.error(message);
			return res.status(500).send({ message });
		}
	};
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

export default loginController;
