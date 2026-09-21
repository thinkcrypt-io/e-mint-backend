import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { setMaintenance, invalidate } from '../../lib/heroku/index.js';

/** PATCH /:id/apps/:app/maintenance — body `{ enabled: boolean }`. */
const setHerokuMaintenance = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const enabled = req.body?.enabled;

	if (typeof enabled !== 'boolean') {
		return res.status(400).json({ message: 'Body must be { enabled: true | false }' });
	}

	try {
		const result = await setMaintenance(token, app, enabled);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.maintenance',
			summary: `Turned maintenance mode ${enabled ? 'on' : 'off'} for ${app}`,
		});

		return res.status(200).json(result);
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.maintenance',
			summary: `Failed to turn maintenance mode ${enabled ? 'on' : 'off'} for ${app}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default setHerokuMaintenance;
