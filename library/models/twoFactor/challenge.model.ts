import mongoose, { Schema } from 'mongoose';

/**
 * One step of a two-factor exchange, alive for minutes:
 *   - `login`: the sign-in that a password started — keyed by its ticket id
 *     (`ticket`). It counts every wrong code for that sign-in, holds the
 *     emailed code's hash and the passkey challenge the browser must sign.
 *   - `register`: adding a passkey from Settings — the challenge the new
 *     credential must answer.
 *   - `link`: adding a passkey on another device by QR code — `ticket` is the
 *     link token's hash; the status the computer showing the QR polls
 *     (waiting → opened → added), the device that opened it, the passkey made.
 * MongoDB removes it at `expiresAt` (TTL index).
 */
export type TwoFactorChallengeType = {
	admin: Schema.Types.ObjectId;
	purpose: 'login' | 'register' | 'link';
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
	linkStatus?: 'waiting' | 'opened' | 'added';
	linkDevice?: string;
	linkPasskey?: Schema.Types.ObjectId;
	linkPasskeyName?: string;
	expiresAt: Date;
};

const schema = new Schema<TwoFactorChallengeType>(
	{
		admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
		purpose: { type: String, enum: ['login', 'register', 'link'], required: true },
		ticket: { type: String, index: true },
		codeHash: { type: String },
		codeExpiresAt: { type: Date },
		codeSentAt: { type: Date },
		codeAttempts: { type: Number, default: 0 },
		attempts: { type: Number, default: 0 },
		challenge: { type: String },
		linkStatus: { type: String, enum: ['waiting', 'opened', 'added'] },
		linkDevice: { type: String },
		linkPasskey: { type: Schema.Types.ObjectId, ref: 'Passkey' },
		linkPasskeyName: { type: String },
		expiresAt: { type: Date, required: true, index: { expires: 0 } },
	},
	{ timestamps: true }
);

const TwoFactorChallenge = mongoose.model<TwoFactorChallengeType>('TwoFactorChallenge', schema);
export default TwoFactorChallenge;
