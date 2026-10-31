// Couriers CR-09 (docs/couriers): RedX through Mint, against courier-stub.mjs — connected (sandbox), its pickup store
// and that store's area, areas by post code, the charge, a send without a delivery area refused, sent as RedX takes it
// (grams, the cash as a string, the store), Refresh, every status mapped, Cancel as RedX's request (the status follows),
// the webhook (the token in the address; wrong or missing 401; ready-for-delivery → shipped, delivered → paid, paid →
// settled). Backend with COURIER_STUB_URL.
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
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
const setStatus = (consignment, status) => fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'redx', consignment, status }) });

let r = await call('POST', '/tenant/api/auth/register', { name: 'Rex RedX', email: `rex${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rx ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'RedX shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `RX${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['redx'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('PUT', `${C}/couriers/redx`, { mode: 'test', keys: { token: 'rx-token' } }, t);
const conn = r.body?.connection;
ok('RedX connected (sandbox): its pickup store and that store’s area', conn?.tested && conn.mode === 'test' && conn.settings.store === '7001' && conn.settings.pickupArea === '3', JSON.stringify(conn?.settings));
const hookUrl = new URL(conn.webhook.url);

r = await call('GET', `${C}/couriers/redx/options/areas?parent=1216`, null, t);
const area = r.body?.choices?.[0];
ok('a delivery area by post code', area?.label === 'Mirpur DOHS', JSON.stringify(r.body));

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Tea', price: 400, status: 'active', sku: 'TEA' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 50, reason: 'opening' }, t);
const addOrder = async () => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 3 }], delivery: { name: 'Rina Akter', phone: '01711000000', address: 'House 5, Road 3', area: 'Mirpur DOHS', city: 'Dhaka', rate: 'Inside Dhaka' } }, t)).body?.order;
const orderOf = async id => (await call('GET', `${C}/orders/${id}`, null, t)).body;

const o1 = await addOrder();
r = await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'redx' }, t);
ok('without a delivery area: refused, says what to pick', r.status === 400 && /delivery area/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'redx', weight: 1.5, options: { area: area.value, areaName: area.label } }, t);
const d1 = r.body?.delivery;
ok('sent: RedX’s tracking id, waiting for pickup', r.status === 201 && d1?.consignment && d1.status === 'booked' && d1.courierStatus === 'pickup-pending', `${r.status} ${r.body?.message || d1?.status}`);
const sent = (await (await fetch(`${STUB}/__parcel/redx/${d1.consignment}`)).json()).sent;
ok('sent as RedX takes it: grams, the cash as a string, the area id, the pickup store, our invoice', sent.parcel_weight === 1500 && sent.cash_collection_amount === '1260' && sent.delivery_area_id === 1 && sent.pickup_store_id === 7001 && sent.merchant_invoice_id === o1.code && sent.value === 1260, JSON.stringify(sent));

await setStatus(d1.consignment, 'ready-for-delivery');
r = await call('POST', `${C}/deliveries/${d1._id}/refresh`, {}, t);
ok('Refresh: ready for delivery → picked up; the order shipped', r.body?.delivery?.status === 'picked-up' && (await orderOf(o1._id)).order.fulfilment === 'shipped', r.body?.delivery?.status || r.body?.message);
r = await call('POST', `${C}/deliveries/${d1._id}/cancel`, { reason: 'Customer moved' }, t);
ok('Cancel: RedX asked, the status waits for RedX', r.status === 200 && r.body?.delivery?.status === 'picked-up' && r.body.delivery.events.slice(-1)[0].courierStatus === 'cancel-requested', `${r.status} ${r.body?.message}`);
const asked = (await (await fetch(`${STUB}/__parcel/redx/${d1.consignment}`)).json()).cancelRequested;
ok('…with the reason', asked === 'Customer moved', String(asked));

const hook = async (body, token = hookUrl.searchParams.get('token')) => {
	const u = `${ROOT}${hookUrl.pathname}${token === null ? '' : `?token=${token}`}`;
	const res = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return res.status;
};
const ev = (status, at) => ({ tracking_number: d1.consignment, timestamp: at, status, message_en: `RedX: ${status}`, message_bn: '', invoice_number: o1.code, delivery_type: 'regular' });
ok('webhook without the token: 401', (await hook(ev('delivered', '2026-10-31T10:00:00Z'), null)) === 401);
ok('webhook with a wrong token: 401', (await hook(ev('delivered', '2026-10-31T10:00:00Z'), 'nope')) === 401);
ok('webhook with Mint’s token: 200', (await hook(ev('delivery-in-progress', '2026-10-31T09:00:00Z'))) === 200);
await sleep(700);
let x = (await call('GET', `${C}/deliveries/${d1._id}`, null, t)).body?.delivery;
ok('delivery-in-progress → out for delivery, RedX’s words on the timeline', x?.status === 'out-for-delivery' && x.events.slice(-1)[0].message === 'RedX: delivery-in-progress', x?.status);
await hook(ev('delivered', '2026-10-31T10:00:00Z'));
await sleep(700);
x = (await call('GET', `${C}/deliveries/${d1._id}`, null, t)).body?.delivery;
const od = await orderOf(o1._id);
ok('delivered → the order delivered and paid', x?.status === 'delivered' && od.order.fulfilment === 'delivered' && od.order.paymentStatus === 'paid', `${x?.status} ${od.order.paymentStatus}`);
await hook(ev('paid', '2026-11-02T10:00:00Z'));
await sleep(700);
x = (await call('GET', `${C}/deliveries/${d1._id}`, null, t)).body?.delivery;
ok('paid → paid out by RedX', x?.settled === true && x.status === 'delivered', JSON.stringify({ s: x?.settled }));

const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
const { redx } = await import(pathToFileURL(`${backend}/dist/library/functions/commerce/couriers/redx.js`).href);
const map = { 'pickup-pending': 'pickup-pending', 'ready-for-delivery': 'picked-up', 'delivery-in-progress': 'out-for-delivery', delivered: 'delivered', 'agent-hold': 'on-hold', 'agent-returning': 'returning', returned: 'returned', 'agent-area-change': null, paid: null, 'something-new': null };
ok('every RedX status mapped', Object.entries(map).every(([k, v]) => redx.normalise(k) === v), JSON.stringify(Object.keys(map).map(k => [k, redx.normalise(k)])));

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
