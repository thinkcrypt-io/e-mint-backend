import crypto from 'crypto';
import { fingerprint } from '../../../../lib/crypto/secret.js';
import { Booked, CourierAdapter, CourierEvent, Conn, NormalStatus, Parcel, Risk, TestResult, WebhookIn } from './types.js';
import { CourierError, CourierRefusal, Answer, baseUrl, bdPhone, courierFetch, courierWords, fit, fullAddress } from './http.js';

/**
 * Steadfast (docs/couriers CONNECTING.md § Steadfast): API key + secret key on
 * every call, no token, no sandbox. A wrong key is a 401, and ten of those in
 * five minutes lock the key out for an hour — so a 401 is never retried.
 */

const LIVE = 'https://portal.packzy.com/api/v1';
const base = (conn: Conn) => baseUrl('steadfast', 'live', LIVE);
const headers = (conn: Conn) => ({ 'Api-Key': conn.credentials.apiKey || '', 'Secret-Key': conn.credentials.secretKey || '' });

const taka = (n: any) => `৳${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

const test = async (conn: Conn): Promise<TestResult> => {
	if (!conn.credentials.apiKey || !conn.credentials.secretKey) return { ok: false, message: 'Paste both the API key and the secret key from Steadfast’s API page.' };
	try {
		const ping = await courierFetch('Steadfast', `${base(conn)}/ping`);
		if (ping.status >= 500) return { ok: false, message: 'Steadfast isn’t answering right now — try again in a few minutes.' };
		const r = await courierFetch('Steadfast', `${base(conn)}/get_balance`, { headers: headers(conn) });
		if (r.status === 401 || r.status === 403)
			return { ok: false, rejected: true, message: 'Steadfast refused these keys. Copy the API key and secret key again from Steadfast’s API page — after ten wrong tries Steadfast blocks the key for an hour.' };
		if (r.status === 429) return { ok: false, message: 'Steadfast has blocked this key for a while after too many wrong tries — wait an hour, then test again.' };
		if (r.status !== 200 || r.body?.current_balance === undefined) return { ok: false, message: `Steadfast answered: ${courierWords(r.body) || `error ${r.status}`}` };
		return {
			ok: true,
			message: `Connected — balance ${taka(r.body.current_balance)}`,
			accountKey: fingerprint(`steadfast:${conn.credentials.apiKey}`),
			details: { balance: Number(r.body.current_balance) || 0 },
		};
	} catch (e: any) {
		if (e instanceof CourierError) return { ok: false, message: e.message };
		throw e;
	}
};

/** Steadfast's statuses → Mint's (CONNECTING.md, CR6). `*_approval_pending`: the rider says so, Steadfast hasn't confirmed. */
const STATUSES: Record<string, NormalStatus | null> = {
	in_review: 'booked',
	pending: 'in-transit',
	hold: 'on-hold',
	delivered: 'delivered',
	partial_delivered: 'partly-delivered',
	cancelled: 'returning',
	cancelled_return_received: 'returned',
	partial_delivered_return_received: 'returned',
	exceptional: 'lost',
	unknown: null,
};
const normalise = (s: string): NormalStatus | null => {
	const k = String(s || '').toLowerCase().trim();
	if (k in STATUSES) return STATUSES[k];
	if (k.endsWith('_approval_pending')) return null;
	return null;
};

/** A 401 is never retried (ten lock the key out); other refusals come back in Steadfast's words. */
const refused = (r: Answer) => {
	if (r.status === 401 || r.status === 403) return new CourierRefusal('Steadfast refused the keys — test the connection in Store settings → Delivery.', true);
	if (r.status === 429) return new CourierRefusal('Steadfast has paused this key for a while — try again later.');
	return new CourierRefusal(`Steadfast refused it: ${courierWords(r.body) || `error ${r.status}`}`);
};

const orderOf = (conn: Conn, p: Parcel) => {
	const phone = bdPhone(p.recipient.phone);
	if (!phone) throw new CourierRefusal('The phone number needs to be a Bangladeshi mobile (01XXXXXXXXX).');
	return {
		invoice: fit(p.invoice, 100, /[^A-Za-z0-9_-]/g).replace(/\s/g, ''),
		recipient_name: fit(p.recipient.name, 100),
		recipient_phone: phone,
		recipient_address: fit(fullAddress(p.recipient), 490),
		cod_amount: Math.max(0, Math.round(Number(p.cod) || 0)),
		...(p.note && { note: fit(p.note, 480) }),
		...(p.recipient.email && /@/.test(p.recipient.email) && { recipient_email: fit(p.recipient.email, 100) }),
		...(p.description && { item_description: fit(p.description, 255) }),
		total_lot: Math.max(1, Math.round(Number(p.items) || 1)),
		delivery_type: Number(p.options?.deliveryType ?? conn.settings.deliveryType ?? 0) === 1 ? 1 : 0,
	};
};

const bookedOf = (c: any): Booked => ({
	consignment: String(c.consignment_id),
	trackingCode: String(c.tracking_code || ''),
	trackingUrl: c.tracking_link || (c.tracking_code ? `https://steadfast.com.bd/t/${c.tracking_code}` : undefined),
	courierStatus: c.status || 'in_review',
});

