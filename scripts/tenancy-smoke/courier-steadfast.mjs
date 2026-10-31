// Couriers CR-04 (docs/couriers): the Steadfast adapter on its own, against courier-stub.mjs — booking (phone and
// field rules, a reused invoice refused), bulk (good and bad in one call), find by invoice, status, cancel as a
// return request, the statuses mapped (CR6), the webhook's signature and its three event kinds. Imports the built
// adapter from SMOKE_BACKEND (default this backend; `npm run build` first).
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { ok, done } from './lib.mjs';

const STUB = process.env.COURIER_STUB || 'http://127.0.0.1:4599';
process.env.COURIER_STUB_URL = STUB;
let stub = null;
try {
	await fetch(`${STUB}/__calls`);
} catch {
	stub = spawn('node', [fileURLToPath(new URL('./courier-stub.mjs', import.meta.url)), new URL(STUB).port], { stdio: 'ignore' });
	await new Promise(r => setTimeout(r, 600));
}
const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
const { steadfast: sf } = await import(pathToFileURL(`${backend}/dist/library/functions/commerce/couriers/steadfast.js`).href);

const conn = { mode: 'live', credentials: { apiKey: 'sf-api', secretKey: 'sf-secret' }, settings: { deliveryType: '0' } };
const stamp = Date.now();
const parcel = (n, extra = {}) => ({
	invoice: `T${stamp}-${n}`,
	recipient: { name: 'Rahim <Uddin>', phone: '+880 1711-000000', address: 'House 5, Road 3', area: 'Mirpur 10', city: 'Dhaka' },
	cod: 1260.4,
	value: 1260,
	weight: 1,
	items: 2,
	note: 'Call first; fragile',
	options: {},
	...extra,
});
const fails = async fn => {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
};

const b = await sf.book(conn, parcel(1));
ok('booked: consignment, tracking code and link, in review', /^\d+$/.test(b.consignment) && b.trackingCode && /steadfast\.com\.bd\/tl\//.test(b.trackingUrl) && b.courierStatus === 'in_review', JSON.stringify(b));
const p = await (await fetch(`${STUB}/__parcel/steadfast/${b.consignment}`)).json();
ok('sent as Steadfast takes it: 01… phone, whole taka, no < > ;, area and city added, pieces', p.recipient_phone === '01711000000' && p.cod_amount === 1260 && p.recipient_name === 'Rahim Uddin' && p.recipient_address === 'House 5, Road 3, Mirpur 10, Dhaka' && p.note === 'Call first fragile' && p.delivery_type === 0, JSON.stringify(p));

let e = await fails(() => sf.book(conn, parcel(1)));
ok('the same invoice again: refused in Steadfast’s words', e?.constructor?.name === 'CourierRefusal' && /already been taken/.test(e.message), e?.message);
e = await fails(() => sf.book(conn, parcel(2, { recipient: { name: 'X', phone: '12345', address: 'Somewhere' } })));
ok('a phone that isn’t a BD mobile: refused before calling', /Bangladeshi mobile/.test(e?.message || ''), e?.message);
e = await fails(() => sf.book({ ...conn, credentials: { apiKey: 'nope', secretKey: 'x' } }, parcel(3)));
ok('wrong keys: refused and marked as the keys', e?.rejected === true, e?.message);

const many = await sf.bookMany(conn, [parcel(10), parcel(11, { recipient: { name: 'Y', phone: 'bad', address: 'x' } }), parcel(1), parcel(12)]);
ok('bulk: each answer in the order sent — booked, bad phone, invoice taken, booked', many.map(x => x.ok).join() === 'true,false,false,true' && /Bangladeshi/.test(many[1].error) && /already been taken/.test(many[2].error), JSON.stringify(many.map(x => x.ok ? x.booked.consignment : x.error)));

const f = await sf.find(conn, `T${stamp}-1`);
ok('found by invoice after the fact', f?.consignment === b.consignment, JSON.stringify(f));
ok('an invoice never booked: nothing', (await sf.find(conn, `T${stamp}-none`)) === null);

let s = await sf.status(conn, b);
ok('status: in review → booked', s.courierStatus === 'in_review' && s.status === 'booked' && s.consignment === b.consignment, JSON.stringify(s));
await fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'steadfast', consignment: b.consignment, status: 'delivered_approval_pending' }) });
s = await sf.status(conn, b);
ok('“rider says delivered”: shown, not moved, waiting for approval', s.status === null && s.awaitingApproval === true, JSON.stringify(s));

