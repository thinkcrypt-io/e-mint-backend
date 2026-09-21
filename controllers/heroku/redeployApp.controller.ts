import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { getCurrentRelease, releaseSlug, invalidate } from '../../lib/heroku/index.js';

/**
 * POST /:id/apps/:app/redeploy
 *
 * Heroku has no redeploy verb. The documented equivalent is re-releasing the
 * slug that is already current, which restarts the app on exactly the same
 * build — no rebuild, no new code fetched. If the intent is "pick up new
 * commits", that is a build (POST /builds), not this.
 */
const redeployHerokuApp = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;

	try {
		const current = await getCurrentRelease(token, app);

		if (!current?.slugId) {
			return res.status(400).json({
				message: `${app} has no current slug to re-release. Deploy it at least once first.`,
			});
		}

		const release = await releaseSlug(
			token,
			app,
			current.slugId,
			`Redeploy of v${current.version}`
		);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.redeploy',
			summary: `Redeployed ${app} (re-released v${current.version})`,
		});

		return res.status(200).json({ release });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.redeploy',
			summary: `Failed to redeploy ${app}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default redeployHerokuApp;
