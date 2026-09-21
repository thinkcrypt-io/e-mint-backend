import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	deleteProject,
	getProject,
	invalidate,
	findManagedProject,
	storefrontRefusal,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * DELETE /:id/projects/:project
 *
 * Two guards, and both are load-bearing:
 *
 * 1. **A storefront is refused outright.** controllers/hongo deploys a Vercel
 *    project per shop onto this same account. Deleting one here would leave the
 *    Deployment row, Shop.deployment and PurchasedTheme.isDeployed all pointing
 *    at a project that no longer exists, and a shop that still believes it is
 *    live. hongo's own delete flow unwinds all of that; this one cannot.
 * 2. **The exact project name must be typed.** Deleting a Vercel project takes
 *    its deployments and its domain attachments with it, with no undo.
 */
const deleteVercelProject = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	try {
		const project = await getProject(token, ref, team);
		const storefront = await findManagedProject(project.id);

		if (storefront) {
			return res.status(409).json({
				message: storefrontRefusal(storefront),
				storefront,
			});
		}

		const confirm = String(req.body?.confirm || req.query?.confirm || '');

		if (confirm !== project.name) {
			return res.status(400).json({
				message: `Type the project name exactly (${project.name}) to confirm this deletion.`,
				requiresConfirmation: true,
			});
		}

		await deleteProject(token, ref, team);
		invalidate(String(account._id), project.id);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			action: 'project.delete',
			summary: `Deleted the project ${project.name}`,
		});

		return res.status(200).json({ message: `Deleted ${project.name}` });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: ref,
			action: 'project.delete',
			summary: `Failed to delete ${ref}`,
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default deleteVercelProject;
