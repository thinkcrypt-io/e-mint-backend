import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getAccountResources, listAllProjects, cached } from '../../lib/vercel/index.js';

/**
 * GET /:id/resources — the account rollup.
 *
 * The inverse of the per-project view: what exists on this account and which
 * projects use it. `orphans` is the part that only this view can answer — a
 * store or a paid integration attached to no project is invisible from every
 * project page by definition, and it is money leaving the account for nothing.
 */
const getVercelAccountResources = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;

	try {
		const resources = await cached(String(account._id), team, 'accountResources', '', async () => {
			const projects = await listAllProjects(token, { team });
			return getAccountResources(token, projects, team);
		});

		return res.status(200).json({ resources });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelAccountResources;
