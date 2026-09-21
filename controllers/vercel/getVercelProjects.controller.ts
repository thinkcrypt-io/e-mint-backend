import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { listProjects, cached, findManagedProjects } from '../../lib/vercel/index.js';

/**
 * GET /:id/projects — also refreshes `projectCount` on the stored document.
 *
 * Every row is tagged with whether it is a live shop storefront. That tag is
 * resolved in one query for the whole page, not one per row.
 */
const getVercelProjects = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;

	const search = String(req.query?.search || '');
	const until = Number(req.query?.until) || null;

	try {
		const page = await cached(
			String(account._id),
			team,
			'projects',
			`${search}:${until || ''}`,
			() => listProjects(token, { team, search, until })
		);

		const managed = await findManagedProjects(page.items.map(p => p.id));

		const projects = page.items.map(project => ({
			...project,
			storefront: managed[project.id] || null,
		}));

		if (!search && !until) {
			account.projectCount = projects.length;
			await account.save();
		}

		return res.status(200).json({ count: projects.length, projects, next: page.next });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelProjects;
