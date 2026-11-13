import { CourierAdapter, PanelCheck, Risk } from './types.js';
import { Answer, CourierRefusal, PanelError, baseUrl, bdPhone, courierFetch, courierWords, panelHeaders } from './http.js';

/**
 * Paperfly, for buyer checks only (docs/couriers BUYER_CHECK.md §3a, CR-26): Mint can't send parcels with it yet
 * (no booking adapter, CR-16), but a store can add its Paperfly merchant login so every buyer check asks Paperfly too.
 * Not Paperfly's API — the merchant app's own calls, read from community code (refatbd/bd-courier-fraud-checker,
 * 2026-10-28); to be confirmed on a real account (BC2):
 *   sign-in  POST go-app.paperfly.com.bd/merchant/api/react/authentication/login_using_password.php { username, password } → token
 *   check    POST …/merchant/api/react/smart-check/smart-check-v2.php?search_text=01… { search_text } (Bearer + the app's paperflykey)
 *            → { delivered, partial, returned, total, smart_check { delivery_rate, return_rate, label } }
 */
const SITE = 'https://go.paperfly.com.bd';
const api = () => baseUrl('paperfly', 'panel', 'https://go-app.paperfly.com.bd');
/** The merchant web app sends this fixed key with every call (it's in the app's own script, not a secret of the store's). */
const APP_KEY = 'Paperfly_~La?Rj73FcLm';
const PANEL_MS = 6000;

const signIn = async (login: Record<string, string>) => {
	const username = String(login.username || '').trim();
	if (!username || !login.password) throw new PanelError('Type the phone number or email and the password you sign in to Paperfly with.', 'refused');
	let r: Answer;
	try {
		r = await courierFetch('Paperfly', `${api()}/merchant/api/react/authentication/login_using_password.php`, {
			method: 'POST',
			body: { username, password: login.password },
			headers: panelHeaders(SITE),
			timeout: PANEL_MS,
		});
	} catch (e: any) {
		throw new PanelError(e?.message || 'Couldn’t reach Paperfly — try again in a minute.', 'down');
	}
	const token = r.body?.token || r.body?.user?.token;
	if (r.status >= 200 && r.status < 300 && token) return String(token);
	const words = courierWords(r.body);
	if (/otp|verification code|code sent|verify/i.test(words)) throw new PanelError('Paperfly asks for a code at sign-in for this account, so Mint can’t check with it.', 'otp');
	if (r.status === 429 || r.status >= 500) throw new PanelError(`Paperfly isn’t taking sign-ins just now (error ${r.status}) — try again later.`, 'down');
	throw new PanelError(`Paperfly refused the sign-in${words ? `: ${words}` : ''} — check the phone number or email and the password.`, 'refused');
};

const count = (v: any) => {
	const n = Number(v ?? 0);
	return Number.isInteger(n) && n >= 0 ? n : NaN;
};

const check = async (token: string, phone: string): Promise<Risk> => {
	const p = bdPhone(phone);
	if (!p) throw new CourierRefusal('A Bangladeshi mobile number is needed to check it.');
	const r = await courierFetch('Paperfly', `${api()}/merchant/api/react/smart-check/smart-check-v2.php?search_text=${p}`, {
		method: 'POST',
		body: { search_text: p },
		headers: { ...panelHeaders(SITE, token), paperflykey: APP_KEY },
		timeout: PANEL_MS,
	});
	if (r.status === 401 || r.status === 403) throw new PanelError('Paperfly no longer takes the sign-in', 'expired');
	if (r.status === 429) throw new PanelError('Paperfly’s checks for today are used up', 'limit');
	const d = r.body || {};
	const delivered = count(d.delivered);
	const partial = count(d.partial);
	const returned = count(d.returned);
	const good = r.status >= 200 && r.status < 300 && typeof d === 'object' && ![delivered, partial, returned].some(Number.isNaN) && ('total' in d || 'delivered' in d);
	// Paperfly answers a refused token with 200 and an error now and then: treat it as expired once, then as down.
	if (!good) {
		if (r.status >= 200 && r.status < 300 && /token|login|unauthor/i.test(courierWords(d))) throw new PanelError('Paperfly no longer takes the sign-in', 'expired');
		throw new PanelError(r.status >= 500 ? 'Paperfly’s buyer check is offline just now' : 'Paperfly didn’t give a buyer check answer', 'down');
	}
	const label = d.smart_check?.label;
	return {
		deliveryRatio: null,
		cancellationRatio: null,
		// A partly delivered parcel was taken.
		delivered: delivered + partial,
		cancelled: returned,
		reports: null,
		volume: null,
		categories: [],
		rating: typeof label === 'string' && label ? label : null,
	};
};

const panel: PanelCheck = {
	fields: [
		{ key: 'username', label: 'Paperfly sign-in', secret: false, helper: 'The phone number or email you sign in to go.paperfly.com.bd with' },
		{ key: 'password', label: 'Paperfly password', secret: true },
	],
	note: 'Uses your Paperfly merchant login, not an API. It may stop working if Paperfly changes its site. Mint can’t send parcels with Paperfly yet — this is for buyer checks only.',
	signIn,
	check,
};

export const paperfly: CourierAdapter = {
	id: 'paperfly',
	name: 'Paperfly',
	countries: ['BD'],
	sandbox: false,
	ready: false,
	checksOnly: true,
	links: { signUp: 'https://paperfly.com.bd/', keys: 'https://go.paperfly.com.bd/' },
	credentials: [],
	settings: [],
	test: async () => ({ ok: false, message: 'Mint can’t send parcels with Paperfly yet — add your Paperfly login under Buyer checks instead.' }),
	normalise: () => null,
	panel,
};
