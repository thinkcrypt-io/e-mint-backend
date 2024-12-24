import Joi from 'joi';
import User from '../../models/user/user.model.js';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import sendMail from '../mail/sendMail.controller.js';
import geoip from 'geoip-lite';
import { Shop } from '../../models/index.js';
import { UAParser } from 'ua-parser-js';

type RequestType = Request & { body: any };

const loginController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		const { email, password, lead, from }: any = req.body;

		if (error) return res.status(400).json({ message: error.details[0].message });
		let user = await User.findOne({ email });

		const shop = await Shop.findById(user.shop);

		let isAdmin = false;

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

		const parser = new UAParser();
		const userAgent = req.headers['user-agent'];
		const deviceDetails: any = userAgent && parser.setUA(userAgent).getResult();

		const ip = req.clientIp || req.ip || 'Unknown IP';
		const geo = geoip.lookup(ip); // Get location details from IP

		const location = geo ? `${geo?.city}, ${geo?.region}, ${geo?.country}` : 'Unknown Location';

		sendMail({
			to: 'log.mintapp@gmail.com',
			subject: `Login Notification, ${new Date().toLocaleString()}`,
			body: `New Login from account. \n\n Email: ${email}, \n Shop: ${shop?.name} \n Shop Id: ${
				shop?.id
			} \n Time: ${new Date().toLocaleString()} \n User Ip: ${ip} \n Location: ${location} \n Browser: ${
				deviceDetails?.browser?.name
			} \n OS: ${deviceDetails?.os?.name} \n Device: ${deviceDetails?.device?.type} \n ${
				from ? `From: ${from}` : ''
			} \n ${lead ? `Lead: ${lead}` : ''}`,
		});

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
		lead: Joi.string().allow(null, ''),
		from: Joi.string().allow(null, ''),
		password: Joi.string().min(8).max(255).required().messages({
			'string.min': 'Password must be 8 characters long',
			'any.required': 'Password is required',
		}),
	});
	return schema.validate(data);
}

export default loginController;
