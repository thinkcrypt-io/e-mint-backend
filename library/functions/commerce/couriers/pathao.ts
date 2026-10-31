import { fingerprint } from '../../../../lib/crypto/secret.js';
import crypto from 'crypto';
import { Booked, Choice, CourierAdapter, CourierEvent, Conn, NormalStatus, OptionKind, Parcel, TestResult, Token, WebhookIn } from './types.js';
import { CourierError, CourierRefusal, Answer, baseUrl, bdPhone, courierFetch, courierWords, fit, fullAddress } from './http.js';

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

/** A call with the token, once more with a fresh one if Pathao no longer takes it. */
const call = async (conn: Conn, method: string, path: string, body?: any): Promise<Answer> => {
	let r = await courierFetch('Pathao', `${base(conn)}${path}`, { method, body, headers: { authorization: `Bearer ${await tokenFor(conn)}` } });
	if (r.status === 401) r = await courierFetch('Pathao', `${base(conn)}${path}`, { method, body, headers: { authorization: `Bearer ${await tokenFor(conn, true)}` } });
	return r;
};

const refused = (r: Answer) => {
	if (r.status === 401) return new CourierRefusal('Pathao refused the sign-in — test the connection in Store settings → Delivery.', true);
	const errs = r.body?.errors && typeof r.body.errors === 'object' ? Object.values(r.body.errors).flat().filter(x => typeof x === 'string') : [];
	return new CourierRefusal(`Pathao refused it: ${errs.join(' ') || courierWords(r.body) || `error ${r.status}`}`);
};

/** Pathao's events and statuses → Mint's (CONNECTING.md, CR6). `order.updated`: nothing to move. */
const EVENTS: Record<string, NormalStatus | null> = {
	created: 'booked', pending: 'booked', updated: null,
	'pickup-requested': 'pickup-pending', 'assigned-for-pickup': 'pickup-pending',
	picked: 'picked-up', 'pickup-failed': 'on-hold', 'pickup-cancelled': 'cancelled',
	'at-the-sorting-hub': 'in-transit', 'in-transit': 'in-transit', 'received-at-last-mile-hub': 'in-transit',
	'assigned-for-delivery': 'out-for-delivery', delivered: 'delivered', 'partial-delivery': 'partly-delivered',
	'delivery-failed': 'failed-attempt', 'on-hold': 'on-hold', returned: 'returning', 'return-id-created': 'returning',
	'return-in-transit': 'returning', 'returned-to-merchant': 'returned', 'paid-return': 'returned', exchanged: 'delivered',
	paid: null,
};
/** "order.picked", "Picked", "pickup_requested" — one spelling. */
const slug = (s: string) => String(s || '').toLowerCase().replace(/^order\./, '').replace(/[\s_]+/g, '-').trim();
const normalise = (s: string): NormalStatus | null => EVENTS[slug(s)] ?? null;

const orderOf = (conn: Conn, p: Parcel) => {
	const phone = bdPhone(p.recipient.phone);
	if (!phone) throw new CourierRefusal('The phone number needs to be a Bangladeshi mobile (01XXXXXXXXX).');
	const store = Number(p.options?.store || conn.settings.store);
	if (!store) throw new CourierRefusal('Pick the Pathao pickup store in Store settings → Delivery.');
	const address = fit(fullAddress(p.recipient), 220, /[{}<>$]/g);
	if (address.length < 10) throw new CourierRefusal('Pathao needs an address of 10 characters or more.');
	const weight = Math.min(10, Math.max(0.5, Number(p.weight) || Number(conn.settings.defaultWeight) || 0.5));
	const n = (k: string) => (p.options?.[k] && /^\d+$/.test(String(p.options[k])) ? Number(p.options[k]) : undefined);
	return {
		store_id: store,
		merchant_order_id: fit(p.invoice, 100),
		recipient_name: fit(p.recipient.name, 100).padEnd(3, '.'),
		recipient_phone: phone,
		recipient_address: address,
		// City / zone / area are left to Pathao (it reads the address) unless picked — never sent empty.
		...(n('city') && { recipient_city: n('city') }),
		...(n('zone') && { recipient_zone: n('zone') }),
		...(n('area') && { recipient_area: n('area') }),
		delivery_type: Number(p.options?.deliveryType || conn.settings.deliveryType) === 12 ? 12 : 48,
		item_type: Number(p.options?.itemType || conn.settings.itemType) === 1 ? 1 : 2,
		item_quantity: Math.max(1, Math.round(Number(p.items) || 1)),
		item_weight: weight,
		amount_to_collect: Math.max(0, Math.round(Number(p.cod) || 0)),
		...(p.note && { special_instruction: fit(p.note, 255) }),
		...(p.description && { item_description: fit(p.description, 255) }),
	};
};

const book = async (conn: Conn, p: Parcel): Promise<Booked> => {
	const r = await call(conn, 'POST', '/aladdin/api/v1/orders', orderOf(conn, p));
	const d = r.body?.data;
	if (r.status !== 200 || !d?.consignment_id) throw refused(r);
	return {
		consignment: String(d.consignment_id),
		trackingCode: String(d.consignment_id),
		courierStatus: slug(d.order_status || 'pending'),
		...(d.delivery_fee !== undefined && { charge: Number(d.delivery_fee) || 0 }),
	};
};

