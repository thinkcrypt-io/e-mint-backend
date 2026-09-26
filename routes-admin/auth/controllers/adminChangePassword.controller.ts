import Joi from 'joi';
import { Response } from 'express';
import { Admin, validatorHelper as vh, getErrorMessage } from '../../../imports.js';

type Body = {
	oldPassword: string;
	password: string;
	confirm: string;
};

/**
 * The signed-in admin changes their own password (the "Change Password"
 * button on /settings). The admin app always called PUT auth/change-password,
 * but no admin route existed — it 404'd. The model's pre-save hook hashes the
 * new password, as it does for reset-password.
 */
const adminChangePasswordController = async (req: any, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		if (error) return res.status(400).json({ message: error.details[0].message });

		const { oldPassword, password } = req.body as Body;

		const admin = (await Admin.findById(req.user._id).select('+password')) as any;
		if (!admin) return res.status(404).json({ message: 'Admin not found' });

		if (!admin.password || !(await admin.checkPassword(oldPassword))) {
			return res.status(400).json({ message: 'The current password is incorrect' });
		}
		if (await admin.checkPassword(password)) {
			return res.status(400).json({ message: 'The new password must be different from the current one' });
		}

		admin.password = password;
		await admin.save();

		return res.status(200).json({ message: 'Password updated' });
	} catch (e: any) {
		return res.status(500).json({ message: getErrorMessage(e) });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		oldPassword: Joi.string().required().messages({
			'any.required': 'The current password is required',
			'string.empty': 'The current password is required',
		}),
		password: vh.password,
		confirm: Joi.any().valid(Joi.ref('password')).required().messages({
			'any.only': 'The new passwords do not match',
			'any.required': 'Confirm the new password',
		}),
	});
	return schema.validate(data);
}

export default adminChangePasswordController;
