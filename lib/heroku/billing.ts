import { herokuClient } from './client.js';

/**
 * Billing and usage.
 *
 * **Invoice amounts are cents.** Confirmed against a live account: an invoice
 * reporting `total: 777` is $7.77. All three money fields (`charges_total`,
 * `credits_total`, `total`) use the same unit. They are passed through as the
 * integer Heroku sends and divided at the point of display, so no rounding
 * happens twice.
 *
 * **Usage units are still unconfirmed.** Whether `usage.dynos` counts
 * dyno-hours or dyno-units has not been checked against a real account, so the
 * usage response still carries `unitsVerified: false` and the UI must not put a
 * unit suffix on those numbers. Flip the second constant and label the UI in
 * the same commit once someone has verified it — not before.
 */
export const INVOICE_AMOUNTS_IN_CENTS = true;
export const USAGE_UNITS_VERIFIED = false;

export type HerokuInvoice = {
	number: number;
	periodStart: string | null;
	periodEnd: string | null;
	chargesTotal: number;
	creditsTotal: number;
	total: number;
	state: string;
	/** The raw integer, kept so an unmapped state is still diagnosable. */
	stateCode: number | null;
	createdAt: string | null;
};

/**
 * Heroku reports invoice state as an integer and does not document the enum.
 * These four are the observed values; anything else maps to `unknown` rather
 * than leaking a bare number into the UI, and `stateCode` carries the original
 * so it can be identified and added here.
 */
const INVOICE_STATE: Record<number, string> = {
	0: 'pending',
	1: 'paid',
	2: 'payment-failed',
	3: 'pending-payment',
};

const toInvoice = (data: any): HerokuInvoice => {
	const code = typeof data?.state === 'number' ? data.state : null;

	return {
		number: data?.number,
		periodStart: data?.period_start || null,
		periodEnd: data?.period_end || null,
		chargesTotal: data?.charges_total ?? 0,
		creditsTotal: data?.credits_total ?? 0,
		total: data?.total ?? 0,
		state: (code !== null && INVOICE_STATE[code]) || 'unknown',
		stateCode: code,
		createdAt: data?.created_at || null,
	};
};

/** GET /account/invoices, or a team's when `team` is given. */
export const listInvoices = async (token: string, team?: string): Promise<HerokuInvoice[]> => {
	const path = team ? `/teams/${encodeURIComponent(team)}/invoices` : '/account/invoices';
	const { data } = await herokuClient(token).get(path);

	return (data || [])
		.map(toInvoice)
		.sort((a: HerokuInvoice, b: HerokuInvoice) => b.number - a.number);
};

export type MonthlyUsageApp = {
	appName: string;
	dynos: number;
	addons: number;
	data: number;
	partner: number;
};

export type MonthlyUsage = {
	month: string;
	dynos: number;
	addons: number;
	data: number;
	partner: number;
	apps: MonthlyUsageApp[];
};

/** `2026-09` for the current month, which is the default range. */
export const currentMonth = (): string => new Date().toISOString().slice(0, 7);

/**
 * GET /accounts/{account_id}/usage/monthly?start=YYYY-MM&end=YYYY-MM
 *
 * `accountId` is the Heroku account id from GET /account, not our Mongo id.
 */
export const monthlyUsage = async (
	token: string,
	accountId: string,
	{ start, end }: { start?: string; end?: string } = {}
): Promise<MonthlyUsage[]> => {
	const from = start || currentMonth();
	const to = end || from;

	const { data } = await herokuClient(token).get(
		`/accounts/${encodeURIComponent(accountId)}/usage/monthly`,
		{ params: { start: from, end: to } }
	);

	return (data || []).map((month: any) => ({
		month: month?.month || month?.start_date || from,
		dynos: month?.dynos ?? 0,
		addons: month?.addons ?? 0,
		data: month?.data ?? 0,
		partner: month?.partner ?? 0,
		apps: (month?.apps || []).map((app: any) => ({
			appName: app?.app_name || app?.name || '',
			dynos: app?.dynos ?? 0,
			addons: app?.addons ?? 0,
			data: app?.data ?? 0,
			partner: app?.partner ?? 0,
		})),
	}));
};
