import Joi from 'joi';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { Admin, validatorHelper as vh, getErrorMessage } from '../../../imports.js';

type Body = {
	name: string;
	phone?: string;
	password: string;
};

type RequestType = Request & {
	body: Body;
	params: { token: string };
};

const acceptInvitationController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		if (error) return res.status(400).json({ message: error.details[0].message });

		const { token } = req.params;
		const { name, phone, password } = req.body;
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

		const admin = (await Admin.findOne({
			invitationToken: hashedToken,
			invitationExpires: { $gt: new Date() },
			invitationStatus: 'pending',
		}).select('+invitationToken +invitationExpires')) as any;

		if (!admin) {
			return res.status(400).json({ message: 'This invitation link is invalid or has expired' });
		}

		admin.name = name;
		if (phone) admin.phone = phone;
		admin.password = password;
		admin.invitationStatus = 'accepted';
		admin.invitationToken = undefined;
		admin.invitationExpires = undefined;
		await admin.save();

		const token_: string = admin.generateAuthToken();

		return res.status(200).json({ message: 'Welcome aboard', token: `Bearer ${token_}` });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		name: Joi.string().min(2).max(50).required().messages({
			'any.required': 'Name is required',
			'string.min': 'Name must be at least 2 characters long',
		}),
		phone: Joi.string().allow('').optional(),
		password: vh.password,
	});
	return schema.validate(data);
}

export default acceptInvitationController;
