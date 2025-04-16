import { Response } from 'express';
import { PendingPayment } from './addUserOrder.controller.js';
const addSslCancel = async (req: any, res: Response) => {
	try {
		// Delete the pending payment record (no order was created yet)
		await PendingPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to cancel page
		res.redirect(`${process.env.WEBSITE}/payment/cancel/${req.params.transId}`);
	} catch (error) {
		console.error('Error handling payment cancellation:', error);
		res.status(500).redirect(`${process.env.WEBSITE}/payment/error`);
	}
};

export default addSslCancel;