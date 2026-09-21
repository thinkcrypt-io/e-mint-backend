import { Response } from 'express';
import { resolveAccount, handleVercelFailure } from './resolveToken.js';
import { getUser, listTeams, cached } from '../../lib/vercel/index.js';

/** GET /:id/account — live snapshot, and refreshes the stored copy. */
const getVercelAccount = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req, res);
	if (!resolved) return res;

	const { account, token, team } = resolved;

	try {
		const user = await cached(String(account._id), team, 'user', '', () => getUser(token));
		const teams = await cached(String(account._id), team, 'teams', '', () =>
			listTeams(token).catch(() => [])
		);

		account.userId = user.userId;
		account.username = user.username;
		account.userEmail = user.userEmail;
		account.displayName = user.displayName;
		account.plan = user.plan;
		account.teams = teams;
		account.status = 'active';
		account.lastSyncedAt = new Date();
		account.lastError = '';
		await account.save();

		return res.status(200).json({
			account: {
				userId: user.userId,
				username: user.username,
				userEmail: user.userEmail,
				displayName: user.displayName,
				plan: user.plan,
				avatar: user.avatar,
				createdAt: user.createdAt,
			},
			teams,
			// Empty is the correct scope on a personal account, and the UI hides
			// the team switcher entirely when there is nothing to switch between.
			team,
			hasTeams: teams.length > 1,
			// Null when Vercel sent no rate headers, which is common — the page
			// shows nothing rather than a made-up budget.
			rateLimit: user.rateLimit,
		});
	} catch (e: any) {
		console.error(e.message);
		return handleVercelFailure(e, res, account);
	}
};

export default getVercelAccount;
