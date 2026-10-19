import mongoose, { Schema } from 'mongoose';

/**
 * Every email MINT sent for an organization through its own email server
 * (docs/messaging M-02, MD8): who to, what about, whether it went. Shown on
 * the organization's Email page; kept 180 days. Only the subject — except
 * automation emails (`kept`), whose text and finished HTML are kept so the
 * panel can show the email as sent and resend a failed one (docs/automations
 * AU-03c); a failed one keeps its attached files too until it's resent. One
 * shared collection for every organization (MD10).
 */
export const MAIL_KINDS = ['test', 'customer-welcome', 'record', 'campaign', 'automation'] as const;

const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
		project: { type: Schema.Types.ObjectId, ref: 'TenantProject', default: null },
		/** The project's email account it went through (M-14); null = the organization's server. */
		account: { type: Schema.Types.ObjectId, ref: 'MailAccount', default: null },
		kind: { type: String, enum: MAIL_KINDS, required: true },
		to: { type: String, trim: true, lowercase: true, required: true },
		subject: { type: String, maxlength: 300, default: '' },
		status: { type: String, enum: ['sent', 'failed'], required: true },
		error: { type: String, default: '' },
		/** The server's id for it (Message-ID), to find it in the server's own logs. */
		messageId: { type: String, default: '' },
		sentBy: { type: Schema.Types.ObjectId, ref: 'TenantUser', default: null },
		/** The body was kept (automation emails): `text` and `html` below. */
		kept: { type: Boolean, default: false },
		text: { type: String, select: false },
		html: { type: String, select: false },
		/** The names of the files it carried. */
		files: { type: [{ _id: false, filename: String, size: Number }], default: undefined },
		/** The files themselves — only while it's failed, for Resend; dropped once a resend goes. */
		attachments: { type: [{ _id: false, filename: String, content: Buffer, contentType: String }], select: false, default: undefined },
		/** Which automation run sent it, on which record. */
		automation: { type: Schema.Types.ObjectId, ref: 'Automation', default: undefined },
		run: { type: Schema.Types.ObjectId, ref: 'AutomationRun', default: undefined },
		route: { type: String, default: undefined },
		record: { type: Schema.Types.ObjectId, default: undefined },
		design: { type: Schema.Types.ObjectId, default: undefined },
		/** A resend: the email it sent again. */
		resendOf: { type: Schema.Types.ObjectId, ref: 'MailMessage', default: undefined },
		/** On a failed email: the last time it was resent, and how that went. */
		resent: {
			type: { _id: false, at: Date, by: { type: Schema.Types.ObjectId, ref: 'TenantUser' }, status: String, error: String, message: Schema.Types.ObjectId },
			default: undefined,
		},
	},
	{ timestamps: true }
);

schema.index({ organization: 1, createdAt: -1 });
schema.index({ run: 1 }, { sparse: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default mongoose.model<any>('MailMessage', schema, 'mailmessages');
