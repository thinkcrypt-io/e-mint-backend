import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	updateProject,
	invalidate,
	findManagedProject,
	getProject,
	toVercelError,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/** Only the build configuration is editable from here — never the git link. */
const EDITABLE = [
	'framework',
	'buildCommand',
	'installCommand',
	'outputDirectory',
	'devCommand',
	'rootDirectory',
	'nodeVersion',
];

/** PATCH /:id/projects/:project */
const updateVercelProject = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	const patch: Record<string, any> = {};
	EDITABLE.forEach(field => {
		if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) patch[field] = req.body[field];
	});

	if (!Object.keys(patch).length) {
		return res.status(400).json({ message: 'No editable fields were supplied' });
	}

	try {
		const before = await getProject(token, ref, team);
		const storefront = await findManagedProject(before.id);

		const project = await updateProject(token, ref, patch, team);
		invalidate(String(account._id), before.id);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			isStorefront: !!storefront,
			action: 'project.update',
			summary: `Updated ${Object.keys(patch).join(', ')} on ${project.name}`,
		});

		return res.status(200).json({ message: 'Project updated', project });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: ref,
			action: 'project.update',
			summary: `Failed to update ${ref}`,
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default updateVercelProject;
