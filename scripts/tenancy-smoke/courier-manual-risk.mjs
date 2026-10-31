// Couriers CR-15 + CR-18 (docs/couriers): the manual courier — offered in any country, the couriers a store uses
// (names, tracking-link patterns), a parcel sent with a typed tracking code under its own courier's name and link,
// moved on by hand (picked up → the order shipped; delivered with the cash collected → paid), refused moves, other
// couriers' parcels not moved by hand — and the delivery risk of a buyer's phone from Steadfast's check (usually takes
// parcels / often refuses / not enough to tell), kept a day. Backend with COURIER_STUB_URL.
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
let r = await call('POST', '/tenant/api/auth/register', { name: 'Mo Manual', email: `mo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Ma ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Manual shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('GET', `${C}/settings`, null, t);
ok('the manual courier is offered (any country)', (r.body?.offered?.couriers || []).some(c => c.id === 'manual'), JSON.stringify(r.body?.offered?.couriers));
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `MA${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'manual'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('PUT', `${C}/couriers/manual`, { settings: {} }, t);
ok('no couriers named yet: not ready, says what to add', r.body?.connection && !r.body.connection.tested && /one per line/.test(r.body.connection.test?.message || ''), JSON.stringify(r.body?.connection?.test));
r = await call('PUT', `${C}/couriers/manual`, { settings: { names: 'Sundarban | https://sundarban.example/track/{tracking}\nOwn rider' } }, t);
r = await call('POST', `${C}/couriers/manual/test`, {}, t);
ok('two couriers named: ready', r.body?.connection?.tested && r.body.connection.test.message === 'Ready — Sundarban, Own rider', JSON.stringify(r.body?.connection?.test));
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Ghee', price: 400, status: 'active', sku: 'GHEE' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 50, reason: 'opening' }, t);
const addOrder = async (phone = '01711000000') => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 2 }], delivery: { name: 'Rina Akter', phone, address: 'House 5, Road 3', area: 'Khulna sadar', city: 'Khulna', rate: 'Inside Dhaka' } }, t)).body?.order;
const orderOf = async id => (await call('GET', `${C}/orders/${id}`, null, t)).body;

const o1 = await addOrder();
r = await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'manual', options: { name: 'Pigeon post', tracking: 'X' } }, t);
ok('a courier the store didn’t name: refused, its own listed', r.status === 400 && /Sundarban, Own rider/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'manual', options: { name: 'Sundarban', tracking: 'SB-55120' } }, t);
const d = r.body?.delivery;
ok('sent with Sundarban: its name, the code typed, its tracking link', r.status === 201 && d?.courierName === 'Sundarban' && d.trackingCode === 'SB-55120' && d.trackingUrl === 'https://sundarban.example/track/SB-55120' && d.status === 'booked' && r.body.can.move, `${r.status} ${JSON.stringify(d && { n: d.courierName, t: d.trackingUrl, s: d.status }) || r.body?.message}`);
const move = (to, extra = {}) => call('POST', `${C}/deliveries/${d._id}/status`, { to, ...extra }, t);
r = await move('picked-up', { note: 'Handed over at the Gulshan office' });
ok('moved by hand: picked up; the order shipped; the note on the timeline', r.body?.delivery?.status === 'picked-up' && (await orderOf(o1._id)).order.fulfilment === 'shipped' && r.body.delivery.events.slice(-1)[0].message === 'Handed over at the Gulshan office', `${r.status} ${r.body?.message || r.body?.delivery?.status}`);
r = await move('booked');
ok('not to a made-up step', r.status === 400, `${r.status}`);
r = await move('delivered', { collected: 860 });
let od = await orderOf(o1._id);
ok('delivered with the cash collected: the order delivered and paid', r.body?.delivery?.status === 'delivered' && od.order.fulfilment === 'delivered' && od.order.paymentStatus === 'paid' && od.payments.some(p => p.method === 'courier-cod' && p.amount === 860 && /Sundarban/.test(p.methodLabel)), `${r.body?.delivery?.status} ${od.order.paymentStatus}`);
r = await move('in-transit');
ok('a delivered parcel isn’t moved back', r.status === 409, `${r.status} ${r.body?.message}`);
r = await call('POST', `${C}/deliveries/${d._id}/refresh`, {}, t);
ok('Refresh on a manual parcel asks nobody', r.status === 200 && r.body?.delivery?.status === 'delivered', `${r.status}`);

const o2 = await addOrder();
const sd = (await call('POST', `${C}/orders/${o2._id}/deliveries`, { courier: 'steadfast' }, t)).body?.delivery;
r = await call('POST', `${C}/deliveries/${sd._id}/status`, { to: 'delivered' }, t);
ok('a Steadfast parcel can’t be moved by hand', r.status === 409 && /come from Steadfast/.test(r.body?.message), `${r.status} ${r.body?.message}`);

// The buyer's phone with couriers.
r = await call('GET', `${C}/orders/${o2._id}/risk`, null, t);
ok('risk: usually takes their parcels (90%)', r.status === 200 && r.body?.level === 'low' && r.body.risk.delivered === 18 && /90% delivered/.test(r.body.summary), `${r.status} ${JSON.stringify(r.body)}`);
const o3 = await addOrder('01800000000');
r = await call('GET', `${C}/orders/${o3._id}/risk`, null, t);
ok('risk: often refuses (30%) — ask for payment first', r.body?.level === 'high' && /payment first/.test(r.body.summary) && r.body.risk.categories.includes('fake-order'), JSON.stringify(r.body));
const o4 = await addOrder('01900000000');
r = await call('GET', `${C}/orders/${o4._id}/risk`, null, t);
ok('risk: a number Steadfast doesn’t know — not enough to tell (nulls kept as unknown)', r.body?.level === 'unknown' && r.body.risk.deliveryRatio === null, JSON.stringify(r.body));
await fetch(`${STUB}/__reset`, { method: 'POST' });
r = await call('GET', `${C}/orders/${o2._id}/risk`, null, t);
ok('asked again: kept for the day, Steadfast not asked', r.body?.level === 'low' && (await (await fetch(`${STUB}/__calls`)).json()).filter(c => c.path.startsWith('/fraud_check')).length === 0, '');

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
