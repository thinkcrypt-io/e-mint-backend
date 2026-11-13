import { CourierAdapter, PanelCheck, Risk } from './types.js';
import { CourierRefusal, PanelError, baseUrl, bdPhone, courierFetch, courierWords, panelHeaders } from './http.js';

/**
 * CarryBee, for buyer checks only (docs/couriers BUYER_CHECK.md §3a, CR-26): no booking adapter yet (CR-16), so a
 * store adds its CarryBee merchant login and every buyer check asks CarryBee too. Not CarryBee's API — the merchant
 * site's NextAuth sign-in and its customer lookup, read from community code (refatbd/bd-courier-fraud-checker,
 * 2026-10-28); to be confirmed on a real account (BC2):
 *   1. GET  merchant.carrybee.com/api/auth/csrf                       → csrfToken + cookies
 *   2. POST merchant.carrybee.com/api/auth/callback/login (form)      { phone +8801…, password, csrfToken } → session cookie
 *   3. GET  merchant.carrybee.com/api/auth/session                    → accessToken + user.selectedBusinessId
 *   check GET api-merchant.carrybee.com/api/v2/businesses/:id/customers/+8801… (Bearer)
 *         → data { total_order, cancelled_order, success_rate, fraud_count }; 404 = never sent to
 * The kept "token" is the access token and the business id together, so a check needs no second sign-in.
 */
const SITE = 'https://merchant.carrybee.com';
const site = () => baseUrl('carrybee', 'panel', SITE);
const api = () => baseUrl('carrybee', 'panel', 'https://api-merchant.carrybee.com');
const PANEL_MS = 6000;

/** The cookies a response sets, merged into a jar. */
const keep = (jar: Record<string, string>, r: Response) => {
	for (const c of r.headers.getSetCookie?.() || []) {
		const [pair] = c.split(';');
		const i = pair.indexOf('=');
		if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
	}
	return jar;
};
const cookieHeader = (jar: Record<string, string>) =>
	Object.entries(jar)
		.map(([k, v]) => `${k}=${v}`)
		.join('; ');

const raw = async (url: string, init: RequestInit) => {
	try {
		return await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(PANEL_MS) });
	} catch (e: any) {
		throw new PanelError(e?.name === 'TimeoutError' ? `CarryBee didn’t answer in ${PANEL_MS / 1000} seconds — try again in a minute.` : 'Couldn’t reach CarryBee — try again in a minute.', 'down');
	}
};
const body = async (r: Response) => {
	try {
		return await r.json();
	} catch {
		return null;
	}
};

const signIn = async (login: Record<string, string>) => {
	const phone = bdPhone(login.phone);
	if (!phone || !login.password) throw new PanelError('Type the phone number and password you sign in to CarryBee with.', 'refused');
	const h = panelHeaders(SITE);
	const jar: Record<string, string> = {};
	const csrf = await raw(`${site()}/api/auth/csrf`, { headers: { ...h, referer: `${SITE}/login` } });
	const csrfToken = (await body(csrf))?.csrfToken;
	if (!csrf.ok || !csrfToken) throw new PanelError(`CarryBee isn’t taking sign-ins just now${csrf.ok ? '' : ` (error ${csrf.status})`} — try again later.`, 'down');
	keep(jar, csrf);
	const form = new URLSearchParams({ phone: `+88${phone}`, password: login.password, csrfToken, callbackUrl: `${SITE}/login` });
	const signed = await raw(`${site()}/api/auth/callback/login`, {
		method: 'POST',
		headers: { ...h, 'content-type': 'application/x-www-form-urlencoded', 'x-auth-return-redirect': '1', referer: `${SITE}/login`, cookie: cookieHeader(jar) },
		body: form.toString(),
	});
	keep(jar, signed);
	const session = Object.keys(jar).find(k => /authjs\.session-token$|next-auth\.session-token$/.test(k));
	if (!session) {
		const answer = await body(signed);
		const words = `${courierWords(answer)} ${answer?.url || ''} ${signed.headers.get('location') || ''}`;
		// NextAuth's refusal is ?error=CredentialsSignin&code=credentials — "code" there isn't an SMS code.
		if (!/CredentialsSignin|code=credentials/i.test(words) && /otp|verification code|code sent|verify/i.test(words)) throw new PanelError('CarryBee asks for a code at sign-in for this account, so Mint can’t check with it.', 'otp');
		if (signed.status === 429 || signed.status >= 500) throw new PanelError(`CarryBee isn’t taking sign-ins just now (error ${signed.status}) — try again later.`, 'down');
		throw new PanelError('CarryBee refused the sign-in — check the phone number and password.', 'refused');
	}
	const s = await raw(`${site()}/api/auth/session`, { headers: { ...h, accept: 'application/json', referer: `${SITE}/login`, cookie: cookieHeader(jar) } });
	const d = (await body(s)) || {};
	const access = d.accessToken || d.access_token || d.user?.accessToken || d.user?.access_token;
	const business = d.user?.selectedBusinessId || d.user?.businessId || d.user?.business_id || d.user?.merchantBusinesses?.[0]?.businessId;
	if (!s.ok || !access) throw new PanelError('CarryBee signed in but gave no session — try again later.', 'down');
	if (!business) throw new PanelError('CarryBee signed in, but the account has no business yet — finish setting it up in CarryBee first.', 'refused');
	return JSON.stringify({ t: String(access), b: String(business) });
};