const book = async (conn: Conn, p: Parcel): Promise<Booked> => {
	const r = await courierFetch('Steadfast', `${base(conn)}/create_order`, { method: 'POST', headers: headers(conn), body: orderOf(conn, p) });
	if (r.status !== 200 || r.body?.status !== 200 || !r.body?.consignment?.consignment_id) throw refused(r);
	return bookedOf(r.body.consignment);
};

const bookMany = async (conn: Conn, parcels: Parcel[]) => {
	const out: ({ ok: true; booked: Booked } | { ok: false; error: string })[] = [];
	for (let i = 0; i < parcels.length; i += 500) {
		const chunk = parcels.slice(i, i + 500);
		const data: any[] = [];
		const bad = new Map<number, string>();
		chunk.forEach((p, j) => {
			try {
				data.push(orderOf(conn, p));
			} catch (e: any) {
				bad.set(j, e.message);
			}
		});
		const r = data.length ? await courierFetch('Steadfast', `${base(conn)}/create_order/bulk-order/extended`, { method: 'POST', headers: headers(conn), body: { data }, timeout: 60000 }) : null;
		if (r && r.status !== 200) throw refused(r);
		const answers: any[] = Array.isArray(r?.body?.data) ? r!.body.data : Array.isArray(r?.body) ? r!.body : [];
		let k = 0;
		chunk.forEach((_, j) => {
			if (bad.has(j)) return out.push({ ok: false, error: bad.get(j)! });
			const a = answers[k++];
			if (a?.status === 'success' && a.consignment_id) out.push({ ok: true, booked: bookedOf(a) });
			else out.push({ ok: false, error: `Steadfast refused it: ${[].concat(a?.error || a?.errors || []).join(' ') || 'no answer for this one'}` });
		});
	}
	return out;
};

/** CR13: after a timeout — the timeline Steadfast keeps for our invoice names the parcel, if it was booked. */
const find = async (conn: Conn, invoice: string): Promise<Booked | null> => {
	const r = await courierFetch('Steadfast', `${base(conn)}/trackings_by_invoice/${encodeURIComponent(invoice)}`, { headers: headers(conn) });
	if (r.status === 404) return null;
	if (r.status !== 200) throw refused(r);
	const t = (Array.isArray(r.body?.tracking) ? r.body.tracking : []).find((x: any) => x?.consignment_id);
	if (!t) return null;
	const s = await courierFetch('Steadfast', `${base(conn)}/status_by_cid/${t.consignment_id}`, { headers: headers(conn) });
	return { consignment: String(t.consignment_id), trackingCode: String(t.tracking_code || ''), courierStatus: s.body?.delivery_status || 'in_review' };
};

const eventOf = (courierStatus: string, extra: Partial<CourierEvent> & { consignment?: string; at?: Date }): CourierEvent => {
	const s = String(courierStatus || '').toLowerCase();
	const at = extra.at || new Date();
	return {
		courierStatus: s,
		status: normalise(s),
		awaitingApproval: s.endsWith('_approval_pending'),
		kind: 'status',
		key: `steadfast:${extra.consignment}:${s}:${at.toISOString()}`,
		...extra,
		at,
	};
};

const status = async (conn: Conn, d: { consignment: string; invoice: string }) => {
	const r = await courierFetch('Steadfast', `${base(conn)}/status_by_cid/${encodeURIComponent(d.consignment)}`, { headers: headers(conn) });
	if (r.status !== 200 || !r.body?.delivery_status) throw refused(r);
	// Seen now; the same status asked again changes nothing (applyEvent), and Steadfast's answers are a minute old at most.
	return eventOf(r.body.delivery_status, { consignment: d.consignment, at: new Date(), key: `steadfast:${d.consignment}:${r.body.delivery_status}:sync` });
};

/** No cancel in Steadfast's API: a return request brings an undelivered parcel back. */
const cancel = async (conn: Conn, d: { consignment: string; invoice: string }, reason: string) => {
	const r = await courierFetch('Steadfast', `${base(conn)}/create_return_request`, {
		method: 'POST',
		headers: headers(conn),
		body: { consignment_id: Number(d.consignment) || d.consignment, reason: fit(reason || 'Cancelled by the shop', 255) },
	});
	if (r.status === 422) throw new CourierRefusal(`Steadfast can’t take it back: ${courierWords(r.body) || 'it’s already delivered or on its way back'}`);
	if (r.status !== 200 && r.status !== 201) throw refused(r);
	return { async: true, message: 'Steadfast is asked to bring it back — the status moves when Steadfast confirms.' };
};

