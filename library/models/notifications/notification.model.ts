import mongoose, { Schema } from 'mongoose';

/**
 * Something that happened that an admin should know about — for now, being
 * given access to a record (library/functions/notifications.function.ts).
 * Shown by the bell in the admin navbar and on /notifications; `href` is
 * where opening it leads (a record's view page).
 */

const schema = new Schema<any>(
	{
		recipient: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		actor: { type: Schema.Types.ObjectId, ref: 'Admin' },
		type: { type: String, required: true, trim: true },
		title: { type: String, required: true, trim: true },
		message: { type: String, trim: true },
		href: { type: String, trim: true },
		/** What it's about: the route and record, for types that concern one. */
		route: { type: String, trim: true },
		record: { type: Schema.Types.ObjectId },
		read: { type: Boolean, default: false },
		readAt: { type: Date },
	},
	{ timestamps: true, versionKey: false }
);

schema.index({ recipient: 1, read: 1, createdAt: -1 });
schema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.model<any>('Notification', schema, 'notifications');
export default Notification;
