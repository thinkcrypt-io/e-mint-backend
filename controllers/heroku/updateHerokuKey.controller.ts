import { Response } from 'express';
import HerokuAccount from '../../models/heroku/model.js';
import { getAccount, toHerokuError } from '../../lib/heroku/index.js';
import recordHistory from '../../library/functions/recordHistory.function.js';

/**
 * `apiKey` is `edit: false`, so the generic PUT rejects it — this is the only
 * way to rotate a stored key. Verifies against Heroku first, then lets the
 * pre-save hook reseal and refresh `keyLast4`/`keyFingerprint`.
 */
const updateHerokuKey = async (req: any, res: Response): Promise<Response> => {
	try {
		const apiKey = String(req.body?.apiKey || '').trim();

		if (!apiKey) {
			return res.status(400).json({ message: 'apiKey is required' });
		}

		const account = await HerokuAccount.findById(req.params.id);

		if (!account) {
			return res.status(404).json({ message: 'Heroku account not found' });
		}

		let preview;
		try {
			preview = await getAccount(apiKey);
		} catch (e: any) {
			const error = toHerokuError(e);
			return res.status(400).json({ message: error.message, id: error.id });
		}

		account.apiKey = apiKey;
		account.status = 'active';
		account.lastError = '';
		account.accountEmail = preview.email;
		account.accountId = preview.id;
		account.accountName = preview.name;
		account.isVerified = preview.verified;
		account.twoFactor = preview.twoFactor;
		account.defaultTeam = preview.defaultTeam;
		account.lastSyncedAt = new Date();

		await account.save();

		recordHistory({
			req,
			action: 'update',
			model: 'HerokuAccount',
			doc: account,
			changes: [{ field: 'apiKey', label: 'API Key', from: 'rotated', to: 'rotated' }],
		});

		const sanitized = await HerokuAccount.findById(account._id);

		return res.status(200).json({ message: 'Heroku key updated', doc: sanitized });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

export default updateHerokuKey;
