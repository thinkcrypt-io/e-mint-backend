import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Store search (docs/search SI5): products whose search document must be built again — one row per product, however
 * many times it was touched before the indexer got to it. The indexer claims rows with a lease (`token` +
 * `leaseUntil`), so two servers never build the same product at once; touching a claimed row again takes the claim
 * away, so a change made while it was being built is never lost.
 */
const schema = new Schema<any>(
	{
		product: { type: Schema.Types.ObjectId, required: true },
		reason: { type: String, default: '' },
		at: { type: Date, default: () => new Date() },
		token: { type: String, default: null },
		leaseUntil: { type: Date, default: null },
	},
	{ timestamps: false }
);
schema.plugin(tenantScoped);
schema.index({ project: 1, product: 1 }, { unique: true });
schema.index({ at: 1 });

export default mongoose.model<any>('SearchQueue', schema, 'searchqueue');
