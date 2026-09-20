import { Response } from 'express';
import mongoose from 'mongoose';
import AdminInvoice from '../../models/payment/adminInvoice.model.js';
import PaymentMethod from '../../library/models/paymentmethod/model.js';
import { loadBillingProfile } from '../../lib/billingProfile.js';
import { amountToWords } from '../../lib/numberToWords.js';

// Read-only, unauthenticated view of a single bill/invoice/receipt — the
// shareable link a client opens directly, with no admin login. Deliberately
// returns a hand-picked shape rather than the raw document: internal-only
// fields (`access`, `addedBy`, `note`) never leave the server, only what the
// client-facing page renders.
const getPublicInvoice = async (req: any, res: Response) => {
	try {
		const { id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(404).json({ message: 'Document not found' });
		}

		const invoice: any = await AdminInvoice.findById(id)
			.populate('client', 'name email phone address city country')
			.populate('project', 'name')
			.lean();

		if (!invoice) {
			return res.status(404).json({ message: 'Document not found' });
		}

		const profile = await loadBillingProfile();
		const bankAccount: any =
			(await PaymentMethod.findOne({ isDefault: true, isActive: true }).lean()) ||
			(await PaymentMethod.findOne({ isActive: true }).sort('createdAt').lean());

		const currency = invoice.currency || 'BDT';
		const bank = invoice.bank?.accountNo
			? invoice.bank
			: bankAccount
			? {
					accountName: bankAccount.accountName,
					accountNo: bankAccount.accountNumber,
					bankName: bankAccount.bankName,
					branch: bankAccount.branch,
			  }
			: null;

		return res.status(200).json({
			code: invoice.code,
			name: invoice.name,
			description: invoice.description,
			docType: invoice.docType || 'invoice',
			status: invoice.status,
			issueDate: invoice.issueDate,
			dueDate: invoice.dueDate,
			currency,
			client: invoice.client
				? {
						name: invoice.client.name,
						email: invoice.client.email,
						phone: invoice.client.phone,
						address: invoice.client.address,
						city: invoice.client.city,
						country: invoice.client.country,
				  }
				: null,
			project: invoice.project ? { name: invoice.project.name } : null,
			billFrom: invoice.billFromOverride
				? { override: invoice.billFromOverride }
				: {
						name: profile.company.name,
						addressLines: profile.company.addressLines,
						phone: profile.company.phone,
						email: profile.company.email,
						website: profile.company.website,
				  },
			items: (invoice.items || []).map((item: any) => ({
				name: item.name,
				description: item.description,
				quantity: item.quantity,
				rate: item.rate,
				total: item.total,
			})),
			subTotal: invoice.subTotal,
			tax: invoice.tax,
			shipping: invoice.shipping,
			others: invoice.others,
			total: invoice.total,
			amountInWords: invoice.amountInWords || amountToWords(invoice.total, currency),
			paymentMethod: invoice.paymentMethod,
			bank,
			authorizedBy: invoice.authorizedBy,
			footerNote: profile.footerNote,
		});
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default getPublicInvoice;
