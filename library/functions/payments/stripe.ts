import crypto from 'crypto';

/**
 * Stripe Checkout for a tenant's own Stripe account (docs/widgets W-06, WD6),
 * over Stripe's HTTP API — no SDK. The tenant's secret key creates a hosted
 * Checkout Session; Stripe calls our webhook when it's paid; we check the
 * webhook's signature with the tenant's signing secret, then ask Stripe for the
 * session again before believing it (functions/payments.function.ts).
 *
 * STRIPE_API_BASE points the calls at a stand-in server in local tests only;
 * production always talks to api.stripe.com.
 */

const base = () => (process.env.NODE_ENV !== 'production' && process.env.STRIPE_API_BASE) || 'https://api.stripe.com';

/** Currencies Stripe counts in whole units (no cents). */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

/** An amount (28.5) in the currency's smallest unit (2850) — what providers and Payment.amount use. */
export const toMinor = (amount: number, currency: string) => Math.round(amount * (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100));
export const fromMinor = (minor: number, currency: string) => minor / (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100);

/** Flattens { a: { b: 1 }, c: [ { d: 2 } ] } into Stripe's form encoding: a[b]=1&c[0][d]=2. */
const form = (data: any, prefix = '', out: string[] = []) => {
	for (const [k, v] of Object.entries(data)) {
		if (v === undefined || v === null || v === '') continue;
		const key = prefix ? `${prefix}[${k}]` : k;
		if (typeof v === 'object') form(v, key, out);
		else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
	}
	return out.join('&');
};

export class StripeError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const call = async (secretKey: string, method: 'GET' | 'POST', path: string, body?: any) => {
	let res: Response;
	try {
		res = await fetch(`${base()}${path}`, {
			method,
			headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
			...(body && { body: form(body) }),
			signal: AbortSignal.timeout(20_000),
		});
	} catch {
		throw new StripeError(502, 'Stripe didn’t answer — try again in a moment.');
	}
	const json: any = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg = json?.error?.message || `Stripe answered ${res.status}`;
		throw new StripeError(res.status === 401 ? 401 : 502, res.status === 401 ? 'Stripe refused the secret key — check it in Payments.' : `Stripe: ${msg}`);
	}
	return json;
};

/** A hosted Checkout page for one order: one line with the order's total, the server's price. */
export const createSession = (
	secretKey: string,
	o: { amount: number; currency: string; title: string; description?: string; email?: string; ref: string; successUrl: string; cancelUrl: string }
) =>
	call(secretKey, 'POST', '/v1/checkout/sessions', {
		mode: 'payment',
		success_url: o.successUrl,
		cancel_url: o.cancelUrl,
		client_reference_id: o.ref,
		customer_email: o.email,
		metadata: { mint_ref: o.ref },
		payment_intent_data: { metadata: { mint_ref: o.ref } },
		line_items: [
			{
				quantity: 1,
				price_data: { currency: o.currency.toLowerCase(), unit_amount: o.amount, product_data: { name: o.title.slice(0, 250), ...(o.description && { description: o.description.slice(0, 500) }) } },
			},
		],
	}) as Promise<{ id: string; url: string }>;

/** The session as Stripe has it now — the only thing a payment is confirmed against. */
export const getSession = (secretKey: string, id: string) =>
	call(secretKey, 'GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`) as Promise<{
		id: string;
		payment_status: 'paid' | 'unpaid' | 'no_payment_required';
		status: 'open' | 'complete' | 'expired';
		amount_total: number;
		currency: string;
		client_reference_id: string;
		payment_intent: string | null;
	}>;

/** Checks the key works (a cheap read). */
export const checkKey = (secretKey: string) => call(secretKey, 'GET', '/v1/balance');

/**
 * Stripe-Signature: t=<time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the
 * signing secret>. True when one v1 matches and the time is within 5 minutes.
 */
export const verifySignature = (raw: Buffer | string, header: string, secret: string, toleranceSec = 300) => {
	const parts = String(header || '').split(',').map(p => p.trim().split('='));
	const t = parts.find(p => p[0] === 't')?.[1];
	const sigs = parts.filter(p => p[0] === 'v1').map(p => p[1]);
	if (!t || !sigs.length || !secret) return false;
	if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
	const expected = crypto.createHmac('sha256', secret).update(`${t}.${typeof raw === 'string' ? raw : raw.toString('utf8')}`).digest('hex');
	return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
};

/** For tests and the panel's guide: what a valid header looks like. */
export const signPayload = (raw: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
	`t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
