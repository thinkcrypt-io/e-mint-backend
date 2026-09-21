import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listApps, cached } from '../../lib/heroku/index.js';

/** GET /:id/apps — also refreshes `appCount` on the stored document. */
const getHerokuApps = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;

	try {
		const apps = await cached(String(account._id), 'apps', '', () => listApps(token));

		account.appCount = apps.length;
		await account.save();

		return res.status(200).json({ count: apps.length, apps });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuApps;
