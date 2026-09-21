import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { createBuild, invalidate } from '../../lib/heroku/index.js';

/**
 * POST /:id/apps/:app/builds
 *
 * Body `{ sourceUrl, version? }`. The documented way to deploy new code without
 * a git push: Heroku fetches the tarball, builds it, and releases the result.
 * A GitHub tarball URL for a branch or tag is the usual source.
 */
const createHerokuBuild = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const sourceUrl = String(req.body?.sourceUrl || '').trim();
	const version = req.body?.version ? String(req.body.version).trim() : undefined;

	if (!sourceUrl) {
		return res.status(400).json({ message: 'sourceUrl is required' });
	}

	// Heroku fetches this server-side, so a non-http scheme is either a mistake
	// or an attempt to make our backend open something it should not.
	if (!/^https?:\/\//i.test(sourceUrl)) {
		return res.status(400).json({ message: 'sourceUrl must be an http(s) URL to a .tar.gz' });
	}

	try {
		const build = await createBuild(token, app, { sourceUrl, version });
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.build',
			summary: `Started a build of ${app} from ${sourceUrl}`,
		});

		return res.status(201).json({ build });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.build',
			summary: `Failed to start a build of ${app}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default createHerokuBuild;
