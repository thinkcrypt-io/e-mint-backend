import Joi from 'joi';

import Otp from '../../../models/otp/otp.model.js';
import sendSMS from '../../../controllers/util/sendSms.controller.js';

const generateOTP = (length = 6) => {
	const characters = '0123456789';
	let otp = '';
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length);
		otp += characters[randomIndex];
	}
	return otp;
};

const generateOtpController = async (req: any, res: any) => {
	const { error } = validate(req.body);
	if (error) return res.status(400).json({ message: error.details[0].message });
	try {
		const { phone } = req.body;

		const otp = generateOTP(4);

		const smsData = await sendSMS({
			receiver: phone,
			message: `Your order confirmation code is ${otp}`,
		});

		if (!smsData.success) {
			console.log(`Error Sending SMS, ${smsData.data}`);
			return res.status(500).json({ message: 'Error Sending OTP, Please try again' });
		}

		const newData = new Otp({ otp, recipient: phone, isActive: true });
		const saved = await newData.save();

		return res.status(201).json({ message: 'OTP sent successfully', data: saved });
	} catch (e: any) {
		console.error(e);
		res.status(500).json({ message: e.message });
	}
};

const validate = (data: any): Joi.ValidationResult => {
	const schema = Joi.object({
		phone: Joi.string().min(11).max(11).pattern(new RegExp('^01\\d{9}$')).required().messages({
			'any.required': 'Phone is required',
			'string.min': 'Phone must be at least 11 characters long',
			'string.max': 'Phone must be at most 11 characters long',
			'string.pattern.base': 'Invalid Phone Number format',
		}),
	});
	return schema.validate(data);
};

export default generateOtpController;
