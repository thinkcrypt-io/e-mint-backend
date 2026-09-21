import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { restartAll, invalidate } from '../../lib/heroku/index.js';

/** POST /:id/apps/:app/restart — restart every dyno. */
const restartHerokuApp = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;

	try {
		await restartAll(token, app);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.restart',
			summary: `Restarted all dynos on ${app}`,
		});

		return res.status(200).json({ message: `Restarting all dynos on ${app}` });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.restart',
			summary: `Failed to restart ${app}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default restartHerokuApp;
