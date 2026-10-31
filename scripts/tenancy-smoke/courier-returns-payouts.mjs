// Couriers CR-13 (docs/couriers): a parcel the courier brought back, received in — through the returns engine even
// with returns switched off, restocked to its outlet, no refund for cash on delivery never paid, the order returned,
// once only — and couriers' payouts: Steadfast's payments list (pulled by the regular check) marking its delivered
// parcels paid out, RedX's marked by hand, cash with couriers going down. Backend with COURIER_STUB_URL,
// COURIER_SYNC_MS=3000, COURIER_QUIET_MS=1500 and COURIER_PAYOUT_MS=1000.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done } from './lib.mjs';

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
const setStatus = (courier, consignment, status) => fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier, consignment, status }) });
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ray Returns', email: `ray${stamp}@example.com`, password: 'tenant-pass-123', organization: `Re ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Return shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `RE${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, returns: { allowed: false }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'redx'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);
await call('PUT', `${C}/couriers/redx`, { mode: 'test', keys: { token: 'rx-token' } }, t);
r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Jam', price: 400, status: 'active', sku: 'JAM' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 20, reason: 'opening' }, t);
const onHand = async () => (await call('GET', `${C}/lookup?code=JAM&outlet=${GUL}`, null, t)).body?.onHand;
const addOrder = async (q = 2) => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: q }], delivery: { name: 'Rina Akter', phone: '01711000000', address: 'House 5, Road 3', area: 'Mirpur DOHS', city: 'Dhaka', rate: 'Inside Dhaka' } }, t)).body?.order;
const orderOf = async id => (await call('GET', `${C}/orders/${id}`, null, t)).body;

// Refused at the door, coming back.
const o1 = await addOrder(2);
ok('2 sold: 18 left', (await onHand()) === 18);
const d1 = (await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'steadfast' }, t)).body?.delivery;
r = await call('POST', `${C}/deliveries/${d1._id}/receive`, { lines: [{ line: 0, quantity: 2 }] }, t);
ok('a parcel still on its way can’t be received', r.status === 409, `${r.status} ${r.body?.message}`);
await setStatus('steadfast', d1.consignment, 'cancelled');
r = await call('POST', `${C}/deliveries/${d1._id}/refresh`, {}, t);
ok('Steadfast: coming back', r.body?.delivery?.status === 'returning' && r.body.can.receive, `${r.body?.delivery?.status}`);
r = await call('POST', `${C}/deliveries/${d1._id}/receive`, { lines: [{ line: 0, quantity: 2, condition: 'sellable' }], note: 'Box fine' }, t);
let od = await orderOf(o1._id);
ok('received back — returns switched off, yet taken: a return, no refund (never paid), stock back to 20', r.status === 200 && /^RET-/.test(r.body?.return?.code || '') && r.body.return.refunded === 0 && (await onHand()) === 20, `${r.status} ${r.body?.message || JSON.stringify(r.body?.return)} ${await onHand()}`);
ok('…the delivery returned; the order returned and closed (never delivered), nothing owed', r.body?.delivery?.status === 'returned' && od.order.fulfilment === 'returned' && od.order.status === 'cancelled' && /never delivered/.test(od.order.note) && od.order.balance === 0 && od.returns.length === 1 && /Steadfast DLV-/.test(od.returns[0].note), JSON.stringify({ d: r.body?.delivery?.status, f: od.order.fulfilment, b: od.order.balance, n: od.returns?.[0]?.note }));
r = await call('POST', `${C}/deliveries/${d1._id}/receive`, { lines: [{ line: 0, quantity: 1 }] }, t);
ok('received once only', r.status === 409, `${r.status} ${r.body?.message}`);

// Payouts: Steadfast's list, pulled by the regular check.
const o2 = await addOrder(1);
const d2 = (await call('POST', `${C}/orders/${o2._id}/deliveries`, { courier: 'steadfast' }, t)).body?.delivery;
await setStatus('steadfast', d2.consignment, 'delivered');
await call('POST', `${C}/deliveries/${d2._id}/refresh`, {}, t);
r = await call('GET', `${C}/deliveries`, null, t);
ok('delivered: 460 with Steadfast, not paid out yet', r.body?.cashWithCouriers?.total === 460, JSON.stringify(r.body?.cashWithCouriers));
let x;
for (let i = 0; i < 20; i++) {
	await sleep(1000);
	x = (await call('GET', `${C}/deliveries/${d2._id}`, null, t)).body?.delivery;
	if (x?.settled) break;
}
ok('Steadfast’s payout marks it paid out, with the payment', x?.settled === true && x.payoutRef === 'Steadfast payment 501', JSON.stringify({ s: x?.settled, r: x?.payoutRef }));

// RedX: marked by hand.
const o3 = await addOrder(1);
const d3 = (await call('POST', `${C}/orders/${o3._id}/deliveries`, { courier: 'redx', options: { area: '1', areaName: 'Mirpur DOHS' } }, t)).body?.delivery;
r = await call('POST', `${C}/deliveries/settle`, { deliveries: [d3._id], ref: 'RX-PAY-1' }, t);
ok('a parcel not delivered yet isn’t marked paid out', r.body?.settled === 0 && r.body.skipped === 1, JSON.stringify(r.body));
await setStatus('redx', d3.consignment, 'delivered');
await call('POST', `${C}/deliveries/${d3._id}/refresh`, {}, t);
r = await call('GET', `${C}/deliveries`, null, t);
ok('RedX delivered: 460 with RedX', r.body?.cashWithCouriers?.byCourier?.find(c => c.courier === 'redx')?.amount === 460, JSON.stringify(r.body?.cashWithCouriers));
r = await call('POST', `${C}/deliveries/settle`, { deliveries: [d3._id], ref: 'RX-PAY-1' }, t);
x = (await call('GET', `${C}/deliveries/${d3._id}`, null, t)).body?.delivery;
ok('marked paid out by hand, with the reference', r.body?.settled === 1 && x?.settled && x.payoutRef === 'RX-PAY-1', JSON.stringify(r.body));
r = await call('GET', `${C}/deliveries`, null, t);
ok('nothing left with couriers', r.body?.cashWithCouriers?.total === 0, JSON.stringify(r.body?.cashWithCouriers));

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
