import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Store search (docs/search SI16, SI-16): what shoppers did with one product for one search, learned from the search
 * log (`SearchEvent`, 90 days) once a day. Counts are decayed (half-life 30 days), so last week counts more than two
 * months ago. `expected` is how many clicks the product would have had where it was shown if it were an average result
 * there (position 1 gets clicked more anyway): `boost` comes from what it got against that.
 *
 * Only pairs past the thresholds (≥ 20 impressions from ≥ 5 visitors) get a boost other than 1, and the boost is
 * between × 0.85 and × 1.25 — never enough to bring in a product the words don't find.
 */
const schema = new Schema<any>(
	{
		/** The normalised query (stems in order), as the log keeps it. */
		nq: { type: String, required: true },
		/** How it was typed most often. */
		q: { type: String, default: '' },
		product: { type: Schema.Types.ObjectId, required: true },
		/** Raw counts over the 90 days (for the thresholds). */
		impressions: { type: Number, default: 0 },
		visitors: { type: Number, default: 0 },
		/** Decayed counts. */
		shown: { type: Number, default: 0 },
		clicks: { type: Number, default: 0 },
		carts: { type: Number, default: 0 },
		orders: { type: Number, default: 0 },
		/** Decayed clicks an average result would have had at the positions this one was shown at. */
		expected: { type: Number, default: 0 },
		/** The average position it was shown at. */
		position: { type: Number, default: 0 },
		/** The learned multiplier (1 until the thresholds are met). */
		boost: { type: Number, default: 1 },
		at: { type: Date, default: () => new Date() },
	},
	{ timestamps: false }
);
schema.plugin(tenantScoped);
schema.index({ project: 1, nq: 1, product: 1 }, { unique: true });
schema.index({ project: 1, product: 1 });
schema.index({ project: 1, at: 1 });

export default mongoose.model<any>('SearchPair', schema, 'searchpairs');
