import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { getConfigVars } from '../../lib/heroku/index.js';

/**
 * GET /:id/apps/:app/config-vars — live secrets, proxied straight through.
 * Never cached by the browser and never written to Mongo.
 */
const getHerokuConfigVars = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;

	try {
		const vars = await getConfigVars(token, req.params.app);
		res.set('Cache-Control', 'no-store');
		return res.status(200).json({ app: req.params.app, count: Object.keys(vars).length, vars });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuConfigVars;
