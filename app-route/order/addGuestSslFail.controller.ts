import { Response } from 'express';
import { PendingGuestPayment } from './addAppOrder.js';
const addGuestSslFail = async (req: any, res: Response) => {
	try {
		// Delete the pending payment record (no order was created yet)
		await PendingGuestPayment.deleteOne({ transactionId: req.params.transId });

		// Redirect to failure page
		res.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	} catch (error) {
		console.error('Error handling payment failure:', error);
		res
			.status(500)
			.redirect(`${process.env.WEBSITE}/payment/fail/${req.params.transId}`);
	}
};

export default addGuestSslFail;
