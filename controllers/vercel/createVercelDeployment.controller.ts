import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	createDeployment,
	redeploy,
	getProject,
	getDeployment,
	invalidate,
	findManagedProject,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * POST /:id/projects/:project/deploy
 *
 * Two shapes, one route:
 *   { deploymentId }  -> redeploy an existing deployment
 *   { ref, target }   -> deploy a git branch
 *
 * The redeploy path carries its own fallback — see `redeploy` in
 * lib/vercel/deployments.ts — so it works whether or not `{ deploymentId }`
 * alone is enough, which VWO-01 #9 could not confirm without deploying on a
 * live account.
 */
const createVercelDeployment = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	const deploymentId = String(req.body?.deploymentId || '');
	const gitRef = String(req.body?.ref || '');
	const target = String(req.body?.target || 'production');

	try {
		const project = await getProject(token, ref, team);
		const storefront = await findManagedProject(project.id);

		// Redeploying a shop's production site is a real event for that shop, so
		// it is confirmed by name the same way a destructive action is.
		if (storefront && target === 'production' && String(req.body?.confirm || '') !== project.name) {
			return res.status(400).json({
				message: `${project.name} is the live storefront for ${storefront.shopName}. Type the project name exactly to deploy to its production site.`,
				requiresConfirmation: true,
				storefront,
			});
		}

		const sourceFor = (ref: string) =>
			project.gitRepo?.repo
				? {
						type: String(project.gitRepo.type || 'github'),
						...(project.gitRepo.org ? { org: project.gitRepo.org } : {}),
						...(project.gitRepo.repo ? { repo: project.gitRepo.repo } : {}),
						...(project.gitRepo.repoId ? { repoId: project.gitRepo.repoId } : {}),
						ref,
					}
				: null;

		let deployment;
		let usedFallback = false;

		if (deploymentId) {
			// The branch the original was built from, so the fallback reproduces
			// that deployment rather than whatever production points at now.
			const original = await getDeployment(token, deploymentId, team).catch(() => null);
			const ref = original?.branch || project.gitRepo?.productionBranch || 'main';

			const result = await redeploy(
				token,
				{ name: project.name, project: project.id, deploymentId, target },
				sourceFor(ref),
				team
			);

			deployment = result.deployment;
			usedFallback = result.usedFallback;
		} else {
			const source = sourceFor(gitRef || project.gitRepo?.productionBranch || 'main');

			if (!source) {
				return res.status(400).json({
					message:
						'This project has no git repository connected, so there is no branch to deploy. Redeploy an existing deployment instead.',
				});
			}

			deployment = await createDeployment(
				token,
				{ name: project.name, project: project.id, target, gitSource: source },
				team
			);
		}

		invalidate(String(account._id), project.id);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			deploymentId: deployment.id,
			isStorefront: !!storefront,
			action: deploymentId ? 'deployment.redeploy' : 'deployment.create',
			summary: deploymentId
				? `Redeployed ${project.name} to ${target}`
				: `Deployed ${gitRef || 'the production branch'} of ${project.name} to ${target}`,
		});

		return res.status(201).json({
			message: 'Deployment started',
			deployment,
			// True when the documented `{ deploymentId }` redeploy was rejected and
			// the git-ref path ran instead. Surfaced rather than hidden: the result
			// is equivalent for a git-linked project, but the caller should be able
			// to tell which one actually happened.
			usedFallback,
		});
	} catch (e: any) {
		console.error(e.message);

		const error = toVercelError(e);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: ref,
			action: deploymentId ? 'deployment.redeploy' : 'deployment.create',
			summary: `Failed to deploy ${ref}`,
			status: 'failed',
			errorMessage: error.message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default createVercelDeployment;
