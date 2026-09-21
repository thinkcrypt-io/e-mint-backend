import { Response } from 'express';
import VercelAccount from '../../models/vercel/model.js';
import { open } from '../../lib/crypto/index.js';
import { toVercelError } from '../../lib/vercel/index.js';

export type ResolvedAccount = {
	account: any;
	token: string;
	/**
	 * The team scope for this request: `?team=`, else the account's default,
	 * else empty. Empty is a valid, correct scope — it means the personal
	 * account, which is where every project lives on a Hobby plan.
	 */
	team: string;
};

/**
 * Why a sealed token would not open. All three read identically to a user
 * otherwise, and they need three different fixes — the Heroku equivalent
 * answers one sentence for all of them, which cost a production debugging
 * session that ended with someone reading console logs on the server.
 */
const describeDecryptFailure = (message: string): string => {
	if (message.includes('SECRET_ENCRYPTION_KEY')) {
		return 'SECRET_ENCRYPTION_KEY is not set on this server (or is too short). The stored token cannot be read until it is set to the same value used when the token was saved.';
	}

	if (message.includes('not in a recognised format')) {
		return 'This account row is not in the expected encrypted format — it looks like it was edited directly in the database. Re-enter the token to repair it.';
	}

	// AES-GCM authentication failure: the ciphertext is well-formed but this key
	// did not produce it.
	return 'SECRET_ENCRYPTION_KEY on this server does not match the one used when this token was saved. Restore the original key, or re-enter the token.';
};

/**
 * Load a stored account and decrypt its token.
 *
 * `+apiToken` is the only place in the codebase that asks for that field — see
 * the note on the schema path. The plaintext exists for the life of one
 * request and is never put on a response.
 *
 * Returns null and answers the request itself when the account is missing, so
 * controllers can `if (!resolved) return;` instead of repeating the 404.
 */
export const resolveAccount = async (
	req: any,
	res: Response
): Promise<ResolvedAccount | null> => {
	const account = await VercelAccount.findById(req?.params?.id).select('+apiToken');

	if (!account) {
		res.status(404).json({ message: 'Vercel account not found' });
		return null;
	}

	const team = String(req?.query?.team || account.defaultTeamId || '');

	try {
		return { account, token: open(account.apiToken), team };
	} catch (e: any) {
		console.error('Vercel token could not be decrypted:', e.message);
		res.status(500).json({ message: describeDecryptFailure(String(e.message || '')) });
		return null;
	}
};

/**
 * One place for "the Vercel call failed". Flips the stored account to `invalid`
 * only when Vercel actually rejected the token, so the list page shows a real
 * problem without anyone having to open the record.
 *
 * A 403 is deliberately not treated as an invalid token: on a Hobby account it
 * is far more often a plan restriction (storage, log drains) than a revoked
 * token, and marking the account invalid for that would be actively misleading.
 * `GET /v2/user` is the token test — see `toVercelError`.
 */
export const handleVercelFailure = async (
	e: any,
	res: Response,
	account?: any
): Promise<Response> => {
	const error = toVercelError(e);

	if (account) {
		account.lastError = error.message;
		if (error.invalidToken) account.status = 'invalid';
		await account.save().catch(() => undefined);
	}

	return res.status(error.status).json({
		message: error.message,
		code: error.code,
		...(error.planRestricted ? { planRestricted: true } : {}),
	});
};
