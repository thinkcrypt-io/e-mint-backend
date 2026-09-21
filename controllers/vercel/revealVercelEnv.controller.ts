import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getEnvValue, getProject } from '../../lib/vercel/index.js';

/**
 * GET /:id/projects/:project/env/:envId — one plaintext value.
 *
 * The list endpoint returns encrypted envelopes however it is asked
 * (VWO-01 #8), so revealing a value is necessarily one request per variable.
 * That turns out to be the right shape anyway: a value is only ever fetched
 * when someone explicitly asks to see that one, rather than every value landing
 * in a response that merely rendered a table.
 *
 * A `sensitive` variable is not revealable at all — Vercel will not return it
 * to anyone, including its own dashboard.
 */
const revealVercelEnv = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const envId = String(req.params.envId);

	try {
		const project = await getProject(token, ref, team);
		const record = await getEnvValue(token, project.id, envId, team);

		if (!record.revealable) {
			return res.status(200).json({
				key: record.key,
				value: null,
				readable: false,
				revealable: false,
				message: 'Vercel never returns a sensitive value to anyone. Replace it instead.',
			});
		}

		res.setHeader('Cache-Control', 'no-store');

		return res.status(200).json({
			key: record.key,
			value: record.value,
			readable: record.readable,
			revealable: true,
			target: record.target,
			gitBranch: record.gitBranch,
		});
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default revealVercelEnv;
