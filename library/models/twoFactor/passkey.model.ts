import mongoose, { Schema } from 'mongoose';

/**
 * A passkey an admin registered for two-factor sign-in — a WebAuthn
 * credential kept by Apple Keychain, Google Password Manager / Chrome, the
 * browser, a phone or a security key. Only the public key is stored; the
 * private key never leaves the device.
 *
 * Managed from the admin's Settings → Two-factor authentication
 * (library/controllers/twoFactor).
 */
export type PasskeyType = {
	admin: Schema.Types.ObjectId;
	name: string;
	/** base64url credential id, as the browser reports it. */
	credentialId: string;
	/** base64url COSE public key. */
	publicKey: string;
	counter: number;
	transports?: string[];
	/** 'singleDevice' | 'multiDevice' (synced, e.g. iCloud Keychain). */
	deviceType?: string;
	backedUp?: boolean;
	lastUsedAt?: Date;
};

export const makePasskeySchema = (userRef: string) =>
	new Schema<PasskeyType>(
		{
			admin: { type: Schema.Types.ObjectId, ref: userRef, required: true, index: true },
			name: { type: String, trim: true, maxlength: 60, default: 'Passkey' },
			credentialId: { type: String, required: true, unique: true },
			publicKey: { type: String, required: true, select: false },
			counter: { type: Number, default: 0 },
			transports: { type: [String], default: undefined },
			deviceType: { type: String },
			backedUp: { type: Boolean },
			lastUsedAt: { type: Date },
		},
		{ timestamps: true }

	);

/** For admins (here) and tenant users (tenant.models.ts): `admin` holds the user's id. */
const Passkey = mongoose.model<PasskeyType>('Passkey', makePasskeySchema('Admin'));
export default Passkey;
