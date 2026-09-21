import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getProjectResources, getProject, cached } from '../../lib/vercel/index.js';

/**
 * GET /:id/projects/:project/resources — what this project is using.
 *
 * Every section carries `available` / `planRestricted` so the UI can render the
 * three states it needs: has items, has none, and not available on this plan.
 * A Pro-only endpoint answering 403 is information, not an error.
 */
const getVercelProjectResources = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	try {
		const project = await getProject(token, ref, team);

		const resources = await cached(String(account._id), team, 'resources', project.id, () =>
			getProjectResources(token, project, team)
		);

		return res.status(200).json({ resources, project: { id: project.id, name: project.name } });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelProjectResources;
