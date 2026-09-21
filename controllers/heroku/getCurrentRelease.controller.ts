import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { getCurrentRelease, cached } from '../../lib/heroku/index.js';

/** GET /:id/apps/:app/current-release — what the app page leads with. */
const getHerokuCurrentRelease = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;

	try {
		const release = await cached(String(account._id), 'releases', `${app}:current`, () =>
			getCurrentRelease(token, app)
		);

		return res.status(200).json({ release });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuCurrentRelease;
