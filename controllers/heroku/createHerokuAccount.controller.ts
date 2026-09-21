import { Response } from 'express';
import HerokuAccount from '../../models/heroku/model.js';
import { getAccount, toHerokuError } from '../../lib/heroku/index.js';
import recordHistory from '../../library/functions/recordHistory.function.js';

/**
 * Replaces the generic `POST /`. The key has to prove itself against Heroku
 * before we ever write it — an account row backed by a garbage key is not a
 * partial success, it is just a broken row.
 */
const createHerokuAccount = async (req: any, res: Response): Promise<Response> => {
	try {
		const apiKey = String(req.body?.apiKey || '').trim();

		if (!apiKey) {
			return res.status(400).json({ message: 'apiKey is required' });
		}

		let preview;
		try {
			preview = await getAccount(apiKey);
		} catch (e: any) {
			const error = toHerokuError(e);
			return res.status(400).json({ message: error.message, id: error.id });
		}

		const document = new HerokuAccount({
			...req.body,
			apiKey,
			status: 'active',
			accountEmail: preview.email,
			accountId: preview.id,
			accountName: preview.name,
			isVerified: preview.verified,
			twoFactor: preview.twoFactor,
			defaultTeam: preview.defaultTeam,
			lastSyncedAt: new Date(),
			addedBy: req.user._id,
		});

		const saved = await document.save();

		recordHistory({ req, action: 'create', model: 'HerokuAccount', doc: saved });

		// Re-read so `select: false` strips the key rather than returning the
		// in-memory document, which still carries the sealed value we just set.
		const sanitized = await HerokuAccount.findById(saved._id);

		return res.status(201).json({
			message: `HerokuAccount with id: ${saved._id} added successfully`,
			doc: sanitized,
		});
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default createHerokuAccount;
