import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listReleases, cached } from '../../lib/heroku/index.js';

/**
 * GET /:id/apps/:app/releases?cursor=
 *
 * `cursor` is an opaque Next-Range value from a previous page — pass it back
 * verbatim rather than parsing it. Only the first page is cached; later pages
 * are a deliberate "load more" click and should be fresh.
 */
const getHerokuReleases = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

	try {
		const load = () => listReleases(token, app, { cursor });
		const result = cursor ? await load() : await cached(String(account._id), 'releases', app, load);

		return res.status(200).json(result);
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuReleases;
