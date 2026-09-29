import Joi from 'joi';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { Admin, validatorHelper as vh, getErrorMessage } from '../../../imports.js';
import { startLogin } from '../../../library/controllers/twoFactor/twoFactor.service.js';
import { issueSession } from '../../../library/functions/sessions.function.js';

type Body = {
	email: string;
	password: string;
};

type RequestType = Request & {
	body: Body;
};

const adminLoginController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		const { email, password }: Body = req.body;

		if (error) return res.status(400).json({ message: error.details[0].message });
		// The password is select: false on the model; only login reads it.
		let user = (await Admin.findOne({ email }).select('+password')) as any;

		if (!user)
			return res.status(400).json({
				message: 'This email is not yet registered',
			});

		if (!user.isActive)
			return res.status(400).json({
				message: 'Your account is deactivated ,please contact support',
			});

		const validPassword = await bcrypt.compare(password, user.password);

		if (!validPassword) return res.status(400).json({ message: 'Incorrect password' });

		// Two-factor on: the password only earns a ticket for the second step
		// (POST /auth/2fa/login/*), which hands out the token.
		if (user.twoFactorEnabled) return res.status(200).json({ twoFactor: await startLogin(user) });

		// A session per sign-in (device, last active), so it can be signed out alone.
		return res.status(200).json({ token: await issueSession(user, req, 'password') });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		email: vh.email,
		password: vh.password,
	});
	return schema.validate(data);
}

export default adminLoginController;
