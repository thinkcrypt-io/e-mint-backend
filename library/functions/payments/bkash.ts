import crypto from 'crypto';

/**
 * bKash Tokenized Checkout for a tenant's own merchant account (docs/widgets
 * W-07b, WD6), over its HTTP API — no SDK. The tenant's username, password,
 * app key and app secret grant a token; `create` opens bKash's payment page;
 * bKash sends the buyer back to our callback with a paymentID, and only then
 * do we `execute` it server to server — bKash's answer (or, when that answer
 * is lost, `payment/status`) is what marks an order paid
 * (functions/payments.function.ts). Nothing the browser brings back counts.
 *
 * Sandbox: tokenized.sandbox.bka.sh (bKash's public sandbox merchant);
 * live: tokenized.pay.bka.sh. BDT only.
 */

const base = (mode: string) => `https://tokenized.${mode === 'live' ? 'pay' : 'sandbox'}.bka.sh/v1.2.0-beta/tokenized/checkout`;

export class BkashError extends Error {
	status: number;
	code: string;
	constructor(status: number, message: string, code = '') {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export type BkashKeys = { mode: string; username: string; password: string; appKey: string; appSecret: string };

const post = async (url: string, headers: Record<string, string>, body: any) => {
	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		throw new BkashError(504, 'bKash didn’t answer — try again in a moment.', 'timeout');
	}
	// bKash's error answers can carry a raw line break inside a string, which isn't JSON.
	const text = await res.text().catch(() => '');
	let json: any = null;
	try {
		json = JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
	} catch {
		json = null;
	}
	if (!json) throw new BkashError(502, `bKash answered ${res.status}`);
	return { ok: res.ok, status: res.status, json };
};

/* A token lasts an hour; one per merchant, renewed a few minutes early. */
const tokens = new Map<string, { token: string; until: number }>();
const tokenKey = (k: BkashKeys) => crypto.createHash('sha256').update(`${k.mode}|${k.username}|${k.appKey}|${k.appSecret}|${k.password}`).digest('hex');

export const grantToken = async (k: BkashKeys, fresh = false) => {
	const key = tokenKey(k);
	const had = tokens.get(key);
	if (!fresh && had && had.until > Date.now()) return had.token;
	const { json } = await post(`${base(k.mode)}/token/grant`, { username: k.username, password: k.password }, { app_key: k.appKey, app_secret: k.appSecret });
	if (!json.id_token) {
		tokens.delete(key);
		throw new BkashError(401, `bKash refused the merchant details${json.statusMessage || json.msg || json.message ? ` (${json.statusMessage || json.msg || json.message})` : ''} — check them in Payments.`, 'unauthorized');
	}
	tokens.set(key, { token: json.id_token, until: Date.now() + Math.max(60, Number(json.expires_in || 3600) - 300) * 1000 });
	return json.id_token as string;
};

/** A call with the token; once more with a new token if bKash says it's expired. */
const call = async (k: BkashKeys, path: string, body: any) => {
	for (let attempt = 0; attempt < 2; attempt++) {
		const token = await grantToken(k, attempt > 0);
		const r = await post(`${base(k.mode)}${path}`, { Authorization: token, 'X-APP-Key': k.appKey }, body);
		if (r.status === 401 && attempt === 0) continue;
		return r.json;
	}
	throw new BkashError(401, 'bKash refused the token — check the merchant details in Payments.', 'unauthorized');
};

const failed = (json: any) => {
	const code = String(json?.statusCode || json?.errorCode || '');
	const msg = String(json?.statusMessage || json?.errorMessage || json?.message || 'bKash refused');
	return new BkashError(502, `bKash: ${msg}${code && code !== '0000' ? ` (${code})` : ''}`, code);
};

/** bKash's payment page for one order (BDT, the server's amount). */
export const createPayment = async (k: BkashKeys, o: { amount: number; ref: string; payer: string; callbackUrl: string }) => {
	const json = await call(k, '/create', {
		mode: '0011',
		payerReference: o.payer.slice(0, 255) || o.ref,
		callbackURL: o.callbackUrl,
		amount: o.amount.toFixed(2),
		currency: 'BDT',
		intent: 'sale',
		merchantInvoiceNumber: o.ref,
	});
	if (json?.statusCode !== '0000' || !json.paymentID || !json.bkashURL) throw failed(json);
	return { id: String(json.paymentID), url: String(json.bkashURL) };
};

export type BkashPayment = {
	paymentID: string;
	trxID?: string;
	transactionStatus?: string;
	amount?: string;
	currency?: string;
	merchantInvoiceNumber?: string;
	statusCode?: string;
	statusMessage?: string;
};

/** Takes the money the buyer approved. Throws BkashError (with bKash's code) when bKash says no. */
export const executePayment = async (k: BkashKeys, paymentID: string): Promise<BkashPayment> => {
	const json = await call(k, '/execute', { paymentID });
	if (json?.statusCode && json.statusCode !== '0000') throw failed(json);
	if (!json?.transactionStatus) throw failed(json);
	return json;
};

/** The payment as bKash has it now. */
export const queryPayment = async (k: BkashKeys, paymentID: string): Promise<BkashPayment> => {
	const json = await call(k, '/payment/status', { paymentID });
	if (json?.statusCode && json.statusCode !== '0000') throw failed(json);
	return json;
};

/** Checks the four merchant details (a token grant). */
export const checkKeys = (k: BkashKeys) => grantToken(k, true).then(() => undefined);
