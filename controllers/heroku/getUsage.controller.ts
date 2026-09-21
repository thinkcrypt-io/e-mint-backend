import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { monthlyUsage, currentMonth, cached, USAGE_UNITS_VERIFIED } from '../../lib/heroku/index.js';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * GET /:id/usage?start=YYYY-MM&end=YYYY-MM
 *
 * Needs the Heroku account id, which is on the stored snapshot. If the account
 * has never been synced there is nothing to query against — say so plainly
 * rather than sending Heroku an undefined path segment.
 */
const getHerokuUsage = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;

	if (!account.accountId) {
		return res
			.status(409)
			.json({ message: 'This account has not been synced yet. Open it once to load its details.' });
	}

	const start = MONTH.test(String(req.query.start)) ? String(req.query.start) : currentMonth();
	const end = MONTH.test(String(req.query.end)) ? String(req.query.end) : start;

	if (end < start) {
		return res.status(400).json({ message: 'end must not be earlier than start' });
	}

	try {
		const usage = await cached(String(account._id), 'usage', `${start}:${end}`, () =>
			monthlyUsage(token, account.accountId, { start, end })
		);

		return res.status(200).json({ start, end, usage, unitsVerified: USAGE_UNITS_VERIFIED });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuUsage;
