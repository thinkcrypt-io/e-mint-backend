import crypto from 'crypto';

/**
 * Symmetric at-rest encryption for provider credentials we have to be able to
 * read back (an API key is useless as a one-way hash, unlike a password).
 *
 * AES-256-GCM, so a tampered ciphertext fails to open instead of decrypting to
 * garbage we would then send to the provider. The stored form carries its own
 * version prefix — `v1:<iv>:<tag>:<ciphertext>`, all base64 — so the scheme can
 * be rotated later without guessing what an existing row was written with.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';
const MIN_SECRET_LENGTH = 16;

/** Resolved on first use, not at import time: a missing key should break the
 *  one feature that needs it, not stop the whole server from booting. */
let cachedKey: Buffer | null = null;

const getKey = (): Buffer => {
	if (cachedKey) return cachedKey;

	const secret = process.env.SECRET_ENCRYPTION_KEY;

	if (!secret || secret.length < MIN_SECRET_LENGTH) {
		throw new Error(
			`SECRET_ENCRYPTION_KEY is missing or shorter than ${MIN_SECRET_LENGTH} characters. Set it in .env before storing provider API keys.`
		);
	}

	cachedKey = crypto.createHash('sha256').update(secret).digest();
	return cachedKey;
};

/** True for a value already written by `seal`, so callers can tell a stored
 *  ciphertext apart from a plaintext key a client just sent up. */
export const isSealed = (value?: string | null): boolean =>
	typeof value === 'string' && value.startsWith(`${VERSION}:`);

export const seal = (plain: string): string => {
	const iv = crypto.randomBytes(IV_BYTES);
	const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
		':'
	);
};

export const open = (sealed: string): string => {
	const parts = sealed.split(':');

	if (parts.length !== 4 || parts[0] !== VERSION) {
		throw new Error('Stored secret is not in a recognised format');
	}

	const [, iv, tag, ciphertext] = parts;
	const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));

	// Throws if SECRET_ENCRYPTION_KEY changed or the row was edited by hand,
	// which is the point — better a hard failure than a silently wrong key.
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, 'base64')),
		decipher.final(),
	]).toString('utf8');
};

/** Displayed instead of the key itself, so a row is still identifiable. */
export const last4 = (plain: string): string => plain.slice(-4);

/** Lets two records be compared for "same key" without decrypting either: GCM
 *  output differs every time, so the ciphertexts themselves never match. */
export const fingerprint = (plain: string): string =>
	crypto.createHash('sha256').update(plain).digest('hex').slice(0, 16);
