import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { renameApp, invalidate } from '../../lib/heroku/index.js';

/**
 * PATCH /:id/apps/:app/rename — body `{ name }`.
 *
 * The git remote and the default herokuapp.com hostname both follow the name,
 * so every bookmark, webhook and deploy remote pointing at the old one breaks
 * the moment this succeeds.
 */
const renameHerokuApp = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const name = String(req.body?.name || '').trim().toLowerCase();

	if (!name) {
		return res.status(400).json({ message: 'name is required' });
	}

	// Heroku's own rule, checked here so a bad name reads as a validation error
	// rather than a platform failure.
	if (!/^[a-z][a-z0-9-]{2,29}$/.test(name)) {
		return res.status(400).json({
			message:
				'App names are 3-30 characters, lowercase, starting with a letter, and may contain digits and hyphens.',
		});
	}

	try {
		const result = await renameApp(token, app, name);
		invalidate(String(account._id), app);
		invalidate(String(account._id));

		recordActivity({
			req,
			account,
			appName: name,
			action: 'app.rename',
			summary: `Renamed ${app} to ${name}`,
		});

		return res.status(200).json(result);
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.rename',
			summary: `Failed to rename ${app} to ${name}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default renameHerokuApp;
