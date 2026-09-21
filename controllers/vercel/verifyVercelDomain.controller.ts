import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	verifyProjectDomain,
	getProject,
	invalidate,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/** POST /:id/projects/:project/domains/:domain/verify */
const verifyVercelDomain = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const name = String(req.params.domain);

	try {
		const project = await getProject(token, ref, team);
		const domain = await verifyProjectDomain(token, project.id, name, team);
		invalidate(String(account._id), project.id);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			action: 'domain.verify',
			summary: domain.verified
				? `Verified the domain ${name} on ${project.name}`
				: `Attempted to verify ${name} on ${project.name}; DNS has not propagated yet`,
			status: domain.verified ? 'success' : 'failed',
			errorMessage: domain.verified ? '' : 'Verification records not found in DNS yet',
		});

		return res.status(200).json({
			message: domain.verified
				? 'Domain verified'
				: 'Vercel could not see the verification record yet. DNS changes can take a while to propagate.',
			domain,
		});
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default verifyVercelDomain;
