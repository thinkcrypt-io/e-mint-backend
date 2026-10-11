import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One change a Linked Relationship rule made to another record: "Mark invoice
 * paid" set Invoice INV-0042's status from unpaid to paid, from Payment
 * PAY-0012 (docs/linked-relationships).
 *
 * It is what lets the change be taken back: when the payment is deleted, or
 * edited so the rule no longer holds, the invoice's fields that still hold
 * what the rule set go back to `before` (a field someone has changed since is
 * left alone), and an `inc` is taken off again. Active while `revertedAt` is
 * empty; kept after that as the record of what happened.
 */
const schema = new Schema<any>(
	{
		rule: { type: String, required: true },
		ruleName: { type: String, default: '' },
		sourceRoute: { type: String, required: true },
		sourceModel: { type: String, required: true },
		source: { type: Schema.Types.ObjectId, required: true },
		targetRoute: { type: String, required: true },
		targetModel: { type: String, required: true },
		target: { type: Schema.Types.ObjectId, required: true },
		/** Field → value before the rule first set it. */
		before: { type: Schema.Types.Mixed, default: {} },
		/** Field → value the rule set (last time it ran). */
		after: { type: Schema.Types.Mixed, default: {} },
		/** Field → total amount added by `inc` (taken off again on undo). */
		incs: { type: Schema.Types.Mixed, default: {} },
		revertedAt: { type: Date, default: null },
		by: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

schema.index({ source: 1, rule: 1, revertedAt: 1 });
schema.index({ target: 1, revertedAt: 1 });

// A tenant project's entries carry its ids and stay out of the super admin's lists (docs/multi-tenancy).
schema.plugin(tenantScoped);

export default mongoose.model<any>('LinkedChange', schema, 'linkedchanges');
