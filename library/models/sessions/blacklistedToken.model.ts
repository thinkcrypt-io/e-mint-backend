import mongoose, { Schema } from 'mongoose';

/**
 * Login tokens that were revoked — signed out from Settings → Signed-in
 * devices, by a super admin on the Login sessions page, or by Logout. A token
 * is listed by its session id (`sid` claim, or `legacy:<hash>` for a token
 * issued before sessions existed). adminProtect refuses a listed token with
 * 401 `{ code: 'SESSION_REVOKED' }`, and the admin app signs that browser out.
 *
 * Admin tokens don't expire, so entries are kept.
 */
export type BlacklistedTokenType = {
	sid: string;
	admin: Schema.Types.ObjectId;
	session?: Schema.Types.ObjectId;
	revokedBy?: Schema.Types.ObjectId;
	reason?: string;
};

/** For admins (here) and tenant users (tenantSession.model.ts), like the session schema. */
export const makeBlacklistSchema = (userRef: string, sessionRef: string) =>
	new Schema<BlacklistedTokenType>(
		{
			sid: { type: String, required: true, unique: true },
			admin: { type: Schema.Types.ObjectId, ref: userRef, required: true, index: true },
			session: { type: Schema.Types.ObjectId, ref: sessionRef },
			revokedBy: { type: Schema.Types.ObjectId, ref: userRef },
			reason: { type: String },
		},
		{ timestamps: true }
	);

const BlacklistedToken = mongoose.model<BlacklistedTokenType>('BlacklistedToken', makeBlacklistSchema('Admin', 'AdminSession'));
export default BlacklistedToken;
