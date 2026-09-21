import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	promote,
	getProject,
	getDeployment,
	invalidate,
	findManagedProject,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * POST /:id/projects/:project/promote/:deployment
 *
 * This is what "rollback" means on Vercel: the production alias moves to an
 * existing deployment. Nothing is rebuilt, and promoting back undoes it — which
 * is why this is confirmed but not type-to-confirm for an ordinary project.
 */
const promoteVercelDeployment = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const deploymentRef = String(req.params.deployment);

	try {
		const project = await getProject(token, ref, team);
		const storefront = await findManagedProject(project.id);
		const deployment = await getDeployment(token, deploymentRef, team).catch(() => null);

		if (storefront && String(req.body?.confirm || '') !== project.name) {
			return res.status(400).json({
				message: `${project.name} is the live storefront for ${storefront.shopName}. Type the project name exactly to change what its visitors are served.`,
				requiresConfirmation: true,
				storefront,
			});
		}

		await promote(token, project.id, deploymentRef, team);
		invalidate(String(account._id), project.id);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			deploymentId: deploymentRef,
			isStorefront: !!storefront,
			action: 'deployment.promote',
			summary: deployment?.commitMessage
				? `Promoted "${deployment.commitMessage}" to production on ${project.name}`
				: `Promoted a deployment to production on ${project.name}`,
		});

		return res.status(200).json({ message: 'Promoted to production' });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: ref,
			deploymentId: deploymentRef,
			action: 'deployment.promote',
			summary: `Failed to promote a deployment on ${ref}`,
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default promoteVercelDeployment;
