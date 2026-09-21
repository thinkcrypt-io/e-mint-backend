import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getDeploymentEvents } from '../../lib/vercel/index.js';

/**
 * GET /:id/deployments/:deployment/events — build logs.
 *
 * Gated on `view-vercel-env`, not `view-vercel`: a build prints environment
 * values, tokens and connection strings to stdout constantly, so being able to
 * read build output is being able to read the environment. Never cached, and
 * never stored.
 */
const getVercelBuildLogs = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.deployment);
	const limit = Math.min(Number(req.query?.limit) || 500, 2000);

	try {
		const events = await getDeploymentEvents(token, ref, team, limit);

		res.setHeader('Cache-Control', 'no-store');

		return res.status(200).json({ count: events.length, events });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelBuildLogs;
