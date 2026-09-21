import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { listDeployments, getProject, cached } from '../../lib/vercel/index.js';

/** GET /:id/projects/:project/deployments */
const getVercelDeployments = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	const target = String(req.query?.target || '');
	const state = String(req.query?.state || '');
	const until = Number(req.query?.until) || null;

	try {
		const project = await getProject(token, ref, team);

		const page = await cached(
			String(account._id),
			team,
			'deployments',
			`${project.id}:${target}:${state}:${until || ''}`,
			() => listDeployments(token, { project: project.id, team, target, state, until })
		);

		return res.status(200).json({
			count: page.items.length,
			deployments: page.items,
			next: page.next,
			// Normal on a Hobby plan, which allows one concurrent build. The tab
			// labels these explicitly rather than showing a vague pending state.
			queued: page.items.filter(d => d.isQueued).length,
			project: { id: project.id, name: project.name },
		});
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelDeployments;
