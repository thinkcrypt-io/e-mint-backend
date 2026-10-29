// E-commerce EC-08 (docs/ecommerce): returns — items come back (all or part), sellable ones go back to stock,
// damaged ones don't, the refund is never more than was paid (shipping stays), over-returns are refused, a
// fully returned order is marked returned, and a cancelled order can't be returned.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rae Returns', email: `rae${stamp}@example.com`, password: 'tenant-pass-123', organization: `Returns ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Return shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'RS' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }] }, returns: { allowed: true, windowDays: 30, partial: true, restockDefault: true, refundMethods: ['original', 'cash'], storeCredit: false } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Chicken', price: 400, status: 'active', sku: 'CHK' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) { v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id; await sleep(300); }
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 10, reason: 'opening' }, t);
const onHand = async () => (await call('GET', `${C}/lookup?code=CHK&outlet=${GUL}`, null, t)).body?.onHand;

r = await call('POST', `/public/api/${publicSlug}/store/orders`, { lines: [{ product: pid, quantity: 4 }], customerName: 'Rina', phone: '01700000000', address: 'House 5', area: 'Inside Dhaka' });
const o = r.body?.doc || r.body;
ok('a website order of 4 (1660 with delivery), stock 6', o?.total === 1660 && (await onHand()) === 6, `${o?.total} ${await onHand()}`);

// Unpaid: returning owes less, nothing to refund.
r = await call('POST', `${C}/orders/${o._id}/return`, { lines: [{ line: 0, quantity: 1 }] }, t);
ok('unpaid: one back → stock 7, nothing to refund, a return record', r.status === 200 && (await onHand()) === 7 && r.body?.return?.refundDue === 0 && r.body?.return?.code?.startsWith('RET'), `${r.status} ${r.body?.message || JSON.stringify(r.body?.return)}`);

// Pay it in full (what's owed is now 1260 + 60 shipping).
r = await call('GET', `${C}/orders/${o._id}`, null, t);
const owed = r.body?.order?.balance ?? r.body?.balance;
r = await call('POST', `${C}/orders/${o._id}/pay`, { payments: [{ method: 'cash', amount: owed }] }, t);
ok('paid what was owed', r.status === 200, `${r.status} ${r.body?.message || owed}`);

r = await call('POST', `${C}/orders/${o._id}/return`, { lines: [{ line: 0, quantity: 2, condition: 'damaged', reason: 'damaged' }] }, t);
ok('two damaged: refund 800, stock stays 7', r.status === 200 && r.body?.return?.refund === undefined && r.body?.return?.refunded === 800 && (await onHand()) === 7, `${r.status} ${r.body?.message || JSON.stringify(r.body?.return)} ${await onHand()}`);
r = await call('POST', `${C}/orders/${o._id}/return`, { lines: [{ line: 0, quantity: 5 }] }, t);
ok('more than is left is refused', r.status === 409, `${r.status} ${r.body?.message}`);
r = await call('POST', `${C}/orders/${o._id}/return`, { lines: [{ line: 0, quantity: 1 }] }, t);
ok('the last one back, sellable: stock 8, order returned', r.status === 200 && (await onHand()) === 8 && (r.body?.order?.order?.fulfilment || r.body?.order?.fulfilment) === 'returned', `${r.status} ${r.body?.message || ''} ${await onHand()}`);
r = await call('GET', `${C}/returns`, null, t);
ok('three returns listed', (r.body?.doc || []).length === 3, String(r.body?.doc?.length));

// Cancelled orders can't be returned.
r = await call('POST', `/public/api/${publicSlug}/store/orders`, { lines: [{ product: pid, quantity: 1 }], customerName: 'Rina', phone: '01700000000', address: 'House 5', area: 'Inside Dhaka' });
const o2 = r.body?.doc || r.body;
await call('POST', `${C}/orders/${o2._id}/cancel`, {}, t);
r = await call('POST', `${C}/orders/${o2._id}/return`, { lines: [{ line: 0, quantity: 1 }] }, t);
ok('a cancelled order can’t be returned', r.status === 409, `${r.status} ${r.body?.message}`);
done();
