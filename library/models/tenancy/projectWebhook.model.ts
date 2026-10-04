import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * An outgoing webhook of a tenant project (docs/templates T-09): when a record
 * of `route` is created, changed or deleted — in the panel or through the
 * public API — the project POSTs it to `url`, signed with `secret`
 * (HMAC-SHA256, `x-mint-signature`). Sent by functions/webhooks.function.ts;
 * each try is logged in WebhookDelivery.
 *
 * A webhook without a URL is kept switched off (a template can make one and
 * leave the address to the project).
 */
export const WEBHOOK_EVENTS = ['create', 'update', 'delete'] as const;

const schema = new Schema<any>(
	{
		route: { type: String, required: true, trim: true, maxlength: 60 },
		events: { type: [{ type: String, enum: WEBHOOK_EVENTS }], default: ['create', 'update', 'delete'] },
		url: { type: String, trim: true, maxlength: 500, default: '' },
		/** Signs every delivery; shown once when made or replaced. */
		secret: { type: String, select: false },
		active: { type: Boolean, default: true },
		/** What the receiving system does with it — from the template, or the project's own words. */
		note: { type: String, trim: true, maxlength: 300, default: '' },
		lastDelivery: {
			at: Date,
			event: String,
			ok: Boolean,
			status: Number,
			error: String,
			test: Boolean,
		},
		createdBy: { type: Schema.Types.ObjectId },
	},
	{ timestamps: true, versionKey: false }
);

schema.plugin(tenantScoped);
schema.index({ project: 1, route: 1 });

export default mongoose.model<any>('ProjectWebhook', schema, 'projectwebhooks');
