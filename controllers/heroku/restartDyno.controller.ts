import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { restartOne, invalidate } from '../../lib/heroku/index.js';

/** POST /:id/apps/:app/dynos/:dyno/restart — `:dyno` is a name like `web.1`. */
const restartHerokuDyno = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const dyno = req.params.dyno;

	try {
		await restartOne(token, app, dyno);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'dyno.restart',
			summary: `Restarted ${dyno} on ${app}`,
		});

		return res.status(200).json({ message: `Restarting ${dyno}` });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'dyno.restart',
			summary: `Failed to restart ${dyno} on ${app}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default restartHerokuDyno;
