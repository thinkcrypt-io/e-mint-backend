import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A comment on one record of a project's page (docs/multi-tenancy WO-49): the
 * record page's Comments tab. `mentions` are the people it @mentions — each
 * checked against who may see the record when it was written, and notified.
 * The names are snapshots, like History's, so a comment reads the same after
 * someone renames themselves. Scoped to the project (tenantScoped).
 */
const schema = new Schema<any>(
	{
		/** The page (route) the record belongs to, and the record. */
		route: { type: String, required: true, trim: true, lowercase: true },
		record: { type: Schema.Types.ObjectId, required: true },
		author: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true },
		authorName: { type: String, trim: true },
		body: { type: String, required: true, trim: true, maxlength: 5000 },
		mentions: {
			type: [{ _id: false, user: { type: Schema.Types.ObjectId, ref: 'TenantUser' }, name: String }],
			default: [],
		},
		editedAt: Date,
	},
	{ timestamps: true, versionKey: false }
);

// One record's thread, oldest first.
schema.index({ route: 1, record: 1, createdAt: 1 });

schema.plugin(tenantScoped);

export default mongoose.model<any>('RecordComment', schema, 'recordcomments');