const check = async (token: string, phone: string): Promise<Risk> => {
	const p = bdPhone(phone);
	if (!p) throw new CourierRefusal('A Bangladeshi mobile number is needed to check it.');
	let kept: { t: string; b: string };
	try {
		kept = JSON.parse(token);
	} catch {
		throw new PanelError('CarryBee no longer takes the sign-in', 'expired');
	}
	if (!kept?.t || !kept?.b) throw new PanelError('CarryBee no longer takes the sign-in', 'expired');
	const r = await courierFetch('CarryBee', `${api()}/api/v2/businesses/${encodeURIComponent(kept.b)}/customers/${encodeURIComponent(`+880${p.slice(1)}`)}`, {
		headers: panelHeaders(SITE, kept.t),
		timeout: PANEL_MS,
	});
	if (r.status === 401 || r.status === 403) throw new PanelError('CarryBee no longer takes the sign-in', 'expired');
	if (r.status === 429) throw new PanelError('CarryBee’s checks for today are used up', 'limit');
	// Never sent with CarryBee: no parcels, not an error.
	if (r.status === 404) return { deliveryRatio: null, cancellationRatio: null, delivered: 0, cancelled: 0, reports: 0, volume: null, categories: [] };
	const d = r.body?.data;
	const total = Number(d?.total_order ?? 0);
	const cancelled = Number(d?.cancelled_order ?? 0);
	const good = r.status >= 200 && r.status < 300 && r.body?.error !== true && d && Number.isInteger(total) && Number.isInteger(cancelled) && total >= 0 && cancelled >= 0 && cancelled <= total;
	if (!good) throw new PanelError(r.status >= 500 ? 'CarryBee’s buyer check is offline just now' : 'CarryBee didn’t give a buyer check answer', 'down');
	const fraud = Number(d.fraud_count ?? 0);
	return {
		deliveryRatio: null,
		cancellationRatio: null,
		delivered: total - cancelled,
		cancelled,
		reports: Number.isInteger(fraud) && fraud > 0 ? fraud : 0,
		volume: null,
		categories: [],
	};
};

const panel: PanelCheck = {
	fields: [
		{ key: 'phone', label: 'CarryBee sign-in phone', secret: false, helper: 'The number you sign in to merchant.carrybee.com with' },
		{ key: 'password', label: 'CarryBee password', secret: true },
	],
	note: 'Uses your CarryBee merchant login, not an API. It may stop working if CarryBee changes its site. Mint can’t send parcels with CarryBee yet — this is for buyer checks only.',
	signIn,
	check,
};

export const carrybee: CourierAdapter = {
	id: 'carrybee',
	name: 'CarryBee',
	countries: ['BD'],
	sandbox: false,
	ready: false,
	checksOnly: true,
	links: { signUp: 'https://carrybee.com/', keys: 'https://merchant.carrybee.com/' },
	credentials: [],
	settings: [],
	test: async () => ({ ok: false, message: 'Mint can’t send parcels with CarryBee yet — add your CarryBee login under Buyer checks instead.' }),
	normalise: () => null,
	panel,
};
