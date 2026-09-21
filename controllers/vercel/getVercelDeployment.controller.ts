import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getDeployment, listChecks, listDeploymentAliases, cached } from '../../lib/vercel/index.js';

/** GET /:id/deployments/:deployment */
const getVercelDeployment = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.deployment);

	try {
		const deployment = await cached(String(account._id), team, 'deployment', ref, () =>
			getDeployment(token, ref, team)
		);

		// Neither is essential to the page, so neither is allowed to fail it.
		const [checks, aliases] = await Promise.all([
			listChecks(token, ref, team).catch(() => []),
			listDeploymentAliases(token, ref, team).catch(() => []),
		]);

		return res.status(200).json({ deployment, checks, aliases });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelDeployment;
