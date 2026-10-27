/**
 * SSLCommerz for a tenant's own store (docs/widgets W-07b, WD6), over its HTTP
 * API — no SDK. The tenant's store id + password open a hosted payment page
 * (cards, bKash, Nagad, Rocket, internet banking); SSLCommerz posts the buyer
 * back to our return address and calls our IPN address. Neither post is
 * believed: we take its `val_id` and ask SSLCommerz's validation API, with the
 * tenant's own password, what really happened (functions/payments.function.ts).
 *
 * Sandbox: sandbox.sslcommerz.com (public demo store `testbox` / `qwerty`);
 * live: securepay.sslcommerz.com.
 */

export const SSLCOMMERZ_CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'SGD', 'INR', 'MYR', 'AUD', 'CAD'];

const base = (mode: string) => (mode === 'live' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com');

export class SslcommerzError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export type SslKeys = { mode: string; storeId: string; storePassword: string };

const get = async (url: string) => {
	let res: Response;
	try {
		res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	} catch {
		throw new SslcommerzError(502, 'SSLCommerz didn’t answer — try again in a moment.');
	}
	const json: any = await res.json().catch(() => null);
	if (!res.ok || !json) throw new SslcommerzError(502, `SSLCommerz answered ${res.status}`);
	return json;
};

/** A hosted payment page for one order, for the server's amount. */
export const createSession = async (
	k: SslKeys,
	o: {
		amount: number;
		currency: string;
		ref: string;
		title: string;
		items: number;
		successUrl: string;
		failUrl: string;
		cancelUrl: string;
		ipnUrl: string;
		customer: { name?: string; email: string; phone?: string; address?: Record<string, string> };
	}
) => {
	const a = o.customer.address || {};
	const body = new URLSearchParams({
		store_id: k.storeId,
		store_passwd: k.storePassword,
		total_amount: o.amount.toFixed(2),
		currency: o.currency,
		tran_id: o.ref,
		success_url: o.successUrl,
		fail_url: o.failUrl,
		cancel_url: o.cancelUrl,
		ipn_url: o.ipnUrl,
		// SSLCommerz requires the buyer's details; what checkout didn't ask for goes as N/A.
		cus_name: (o.customer.name || o.customer.email).slice(0, 50),
		cus_email: o.customer.email.slice(0, 50),
		cus_phone: (o.customer.phone || a.phone || 'N/A').slice(0, 20),
		cus_add1: (a.line1 || 'N/A').slice(0, 50),
		cus_add2: (a.line2 || '').slice(0, 50),
		cus_city: (a.city || 'N/A').slice(0, 50),
		cus_postcode: (a.postcode || '').slice(0, 30),
		cus_country: (a.country || 'Bangladesh').slice(0, 50),
		shipping_method: 'NO',
		num_of_item: String(Math.max(1, o.items)),
		product_name: o.title.slice(0, 255),
		product_category: 'General',
		product_profile: 'general',
		value_a: o.ref,
	});
	let res: Response;
	try {
		res = await fetch(`${base(k.mode)}/gwprocess/v4/api.php`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(20_000),
		});
	} catch {
		throw new SslcommerzError(502, 'SSLCommerz didn’t answer — try again in a moment.');
	}
	const json: any = await res.json().catch(() => null);
	if (json?.status !== 'SUCCESS' || !json.GatewayPageURL) {
		const why = String(json?.failedreason || `SSLCommerz answered ${res.status}`);
		throw new SslcommerzError(/store|credential|password/i.test(why) ? 401 : 502, `SSLCommerz: ${why}`);
	}
	return { id: String(json.sessionkey || ''), url: String(json.GatewayPageURL) };
};

export type SslValidation = {
	status: string;
	tran_id: string;
	val_id: string;
	amount: string;
	currency: string;
	currency_type?: string;
	currency_amount?: string;
	bank_tran_id?: string;
	risk_level?: string;
	risk_title?: string;
	value_a?: string;
};

/** What SSLCommerz says about one `val_id` — the only thing a payment is confirmed against. */
export const validate = async (k: SslKeys, valId: string): Promise<SslValidation> => {
	const q = new URLSearchParams({ val_id: valId, store_id: k.storeId, store_passwd: k.storePassword, v: '1', format: 'json' });
	return get(`${base(k.mode)}/validator/api/validationserverAPI.php?${q}`);
};

/** Every attempt SSLCommerz has for our reference (when the buyer came back without a val_id). */
export const byTransaction = async (k: SslKeys, ref: string): Promise<{ APIConnect: string; element: SslValidation[] }> => {
	const q = new URLSearchParams({ tran_id: ref, store_id: k.storeId, store_passwd: k.storePassword, format: 'json' });
	return get(`${base(k.mode)}/validator/api/merchantTransIDvalidationAPI.php?${q}`);
};

/** Checks the store id + password (a lookup of a reference that doesn't exist). */
export const checkKeys = async (k: SslKeys) => {
	const r = await byTransaction(k, 'mint-key-check');
	if (r?.APIConnect !== 'DONE') throw new SslcommerzError(401, `SSLCommerz refused the store id or password${k.mode === 'live' ? '' : ' — sandbox stores come from developer.sslcommerz.com'}.`);
};

/** A validation that counts as paid: VALID (first look) or VALIDATED (looked at before). */
export const isPaid = (v: SslValidation | null | undefined) => !!v && (v.status === 'VALID' || v.status === 'VALIDATED');
