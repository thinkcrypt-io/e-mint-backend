import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	addProjectDomain,
	getDomainConfig,
	getProject,
	invalidate,
	findManagedProject,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/** POST /:id/projects/:project/domains */
const addVercelDomain = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const name = String(req.body?.name || '').trim().toLowerCase();

	if (!name) return res.status(400).json({ message: 'A domain name is required' });

	try {
		const project = await getProject(token, ref, team);
		const storefront = await findManagedProject(project.id);

		const domain = await addProjectDomain(token, project.id, name, team);
		invalidate(String(account._id), project.id);

		// Added domains are almost never verified immediately, so the records to
		// create come back with the response rather than after a refresh.
		const config = await getDomainConfig(token, name, team).catch(() => null);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			isStorefront: !!storefront,
			action: 'domain.add',
			summary: `Added the domain ${name} to ${project.name}`,
		});

		return res.status(201).json({ message: 'Domain added', domain: { ...domain, config } });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: ref,
			action: 'domain.add',
			summary: `Failed to add the domain ${name} to ${ref}`,
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default addVercelDomain;
