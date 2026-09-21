import { Response } from 'express';
import VercelAccount from '../../models/vercel/model.js';
import { getUser, listTeams, toVercelError } from '../../lib/vercel/index.js';

/**
 * POST /vercels — replaces the generic create.
 *
 * Verifies the token before storing it and snapshots the identity, so a row is
 * never saved in a state where nobody can tell whose account it is. The token
 * is sealed by the model's pre-save hook, not here.
 */
const createVercelAccount = async (req: any, res: Response): Promise<Response> => {
	const token = String(req.body?.apiToken || '').trim();

	if (!token) return res.status(400).json({ message: 'An API token is required' });

	try {
		const user = await getUser(token);
		const teams = await listTeams(token).catch(() => []);

		const requestedTeam = String(req.body?.defaultTeamId || '').trim();
		// Only accept a default team the token can actually see. A teamId that is
		// not in the list would scope every later call to an empty result set,
		// which looks like "no projects" rather than like a misconfiguration.
		const defaultTeamId =
			requestedTeam && teams.some(t => t.teamId === requestedTeam) ? requestedTeam : '';

		const account = new VercelAccount({
			...req.body,
			apiToken: token,
			userId: user.userId,
			username: user.username,
			userEmail: user.userEmail,
			displayName: user.displayName,
			plan: user.plan,
			teams,
			defaultTeamId,
			status: 'active',
			lastSyncedAt: new Date(),
			lastError: '',
			addedBy: req?.user?._id,
		});

		const saved = await account.save();

		// Re-read without the token: `saved` still holds the sealed value in
		// memory and the whole point of `select: false` is that it never rides
		// out on a response.
		const clean = await VercelAccount.findById(saved._id);

		return res.status(201).json({ message: 'Vercel account connected', doc: clean });
	} catch (e: any) {
		if (e?.response) {
			const error = toVercelError(e);
			return res.status(error.status).json({ message: error.message, code: error.code });
		}

		console.error(e.message);
		return res.status(400).json({ message: e.message || 'Could not connect this account' });
	}
};

export default createVercelAccount;
