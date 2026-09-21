import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { createProject, invalidate, toVercelError } from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/** POST /:id/projects — create a project, optionally linked to a git repo. */
const createVercelProject = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;

	const name = String(req.body?.name || '').trim();
	if (!name) return res.status(400).json({ message: 'A project name is required' });

	const input = {
		name,
		...(req.body?.framework ? { framework: req.body.framework } : {}),
		...(req.body?.gitRepository?.repo
			? {
					gitRepository: {
						repo: String(req.body.gitRepository.repo),
						type: String(req.body.gitRepository.type || 'github'),
					},
				}
			: {}),
		...(req.body?.buildCommand ? { buildCommand: req.body.buildCommand } : {}),
		...(req.body?.installCommand ? { installCommand: req.body.installCommand } : {}),
		...(req.body?.outputDirectory ? { outputDirectory: req.body.outputDirectory } : {}),
		...(req.body?.rootDirectory ? { rootDirectory: req.body.rootDirectory } : {}),
	};

	try {
		const project = await createProject(token, input, team);
		invalidate(String(account._id));

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			action: 'project.create',
			summary: `Created the project ${project.name}`,
		});

		return res.status(201).json({ message: 'Project created', project });
	} catch (e: any) {
		console.error(e.message);

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: name,
			action: 'project.create',
			summary: `Failed to create the project ${name}`,
			status: 'failed',
			errorMessage: toVercelError(e).message,
		});

		return handleVercelFailure(e, res, account);
	}
};

export default createVercelProject;
