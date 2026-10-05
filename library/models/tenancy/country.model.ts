import mongoose, { Schema } from 'mongoose';

/**
 * A country (docs/widgets W-02) — platform data, not a tenant's: the list an
 * organization picks its country from, and what follows from it: the dial code
 * phone fields start with, the currency, and the payment providers offered to
 * organizations there (Bangladesh: SSLCommerz and bKash too; elsewhere Stripe).
 *
 * The flag and map pictures are stored here as SVG (`select: false`, served as
 * images by GET /public/countries/:code/flag.svg and /map.svg). Built-in
 * countries (library/data/countries.ts) are added at boot when missing; edits
 * made here are kept.
 */
export const PAYMENT_PROVIDERS = ['stripe', 'sslcommerz', 'bkash'] as const;

const str = { type: String, trim: true, default: '' };

const schema = new Schema<any>(
	{
		/** ISO 3166-1 alpha-2, e.g. BD. */
		code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z]{2}$/ },
		/** ISO 3166-1 alpha-3, e.g. BGD. */
		code3: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
		name: { type: String, required: true, trim: true, maxlength: 80 },
		/** As people there write it, e.g. বাংলাদেশ. */
		nativeName: str,
		/** International dialling code with the plus, e.g. +880. */
		dialCode: { type: String, trim: true, match: /^\+\d{1,4}$/ },
		/** The flag as an emoji, for places an image is too much. */
		flag: str,
		flagSvg: { type: String, default: '', select: false },
		mapSvg: { type: String, default: '', select: false },
		currency: {
			code: { type: String, uppercase: true, trim: true, match: /^[A-Z]{3}$/ },
			symbol: str,
			name: str,
		},
		region: str,
		/** Offered to organizations in this country, in this order. */
		paymentProviders: { type: [String], enum: PAYMENT_PROVIDERS, default: ['stripe'] },
		active: { type: Boolean, default: true },
		/** Higher shows first in pickers; the rest follow by name. */
		priority: { type: Number, default: 0 },
	},
	{ timestamps: true }
);

export default mongoose.model<any>('Country', schema, 'countries');
