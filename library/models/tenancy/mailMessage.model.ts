import mongoose, { Schema } from 'mongoose';

/**
 * Every email MINT sent for an organization through its own email server
 * (docs/messaging M-02, MD8): who to, what about, whether it went. Shown on
 * the organization's Email page; kept 180 days. Never the body — only the
 * subject. One shared collection for every organization (MD10).
 */
export const MAIL_KINDS = ['test', 'customer-welcome', 'record', 'campaign', 'automation'] as const;

const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', default: null },
		kind: { type: String, enum: MAIL_KINDS, required: true },
		to: { type: String, trim: true, lowercase: true, required: true },
		subject: { type: String, maxlength: 300, default: '' },
		status: { type: String, enum: ['sent', 'failed'], required: true },
		error: { type: String, default: '' },
		/** The server's id for it (Message-ID), to find it in the server's own logs. */
		messageId: { type: String, default: '' },
		sentBy: { type: Schema.Types.ObjectId, ref: 'TenantUser', default: null },
	},
	{ timestamps: true }
);

schema.index({ organization: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default mongoose.model<any>('MailMessage', schema, 'mailmessages');
