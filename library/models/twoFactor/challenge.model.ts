import mongoose, { Schema } from 'mongoose';

/**
 * One step of a two-factor exchange, alive for minutes:
 *   - `login`: the sign-in that a password started — keyed by its ticket id
 *     (`ticket`). It counts every wrong code for that sign-in, holds the
 *     emailed code's hash and the passkey challenge the browser must sign.
 *   - `register`: adding a passkey from Settings — the challenge the new
 *     credential must answer.
 * MongoDB removes it at `expiresAt` (TTL index).
 */
export type TwoFactorChallengeType = {
	admin: Schema.Types.ObjectId;
	purpose: 'login' | 'register';
	ticket?: string;
	/** sha256 of the emailed 6-digit code. */
	codeHash?: string;
	codeExpiresAt?: Date;
	codeSentAt?: Date;
	codeAttempts: number;
	/** Wrong codes of any kind (email or backup) for this sign-in. */
	attempts: number;
	/** The WebAuthn challenge (base64url) waiting for an answer. */
	challenge?: string;
	expiresAt: Date;
};

const schema = new Schema<TwoFactorChallengeType>(
	{
		admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
		purpose: { type: String, enum: ['login', 'register'], required: true },
		ticket: { type: String, index: true },
		codeHash: { type: String },
		codeExpiresAt: { type: Date },
		codeSentAt: { type: Date },
		codeAttempts: { type: Number, default: 0 },
		attempts: { type: Number, default: 0 },
		challenge: { type: String },
		expiresAt: { type: Date, required: true, index: { expires: 0 } },
	},
	{ timestamps: true }
);

const TwoFactorChallenge = mongoose.model<TwoFactorChallengeType>('TwoFactorChallenge', schema);
export default TwoFactorChallenge;
