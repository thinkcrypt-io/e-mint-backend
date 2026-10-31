// Couriers CR-12 (docs/couriers): sending several orders at once — Steadfast's bulk API in one call (a bad phone and
// an order already out refused, the rest booked, each its own delivery), RedX one by one with areas only from an
// earlier pick ("choose the area once" otherwise), more than 100 refused. Backend with COURIER_STUB_URL.
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
let r = await call('POST', '/tenant/api/auth/register', { name: 'Bo Bulk', email: `bo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Bu ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Bulk shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `BU${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'redx'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);
await call('PUT', `${C}/couriers/redx`, { mode: 'test', keys: { token: 'rx-token' } }, t);
r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Oil', price: 400, status: 'active', sku: 'OIL' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 100, reason: 'opening' }, t);
const addOrder = async (phone = '01711000000', area = 'Mirpur', city = 'Dhaka') => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 1 }], delivery: { name: 'Rina Akter', phone, address: 'House 5, Road 3', area, city, rate: 'Inside Dhaka' } }, t)).body?.order;

const os = [await addOrder(), await addOrder(), await addOrder('123'), await addOrder()];
await call('POST', `${C}/orders/${os[3]._id}/deliveries`, { courier: 'steadfast' }, t);
await fetch(`${STUB}/__reset`, { method: 'POST' });
r = await call('POST', `${C}/deliveries/bulk`, { courier: 'steadfast', orders: os.map(o => o._id), note: 'Fragile' }, t);
const res = r.body?.results || [];
ok('Steadfast bulk: 2 sent, a bad phone and one already out refused', r.status === 200 && r.body.sent === 2 && r.body.failed === 2 && res[0].ok && res[1].ok && /Bangladeshi/.test(res[2].error) && /Already with Steadfast/.test(res[3].error), JSON.stringify(r.body));
const calls = (await (await fetch(`${STUB}/__calls`)).json()).filter(c => c.courier === 'steadfast' && c.method === 'POST');
ok('…in one call to Steadfast’s bulk API', calls.length === 1 && calls[0].path === '/create_order/bulk-order/extended', JSON.stringify(calls.map(c => c.path)));
r = await call('GET', `${C}/orders/${os[0]._id}`, null, t);
ok('each its own delivery, booked, with the note', r.body?.deliveries?.[0]?.status === 'booked' && r.body.deliveries[0].note === 'Fragile' && r.body.order.courier.delivery === r.body.deliveries[0].code, JSON.stringify(r.body?.deliveries?.[0] && { s: r.body.deliveries[0].status, n: r.body.deliveries[0].note }));

const rx = [await addOrder('01711000000', 'Mirpur DOHS'), await addOrder('01711000000', 'Agrabad', 'Chattogram')];
r = await call('POST', `${C}/deliveries/bulk`, { courier: 'redx', orders: rx.map(o => o._id) }, t);
ok('RedX bulk with no area picked yet: each says choose the area once', r.body?.sent === 0 && r.body.results.every(x => /Choose the RedX area once/.test(x.error)), JSON.stringify(r.body));
await call('POST', `${C}/orders/${rx[0]._id}/deliveries`, { courier: 'redx', options: { area: '1', areaName: 'Mirpur DOHS' } }, t);
const rx2 = await addOrder('01711000000', 'Mirpur DOHS');
r = await call('POST', `${C}/deliveries/bulk`, { courier: 'redx', orders: [rx2._id, rx[1]._id] }, t);
ok('…after one pick: that place sent with it, the other still asks', r.body?.results?.[0]?.ok && !r.body.results[1].ok, JSON.stringify(r.body));
r = await call('POST', `${C}/deliveries/bulk`, { courier: 'steadfast', orders: Array.from({ length: 101 }, (_, i) => i.toString(16).padStart(24, 'a')) }, t);
ok('more than 100: refused', r.status === 400, `${r.status} ${r.body?.message}`);

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