/** Pathao's bulk takes them all and answers with no ids: each parcel's id comes with its order.created webhook. */
const bookMany = async (conn: Conn, parcels: Parcel[]) => {
	const out: ({ ok: true; booked: Booked } | { ok: false; error: string })[] = [];
	const orders: any[] = [];
	const at: number[] = [];
	parcels.forEach((p, i) => {
		try {
			orders.push(orderOf(conn, p));
			at.push(i);
			out[i] = { ok: true, booked: { consignment: '', trackingCode: '', courierStatus: 'pending', pending: true } };
		} catch (e: any) {
			out[i] = { ok: false, error: e.message };
		}
	});
	for (let i = 0; i < orders.length; i += 100) {
		const r = await call(conn, 'POST', '/aladdin/api/v1/orders/bulk', { orders: orders.slice(i, i + 100) });
		if (r.status !== 202 && r.status !== 200) {
			const e = refused(r);
			at.slice(i, i + 100).forEach(k => (out[k] = { ok: false, error: e.message }));
		}
	}
	return out;
};

const quote = async (conn: Conn, p: Parcel) => {
	const city = Number(p.options?.city);
	const zone = Number(p.options?.zone);
	if (!city || !zone) throw new CourierRefusal('Pick the city and zone to see Pathao’s price.');
	const r = await call(conn, 'POST', '/aladdin/api/v1/merchant/price-plan', {
		store_id: Number(p.options?.store || conn.settings.store),
		item_type: Number(p.options?.itemType || conn.settings.itemType) === 1 ? 1 : 2,
		delivery_type: Number(p.options?.deliveryType || conn.settings.deliveryType) === 12 ? 12 : 48,
		item_weight: Math.min(10, Math.max(0.5, Number(p.weight) || 0.5)),
		recipient_city: city,
		recipient_zone: zone,
	});
	if (r.status !== 200 || r.body?.data?.final_price === undefined) throw refused(r);
	return { charge: Number(r.body.data.final_price) || 0 };
};

const status = async (conn: Conn, d: { consignment: string; invoice: string }): Promise<CourierEvent> => {
	const r = await call(conn, 'GET', `/aladdin/api/v1/orders/${encodeURIComponent(d.consignment)}/info`);
	const x = r.body?.data;
	if (r.status !== 200 || !x) throw refused(r);
	const s = slug(x.order_status_slug || x.order_status);
	return { consignment: d.consignment, invoice: x.merchant_order_id, courierStatus: s, status: normalise(s), at: new Date(), kind: 'status', key: `pathao:${d.consignment}:${s}:sync` };
};

/** The reply Pathao checks for: 202 and the integration header (its value can be changed in Store settings). */
export const PATHAO_HOOK_HEADER = { key: 'X-Pathao-Merchant-Webhook-Integration-Secret', value: 'f3992ecc-59da-4cbe-a049-a13da2018d51' };

const webhook = {
	/** X-PATHAO-Signature is the secret itself, compared in constant time. */
	verify(req: WebhookIn, secret: string) {
		const a = Buffer.from(String(req.headers['x-pathao-signature'] || ''));
		const b = Buffer.from(String(secret || ''));
		return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
	},
	parse(req: WebhookIn): CourierEvent[] {
		const b = req.body || {};
		const name = slug(b.event || '');
		const consignment = b.consignment_id ? String(b.consignment_id) : undefined;
		const stamp = b.updated_at || b.timestamp;
		const t = stamp ? new Date(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(String(stamp)) ? `${String(stamp).replace(' ', 'T')}+06:00` : stamp) : new Date();
		const at = Number.isNaN(t.getTime()) ? new Date() : t;
		const base = { consignment, invoice: b.merchant_order_id ? String(b.merchant_order_id) : undefined, at, key: `pathao:${consignment}:${name}:${at.toISOString()}` };
		if (name === 'webhook-integration') return [{ ...base, courierStatus: name, status: null, kind: 'handshake', key: `pathao:handshake:${Date.now()}` }];
		if (name.startsWith('store.') || name.startsWith('store-')) return [{ ...base, courierStatus: name, status: null, kind: 'other', message: 'Pathao changed the stores' }];
		if (name === 'paid') return [{ ...base, courierStatus: name, status: null, kind: 'payout', settled: { ref: b.invoice_id ? String(b.invoice_id) : undefined }, message: 'Pathao paid this parcel’s cash out' }];
		return [
			{
				...base,
				courierStatus: name,
				status: normalise(name),
				kind: name === 'updated' ? 'update' : 'status',
				...(b.collected_amount !== undefined && { collected: Number(b.collected_amount) || 0 }),
				...(b.delivery_fee !== undefined && { charge: Number(b.delivery_fee) || 0 }),
				...(b.reason && { message: String(b.reason) }),
			},
		];
	},
	reply(settings: Record<string, any>) {
		return { status: 202, headers: { [PATHAO_HOOK_HEADER.key]: String(settings.hookReply || PATHAO_HOOK_HEADER.value) } };
	},
};

export const pathao: CourierAdapter = {
	id: 'pathao',
	name: 'Pathao Courier',
	countries: ['BD'],
	sandbox: true,
	ready: true,
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
		{
			key: 'hookReply',
			label: 'Webhook reply value',
			kind: 'text',
			default: PATHAO_HOOK_HEADER.value,
			helper: 'Only if Pathao’s Webhook Integration tab shows a different value for X-Pathao-Merchant-Webhook-Integration-Secret',
		},
	],
	test,
	options,
	quote,
	book,
	bookMany,
	status,
	webhook,
	normalise,
};
