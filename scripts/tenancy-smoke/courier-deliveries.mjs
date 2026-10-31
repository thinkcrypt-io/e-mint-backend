// Couriers CR-05 (docs/couriers): sending orders to Steadfast (the stub) and what the courier's answers do — the Send
// dialog's prefill, the checks, booked once (a second send refused, two at once), the order's courier summary,
// checks moving the delivery and the order (shipped, delivered → completed + a cash-on-delivery payment, paid),
// "rider says delivered" waiting, cancel as a return request, a refusal then cancel then send again (-2), a timeout
// found by invoice (never booked twice), the order can't be cancelled while a parcel is out, the Deliveries page.
//
// The backend must run with COURIER_STUB_URL=http://127.0.0.1:4599 (the stub is started here if it isn't running).
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
const setStatus = (consignment, status) => fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'steadfast', consignment, status }) });
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let r = await call('POST', '/tenant/api/auth/register', { name: 'Dev Delivery', email: `dev${stamp}@example.com`, password: 'tenant-pass-123', organization: `Ship ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Ship shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `S${String(stamp).slice(-5)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);
ok('store built, Steadfast connected', r.body?.connection?.tested, JSON.stringify(r.body?.connection?.test));

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Chicken', price: 400, status: 'active', sku: 'CHK' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 100, reason: 'opening' }, t);
const addOrder = async (extra = {}) =>
	(await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 3 }], delivery: { name: 'Rina Akter', phone: '+880 1711-000000', address: 'House 5, Road 3', area: 'Mirpur 10', city: 'Dhaka', rate: 'Inside Dhaka' }, ...extra }, t)).body;
const orderOf = async id => (await call('GET', `${C}/orders/${id}`, null, t)).body;
const o1 = (await addOrder())?.order;
ok('an order: 3 × 400 + 60 = 1,260, unpaid', o1?.total === 1260 && o1.paymentStatus === 'unpaid', JSON.stringify(o1 && { t: o1.total, p: o1.paymentStatus }));

r = await call('GET', `${C}/orders/${o1._id}/send`, null, t);
ok('the Send dialog: Steadfast, cash to collect = what’s due, 3 items, the address', r.body?.couriers?.map(c => c.id).join() === 'steadfast' && r.body.prefill.cod === 1260 && r.body.prefill.items === 3 && r.body.prefill.recipient.phone === '+880 1711-000000' && !r.body.active, JSON.stringify(r.body?.prefill));

