import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import {
	listProjectDomains,
	getDomainConfig,
	getProject,
	cached,
} from '../../lib/vercel/index.js';

/**
 * GET /:id/projects/:project/domains
 *
 * The DNS configuration for every unverified domain is fetched alongside the
 * list rather than behind a click — knowing which record to create is the only
 * reason anyone opens this tab on an unverified domain.
 */
const getVercelDomains = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;
	const ref = String(req.params.project);

	try {
		const project = await getProject(token, ref, team);

		const domains = await cached(String(account._id), team, 'domains', project.id, () =>
			listProjectDomains(token, project.id, team)
		);

		const unverified = domains.filter(d => !d.verified);

		const configs = await Promise.all(
			unverified.map(d =>
				getDomainConfig(token, d.name, team)
					.then(config => ({ name: d.name, config }))
					.catch(() => ({ name: d.name, config: null }))
			)
		);

		const configByName: Record<string, any> = {};
		configs.forEach(entry => {
			configByName[entry.name] = entry.config;
		});

		return res.status(200).json({
			count: domains.length,
			domains: domains.map(d => ({ ...d, config: configByName[d.name] || null })),
			project: { id: project.id, name: project.name },
		});
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelDomains;
