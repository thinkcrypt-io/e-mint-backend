import { Response } from 'express';
import AdminInvoice from '../../models/payment/adminInvoice.model.js';
import PaymentMethod from '../../library/models/paymentmethod/model.js';
import { loadBillingProfile } from '../../lib/billingProfile.js';
import { resolveInvoicePdfBuilder } from '../../lib/invoiceDesigns.js';

const downloadInvoicePdf = async (req: any, res: Response) => {
	try {
		const invoice = await AdminInvoice.findById(req.params.id)
			.populate('client', 'name email phone address city country')
			.lean();

		if (!invoice) {
			return res.status(404).json({ message: 'Invoice not found' });
		}

		const type = req.query.type === 'receipt' ? 'receipt' : 'bill';
		const signed = req.query.signed === 'true';
		// Which layout to render in. Unknown/missing ids fall back to the default
		// design rather than failing the download — see lib/invoiceDesigns.ts.
		const design = typeof req.query.design === 'string' ? req.query.design : undefined;

		if (type === 'receipt' && invoice.status !== 'paid') {
			return res.status(400).json({ message: 'A receipt is only available for paid invoices' });
		}

		const profile = await loadBillingProfile();
		const bankAccount: any =
			(await PaymentMethod.findOne({ isDefault: true, isActive: true }).lean()) ||
			(await PaymentMethod.findOne({ isActive: true }).sort('createdAt').lean());

		// The signature is the downloading admin's own — set via their Settings
		// screen — never a shared org-wide one, and never embedded unless they
		// explicitly checked "Include signature" for this download.
		const pdf = await resolveInvoicePdfBuilder(design, type)(invoice, profile, {
			signed,
			bankAccount,
			signerName: req.user?.name,
			signatureUrl: req.user?.signature,
		});

		const filename = type === 'receipt' ? `${invoice.code || 'receipt'}-receipt` : invoice.code || 'invoice';

		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
		res.setHeader('Content-Length', pdf.length);
		return res.status(200).send(pdf);
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default downloadInvoicePdf;
