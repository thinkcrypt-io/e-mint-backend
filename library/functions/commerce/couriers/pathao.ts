import { fingerprint } from '../../../../lib/crypto/secret.js';
import { Choice, CourierAdapter, Conn, OptionKind, TestResult, Token } from './types.js';
import { CourierError, baseUrl, courierFetch, courierWords } from './http.js';

/**
 * Pathao Courier (docs/couriers CONNECTING.md § Pathao): a password-grant
 * token (5 days) from the merchant's client id / secret and panel sign-in,
 * refreshed a day before it runs out; a sandbox with Pathao's published test
 * credentials. Lists come wrapped as `data.data[]`.
 */

const REAL = { live: 'https://api-hermes.pathao.com', test: 'https://courier-api-sandbox.pathao.com' };
const base = (conn: Conn) => baseUrl('pathao', conn.mode, REAL[conn.mode]);
const DAY = 24 * 3600 * 1000;

/** Pathao's own sandbox account, published in its developer docs — for trying Mint before connecting a real account. */
export const PATHAO_SANDBOX = {
	clientId: '7N1aMJQbWm',
	clientSecret: 'wRcaibZkUdSNz2EI9ZyuXLlNrnAv0TdPUPXMnD39',
	username: 'test@pathao.com',
	password: 'lovePathao',
};

const issue = async (conn: Conn, grant: 'password' | 'refresh_token'): Promise<Token> => {
	const c = conn.credentials;
	const body: any = { client_id: c.clientId, client_secret: c.clientSecret, grant_type: grant };
	if (grant === 'password') Object.assign(body, { username: c.username, password: c.password });
	else body.refresh_token = conn.token?.refresh;
	const r = await courierFetch('Pathao', `${base(conn)}/aladdin/api/v1/issue-token`, { method: 'POST', body });
	if (r.status !== 200 || !r.body?.access_token) {
		const e: any = new CourierError(`Pathao refused the sign-in: ${courierWords(r.body) || `error ${r.status}`}`, 'answer');
		e.rejected = r.status === 400 || r.status === 401 || r.status === 422;
		throw e;
	}
	const t: Token = { access: r.body.access_token, refresh: r.body.refresh_token, expiresAt: new Date(Date.now() + (Number(r.body.expires_in) || 0) * 1000) };
	await conn.saveToken?.(t);
	conn.token = t;
	return t;
};

/** A token good for at least a day: the one kept, refreshed, or a new one from the password. */
const tokenFor = async (conn: Conn, fresh = false): Promise<string> => {
	const t = conn.token;
	if (!fresh && t?.access && t.expiresAt && new Date(t.expiresAt).getTime() - Date.now() > DAY) return t.access;
	if (!fresh && t?.refresh)
		try {
			return (await issue(conn, 'refresh_token')).access;
		} catch {
			/* falls back to the password */
		}
	return (await issue(conn, 'password')).access;
};

const get = async (conn: Conn, path: string) => {
	let r = await courierFetch('Pathao', `${base(conn)}${path}`, { headers: { authorization: `Bearer ${await tokenFor(conn)}` } });
	// A token Pathao no longer takes: one new sign-in, then the answer stands.
	if (r.status === 401) r = await courierFetch('Pathao', `${base(conn)}${path}`, { headers: { authorization: `Bearer ${await tokenFor(conn, true)}` } });
	if (r.status !== 200) throw new CourierError(`Pathao answered: ${courierWords(r.body) || `error ${r.status}`}`, 'answer');
	return Array.isArray(r.body?.data?.data) ? r.body.data.data : Array.isArray(r.body?.data) ? r.body.data : [];
};

const MISSING = 'Paste the client id and client secret from Pathao’s Developer API page, and the email and password you sign in to Pathao with.';

const test = async (conn: Conn): Promise<TestResult> => {
	const c = conn.credentials;
	if (!c.clientId || !c.clientSecret || !c.username || !c.password) return { ok: false, message: MISSING };
	try {
		await tokenFor(conn, true);
		const stores = await get(conn, '/aladdin/api/v1/stores');
		const active = stores.filter((s: any) => s.is_active !== false && s.is_active !== 0);
		if (!active.length) return { ok: false, message: 'Signed in to Pathao, but the account has no active store — add one in the Pathao panel first.' };
		return {
			ok: true,
			message: `Connected — ${active.length} store${active.length === 1 ? '' : 's'}`,
			accountKey: fingerprint(`pathao:${conn.mode}:${c.clientId}`),
			details: { stores: active.map((s: any) => ({ value: String(s.store_id), label: s.store_name, default: !!s.is_default_store })) },
		};
	} catch (e: any) {
		if (e instanceof CourierError) return { ok: false, message: e.message, rejected: !!(e as any).rejected };
		throw e;
	}
};

const options = async (conn: Conn, what: OptionKind, parent?: string): Promise<Choice[]> => {
	if (what === 'stores')
		return (await get(conn, '/aladdin/api/v1/stores'))
			.filter((s: any) => s.is_active !== false && s.is_active !== 0)
			.map((s: any) => ({ value: String(s.store_id), label: s.store_name, details: { address: s.store_address, default: !!s.is_default_store } }));
	if (what === 'cities') return (await get(conn, '/aladdin/api/v1/city-list')).map((x: any) => ({ value: String(x.city_id), label: x.city_name }));
	if (!parent || !/^\d+$/.test(parent)) throw new CourierError(`Pick the ${what === 'zones' ? 'city' : 'zone'} first.`, 'answer');
	if (what === 'zones') return (await get(conn, `/aladdin/api/v1/cities/${parent}/zone-list`)).map((x: any) => ({ value: String(x.zone_id), label: x.zone_name }));
	return (await get(conn, `/aladdin/api/v1/zones/${parent}/area-list`)).map((x: any) => ({
		value: String(x.area_id),
		label: x.area_name,
		details: { homeDelivery: !!x.home_delivery_available, pickup: !!x.pickup_available },
	}));
};

export const pathao: CourierAdapter = {
	id: 'pathao',
	name: 'Pathao Courier',
	countries: ['BD'],
	sandbox: true,
	ready: false,
	links: {
		signUp: 'https://merchant.pathao.com/register',
		keys: 'https://merchant.pathao.com/courier/developer-api',
		webhook: 'https://merchant.pathao.com/courier/developer-api',
	},
	credentials: [
		{ key: 'clientId', label: 'Client ID', secret: false, helper: 'Pathao → Developer API → Merchant API Credentials' },
		{ key: 'clientSecret', label: 'Client secret', secret: true },
		{ key: 'username', label: 'Pathao sign-in email', secret: false, kind: 'email' },
		{ key: 'password', label: 'Pathao password', secret: true, helper: 'Only used to sign Mint in to Pathao; kept sealed' },
	],
	settings: [
		{ key: 'store', label: 'Pickup store', kind: 'select', from: 'stores' },
		{
			key: 'deliveryType',
			label: 'Delivery',
			kind: 'select',
			options: [
				{ value: '48', label: 'Normal' },
				{ value: '12', label: 'On demand' },
			],
			default: '48',
		},
		{
			key: 'itemType',
			label: 'What you send',
			kind: 'select',
			options: [
				{ value: '2', label: 'Parcel' },
				{ value: '1', label: 'Document' },
			],
			default: '2',
		},
		{ key: 'defaultWeight', label: 'Weight when an order doesn’t say (kg)', kind: 'number', default: 0.5, helper: '0.5 to 10' },
	],
	test,
	options,
};