const map = { in_review: 'booked', pending: 'in-transit', hold: 'on-hold', delivered: 'delivered', partial_delivered: 'partly-delivered', cancelled: 'returning', exceptional: 'lost', unknown: null, something_new: null };
ok('every Steadfast status mapped', Object.entries(map).every(([k, v]) => sf.normalise(k) === v), JSON.stringify(Object.keys(map).map(k => [k, sf.normalise(k)])));

const c = await sf.cancel(conn, many[0].booked, 'Customer changed their mind');
ok('cancel = a return request, confirmed later', c.async === true && /bring it back/.test(c.message), JSON.stringify(c));
await fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'steadfast', consignment: many[3].booked.consignment, status: 'delivered' }) });
e = await fails(() => sf.cancel(conn, many[3].booked, 'x'));
ok('a delivered parcel can’t be taken back', /can’t take it back/.test(e?.message || ''), e?.message);

// The webhook: X-Signature is the HMAC of the raw body.
const secret = 'Mint-secret_123456789';
const body = { notification_type: 'delivery_status', consignment_id: Number(b.consignment), invoice: `T${stamp}-1`, cod_amount: 1260, status: 'delivered', delivery_charge: 60, tracking_message: 'Delivered to the customer', updated_at: '2026-10-31 12:00:00' };
const raw = JSON.stringify(body);
const sign = (r, k = secret) => crypto.createHmac('sha256', k).update(r).digest('hex');
const req = (r, headers) => ({ raw: r, body: JSON.parse(r), headers, query: {} });
ok('a signed call is Steadfast’s', sf.webhook.verify(req(raw, { 'x-signature': sign(raw), 'idempotency-key': 'idem-1' }), secret));
ok('a wrong signature, a changed body, another secret: not', !sf.webhook.verify(req(raw, { 'x-signature': sign(raw, 'other') }), secret) && !sf.webhook.verify(req(raw.replace('1260', '9999'), { 'x-signature': sign(raw) }), secret) && !sf.webhook.verify(req(raw, { 'x-signature': sign(raw) }), 'another-secret-00000'));
ok('without a signature, the Bearer token must match', sf.webhook.verify(req(raw, { authorization: `Bearer ${secret}` }), secret) && !sf.webhook.verify(req(raw, { authorization: 'Bearer nope' }), secret) && !sf.webhook.verify(req(raw, {}), secret));
let ev = sf.webhook.parse(req(raw, { 'idempotency-key': 'idem-1' }));
ok('delivery_status: delivered, the cash collected, the charge, keyed by Idempotency-Key', ev.length === 1 && ev[0].status === 'delivered' && ev[0].collected === 1260 && ev[0].charge === 60 && ev[0].key === 'steadfast:idem-1' && ev[0].message === 'Delivered to the customer', JSON.stringify(ev));
ev = sf.webhook.parse(req(JSON.stringify({ notification_type: 'tracking_update', consignment_id: 1, invoice: 'x', tracking_message: 'At the Mirpur hub', updated_at: '2026-10-31 13:00:00' }), {}));
ok('tracking_update: a note on the timeline, no status', ev[0].kind === 'tracking' && ev[0].status === null && ev[0].message === 'At the Mirpur hub', JSON.stringify(ev));
ev = sf.webhook.parse(req(JSON.stringify({ notification_type: 'consignment_update', event_id: 7, consignment_id: 1, changed: ['cod_amount'], values: { cod_amount: 900 } }), {}));
ok('consignment_update: what changed', ev[0].kind === 'update' && ev[0].changed?.cod_amount === 900, JSON.stringify(ev));

stub?.kill();
done();
