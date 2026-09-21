import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getProject, cached, findManagedProject } from '../../lib/vercel/index.js';

/** GET /:id/projects/:project */
const getVercelProject = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	try {
		const project = await cached(String(account._id), team, 'project', ref, () =>
			getProject(token, ref, team)
		);

		const storefront = await findManagedProject(project.id);

		return res.status(200).json({ project, storefront });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelProject;
