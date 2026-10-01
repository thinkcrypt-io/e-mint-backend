import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A copy of a record taken just before a bulk delete or a merge removed it,
 * so "Undo" can put it back exactly — same _id, same fields — and a merge can
 * be recovered from. One batch per action. Kept 30 days, then MongoDB drops
 * them (TTL index on createdAt).
 */
const schema = new Schema<any>(
	{
		batch: { type: String, required: true, index: true },
		route: { type: String, required: true },
		model: { type: String, required: true },
		docId: { type: Schema.Types.ObjectId, required: true },
		doc: { type: Schema.Types.Mixed, required: true },
		reason: { type: String, enum: ['delete', 'merge'], default: 'delete' },
		/** For a merge: the record these were merged into. */
		mergedInto: { type: Schema.Types.ObjectId },
		deletedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
	},
	{ timestamps: true, versionKey: false, minimize: false }
);

schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

// A tenant project's entries carry its ids and stay out of the super admin's lists (docs/multi-tenancy).
schema.plugin(tenantScoped);

export default mongoose.model<any>('DeletedRecord', schema, 'deletedrecords');
