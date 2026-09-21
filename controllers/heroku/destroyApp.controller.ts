import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { destroyApp, invalidate } from '../../lib/heroku/index.js';

/**
 * DELETE /:id/apps/:app — body `{ confirm: "<app name>" }`.
 *
 * Permanent and not recoverable through the API: the dynos, the add-ons, the
 * database and the config vars all go.
 *
 * The typed confirmation is required **server-side**, not only in the dialog.
 * A UI-only guard is one stray fetch away from being bypassed, and this is the
 * single action here with no undo.
 */
const destroyHerokuApp = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const confirm = String(req.body?.confirm || '').trim();

	if (confirm !== app) {
		return res.status(400).json({
			message: `To delete this app, confirm with its exact name: "${app}"`,
		});
	}

	try {
		await destroyApp(token, app);
		invalidate(String(account._id));

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.destroy',
			summary: `Deleted the app ${app}`,
		});

		return res.status(200).json({ message: `${app} has been deleted` });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.destroy',
			summary: `Failed to delete ${app}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default destroyHerokuApp;
