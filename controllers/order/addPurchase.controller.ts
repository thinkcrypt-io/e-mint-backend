import { Response } from 'express';
import { Purchase, Counter, Payment } from '../../imports.js';

const addPurchase = async (req: any, res: Response): Promise<Response> => {
	const {
		supplier,
		items,
		date,
		note,
		paidAmount,
		shippingCost,
		discount,
		subTotal,
		total,
		status,
	} = req.body;

	try {
		let counter = await Counter.findOne({ shop: req.shop, slug: 'purchase' });
		if (!counter) counter = new Counter({ sequenceValue: 0, shop: req.shop, slug: 'purchase' });
		counter.sequenceValue += 1;
		await counter.save();

		const invoice = counter.sequenceValue.toString().padStart(4, '0');

		items.forEach(async (item: any) => {
			item.batchNumber = invoice;
		});

		const purchase = new Purchase({
			invoice,
			supplier,
			shop: req.shop,
			date,
			items,
			status,
			isDelivered: status === 'delivered',
			subTotal,
			shippingCost,
			total,
			discount,
			paidAmount,
			dueAmount: total - paidAmount,
			note,
			addedBy: req.user._id,
		});

		const saved = await purchase.save();

		let savedPayment = null;

		if (paidAmount > 0) {
			const payment = new Payment({
				shop: req.shop,
				purchaseInvoice: invoice,
				amount: paidAmount,
				purchase: saved._id,
				date: date,
				reference: invoice,
				tags: ['purchase'],
				note,
				account: 'debit',
				supplier: supplier,
				currency: 'BDT',
			});
			savedPayment = await payment.save();
		}

		return res.status(201).json({
			message: `Purchase id: ${saved._id} added successfully`,
			order: saved,
			payment: savedPayment,
		});
	} catch (e: any) {
		console.error(e);
		return res.status(500).json({ message: e.message });
	}
};

export default addPurchase;
