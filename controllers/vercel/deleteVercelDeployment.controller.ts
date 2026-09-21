import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	deleteDeployment,
	getDeployment,
	invalidate,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * DELETE /:id/deployments/:deployment
 *
 * Refused for whatever is currently serving production: deleting the live
 * deployment takes the site down, and there is no undo. Promote something else
 * first, then delete this one.
 */
const deleteVercelDeployment = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.deployment);

	try {
		const deployment = await getDeployment(token, ref, team);

		if (deployment.target === 'production' && String(deployment.readyState).toUpperCase() === 'READY') {
			return res.status(409).json({
				message: 'This is the current production deployment. Promote another deployment first, then delete this one.',
			});
		}

		await deleteDeployment(token, ref, team);
		invalidate(String(account._id), deployment.projectId || undefined);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: deployment.name || '',
			deploymentId: ref,
			action: 'deployment.delete',
			summary: `Deleted a deployment of ${deployment.name || 'a project'}`,
		});

		return res.status(200).json({ message: 'Deployment deleted' });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			deploymentId: ref,
			action: 'deployment.delete',
			summary: 'Failed to delete a deployment',
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default deleteVercelDeployment;
