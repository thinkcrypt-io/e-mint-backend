import { Response } from 'express';
import { resolveAccount, handleHerokuFailure } from './resolveToken.js';
import { listInvoices, cached, INVOICE_AMOUNTS_IN_CENTS } from '../../lib/heroku/index.js';

/**
 * GET /:id/billing?team=
 *
 * Amounts are the integer cents Heroku sends — an invoice totalling 777 is
 * $7.77. `amountsInCents` states that on the wire so the client is not guessing,
 * and the division happens once, at display time.
 */
const getHerokuBilling = async (req: any, res: Response): Promise<Response> => {
	const resolved = await resolveAccount(req.params.id, res);
	if (!resolved) return res;

	const { account, token } = resolved;
	const team = typeof req.query.team === 'string' ? req.query.team : undefined;

	try {
		const invoices = await cached(String(account._id), 'invoices', team || 'personal', () =>
			listInvoices(token, team)
		);

		return res.status(200).json({ invoices, amountsInCents: INVOICE_AMOUNTS_IN_CENTS });
	} catch (e: any) {
		console.error(e.message);
		return handleHerokuFailure(e, res, account);
	}
};

export default getHerokuBilling;
