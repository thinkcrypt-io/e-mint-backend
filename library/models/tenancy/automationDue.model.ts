import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A record's next "date reached" run of an automation (docs/ecommerce/DISCOUNTS.md DS6): one waiting job per
 * automation and record, at the record's date moved by the automation's offset. Saving the record moves or drops
 * it; the minute tick in automationDue.function.ts claims the due ones, runs the automation and keeps them as done
 * or failed (with why) for a month. Scoped to the project.
 */
export const DUE_STATES = ['pending', 'running', 'done', 'failed'] as const;

const schema = new Schema<any>(
	{
		automation: { type: Schema.Types.ObjectId, ref: 'Automation', required: true },
		route: { type: String, required: true, trim: true },
		record: { type: Schema.Types.ObjectId, required: true },
		/** When it runs: the record's date ± the offset. */
		at: { type: Date, required: true },
		/** The record's date it was worked out from. */
		date: { type: Date },
		state: { type: String, enum: DUE_STATES, default: 'pending' },
		claimedAt: { type: Date },
		tries: { type: Number, default: 0 },
		doneAt: { type: Date },
		error: { type: String, trim: true, default: '' },
	},
	{ timestamps: true, versionKey: false }
);

schema.plugin(tenantScoped);

// The tick: the due ones, oldest first.
schema.index({ state: 1, at: 1 });
// One waiting run per automation and record.
schema.index({ automation: 1, record: 1 }, { unique: true, partialFilterExpression: { state: 'pending' } });
// Done and failed ones go after 30 days.
schema.index({ doneAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<any>('AutomationDue', schema, 'automationdues');
