import { Response } from 'express';
import { getAccount, toHerokuError } from '../../lib/heroku/index.js';

/**
 * Pre-flight check for the create form: does this key work at all? Never
 * echoes the key back — only the account preview Heroku hands us for it.
 */
const verifyHerokuKey = async (req: any, res: Response): Promise<Response> => {
	try {
		const apiKey = String(req.body?.apiKey || '').trim();

		if (!apiKey) {
			return res.status(400).json({ message: 'apiKey is required' });
		}

		const account = await getAccount(apiKey);

		return res.status(200).json({ ok: true, account });
	} catch (e: any) {
		console.error(e.message);
		const error = toHerokuError(e);
		return res.status(error.status).json({ message: error.message, id: error.id });
	}
};

export default verifyHerokuKey;
