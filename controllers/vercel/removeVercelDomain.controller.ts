import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	removeProjectDomain,
	getProject,
	invalidate,
	findManagedProject,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * DELETE /:id/projects/:project/domains/:domain
 *
 * Removing a storefront's domain takes a real shop off its own address, so it
 * is confirmed by project name the same way a deletion is.
 */
const removeVercelDomain = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const name = String(req.params.domain);

	try {
		const project = await getProject(token, ref, team);
		const storefront = await findManagedProject(project.id);

		if (storefront && String(req.body?.confirm || req.query?.confirm || '') !== project.name) {
			return res.status(400).json({
				message: `${project.name} is the live storefront for ${storefront.shopName}. Type the project name exactly to remove ${name} from it.`,
				requiresConfirmation: true,
				storefront,
			});
		}

		await removeProjectDomain(token, project.id, name, team);
		invalidate(String(account._id), project.id);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			isStorefront: !!storefront,
			action: 'domain.remove',
			summary: `Removed the domain ${name} from ${project.name}`,
		});

		return res.status(200).json({ message: `Removed ${name}` });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: ref,
			action: 'domain.remove',
			summary: `Failed to remove the domain ${name} from ${ref}`,
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default removeVercelDomain;
