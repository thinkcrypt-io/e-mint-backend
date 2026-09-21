import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	listEnv,
	hydrateEnvValues,
	getProject,
	toEnvFile,
	toJsonFile,
	ENV_TARGETS,
	VercelEnvTarget,
} from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * GET /:id/projects/:project/env/download?format=env|json&target=production
 *
 * The target is part of the request, not a hidden default: a flat `.env` cannot
 * represent three values for one key, so "the env file" is not a well-formed
 * question without one. JSON carries every target at once and is lossless.
 */
const downloadVercelEnv = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const format = String(req.query?.format || 'env').toLowerCase();
	const target = String(req.query?.target || 'production') as VercelEnvTarget;

	if (format === 'env' && ENV_TARGETS.indexOf(target) === -1) {
		return res.status(400).json({
			message: `A .env download needs a target: ${ENV_TARGETS.join(', ')}.`,
		});
	}

	try {
		const project = await getProject(token, ref, team);
		const listed = await listEnv(token, project.id, { team, decrypt: true });

		// A list read hands back encrypted envelopes, not values (VWO-01 #8), so
		// a download has to fetch each variable individually. That is one request
		// per variable against a 300/hour budget — acceptable for an explicit
		// download, which is exactly why it is not done on page load.
		const records = await hydrateEnvValues(token, project.id, listed, team);

		const unreadable = records.filter(r => !r.readable).length;

		const json = format === 'json';
		const body = json ? toJsonFile(records) : toEnvFile(records, target);
		const filename = json
			? `${project.name}.env.json`
			: `${project.name}.${target}.env`;

		recordActivity({
			req,
			account,
			teamId: team,
			projectName: project.name,
			action: 'env.download',
			summary: `Downloaded the ${json ? 'full' : target} environment for ${project.name} as .${json ? 'json' : 'env'}${
				unreadable ? ` (${unreadable} value(s) could not be read)` : ''
			}`,
		});

		if (unreadable) res.setHeader('X-Vercel-Env-Unreadable', String(unreadable));
		res.setHeader('Content-Type', json ? 'application/json' : 'text/plain; charset=utf-8');
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		// A file of live secrets must not sit in a proxy or a browser cache.
		res.setHeader('Cache-Control', 'no-store');

		return res.status(200).send(body);
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default downloadVercelEnv;
