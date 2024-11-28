import { Response } from 'express';
import sendSMS from '../util/sendSms.controller.js';

import { Shop, Customer } from '../../models/index.js';
import { SMS } from '../../models/sms/index.js';

const MESSAGE_COST = 0.4;
const CHARACTERS_PER_MESSAGE = 70;

const calculateTotalCost = (message: string, ids: string[]): number => {
	// Calculate the number of messages based on the character count
	const numberOfMessages = Math.ceil(message?.length / CHARACTERS_PER_MESSAGE);

	// Calculate the total cost based on the number of messages
	const totalCost = numberOfMessages * MESSAGE_COST;
	return totalCost;
};

const buldSmsController = async (req: any, res: Response): Promise<Response> => {
	const { ids, message } = req.body;
	try {
		const shop = await Shop.findById(req.shop);
		if (!shop) return res.status(404).json({ message: 'Shop not found' });

		const totalCost = calculateTotalCost(message, ids);

		if (shop.smsBalance < totalCost)
			return res.status(400).json({ message: 'Insufficient SMS balance, Please recharge' });

		const customers = await Customer.find({ _id: { $in: ids } });
		if (!customers) return res.status(404).json({ message: 'Customers not found' });

		const numbers = [];

		const phoneNumberPattern = /^01[3-9]\d{8}$/;

		for (const customer of customers) {
			if (customer?.phone && phoneNumberPattern.test(customer.phone)) {
				numbers.push(customer.phone);
				const createMsgLog = new SMS({
					message,
					count: Math.ceil(message?.length / CHARACTERS_PER_MESSAGE),
					recipient: customer.phone,
					status: 'delivered',
					source: 'inventory',
					shop: req.shop,
					rate: Math.ceil(message?.length / CHARACTERS_PER_MESSAGE) * MESSAGE_COST,
				});
				await createMsgLog.save();
			}
		}

		const toSend = numbers.join(',');

		if (numbers.length > 0) {
			sendSMS({
				receiver: toSend,
				message: message,
			});
		}

		shop.smsBalance -= totalCost;
		shop.smsExpense += totalCost;

		await shop.save();

		return res.status(201).json({ message: 'SMS sent successfully' });
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default buldSmsController;
