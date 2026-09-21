import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listAddons, listDomains, listCollaborators, cached } from '../../lib/heroku/index.js';

/**
 * GET /:id/apps/:app/resources — add-ons, domains and collaborators.
 *
 * Three read-only tabs that are cheap, slow-changing and always viewed
 * together; one round trip beats three.
 */
const getHerokuAppResources = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const id = String(account._id);

	try {
		const [addons, domains, collaborators] = await Promise.all([
			cached(id, 'addons', app, () => listAddons(token, app)),
			cached(id, 'domains', app, () => listDomains(token, app)),
			cached(id, 'collaborators', app, () => listCollaborators(token, app)),
		]);

		return res.status(200).json({ addons, domains, collaborators });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuAppResources;
