import mongoose, { Schema } from 'mongoose';

/**
 * One signed-in admin session: a login token (its `sid` claim) and the device
 * it was used from. Created when a token is issued (library/functions/
 * sessions.function.ts `issueSession`); `lastActiveAt` is bumped by
 * adminProtect at most once a minute. A token from before sessions existed
 * gets a row the first time it's used, keyed by a hash of the token.
 *
 * Revoking sets `revokedAt` here and adds the sid to BlacklistedToken, which
 * is what every request is checked against.
 */
export type AdminSessionType = {
	admin: Schema.Types.ObjectId;
	sid: string;
	/** How it was signed in: password, email-code, passkey, backup-code, invitation, legacy. */
	method: string;
	browser?: string;
	os?: string;
	deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
	userAgent?: string;
	ip?: string;
	lastIp?: string;
	lastActiveAt?: Date;
	revokedAt?: Date;
	revokedBy?: Schema.Types.ObjectId;
	revokeReason?: string;
};

const schema = new Schema<AdminSessionType>(
	{
		admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
		sid: { type: String, required: true, unique: true },
		method: { type: String, default: 'password' },
		browser: { type: String },
		os: { type: String },
		deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },
		userAgent: { type: String, maxlength: 500 },
		ip: { type: String },
		lastIp: { type: String },
		lastActiveAt: { type: Date, index: true },
		revokedAt: { type: Date, default: null, index: true },
		revokedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		revokeReason: { type: String },
	},
	{ timestamps: true }
);

const AdminSession = mongoose.model<AdminSessionType>('AdminSession', schema);
export default AdminSession;
