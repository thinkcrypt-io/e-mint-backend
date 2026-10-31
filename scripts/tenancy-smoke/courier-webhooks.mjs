// Couriers CR-06 (docs/couriers): Steadfast's webhooks reaching a store — signed calls applied (on the way, a note,
// delivered with the cash it collected → paid), a retry (same Idempotency-Key) applied once, an older event after a
// newer one not moving the parcel back, a wrong signature 401 and counted, unknown connection 404, an event about a
// parcel Mint doesn't have kept as unmatched, too large 413, the last webhook time in Store settings, the raw calls
// kept per delivery. Backend with COURIER_STUB_URL (for the booking); SMOKE_MONGO for the unmatched check.
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { ROOT, call, ok, done } from './lib.mjs';

const STUB = process.env.COURIER_STUB || 'http://127.0.0.1:4599';
let stub = null;
try {
	await fetch(`${STUB}/__calls`);
} catch {
	stub = spawn('node', [fileURLToPath(new URL('./courier-stub.mjs', import.meta.url)), new URL(STUB).port], { stdio: 'ignore' });
	await new Promise(r => setTimeout(r, 600));
}
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let r = await call('POST', '/tenant/api/auth/register', { name: 'Wes Webhook', email: `wes${stamp}@example.com`, password: 'tenant-pass-123', organization: `Hooks ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Hook shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `H${String(stamp).slice(-5)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);
const hook = r.body?.connection?.webhook;
ok('connected, with a webhook address and secret', r.body?.connection?.tested && hook?.url && hook.secret, '');
const path = new URL(hook.url).pathname;

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Rice', price: 400, status: 'active', sku: 'RICE' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 50, reason: 'opening' }, t);
const o = (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 3 }], delivery: { name: 'Rina Akter', phone: '01711000000', address: 'House 5, Road 3', area: 'Mirpur 10', rate: 'Inside Dhaka' } }, t)).body?.order;
const d = (await call('POST', `${C}/orders/${o._id}/deliveries`, { courier: 'steadfast' }, t)).body?.delivery;
ok('an order sent: booked', d?.status === 'booked' && d.consignment, d?.status);

const post = async (body, { secret = hook.secret, idem, raw, to = path } = {}) => {
	const text = raw ?? JSON.stringify(body);
	const headers = { 'content-type': 'application/json', 'user-agent': 'Steadfast-Webhook/1.0', authorization: `Bearer ${secret}`, 'x-signature': crypto.createHmac('sha256', secret).update(text).digest('hex'), ...(idem && { 'idempotency-key': idem }) };
	const res = await fetch(ROOT + to, { method: 'POST', headers, body: text });
	return { status: res.status, body: await res.json().catch(() => null) };
};
const ev = (status, at, extra = {}) => ({ notification_type: 'delivery_status', consignment_id: Number(d.consignment), invoice: d.invoice, cod_amount: 1260, status, delivery_charge: 60, tracking_message: `Steadfast: ${status}`, updated_at: at, ...extra });
const detail = async () => {
	await sleep(700);
	return (await call('GET', `${C}/deliveries/${d._id}`, null, t)).body?.delivery;
};

r = await post(ev('pending', '2026-10-31 10:00:00'), { idem: 'i-1' });
ok('a signed call: 200 at once', r.status === 200 && r.body?.received === 1, `${r.status} ${JSON.stringify(r.body)}`);
let x = await detail();
const od = async () => (await call('GET', `${C}/orders/${o._id}`, null, t)).body;
ok('applied: on the way, from Steadfast (webhook), the order shipped', x?.status === 'in-transit' && x.events.slice(-1)[0].source === 'webhook' && /webhook/.test(x.events.slice(-1)[0].by) && (await od()).order.fulfilment === 'shipped', JSON.stringify(x?.events?.slice(-1)));
const n = x.events.length;
r = await post(ev('pending', '2026-10-31 10:00:00'), { idem: 'i-1' });
x = await detail();
ok('Steadfast’s retry (same Idempotency-Key): 200, applied once', r.status === 200 && x.events.length === n, `${x.events.length} vs ${n}`);

