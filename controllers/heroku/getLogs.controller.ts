import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { fetchLogs } from '../../lib/heroku/index.js';

const MAX_LINES = 1500;

/**
 * GET /:id/apps/:app/logs?lines=&source=&dyno=
 *
 * Gated on `view-heroku-config` rather than `view-heroku`, and never cached.
 * Applications print tokens, connection strings and request bodies to stdout as
 * a matter of routine, so log access is secret access — the same privilege as
 * reading config vars, not the lower one of seeing an app exists.
 */
const getHerokuLogs = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const app = req.params.app;

	const requested = Number(req.query.lines);
	const lines = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LINES) : 100;
	const source = req.query.source === 'app' || req.query.source === 'heroku' ? req.query.source : '';
	const dyno = typeof req.query.dyno === 'string' ? req.query.dyno : '';

	try {
		const logLines = await fetchLogs(token, app, { lines, source, dyno });

		res.set('Cache-Control', 'no-store');
		return res.status(200).json({ app, count: logLines.length, lines: logLines });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuLogs;
