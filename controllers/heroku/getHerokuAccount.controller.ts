import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { getAccount, getRateLimit } from '../../lib/heroku/index.js';

/** Live `GET /account` + `GET /account/rate-limits`, and refreshes the stored snapshot. */
const getHerokuAccount = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;

	try {
		const [live, rateLimit] = await Promise.all([getAccount(token), getRateLimit(token)]);

		account.lastSyncedAt = new Date();
		account.status = 'active';
		account.lastError = '';
		account.accountEmail = live.email;
		account.accountId = live.id;
		account.accountName = live.name;
		account.isVerified = live.verified;
		account.twoFactor = live.twoFactor;
		account.defaultTeam = live.defaultTeam;
		await account.save();

		return res.status(200).json({ account: live, rateLimit });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuAccount;
