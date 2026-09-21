import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	accountUsage,
	listAllProjects,
	findManagedProjects,
	cached,
} from '../../lib/vercel/index.js';

/** 7 / 30 / 90 rather than a free date picker: each window is many requests. */
const ALLOWED_WINDOWS = [7, 30, 90];

/**
 * GET /:id/usage?days=30
 *
 * Derived usage. Vercel exposes no consumer metered-usage endpoint, so builds,
 * build minutes and the per-project breakdown are computed from the deployment
 * list, and the response names what it cannot show rather than omitting it.
 * The UI is required to render `unavailable` — build numbers read as the whole
 * picture otherwise.
 */
const getVercelUsage = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;

	const requested = Number(req.query?.days) || 30;
	const days = ALLOWED_WINDOWS.indexOf(requested) === -1 ? 30 : requested;

	try {
		const usage = await cached(String(account._id), team, 'usage', String(days), async () => {
			const projects = await listAllProjects(token, { team });
			const managed = await findManagedProjects(projects.map(p => p.id));

			const storefronts: Record<string, boolean> = {};
			Object.keys(managed).forEach(id => {
				storefronts[id] = true;
			});

			return accountUsage(token, projects, {
				team,
				days,
				plan: account.plan || 'unknown',
				storefronts,
			});
		});

		return res.status(200).json({ usage });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelUsage;
