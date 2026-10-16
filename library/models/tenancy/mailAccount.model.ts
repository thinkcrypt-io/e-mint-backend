import mongoose, { Schema } from 'mongoose';

/**
 * An email account connected to a project (docs/messaging M-14): an SMTP
 * server, port, address and password the project's emails go out through,
 * with nodemailer — and the sender name people see. A project can have
 * several (Sales, Support…); one is its default, which every email the
 * project sends uses. A project without one falls back to its organization's
 * server (MailSettings). The password is sealed (lib/crypto/secret.ts) and
 * never read back to anyone. One shared collection (MD10).
 */
const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', required: true },
		/** What the team calls it — "Sales", "Support". */
		name: { type: String, trim: true, required: true, maxlength: 80 },
		/** The sender name people see — "Acme Store". */
		fromName: { type: String, trim: true, maxlength: 120, default: '' },
		host: { type: String, trim: true, lowercase: true, required: true, maxlength: 255 },
		port: { type: Number, min: 1, max: 65535, default: 587 },
		/** TLS from the start (465, 2465). Off: STARTTLS when the server offers it. Follows the port. */
		secure: { type: Boolean, default: false },
		/** The address emails come from, and the login. */
		email: { type: String, trim: true, lowercase: true, required: true, maxlength: 255 },
		password: { type: String, select: false, default: '' },
		isDefault: { type: Boolean, default: false },
		/** The last check or send that worked, and the last that didn't. */
		verifiedAt: { type: Date, default: null },
		lastError: { type: String, default: '' },
		lastErrorAt: { type: Date, default: null },
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
	},
	{ timestamps: true }
);

schema.index({ project: 1, createdAt: 1 });

export default mongoose.model<any>('MailAccount', schema, 'mailaccounts');
