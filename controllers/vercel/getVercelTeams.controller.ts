import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { listTeams, cached } from '../../lib/vercel/index.js';

/** GET /:id/teams — `[]` is the normal answer on a personal account. */
const getVercelTeams = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;

	try {
		const teams = await cached(String(account._id), team, 'teams', '', () => listTeams(token));

		return res.status(200).json({ count: teams.length, teams, defaultTeamId: account.defaultTeamId || '' });
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelTeams;
