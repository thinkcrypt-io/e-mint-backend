import { fingerprint } from '../../../../lib/crypto/secret.js';
import crypto from 'crypto';
import { Booked, Choice, CourierAdapter, CourierEvent, Conn, NormalStatus, OptionKind, Parcel, TestResult, WebhookIn } from './types.js';
import { CourierError, CourierRefusal, Answer, baseUrl, bdPhone, courierFetch, courierWords, fit, fullAddress } from './http.js';

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

const send = (conn: Conn, method: string, path: string, body?: any) =>
	courierFetch('RedX', `${base(conn)}${path}`, { method, body, headers: { 'API-ACCESS-TOKEN': `Bearer ${conn.credentials.token || ''}` } });

const refused = (r: Answer) => {
	if (r.status === 401 || r.status === 403) return new CourierRefusal('RedX refused the token — test the connection in Store settings → Delivery.', true);
	const errs = Array.isArray(r.body?.validation_errors) ? r.body.validation_errors.map((x: any) => x?.message || x).filter(Boolean) : [];
	return new CourierRefusal(`RedX refused it: ${errs.join(' ') || courierWords(r.body) || `error ${r.status}`}`);
};

/** RedX's statuses → Mint's (CONNECTING.md, CR6). `paid` is a payout; `agent-area-change` moves nothing. */
const STATUSES: Record<string, NormalStatus | null> = {
	'pickup-pending': 'pickup-pending',
	'ready-for-delivery': 'picked-up',
	'delivery-in-progress': 'out-for-delivery',
	delivered: 'delivered',
	'agent-hold': 'on-hold',
	'agent-returning': 'returning',
	returned: 'returned',
	'agent-area-change': null,
	cancelled: 'cancelled',
	paid: null,
};
const normalise = (s: string): NormalStatus | null => STATUSES[String(s || '').toLowerCase().trim()] ?? null;

const parcelOf = (conn: Conn, p: Parcel) => {
	const phone = bdPhone(p.recipient.phone);
	if (!phone) throw new CourierRefusal('The phone number needs to be a Bangladeshi mobile (01XXXXXXXXX).');
	const areaId = Number(p.options?.area);
	if (!areaId) throw new CourierRefusal('Pick the RedX delivery area.');
	return {
		customer_name: fit(p.recipient.name, 100),
		customer_phone: phone,
		delivery_area: fit(p.options?.areaName || p.recipient.area || '', 100),
		delivery_area_id: areaId,
		customer_address: fit(fullAddress(p.recipient), 400),
		merchant_invoice_id: fit(p.invoice, 100),
		cash_collection_amount: String(Math.max(0, Math.round(Number(p.cod) || 0))),
		parcel_weight: Math.max(1, Math.round((Number(p.weight) || Number(conn.settings.defaultWeight) || 0.5) * 1000)),
		value: Math.max(0, Math.round(Number(p.value) || 0)),
		...(p.note && { instruction: fit(p.note, 255) }),
		...(p.options?.store || conn.settings.store ? { pickup_store_id: Number(p.options?.store || conn.settings.store) } : {}),
		...(p.description && { parcel_details_json: [{ name: fit(p.description, 100), category: 'General', value: Math.max(0, Math.round(Number(p.value) || 0)) }] }),
	};
};

const book = async (conn: Conn, p: Parcel): Promise<Booked> => {
	const r = await send(conn, 'POST', '/parcel', parcelOf(conn, p));
	if ((r.status !== 200 && r.status !== 201) || !r.body?.tracking_id) throw refused(r);
	return { consignment: String(r.body.tracking_id), trackingCode: String(r.body.tracking_id), courierStatus: 'pickup-pending' };
};

const quote = async (conn: Conn, p: Parcel) => {
	const area = Number(p.options?.area);
	const pickup = Number(conn.settings.pickupArea);
	if (!area || !pickup) throw new CourierRefusal('Pick the delivery area (and a pickup store in Store settings) to see RedX’s charge.');
	const q = new URLSearchParams({ delivery_area_id: String(area), pickup_area_id: String(pickup), cash_collection_amount: String(Math.round(Number(p.cod) || 0)), weight: String(Math.max(1, Math.round((Number(p.weight) || 0.5) * 1000))) });
	const r = await send(conn, 'GET', `/charge/charge_calculator?${q}`);
	if (r.status !== 200 || r.body?.deliveryCharge === undefined) throw refused(r);
	return { charge: (Number(r.body.deliveryCharge) || 0) + (Number(r.body.codCharge) || 0) };
};

const status = async (conn: Conn, d: { consignment: string; invoice: string }): Promise<CourierEvent> => {
	const r = await send(conn, 'GET', `/parcel/info/${encodeURIComponent(d.consignment)}`);
	const x = r.body?.parcel;
	if (r.status !== 200 || !x) throw refused(r);
	const s = String(x.status || '').toLowerCase();
	return {
		consignment: d.consignment,
		invoice: x.merchant_invoice_id,
		courierStatus: s,
		status: normalise(s),
		at: new Date(),
		kind: 'status',
		key: `redx:${d.consignment}:${s}:sync`,
		...(x.charge !== undefined && { charge: Number(x.charge) || 0 }),
	};
};

/** RedX takes the request and cancels later: the status follows when it does. */
const cancel = async (conn: Conn, d: { consignment: string; invoice: string }, reason: string) => {
	const r = await send(conn, 'PATCH', '/parcels', { entity_type: 'parcel-tracking-id', entity_id: d.consignment, update_details: { property_name: 'status', new_value: 'cancelled', reason: fit(reason || 'Cancelled by the shop', 255) } });
	if (r.status !== 200 || r.body?.success === false) throw refused(r);
	return { async: true, message: 'RedX is asked to cancel it — the status moves when RedX confirms.' };
};

const webhook = {
	/** RedX signs nothing: the secret is in the address Mint gave (`?token=`), compared in constant time. */
	verify(req: WebhookIn, secret: string) {
		const a = Buffer.from(String(req.query?.token || ''));
		const b = Buffer.from(String(secret || ''));
		return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
	},
	parse(req: WebhookIn): CourierEvent[] {
		const b = req.body || {};
		const s = String(b.status || '').toLowerCase().trim();
		const consignment = b.tracking_number ? String(b.tracking_number) : undefined;
		const t = b.timestamp ? new Date(b.timestamp) : new Date();
		const at = Number.isNaN(t.getTime()) ? new Date() : t;
		const base = { consignment, invoice: b.invoice_number ? String(b.invoice_number) : undefined, at, message: b.message_en || undefined, key: `redx:${consignment}:${s}:${at.toISOString()}` };
		if (s === 'paid') return [{ ...base, courierStatus: s, status: null, kind: 'payout', settled: {}, message: base.message || 'RedX paid this parcel’s cash out' }];
		return [{ ...base, courierStatus: s, status: normalise(s), kind: 'status' }];
	},
};

export const redx: CourierAdapter = {
	id: 'redx',
	name: 'RedX',
	countries: ['BD'],
	sandbox: true,
	ready: true,
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
	quote,
	book,
	status,
	cancel,
	webhook,
	normalise,
};
