import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { recordActivity } from './recordActivity.js';
import { listReleases, releaseSlug, invalidate } from '../../lib/heroku/index.js';

/**
 * POST /:id/apps/:app/releases/:version/rollback
 *
 * Rolling back re-releases the slug a past release was built from. `:version`
 * is the human release number (`v42` without the v), not the release id — that
 * is what the UI shows, and looking the slug up here keeps the client from
 * having to know the difference.
 *
 * A release with no slug cannot be rolled back to: config-var changes and
 * add-on attachments create releases that carry no build output.
 */
const rollbackHerokuRelease = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;
	const version = Number(req.params.version);

	if (!Number.isFinite(version)) {
		return res.status(400).json({ message: 'Release version must be a number' });
	}

	try {
		// Walk back far enough to find it; 250 releases is well past anything
		// anyone rolls back to by hand.
		const { releases } = await listReleases(token, app, { max: 250 });
		const target = releases.find(release => release.version === version);

		if (!target) {
			return res.status(404).json({ message: `Release v${version} not found on ${app}` });
		}

		if (!target.slugId) {
			return res.status(400).json({
				message: `Release v${version} has no slug to roll back to. It was a config or add-on change, not a deploy.`,
			});
		}

		const release = await releaseSlug(token, app, target.slugId, `Rollback to v${version}`);
		invalidate(String(account._id), app);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.rollback',
			summary: `Rolled ${app} back to v${version}`,
		});

		return res.status(200).json({ release });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			appName: app,
			action: 'app.rollback',
			summary: `Failed to roll ${app} back to v${version}`,
			status: 'failed',
			errorMessage: e?.response?.data?.message || e.message,
		});

		return handleHerokuFailure(e, res, account);
	}
};

export default rollbackHerokuRelease;