const safeEqual = (a: string, b: string) => {
	const x = Buffer.from(String(a || ''));
	const y = Buffer.from(String(b || ''));
	return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const webhook = {
	/** X-Signature: HMAC-SHA256 of the raw body, keyed with the auth token, hex. Without one, the Bearer token itself. */
	verify(req: WebhookIn, secret: string) {
		if (!secret) return false;
		const sig = String(req.headers['x-signature'] || '').toLowerCase();
		if (sig) return safeEqual(sig, crypto.createHmac('sha256', secret).update(req.raw).digest('hex'));
		return safeEqual(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), secret);
	},
	parse(req: WebhookIn): CourierEvent[] {
		const b = req.body || {};
		const type = String(b.notification_type || b.type || b.event || '').toLowerCase();
		const consignment = b.consignment_id !== undefined ? String(b.consignment_id) : undefined;
		// Steadfast's times carry no zone: Dhaka's.
		const stamp = String(b.updated_at || '').trim();
		const at = stamp ? new Date(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(stamp) ? `${stamp.replace(' ', 'T')}+06:00` : stamp) : new Date();
		const when = Number.isNaN(at.getTime()) ? new Date() : at;
		const idem = String(req.headers['idempotency-key'] || '');
		const base = { consignment, invoice: b.invoice ? String(b.invoice) : undefined, at: when, message: b.tracking_message || undefined };
		const key = (k: string) => (idem ? `steadfast:${idem}` : `steadfast:${consignment}:${k}:${when.toISOString()}`);
		if (type === 'delivery_status' || (!type && b.status))
			return [
				{
					...eventOf(b.status, base),
					...(b.cod_amount !== undefined && { collected: Number(b.cod_amount) || 0 }),
					...(b.delivery_charge !== undefined && { charge: Number(b.delivery_charge) || 0 }),
					key: key(String(b.status)),
				},
			];
		if (type === 'tracking_update') return [{ ...base, courierStatus: 'tracking_update', status: null, kind: 'tracking', key: key('tracking') }];
		if (type === 'consignment_update') return [{ ...base, courierStatus: 'consignment_update', status: null, kind: 'update', changed: b.values || {}, key: key(`update:${b.event_id || ''}`) }];
		return [{ ...base, courierStatus: type || 'unknown', status: null, kind: 'other', message: base.message || type.replace(/_/g, ' '), key: key(type) }];
	},
};

/** Steadfast's fraud check for a phone: delivery and cancellation ratios across Steadfast (CR-18). */
const risk = async (conn: Conn, phone: string): Promise<Risk> => {
	const p = bdPhone(phone);
	if (!p) throw new CourierRefusal('A Bangladeshi mobile number is needed to check it.');
	const r = await courierFetch('Steadfast', `${base(conn)}/fraud_check/score/${p}`, { headers: headers(conn) });
	if (r.status === 429) throw new CourierRefusal('Steadfast’s daily limit for checks is used up — it grows with the parcels you book.');
	if (r.status !== 200 || !r.body) throw refused(r);
	const b = r.body.data || r.body;
	const num = (v: any) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
	return {
		deliveryRatio: num(b.delivery_ratio),
		cancellationRatio: num(b.cancellation_ratio),
		delivered: num(b.delivered_count),
		cancelled: num(b.cancelled_count),
		reports: num(b.total_reports),
		volume: b.volume_band ?? b.volume_range ?? null,
		categories: Array.isArray(b.fraud_categories) ? b.fraud_categories.map(String).slice(0, 10) : [],
	};
};

export const steadfast: CourierAdapter = {
	id: 'steadfast',
	name: 'Steadfast',
	countries: ['BD'],
	sandbox: false,
	ready: true,
	links: {
		signUp: 'https://steadfast.com.bd/register',
		keys: 'https://steadfast.com.bd/user/api',
		webhook: 'https://steadfast.com.bd/user/webhook/add',
	},
	credentials: [
		{ key: 'apiKey', label: 'API key', secret: true, helper: 'Steadfast → API → a key named “Mint”' },
		{ key: 'secretKey', label: 'Secret key', secret: true },
	],
	settings: [
		{
			key: 'deliveryType',
			label: 'Delivery',
			kind: 'select',
			options: [
				{ value: '0', label: 'To the customer’s door' },
				{ value: '1', label: 'Customer picks it up at a Steadfast point' },
			],
			default: '0',
		},
	],
	ownWebhookSecret: true,
	test,
	book,
	bookMany,
	find,
	status,
	cancel,
	webhook,
	normalise,
	risk,
};
