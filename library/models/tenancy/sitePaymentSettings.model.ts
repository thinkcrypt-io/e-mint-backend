import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A project's payments (docs/widgets W-06): which providers its checkout
 * offers — each the organization's own merchant account (WD6) — test or live,
 * and where buyers come back to. Keys are sealed (lib/crypto/secret.ts) and
 * `select: false`: the panel only learns whether each is set. Providers a
 * project may turn on come from its organization's country (W-02).
 */
const stripe = new Schema<any>(
	{
		enabled: { type: Boolean, default: false },
		mode: { type: String, enum: ['test', 'live'], default: 'test' },
		publishableKey: { type: String, trim: true, default: '' },
		secretKey: { type: String, select: false, default: '' },
		webhookSecret: { type: String, select: false, default: '' },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		stripe: { type: stripe, default: () => ({}) },
		/** Where the buyer lands after paying; `{ref}` becomes the payment's reference. Empty: <site>/thank-you?ref={ref}. */
		successUrl: { type: String, trim: true, default: '' },
		/** Where the buyer lands if they go back from the provider's page. Empty: <site>/cart. */
		cancelUrl: { type: String, trim: true, default: '' },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1 }, { unique: true });

export default mongoose.model<any>('SitePaymentSettings', schema, 'sitepaymentsettings');
