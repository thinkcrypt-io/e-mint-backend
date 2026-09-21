import { Response } from 'express';
import { getUser, listTeams, toVercelError } from '../../lib/vercel/index.js';

/**
 * POST /verify — pre-flight a token without storing anything.
 *
 * Returns whose account it is and which teams it can see, so the connect form
 * can show the operator what they just pasted and let them pick a default team
 * before committing. An empty `teams` array is the normal answer on a personal
 * account, not a failure.
 */
const verifyVercelToken = async (req: any, res: Response): Promise<Response> => {
	const token = String(req.body?.apiToken || req.body?.token || '').trim();

	if (!token) return res.status(400).json({ message: 'An API token is required' });

	try {
		const user = await getUser(token);

		// Teams are a secondary question: a token that identifies a user is a
		// valid token even if the team list fails, so this never fails the check.
		const teams = await listTeams(token).catch(() => []);

		return res.status(200).json({
			valid: true,
			user: {
				userId: user.userId,
				username: user.username,
				userEmail: user.userEmail,
				displayName: user.displayName,
				plan: user.plan,
			},
			teams,
			rateLimit: user.rateLimit,
		});
	} catch (e: any) {
		const error = toVercelError(e);

		// A failed pre-flight is an answer, not a server error: the form shows
		// Vercel's own message beside the field rather than a red toast.
		return res.status(200).json({ valid: false, message: error.message, code: error.code });
	}
};

export default verifyVercelToken;
