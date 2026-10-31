import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Every webhook call a courier made to a store (docs/couriers CR9, CR-06),
 * kept as it came — the raw body and its headers (secrets left out) — and
 * what became of it. `key` makes a courier's retry land once. Kept 60 days.
 * An event for a parcel not booked yet stays `unmatched` until its booking
 * (Pathao can report a parcel before the booking call answers).
 */
const schema = new Schema<any>(
	{
		courier: { type: String, required: true },
		connection: { type: Schema.Types.ObjectId, required: true },
		key: { type: String, required: true },
		kind: { type: String, default: 'status' },
		consignment: { type: String, default: '' },
		invoice: { type: String, default: '' },
		courierStatus: { type: String, default: '' },
		parsed: { type: Schema.Types.Mixed },
		raw: { type: String, default: '' },
		headers: { type: Schema.Types.Mixed },
		state: { type: String, enum: ['new', 'applied', 'unmatched', 'ignored', 'failed'], default: 'new' },
		delivery: { type: Schema.Types.ObjectId },
		error: { type: String, default: '' },
		createdAt: { type: Date, default: Date.now, expires: 60 * 24 * 3600 },
	},
	{ minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, key: 1 }, { unique: true });
schema.index({ project: 1, courier: 1, state: 1, consignment: 1 });

export default mongoose.model<any>('CourierWebhookEvent', schema, 'courierevents');
