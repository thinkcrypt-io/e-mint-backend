import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One delivery of a project webhook (docs/templates T-09): the event, what
 * was sent, how the receiver answered and how many tries it took. The last
 * 50 per webhook are kept (functions/webhooks.function.ts prunes the rest),
 * none longer than 30 days.
 */
export const DELIVERY_SOURCES = ['panel', 'api', 'test'] as const;

const schema = new Schema<any>(
	{
		webhook: { type: Schema.Types.ObjectId, required: true },
		/** The id the receiver sees in `x-mint-delivery` — the same on every retry. */
		delivery: { type: String, required: true },
		event: { type: String, required: true },
		route: { type: String, required: true },
		record: { type: String },
		source: { type: String, enum: DELIVERY_SOURCES, required: true },
		url: { type: String },
		/** The JSON sent (cut at 8 KB). */
		body: { type: String },
		ok: { type: Boolean, default: false },
		/** Still trying (between retries). */
		pending: { type: Boolean, default: true },
		status: { type: Number },
		/** The receiver's answer (cut at 1 KB), or why nothing came back. */
		response: { type: String },
		error: { type: String },
		attempts: { type: Number, default: 0 },
		durationMs: { type: Number },
		createdAt: { type: Date, default: Date.now },
		finishedAt: { type: Date },
	},
	{ versionKey: false }
);

schema.plugin(tenantScoped);
schema.index({ webhook: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<any>('WebhookDelivery', schema, 'webhookdeliveries');
