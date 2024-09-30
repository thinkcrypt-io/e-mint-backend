import { Response } from 'express';
import sendSMS from '../util/sendSms.controller.js';
import Customer from '../../models/customer/customer.model.js';

const buldSmsController = async (req: any, res: Response): Promise<Response> => {
	const { ids, message } = req.body;
	try {
		const customers = await Customer.find({ _id: { $in: ids } });

		if (!customers) {
			return res.status(404).json({ message: 'Customers not found' });
		}

		const numbers = [];

		const phoneNumberPattern = /^01[3-9]\d{8}$/;

		for (const customer of customers) {
			if (customer?.phone && phoneNumberPattern.test(customer.phone)) {
				numbers.push(customer.phone);
			}
		}

		const toSend = numbers.join(',');

		if (numbers.length > 0) {
			sendSMS({
				receiver: toSend,
				message: message,
			});
		}

		return res.status(201).json({ message: 'SMS sent successfully' });
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default buldSmsController;
