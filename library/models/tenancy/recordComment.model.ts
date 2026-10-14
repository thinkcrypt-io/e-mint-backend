import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A comment on one record of a project's page (docs/multi-tenancy WO-49): the
 * record page's Comments tab. `mentions` are the people it @mentions — each
 * checked against who may see the record when it was written, and notified.
 * The names are snapshots, like History's, so a comment reads the same after
 * someone renames themselves. Scoped to the project (tenantScoped).
 *
 * `parent` makes it a reply (WO-53): one level, like Facebook — a reply to a
 * reply joins the same top-level comment's thread.
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
		/** The top-level comment this replies to; null for a top-level comment. */
		parent: { type: Schema.Types.ObjectId, default: null },
		editedAt: Date,
	},
	{ timestamps: true, versionKey: false }
);

// One record's thread, oldest first.
schema.index({ route: 1, record: 1, createdAt: 1 });
// A thread's replies (deleting a comment takes them with it).
schema.index({ parent: 1 }, { partialFilterExpression: { parent: { $type: 'objectId' } } });

schema.plugin(tenantScoped);

export default mongoose.model<any>('RecordComment', schema, 'recordcomments');
