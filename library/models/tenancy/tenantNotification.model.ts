import mongoose, { Schema } from 'mongoose';

/**
 * Something a tenant user should know about (docs/multi-tenancy WO-37): an
 * invitation, someone joining, their access changing, a record shared with
 * them, a record sent in by their site. Shown by the bell in the tenant
 * panel and on /notifications — every organization's, as one person's list.
 * `href` is a panel address, inside its project when it has one
 * (`/<publicSlug>/<route>/<id>`). Written by tenantNotify.function.ts.
 */
const schema = new Schema<any>(
	{
		recipient: { type: Schema.Types.ObjectId, ref: 'TenantUser', required: true },
		organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject' },
		actor: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		/** The actor's name when it happened (they may be renamed or leave). */
		actorName: { type: String, trim: true },
		type: { type: String, required: true, trim: true },
		title: { type: String, required: true, trim: true },
		message: { type: String, trim: true },
		href: { type: String, trim: true },
		route: { type: String, trim: true },
		record: { type: Schema.Types.ObjectId },
		read: { type: Boolean, default: false },
		readAt: { type: Date },
	},
	{ timestamps: true, versionKey: false }
);

schema.index({ recipient: 1, read: 1, createdAt: -1 });
schema.index({ recipient: 1, createdAt: -1 });
// Kept for a year.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.model<any>('TenantNotification', schema, 'tenantnotifications');