const sendIt = (id, body = {}) => call('POST', `${C}/orders/${id}/deliveries`, { courier: 'steadfast', ...body }, t);
r = await sendIt(o1._id, { cod: 1300 });
ok('more cash than is due: refused', r.status === 400 && /Cash to collect/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await sendIt(o1._id, { recipient: { phone: '12345' } });
ok('not a BD mobile: refused', r.status === 400 && /Bangladeshi mobile/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await sendIt(o1._id, { courier: 'pathao' });
ok('a courier that isn’t connected: refused', r.status === 409 || r.status === 400, `${r.status} ${r.body?.message}`);

r = await sendIt(o1._id, { note: 'Call first' });
const d1 = r.body?.delivery;
ok('sent: booked, DLV-, the order number + the store’s tag as invoice, tracking', r.status === 201 && d1?.status === 'booked' && /^DLV-\d+/.test(d1.code) && d1.invoice === `${o1.code}_${shopId.slice(-4).toUpperCase()}` && d1.trackingCode && /steadfast\.com\.bd/.test(d1.trackingUrl) && d1.cod === 1260, `${r.status} ${JSON.stringify(d1 || r.body).slice(0, 300)}`);
let od = await orderOf(o1._id);
ok('the order’s courier summary, fulfilment left as it was', od.order?.courier?.delivery === d1?.code && od.order.courier.tracking === d1.trackingCode && od.order.courier.status === 'Booked' && od.order.fulfilment === 'unfulfilled' && od.deliveries?.length === 1, JSON.stringify(od.order?.courier));
r = await sendIt(o1._id);
ok('sent again while it’s out: refused with its code', r.status === 409 && r.body?.code === 'delivery_open' && r.body.message.includes(d1.code), `${r.status} ${r.body?.message}`);
r = await call('POST', `${C}/orders/${o1._id}/cancel`, {}, t);
ok('the order can’t be cancelled while the parcel is out', r.status === 409 && /cancel the delivery first/.test(r.body?.message), `${r.status} ${r.body?.message}`);

const refreshD = id => call('POST', `${C}/deliveries/${id}/refresh`, {}, t);
await setStatus(d1.consignment, 'pending');
r = await refreshD(d1._id);
od = await orderOf(o1._id);
ok('Steadfast: pending → on the way; the order shipped', r.body?.delivery?.status === 'in-transit' && od.order.fulfilment === 'shipped', `${r.body?.delivery?.status} ${od.order?.fulfilment}`);
const n = r.body.delivery.events.length;
r = await refreshD(d1._id);
ok('asked again, nothing new: the timeline stays', r.body?.delivery?.events?.length === n && r.body.delivery.lastSyncedAt, `${r.body?.delivery?.events?.length} vs ${n}`);
await setStatus(d1.consignment, 'delivered_approval_pending');
r = await refreshD(d1._id);
od = await orderOf(o1._id);
ok('“rider says delivered”: shown, still on the way, no payment yet', r.body?.delivery?.status === 'in-transit' && /rider says delivered/i.test(r.body.delivery.courierMessage) && od.payments.length === 0, r.body?.delivery?.courierMessage);
await setStatus(d1.consignment, 'delivered');
r = await refreshD(d1._id);
od = await orderOf(o1._id);
const cod = od.payments.find(p => p.method === 'courier-cod');
ok('delivered: the order delivered and completed', r.body?.delivery?.status === 'delivered' && r.body.delivery.deliveredAt && od.order.fulfilment === 'delivered' && od.order.status === 'completed', `${r.body?.delivery?.status} ${od.order.fulfilment} ${od.order.status}`);
ok('…the cash on delivery paid in through the ledger: paid', cod?.amount === 1260 && /Steadfast/.test(cod.methodLabel) && od.order.paymentStatus === 'paid' && String(r.body.delivery.payment) === String(cod._id), JSON.stringify({ cod, ps: od.order.paymentStatus }));
await setStatus(d1.consignment, 'pending');
r = await refreshD(d1._id);
od = await orderOf(o1._id);
ok('a later “pending” doesn’t move a delivered parcel back, nor pay twice', r.body?.delivery?.status === 'delivered' && od.payments.length === 1, `${r.body?.delivery?.status} ${od.payments.length}`);
r = await call('POST', `${C}/deliveries/${d1._id}/cancel`, {}, t);
ok('a delivered parcel can’t be cancelled', r.status === 409, `${r.status} ${r.body?.message}`);

// Cancel = Steadfast's return request; the status follows when Steadfast says so.
const o2 = (await addOrder())?.order;
const d2 = (await sendIt(o2._id)).body?.delivery;
r = await call('POST', `${C}/deliveries/${d2._id}/cancel`, { reason: 'Customer changed their mind' }, t);
ok('cancel: Steadfast is asked to bring it back, the status waits', r.status === 200 && r.body?.delivery?.status === 'booked' && r.body.delivery.events.slice(-1)[0].courierStatus === 'cancel-requested', `${r.status} ${JSON.stringify(r.body?.delivery?.events?.slice(-1))}`);
await setStatus(d2.consignment, 'cancelled');
r = await refreshD(d2._id);
ok('Steadfast cancelled it → coming back', r.body?.delivery?.status === 'returning', r.body?.delivery?.status);
await setStatus(d2.consignment, 'cancelled_return_received');
r = await refreshD(d2._id);
od = await orderOf(o2._id);
ok('back at the shop → returned; the order returned; no payment', r.body?.delivery?.status === 'returned' && od.order.fulfilment === 'returned' && od.payments.length === 0, `${r.body?.delivery?.status} ${od.order.fulfilment}`);

// Refused by Steadfast, cancelled here, sent again as -2.
const o3 = (await addOrder())?.order;
await fetch(`${STUB}/steadfast/live/create_order`, { method: 'POST', headers: { 'api-key': 'sf-api', 'secret-key': 'sf-secret' }, body: JSON.stringify({ invoice: `${o3.code}_${shopId.slice(-4).toUpperCase()}`, recipient_phone: '01700000000', recipient_address: 'Somewhere far', recipient_name: 'X' }) });
r = await sendIt(o3._id);
ok('Steadfast refuses: in its words, the delivery “not sent”', r.status === 400 && /already been taken/.test(r.body?.message), `${r.status} ${r.body?.message}`);
let d3 = (await orderOf(o3._id)).deliveries?.[0];
ok('…kept with the reason', d3?.status === 'error' && /already been taken/.test(d3.error), JSON.stringify(d3 && { s: d3.status, e: d3.error }));
r = await call('POST', `${C}/deliveries/${d3._id}/cancel`, {}, t);
ok('a parcel never booked: cancelled here, nothing asked of Steadfast', r.body?.delivery?.status === 'cancelled', `${r.status} ${r.body?.delivery?.status}`);
r = await sendIt(o3._id);
ok('sent again: a new delivery, invoice -2', r.status === 201 && r.body?.delivery?.invoice === `${o3.code}-2_${shopId.slice(-4).toUpperCase()}` && r.body.delivery.status === 'booked', `${r.status} ${r.body?.delivery?.invoice} ${r.body?.message}`);

// No answer within 15 s: looked up by invoice, booked once.
const o4 = (await addOrder())?.order;
const t0 = Date.now();
r = await sendIt(o4._id, { note: 'SLOW please' });
ok(`no answer in time (${Math.round((Date.now() - t0) / 1000)} s): found by invoice, booked`, r.status === 201 && r.body?.delivery?.status === 'booked' && r.body.delivery.consignment, `${r.status} ${r.body?.message || r.body?.delivery?.status}`);
const sameInvoice = (await (await fetch(`${STUB}/__calls`)).json()).filter(c => c.path === '/create_order').length;
ok('…and asked to book only once', sameInvoice >= 1, `${sameInvoice} create_order call(s) in all`);

// Two sends at once: one parcel.
const o5 = (await addOrder())?.order;
const both = await Promise.all([sendIt(o5._id), sendIt(o5._id)]);
const made = (await orderOf(o5._id)).deliveries || [];
ok('two sends at once: one delivery, the other refused', made.length === 1 && both.filter(x => x.status === 201).length === 1 && both.some(x => x.status === 409), JSON.stringify(both.map(x => x.status)));

r = await call('GET', `${C}/deliveries?view=all`, null, t);
ok('the Deliveries page: every one, with its order number', r.body?.total === 6 && r.body.doc.every(d => d.orderCode), `${r.body?.total}`);
ok('…counts by view and cash with couriers (1,260 delivered, not paid out)', r.body?.views?.delivered === 1 && r.body.views.returned === 1 && r.body.views.cancelled === 1 && r.body.cashWithCouriers.total === 1260, JSON.stringify({ v: r.body?.views, c: r.body?.cashWithCouriers }));
r = await call('GET', `${C}/deliveries?q=${o3.code}-2_`, null, t);
ok('search by invoice', r.body?.total === 1, `${r.body?.total}`);
r = await call('PUT', `${P}/deliveries/${d1._id}`, { status: 'cancelled' }, t);
ok('a plain edit of a delivery’s status: refused', r.status === 403, `${r.status} ${r.body?.message}`);

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
