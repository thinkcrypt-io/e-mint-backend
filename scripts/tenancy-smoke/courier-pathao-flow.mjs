// Couriers CR-08 (docs/couriers): Pathao through Mint, against courier-stub.mjs — connected with Pathao's sandbox
// account, an order sent (the pickup store, its fee), Pathao's webhooks (the integration handshake answered 202 with
// its header, a wrong secret 401, picked → shipped, delivered with the cash collected → paid, paid out → settled),
// a booking that timed out marked "may have been booked", then Pathao's order.created (by our order no.) making it
// booked, Refresh, and Cancel refused (Pathao has no cancel API). Backend with COURIER_STUB_URL.
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

let r = await call('POST', '/tenant/api/auth/register', { name: 'Pia Pathao', email: `pia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Pa ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Pathao shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `PA${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['pathao'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('PUT', `${C}/couriers/pathao`, { sandbox: true }, t);
const hook = r.body?.connection?.webhook;
ok('Pathao connected (sandbox), store 102 picked', r.body?.connection?.tested && r.body.connection.settings.store === '102' && hook?.secret, JSON.stringify(r.body?.connection?.test));
const path = new URL(hook.url).pathname;

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Mango', price: 400, status: 'active', sku: 'MNG' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 50, reason: 'opening' }, t);
const addOrder = async () => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 3 }], delivery: { name: 'Rina Akter', phone: '01711000000', address: 'House 5, Road 3', area: 'Mirpur 10', city: 'Dhaka', rate: 'Inside Dhaka' } }, t)).body?.order;

const hookPost = async (body, secret = hook.secret) => {
	const res = await fetch(ROOT + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pathao-signature': secret }, body: JSON.stringify(body) });
	return { status: res.status, header: res.headers.get('x-pathao-merchant-webhook-integration-secret'), body: await res.json().catch(() => null) };
};
r = await hookPost({ event: 'webhook_integration' });
ok('Pathao’s integration call: 202 with its header', r.status === 202 && r.header === 'f3992ecc-59da-4cbe-a049-a13da2018d51', `${r.status} ${r.header}`);
r = await hookPost({ event: 'order.picked', consignment_id: 'DT1' }, 'wrong-secret');
ok('a wrong secret: 401', r.status === 401, `${r.status}`);

const o1 = await addOrder();
r = await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'pathao' }, t);
const d1 = r.body?.delivery;
ok('sent to Pathao: booked, its fee, store 102', r.status === 201 && d1?.status === 'booked' && /^DT/.test(d1.consignment) && d1.charge === 80 && d1.options.store === '102', `${r.status} ${r.body?.message || JSON.stringify(d1).slice(0, 200)}`);
const get = async id => {
	await sleep(700);
	return (await call('GET', `${C}/deliveries/${id}`, null, t)).body?.delivery;
};
const orderOf = async id => (await call('GET', `${C}/orders/${id}`, null, t)).body;
await hookPost({ event: 'order.picked', consignment_id: d1.consignment, merchant_order_id: d1.invoice, updated_at: '2026-10-31 18:00:00', store_id: 102 });
let x = await get(d1._id);
ok('order.picked → picked up; the order shipped', x?.status === 'picked-up' && x.pickedAt && (await orderOf(o1._id)).order.fulfilment === 'shipped', x?.status);
await hookPost({ event: 'order.delivered', consignment_id: d1.consignment, merchant_order_id: d1.invoice, collected_amount: 1260, updated_at: '2026-10-31 19:00:00' });
x = await get(d1._id);
let od = await orderOf(o1._id);
ok('order.delivered → delivered, 1,260 collected, the order paid', x?.status === 'delivered' && x.collected === 1260 && od.order.paymentStatus === 'paid' && od.payments.some(p => p.method === 'courier-cod' && p.amount === 1260), `${x?.status} ${od.order.paymentStatus}`);
await hookPost({ event: 'order.paid', consignment_id: d1.consignment, merchant_order_id: d1.invoice, invoice_id: 'PINV-9', updated_at: '2026-11-02 10:00:00' });
x = await get(d1._id);
ok('order.paid → paid out by Pathao, its invoice kept', x?.settled === true && x.payoutRef === 'PINV-9' && x.status === 'delivered', JSON.stringify({ s: x?.settled, r: x?.payoutRef }));

// No answer within 15 s: Pathao can't be asked by invoice, so it waits for Pathao's own word.
const o2 = await addOrder();
r = await call('POST', `${C}/orders/${o2._id}/deliveries`, { courier: 'pathao', note: 'SLOW please' }, t);
ok('no answer in time: “may have been booked”', r.status === 502 && /may have been booked/.test(r.body?.message), `${r.status} ${r.body?.message}`);
let d2 = (await orderOf(o2._id)).deliveries[0];
ok('…the delivery says so, and a resend asks first', d2?.uncertain === true && (await call('POST', `${C}/orders/${o2._id}/deliveries`, { courier: 'pathao' }, t)).body?.code === 'delivery_uncertain', JSON.stringify({ s: d2?.status, u: d2?.uncertain }));
r = await call('POST', `${C}/deliveries/${d2._id}/cancel`, {}, t);
ok('…and it can’t be cancelled here until it’s known', r.status === 409 && r.body?.code === 'delivery_uncertain', `${r.status}`);
await sleep(2000);
const booked = await (await fetch(`${STUB}/__pathao/by-invoice/${encodeURIComponent(d2.invoice)}`)).json();
await hookPost({ event: 'order.created', consignment_id: booked.consignment_id, merchant_order_id: d2.invoice, delivery_fee: 80, updated_at: '2026-10-31 18:30:00' });
x = await get(d2._id);
ok('Pathao’s order.created by our order no.: booked after all, its id filled in', x?.status === 'booked' && x.consignment === booked.consignment_id && !x.error, JSON.stringify({ s: x?.status, c: x?.consignment, e: x?.error }));

await fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'pathao', consignment: x.consignment, status: 'In_Transit' }) });
r = await call('POST', `${C}/deliveries/${d2._id}/refresh`, {}, t);
ok('Refresh asks Pathao: in transit', r.body?.delivery?.status === 'in-transit', `${r.status} ${r.body?.delivery?.status || r.body?.message}`);
r = await call('POST', `${C}/deliveries/${d2._id}/cancel`, {}, t);
ok('Cancel: Pathao can’t be cancelled from here — its panel', r.status === 409 && r.body?.code === 'courier_no_cancel' && /Pathao/.test(r.body.message), `${r.status} ${r.body?.message}`);

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
