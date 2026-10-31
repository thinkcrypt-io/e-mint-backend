import { fingerprint } from '../../../../lib/crypto/secret.js';
import { Choice, CourierAdapter, Conn, OptionKind, TestResult } from './types.js';
import { CourierError, baseUrl, courierFetch, courierWords } from './http.js';

/**
 * RedX (docs/couriers CONNECTING.md § RedX): one access token, sandbox and
 * production, a flat area list searched by district or post code, pickup
 * stores by their own id (not the shop id in the panel's address).
 */

const REAL = { live: 'https://openapi.redx.com.bd/v1.0.0-beta', test: 'https://sandbox.redx.com.bd/v1.0.0-beta' };
const base = (conn: Conn) => baseUrl('redx', conn.mode, REAL[conn.mode]);

const get = async (conn: Conn, path: string) => {
	const r = await courierFetch('RedX', `${base(conn)}${path}`, { headers: { 'API-ACCESS-TOKEN': `Bearer ${conn.credentials.token || ''}` } });
	if (r.status === 401 || r.status === 403) {
		const e: any = new CourierError('RedX refused this token. Copy it again from RedX → Developer APIs (production and sandbox tokens differ).', 'answer');
		e.rejected = true;
		throw e;
	}
	if (r.status !== 200) throw new CourierError(`RedX answered: ${courierWords(r.body) || `error ${r.status}`}`, 'answer');
	return r.body || {};
};

const storesOf = (body: any): Choice[] =>
	(Array.isArray(body?.pickup_stores) ? body.pickup_stores : []).map((s: any) => ({
		value: String(s.id),
		label: s.name,
		details: { address: s.address, area: s.area_name, areaId: s.area_id },
	}));

const test = async (conn: Conn): Promise<TestResult> => {
	if (!conn.credentials.token) return { ok: false, message: 'Paste the access token from RedX → Developer APIs.' };
	try {
		const stores = storesOf(await get(conn, '/pickup/stores'));
		if (!stores.length) return { ok: false, message: 'Connected to RedX, but the account has no pickup store — add one in the RedX panel first.' };
		return {
			ok: true,
			message: `Connected — ${stores.length} pickup store${stores.length === 1 ? '' : 's'}`,
			accountKey: fingerprint(`redx:${conn.mode}:${conn.credentials.token}`),
			details: { stores },
		};
	} catch (e: any) {
		if (e instanceof CourierError) return { ok: false, message: e.message, rejected: !!(e as any).rejected };
		throw e;
	}
};

const options = async (conn: Conn, what: OptionKind, parent?: string): Promise<Choice[]> => {
	if (what === 'stores') return storesOf(await get(conn, '/pickup/stores'));
	if (what !== 'areas') return [];
	// A post code or a district narrows the flat list; nothing gives every area.
	const q = String(parent || '').trim();
	const path = /^\d{4}$/.test(q) ? `/areas?post_code=${q}` : q ? `/areas?district_name=${encodeURIComponent(q)}` : '/areas';
	const body = await get(conn, path);
	return (Array.isArray(body?.areas) ? body.areas : []).map((a: any) => ({ value: String(a.id), label: a.name, details: { postCode: a.post_code, division: a.division_name } }));
};

export const redx: CourierAdapter = {
	id: 'redx',
	name: 'RedX',
	countries: ['BD'],
	sandbox: true,
	ready: false,
	links: {
		signUp: 'https://redx.com.bd/',
		keys: 'https://redx.com.bd/developer-api/',
		webhook: 'https://redx.com.bd/developer-api/',
	},
	credentials: [{ key: 'token', label: 'Access token', secret: true, helper: 'RedX → Developer APIs → Configuration (Production, or Sandbox in test mode)' }],
	settings: [
		{ key: 'store', label: 'Pickup store', kind: 'select', from: 'stores' },
		{ key: 'defaultWeight', label: 'Weight when an order doesn’t say (kg)', kind: 'number', default: 0.5 },
	],
	test,
	options,
};
