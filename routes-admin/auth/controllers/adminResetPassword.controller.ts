import Joi from 'joi';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { Admin, validatorHelper as vh, getErrorMessage } from '../../../imports.js';

type Body = {
	password: string;
};

type RequestType = Request & {
	body: Body;
	params: { token: string };
};

const adminResetPasswordController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		if (error) return res.status(400).json({ message: error.details[0].message });

		const { token } = req.params;
		const { password } = req.body;
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

		const admin = (await Admin.findOne({
			resetPasswordToken: hashedToken,
			resetPasswordExpires: { $gt: new Date() },
		}).select('+resetPasswordToken +resetPasswordExpires')) as any;

		if (!admin) {
			return res.status(400).json({ message: 'This reset link is invalid or has expired' });
		}

		admin.password = password;
		admin.resetPasswordToken = undefined;
		admin.resetPasswordExpires = undefined;
		await admin.save();

		return res.status(200).json({ message: 'Password has been reset successfully' });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		password: vh.password,
	});
	return schema.validate(data);
}

export default adminResetPasswordController;
