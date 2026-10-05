import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One payment for one order on a tenant's site (docs/widgets W-06). Made by checkout, at the
 * server's price; only the provider's confirmed webhook makes it `paid`
 * (functions/payments.function.ts). Read-only in the panel. `ref` is the
 * public reference the thank-you page asks about — never the order's id.
 */
export const PAYMENT_STATUSES = ['created', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded'] as const;

const schema = new Schema<any>(
	{
		ref: { type: String, required: true, unique: true },
		order: { type: Schema.Types.ObjectId, required: true },
		orderModel: { type: String, required: true },
		orderCode: { type: String, default: '' },
		provider: { type: String, required: true },
		mode: { type: String, enum: ['test', 'live'], default: 'test' },
		/** In the currency's smallest unit (cents, paisa) — what the provider is asked for and must confirm. */
		amount: { type: Number, required: true },
		currency: { type: String, required: true, uppercase: true },
		status: { type: String, enum: PAYMENT_STATUSES, default: 'created' },
		email: { type: String, trim: true, lowercase: true, default: '' },
		customer: { type: Schema.Types.ObjectId, ref: 'ProjectCustomer', default: null },
		/** What was bought, priced by the server at checkout. */
		lines: { type: Schema.Types.Mixed, default: [] },
		providerSessionId: { type: String, default: '' },
		providerPaymentId: { type: String, default: '' },
		checkoutUrl: { type: String, default: '' },
		paidAt: { type: Date, default: null },
		error: { type: String, default: '' },
		/** What happened, newest last: created, session, webhook, paid, mismatch… */
		events: { type: [{ type: { type: String }, at: Date, note: String, _id: false }], default: [] },
	},
	{ timestamps: true }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, createdAt: -1 });
schema.index({ provider: 1, providerSessionId: 1 });

export default mongoose.model<any>('SitePayment', schema, 'sitepayments');
