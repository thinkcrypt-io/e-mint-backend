import mongoose, { Schema } from 'mongoose';

/**
 * An organization's own email server (docs/messaging M-02): MINT sends the
 * organization's emails — to its customers, from its own address — through
 * the SMTP server it types in here, with nodemailer. One per organization,
 * shared by its projects. The password is sealed (lib/crypto/secret.ts,
 * SECRET_ENCRYPTION_KEY) and never read back to anyone: the panel only learns
 * whether one is set.
 */
const schema = new Schema<any>(
	{
		organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
		host: { type: String, trim: true, required: true, maxlength: 255 },
		port: { type: Number, min: 1, max: 65535, default: 587 },
		/** TLS from the start (port 465). Off: STARTTLS when the server offers it (587, 25). */
		secure: { type: Boolean, default: false },
		username: { type: String, trim: true, maxlength: 255, default: '' },
		password: { type: String, select: false, default: '' },
		fromName: { type: String, trim: true, maxlength: 120, default: '' },
		fromAddress: { type: String, trim: true, lowercase: true, maxlength: 255, required: true },
		replyTo: { type: String, trim: true, lowercase: true, maxlength: 255, default: '' },
		/** Customers who sign up on the organization's sites get a welcome email. */
		customerWelcome: { type: Boolean, default: true },
		/** The last test or send that worked, and the last that didn't. */
		verifiedAt: { type: Date, default: null },
		lastError: { type: String, default: '' },
		lastErrorAt: { type: Date, default: null },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
	},
	{ timestamps: true }
);

export default mongoose.model<any>('MailSettings', schema, 'mailsettings');
