import { Response } from 'express';
import { PendingPayment } from './addUserOrder.controller.js';
const addSslFail = async (req: any, res: Response) => {
	try {
		// Delete the pending payment record (no order was created yet)
		await PendingPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to failure page
		res.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	} catch (error) {
		console.error('Error handling payment failure:', error);
		res.status(500).redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	}
};

export default addSslFail;