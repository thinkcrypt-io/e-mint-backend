import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listDynos, getFormation, cached } from '../../lib/heroku/index.js';

/**
 * GET /:id/apps/:app/dynos — formation and running dynos together.
 *
 * One route rather than two because the Dynos tab always needs both and they
 * are meaningless apart: the formation is the intent, the dyno list is what is
 * actually up.
 */
const getHerokuDynos = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;

	try {
		const [formation, dynos] = await Promise.all([
			cached(String(account._id), 'formation', app, () => getFormation(token, app)),
			cached(String(account._id), 'dynos', app, () => listDynos(token, app)),
		]);

		return res.status(200).json({ formation, dynos });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuDynos;
