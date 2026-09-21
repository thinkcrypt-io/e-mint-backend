import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listBuilds, cached } from '../../lib/heroku/index.js';

/** GET /:id/apps/:app/builds?cursor= */
const getHerokuBuilds = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

	try {
		const load = () => listBuilds(token, app, { cursor });
		const result = cursor ? await load() : await cached(String(account._id), 'builds', app, load);

		return res.status(200).json(result);
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuBuilds;
