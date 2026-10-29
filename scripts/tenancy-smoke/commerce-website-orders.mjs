// E-commerce EC-23 (docs/ecommerce): website orders on the Order model — POST /public/api/store/orders prices and
// stocks the order (never trusting the browser), numbers it WEB-00001, keeps the POS sequence apart; the buyer finds it
// again by id + phone; cancelling puts the stock back; the POS order list doesn't change.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Wes Web', email: `wes${stamp}@example.com`, password: 'tenant-pass-123', organization: `Web ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Web shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'WS' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }] } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const variantOf = async pid => {
	for (let i = 0; i < 20; i++) {
		const v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
		if (v) return v;
		await sleep(300);
	}
};
const pid = (await call('POST', `${P}/products`, { name: 'Chicken', price: 400, status: 'active', sku: 'CHK' }, t)).body?.doc?._id;
const v = await variantOf(pid);
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 10, reason: 'opening' }, t);
const onHand = async () => (await call('GET', `${C}/lookup?code=CHK&outlet=${GUL}`, null, t)).body?.onHand;
ok('a product with 10 in stock', pid && v && (await onHand()) === 10);

const PUB = path => `/public/api/${publicSlug}${path}`;
const body = { lines: [{ product: pid, quantity: 3 }], customerName: 'Rina', phone: '01700000000', email: 'rina@example.com', address: 'House 5, Road 3', area: 'Inside Dhaka', city: 'Dhaka', landmark: 'Near the mosque', slot: 'Morning (9am – 12pm)', note: 'Ring twice' };

r = await call('POST', PUB('/store/orders'), { ...body, area: 'Mars' });
ok('an unknown area is refused', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', PUB('/store/orders'), { ...body, phone: '' });
ok('no phone is refused', r.status === 400, r.body?.message);
r = await call('POST', PUB('/store/orders'), { ...body, lines: [{ product: pid, quantity: 50 }] });
ok('more than the stock is refused, nothing taken', r.status >= 400 && (await onHand()) === 10, `${r.status} ${r.body?.message}`);

r = await call('POST', PUB('/store/orders'), body);
const o = r.body?.doc || r.body;
ok('placed: WEB-00001, 3 × 400 + 60 delivery = 1260, unpaid', r.status === 200 && o?.code === 'WEB-00001' && o?.total === 1260 && o?.shipping === 60 && o?.paymentStatus === 'unpaid', `${r.status} ${JSON.stringify(o).slice(0, 220)}`);
ok('the address, area, landmark and slot are kept', o?.delivery?.address === 'House 5, Road 3' && o?.delivery?.landmark === 'Near the mosque' && o?.delivery?.area === 'Inside Dhaka' && o?.slot?.startsWith('Morning'), JSON.stringify(o?.delivery));
ok('stock came out: 7 left', (await onHand()) === 7, String(await onHand()));
r = await call('POST', PUB('/store/orders'), { ...body, lines: [{ product: pid, quantity: 1 }] });
ok('the next is WEB-00002', (r.body?.doc || r.body)?.code === 'WEB-00002', (r.body?.doc || r.body)?.code);

// Found again by id + phone only.
r = await call('GET', PUB(`/store/orders/${o?._id}?phone=01700000000`));
ok('tracked by id and phone', r.status === 200 && (r.body?.doc || r.body)?.code === 'WEB-00001', `${r.status}`);
r = await call('GET', PUB(`/store/orders/${o?._id}?phone=01800000000`));
ok('a wrong phone is the same 404', r.status === 404, String(r.status));

// The staff side: one Order model, website orders marked, POS list unchanged.
r = await call('GET', `${C}/orders?view=all`, null, t);
const rows = r.body?.doc || r.body?.orders || [];
ok('both are on the Orders model with origin website', rows.filter(x => x.channel === 'website').length === 2, JSON.stringify(rows.map(x => [x.code, x.channel])));

// Cancelling puts the stock back.
r = await call('POST', `${C}/orders/${o?._id}/cancel`, { reason: 'Changed mind' }, t);
ok('cancelled', r.status === 200, `${r.status} ${r.body?.message || ''}`);
ok('stock is back: 10 − 1 = 9', (await onHand()) === 9, String(await onHand()));
done();
