import { Response } from 'express';
import VercelAccount from '../../models/vercel/model.js';
import { getUser, listTeams, toVercelError, invalidate } from '../../lib/vercel/index.js';
import { recordActivity } from './recordActivity.js';

/**
 * PUT /:id/key — rotate a stored token.
 *
 * Refuses a token belonging to a different Vercel user unless the caller says
 * so explicitly. Silently repointing a record at another account while keeping
 * its label, its client link and its audit history is the kind of thing nobody
 * notices until it matters.
 */
const updateVercelToken = async (req: any, res: Response): Promise<Response> => {
	const token = String(req.body?.apiToken || '').trim();
	const allowAccountChange = !!req.body?.allowAccountChange;

	if (!token) return res.status(400).json({ message: 'An API token is required' });

	const account = await VercelAccount.findById(req.params.id);
	if (!account) return res.status(404).json({ message: 'Vercel account not found' });

	try {
		const user = await getUser(token);

		if (account.userId && user.userId && account.userId !== user.userId && !allowAccountChange) {
			return res.status(409).json({
				message: `This token belongs to a different Vercel account (${
					user.userEmail || user.username || 'unknown'
				}). Rotating to it would repoint this record, its ownership links and its history at another account.`,
				requiresConfirmation: true,
				currentUser: account.userEmail,
				incomingUser: user.userEmail,
			});
		}

		const teams = await listTeams(token).catch(() => []);

		account.apiToken = token;
		account.userId = user.userId;
		account.username = user.username;
		account.userEmail = user.userEmail;
		account.displayName = user.displayName;
		account.plan = user.plan;
		account.teams = teams;
		account.status = 'active';
		account.lastSyncedAt = new Date();
		account.lastError = '';

		// The stored default may belong to the old account.
		if (account.defaultTeamId && !teams.some(t => t.teamId === account.defaultTeamId)) {
			account.defaultTeamId = '';
		}

		await account.save();
		invalidate(String(account._id));

		recordActivity({
			req,
			account,
			action: 'account.token-rotate',
			summary: `Rotated the API token for ${account.label}`,
		});

		return res.status(200).json({ message: 'Token rotated', tokenLast4: account.tokenLast4 });
	} catch (e: any) {
		const error = toVercelError(e);

		recordActivity({
			req,
			account,
			action: 'account.token-rotate',
			summary: `Failed to rotate the API token for ${account.label}`,
			status: 'failed',
			errorMessage: error.message,
		});

		return res.status(error.status).json({ message: error.message, code: error.code });
	}
};

export default updateVercelToken;
