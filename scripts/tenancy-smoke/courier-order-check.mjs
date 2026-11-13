// Couriers CR-21 (docs/couriers BUYER_CHECK.md BC4, BC5): the buyer check when an order comes in — website orders and
// phone / by-hand orders with a delivery checked in the background (the order never waits), the answer kept on the
// order as `buyerCheck`, open orders to that phone renewed by a later check while finished ones keep theirs, no check
// without a delivery phone, two orders at once asking the courier once, and none when the store turns it off.
// Backend with COURIER_STUB_URL.
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
const fraudCalls = async phone => (await (await fetch(`${STUB}/__calls`)).json()).filter(c => c.path === `/fraud_check/score/${phone}`).length;

let r = await call('POST', '/tenant/api/auth/register', { name: 'Ola Order', email: `ola${stamp}@example.com`, password: 'tenant-pass-123', organization: `Oc ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Order check shop', type: 'ecommerce' }, t);
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${r.body?._id}`;
const C = `${P}/commerce`;
const delivery = { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'manual'] };
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `OC${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Honey', price: 500, status: 'active', sku: 'HNY' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 100, reason: 'opening' }, t);

const PUB = path => `/public/api/${publicSlug}${path}`;
const webOrder = async phone => {
	const res = await call('POST', PUB('/store/orders'), { lines: [{ product: pid, quantity: 1 }], customerName: 'Rina', phone, address: 'House 5, Road 3', area: 'Inside Dhaka', city: 'Dhaka' });
	return (res.body?.doc || res.body)?._id;
};
const phoneOrder = async phone =>
	(await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 1 }], ...(phone && { delivery: { name: 'Karim', phone, address: 'Flat 2, Road 9', area: 'Gulshan', city: 'Dhaka', rate: 'Inside Dhaka' } }) }, t)).body?.order?._id;
const orderOf = async id => {
	const b = (await call('GET', `${C}/orders/${id}`, null, t)).body;
	return b?.order || b?.doc || b;
};
/** The order's buyer check once the background check has put it there (or null after ~5 s). */
const checkOf = async (id, after) => {
	for (let i = 0; i < 25; i++) {
		const bc = (await orderOf(id))?.buyerCheck;
		if (bc?.level && (!after || new Date(bc.checkedAt) > after)) return bc;
		await sleep(200);
	}
	return null;
};

// A website order: checked after it's placed, the answer on the order.
const w1 = await webOrder('+880 1711-000000');
ok('a website order is placed', !!w1, String(w1));
const bc1 = await checkOf(w1);
ok('website order: buyer check on the order — Safe, 90 %, Steadfast 18 of 20', bc1?.level === 'safe' && bc1.rate === 90 && bc1.parcels === 20 && /Steadfast 18 of 20/.test(bc1.sources) && bc1.checkedAt && /Usually takes/.test(bc1.summary), JSON.stringify(bc1));

// A phone order with a delivery: Risky, its fraud reports warned about.
const m1 = await phoneOrder('01800000000');
const bc2 = await checkOf(m1);
ok('phone order: Risky, 30 %, its 2 fraud reports in the warnings', bc2?.level === 'risky' && bc2.rate === 30 && bc2.reports === 2 && /2 fraud reports/.test(bc2.warnings), JSON.stringify(bc2));

// No delivery phone: nothing to check.
const m0 = await phoneOrder(null);
await sleep(1200);
ok('an order without a delivery isn’t checked', m0 && !(await orderOf(m0))?.buyerCheck?.level, JSON.stringify((await orderOf(m0))?.buyerCheck));

// Logged as an automatic lookup.
r = await call('GET', `${C}/buyer-check/recent`, null, t);
const look = r.body?.lookups?.find(l => l.phone === '01800000000');
ok('the lookup list shows it, by Automatic, for the order', look?.last?.via === 'order' && look.last.by === 'Automatic' && look.level === 'risky', JSON.stringify(look));

// The same buyer again today: Steadfast's answer is kept, not asked again.
const before = await fraudCalls('01711000000');
const w2 = await webOrder('01711000000');
const bc3 = await checkOf(w2);
ok('second order from that buyer: the kept answer, Steadfast not asked', bc3?.level === 'safe' && (await fraudCalls('01711000000')) === before, `${await fraudCalls('01711000000')} vs ${before} ${JSON.stringify(bc3)}`);

// Two orders at once from a new number: the courier asked once, both orders checked.
const calls0 = await fraudCalls('01755500000');
const [a, b] = await Promise.all([webOrder('01755500000'), webOrder('01755500000')]);
const [ba, bb] = [await checkOf(a), await checkOf(b)];
ok('two orders at once: both checked (New buyer), Steadfast asked once', ba?.level === 'new' && bb?.level === 'new' && (await fraudCalls('01755500000')) - calls0 === 1, `${(await fraudCalls('01755500000')) - calls0} ${JSON.stringify([ba, bb])}`);

// A finished order keeps its answer; open ones get the newer one when the number is checked again.
await call('POST', `${C}/orders/${w1}/fulfil`, { to: 'delivered' }, t);
const keptOn = (await orderOf(w1))?.buyerCheck?.checkedAt;
const t0 = new Date();
await sleep(50);
r = await call('GET', `${C}/buyer-check?phone=01711000000&fresh=1`, null, t);
ok('Check again: answered', r.status === 200 && r.body?.level === 'safe', `${r.status}`);
const bc4 = await checkOf(w2, t0);
ok('the open order to that phone shows the newer check', !!bc4, JSON.stringify((await orderOf(w2))?.buyerCheck));
ok('the delivered order keeps the answer it had', (await orderOf(w1))?.buyerCheck?.checkedAt === keptOn, `${(await orderOf(w1))?.buyerCheck?.checkedAt} vs ${keptOn}`);

// Turned off in Store settings → Delivery: no automatic check.
r = await call('PUT', `${C}/settings`, { answers: { delivery: { ...delivery, buyerCheck: { safe: 80, checkFirst: 50, auto: false } } } }, t);
ok('automatic checks turned off', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
const off0 = await fraudCalls('01766600000');
const w3 = await webOrder('01766600000');
await sleep(1500);
ok('switched off: the order isn’t checked, Steadfast not asked', w3 && !(await orderOf(w3))?.buyerCheck?.level && (await fraudCalls('01766600000')) === off0, JSON.stringify((await orderOf(w3))?.buyerCheck));
r = await call('GET', `${C}/buyer-check?phone=01766600000`, null, t);
ok('…a person can still check the number', r.status === 200 && (await fraudCalls('01766600000')) === off0 + 1, `${r.status}`);

stub?.kill();
done();
