import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { getApp, cached } from '../../lib/heroku/index.js';

/** GET /:id/apps/:app */
const getHerokuApp = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;

	try {
		const app = await cached(String(account._id), 'app', req.params.app, () =>
			getApp(token, req.params.app)
		);
		return res.status(200).json({ app });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuApp;
