import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A buyer's phone as a store last checked it (docs/couriers BUYER_CHECK.md BC3): what each courier said, kept a
 * day so the order check, the lookup page and Send to courier share one answer and one courier quota; and who
 * looked it up (BC8). One per phone per project. Removed with the project (projectLifecycle).
 */
const schema = new Schema<any>(
	{
		/** 01XXXXXXXXX for Bangladeshi mobiles (bdPhone), else the digits as typed. */
		phone: { type: String, required: true, trim: true },
		/** By source id (steadfast, pathao…): { ok, delivered, refused, total, ratio, rating, reports, categories, segment, error, at }. */
		sources: { type: Schema.Types.Mixed, default: () => ({}) },
		/** When the couriers were last asked (the store's own history is worked out on every check). */
		checkedAt: Date,
		/** The last answer, combined (BC1). */
		result: { type: Schema.Types.Mixed, default: null },
		/** Who looked it up and why, newest last, the last 50 (BC8). */
		lookups: {
			type: [new Schema<any>({ by: String, via: String, order: String, at: { type: Date, default: Date.now } }, { _id: false })],
			default: [],
		},
		lastLookupAt: { type: Date, index: true },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, phone: 1 }, { unique: true });

export default mongoose.model<any>('PhoneCheck', schema, 'phonechecks');