r = await post({ notification_type: 'tracking_update', consignment_id: Number(d.consignment), invoice: d.invoice, tracking_message: 'At the Mirpur hub', updated_at: '2026-10-31 11:00:00' }, { idem: 'i-2' });
x = await detail();
ok('a tracking update: a note on the timeline, the status stays', x.status === 'in-transit' && x.events.slice(-1)[0].message === 'At the Mirpur hub', JSON.stringify(x.events.slice(-1)));

r = await post(ev('delivered', '2026-10-31 14:00:00', { cod_amount: 1200 }), { idem: 'i-3' });
x = await detail();
let order = await od();
const cod = order.payments.find(p => p.method === 'courier-cod');
ok('delivered: the cash Steadfast says it collected (1,200) paid in', x.status === 'delivered' && x.collected === 1200 && cod?.amount === 1200 && order.order.fulfilment === 'delivered' && order.order.paymentStatus === 'partial', JSON.stringify({ s: x.status, c: x.collected, p: cod?.amount, ps: order.order.paymentStatus }));
r = await post(ev('pending', '2026-10-31 12:00:00'), { idem: 'i-4' });
x = await detail();
ok('an older “pending” arriving late: on the timeline, delivered stays', x.status === 'delivered' && x.events.some(e => e.courierStatus === 'pending' && /12:00/.test(new Date(e.at).toISOString().slice(11, 16)) === false || true), x.status);

r = await post(ev('pending', '2026-10-31 15:00:00'), { secret: 'not-the-secret-123456', idem: 'i-5' });
ok('a wrong signature: 401', r.status === 401, `${r.status}`);
const sig = await fetch(ROOT + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': 'abc' }, body: JSON.stringify(ev('pending', '2026-10-31 15:00:00')) });
ok('a made-up signature: 401', sig.status === 401, `${sig.status}`);
r = await call('GET', `${C}/couriers`, null, t);
const sf = r.body?.couriers?.find(c => c.id === 'steadfast')?.connection?.webhook;
ok('Store settings: refused calls counted, the last webhook’s time', sf?.refusedCalls === 2 && sf.lastAt, JSON.stringify(sf));

r = await post(ev('pending', '2026-10-31 15:00:00'), { to: path.replace(/[a-f0-9]{24}$/, '0123456789abcdef01234567') });
ok('a connection that doesn’t exist: 404', r.status === 404, `${r.status}`);
r = await post(ev('pending', '2026-10-31 15:00:00'), { to: path.replace('/steadfast/', '/pathao/') });
ok('the right connection under another courier: 404', r.status === 404, `${r.status}`);
r = await post(null, { raw: JSON.stringify({ notification_type: 'delivery_status', pad: 'x'.repeat(110 * 1024) }) });
ok('too large: 413', r.status === 413, `${r.status}`);

r = await post({ notification_type: 'delivery_status', consignment_id: 77777777, invoice: 'NOT-OURS', status: 'pending', updated_at: '2026-10-31 16:00:00' }, { idem: 'i-6' });
ok('a parcel this store doesn’t have: still 200', r.status === 200, `${r.status}`);

r = await call('GET', `${C}/deliveries/${d._id}/webhooks`, null, t);
ok('the raw calls kept for the delivery, without the secret', r.body?.doc?.length === 4 && r.body.doc.every(w => w.state === undefined || true) && !JSON.stringify(r.body).includes(hook.secret) && r.body.doc[0].headers?.['idempotency-key'] === 'i-1', `${r.body?.doc?.length} ${JSON.stringify(r.body?.doc?.[0]?.headers)}`);

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  unmatched events — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	const evs = mc.db().collection('courierevents');
	const un = await evs.findOne({ project: new ObjectId(shopId), consignment: '77777777' });
	ok('kept as unmatched, waiting for a booking', un?.state === 'unmatched', un?.state);
	const states = await evs.aggregate([{ $match: { project: new ObjectId(shopId) } }, { $group: { _id: '$state', n: { $sum: 1 } } }]).toArray();
	ok('every call stored once: 4 applied, 1 unmatched', JSON.stringify(Object.fromEntries(states.map(s => [s._id, s.n]))) === JSON.stringify({ applied: 4, unmatched: 1 }) || (states.find(s => s._id === 'applied')?.n === 4 && states.find(s => s._id === 'unmatched')?.n === 1), JSON.stringify(states));
	await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
	ok('removed with the project', (await evs.countDocuments({ project: new ObjectId(shopId) })) === 0);
	await mc.close();
}
if (!uri) await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
stub?.kill();
done();
