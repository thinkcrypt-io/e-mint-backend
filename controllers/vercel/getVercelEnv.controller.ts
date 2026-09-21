import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { listEnv, getProject } from '../../lib/vercel/index.js';

/**
 * GET /:id/projects/:project/env
 *
 * Never cached — these are live secrets, and a stale read here is worse than a
 * slow one. `Cache-Control: no-store` for the same reason.
 *
 * Grouped by key on the way out, because the same key exists once per target
 * with a different value each time. A flat list would render as a key/value
 * table and quietly imply there is one value per name.
 */
const getVercelEnv = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);
	const decrypt = String(req.query?.decrypt || '') === 'true';

	try {
		const project = await getProject(token, ref, team);
		const records = await listEnv(token, project.id, { team, decrypt });

		const byKey: Record<string, any[]> = {};
		records.forEach(record => {
			if (!byKey[record.key]) byKey[record.key] = [];
			byKey[record.key].push(record);
		});

		res.setHeader('Cache-Control', 'no-store');

		return res.status(200).json({
			count: records.length,
			keyCount: Object.keys(byKey).length,
			records,
			// Vercel never returns these to anyone, so the UI shows them as
			// permanently hidden with a Replace action, not a Reveal one.
			sensitiveCount: records.filter(r => !r.revealable).length,
			// Everything else arrives masked too — the list endpoint returns
			// encrypted envelopes however it is asked (VWO-01 #8) — but can be
			// revealed one at a time through the `env/:envId` route.
			maskedCount: records.filter(r => r.revealable && !r.readable).length,
			project: { id: project.id, name: project.name },
		});
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelEnv;
