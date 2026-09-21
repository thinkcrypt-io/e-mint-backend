import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { cancelDeployment, invalidate, toVercelError } from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/** PATCH /:id/deployments/:deployment/cancel — only meaningful while building. */
const cancelVercelDeployment = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.deployment);

	try {
		const deployment = await cancelDeployment(token, ref, team);
		invalidate(String(account._id), deployment.projectId || undefined);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: deployment.name || '',
			deploymentId: ref,
			action: 'deployment.cancel',
			summary: `Cancelled a running build on ${deployment.name || 'a project'}`,
		});

		return res.status(200).json({ message: 'Deployment cancelled', deployment });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			deploymentId: ref,
			action: 'deployment.cancel',
			summary: 'Failed to cancel a build',
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default cancelVercelDeployment;
