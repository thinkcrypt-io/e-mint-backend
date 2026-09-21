import { Response } from 'express';
import HerokuAccount from '../../models/heroku/model.js';
import { open } from '../../lib/crypto/index.js';
import { toHerokuError } from '../../lib/heroku/index.js';

export type ResolvedAccount = {
	account: any;
	token: string;
};

/**
 * Load a stored account and decrypt its key.
 *
 * `+apiKey` is the only place in the codebase that asks for that field — see
 * the note on the schema path. The plaintext exists for the life of one
 * request and is never put on a response.
 *
 * Returns null and answers the request itself when the account is missing, so
 * controllers can `if (!resolved) return;` instead of repeating the 404.
 */
export const resolveAccount = async (id: string, res: Response): Promise<ResolvedAccount | null> => {
	const account = await HerokuAccount.findById(id).select('+apiKey');

	if (!account) {
		res.status(404).json({ message: 'Heroku account not found' });
		return null;
	}

	try {
		return { account, token: open(account.apiKey) };
	} catch (e: any) {
		// Either SECRET_ENCRYPTION_KEY is missing/changed, or the row was edited
		// by hand. Both are operator problems, and neither is worth leaking the
		// underlying crypto error to an admin's screen.
		console.error('Heroku key could not be decrypted:', e.message);
		res.status(500).json({
			message:
				'This account key could not be decrypted. Check SECRET_ENCRYPTION_KEY, or re-enter the key.',
		});
		return null;
	}
};

/**
 * One place for "the Heroku call failed". Flips the stored account to `invalid`
 * when Heroku says the key itself is bad, so the list page shows the problem
 * without anyone having to open the record.
 */
export const handleHerokuFailure = async (e: any, res: Response, account?: any): Promise<Response> => {
	const error = toHerokuError(e);

	if (account) {
		account.lastError = error.message;
		if (error.invalidToken) account.status = 'invalid';
		await account.save().catch(() => undefined);
	}

	return res.status(error.status).json({ message: error.message, id: error.id });
};
