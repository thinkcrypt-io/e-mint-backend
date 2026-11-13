// Couriers CR-19 (docs/couriers BUYER_CHECK.md): the buyer check — any phone looked up with Steadfast's check and the
// store's own orders combined (a store's own Steadfast parcels counted once), the level by the store's thresholds,
// kept a day (Check again asks afresh), a number outside Bangladesh with only the store's history, every lookup
// logged and listed, thresholds saved in Store settings → Delivery. Backend with COURIER_STUB_URL.
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
const fraudCalls = async () => (await (await fetch(`${STUB}/__calls`)).json()).filter(c => c.path.startsWith('/fraud_check')).length;

let r = await call('POST', '/tenant/api/auth/register', { name: 'Bo Check', email: `bo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Bc ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Check shop', type: 'ecommerce' }, t);
const P = `/tenant/api/p/${r.body?._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `BC${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'manual'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}

// No courier connected yet: the store's own history only.
r = await call('GET', `${C}/buyer-check?phone=01711000000`, null, t);
ok('no courier connected: still answers, from the store’s own orders (none yet) — a new buyer', r.status === 200 && r.body?.level === 'new' && r.body.sources.length === 0 && r.body.own.orders === 0, `${r.status} ${JSON.stringify(r.body)}`);
r = await call('GET', `${C}/buyer-check?phone=`, null, t);
ok('no phone: asked for one', r.status === 400, `${r.status}`);

await call('PUT', `${C}/couriers/manual`, { settings: { names: 'Sundarban | https://sundarban.example/track/{tracking}' } }, t);
await call('POST', `${C}/couriers/manual/test`, {}, t);
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
const addOrder = async phone => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 1 }], delivery: { name: 'Rina Akter', phone, address: 'House 5, Road 3', area: 'Gulshan', city: 'Dhaka', rate: 'Inside Dhaka' } }, t)).body?.order;

// Two Sundarban parcels to the same buyer, typed differently: one delivered, one sent back.
const sendManual = async (o, to) => {
	const d = (await call('POST', `${C}/orders/${o._id}/deliveries`, { courier: 'manual', options: { name: 'Sundarban', tracking: `SB-${o.code}` } }, t)).body?.delivery;
	await call('POST', `${C}/deliveries/${d._id}/status`, { to: 'picked-up' }, t);
	await call('POST', `${C}/deliveries/${d._id}/status`, { to, ...(to === 'delivered' && { collected: 460 }) }, t);
};
await sendManual(await addOrder('+880 1711-000000'), 'delivered');
await sendManual(await addOrder('01711 000 000'), 'returned');

r = await call('GET', `${C}/buyer-check?phone=8801711000000`, null, t);
const sf = r.body?.sources?.find(s => s.id === 'steadfast');
ok('Steadfast + own orders: 18 + 1 delivered, 2 + 1 refused → 86 %, Safe', r.body?.phone === '01711000000' && sf?.ok && sf.delivered === 18 && sf.refused === 2 && r.body.delivered === 19 && r.body.refused === 3 && r.body.rate === 86 && r.body.level === 'safe', JSON.stringify(r.body && { rate: r.body.rate, level: r.body.level, d: r.body.delivered, f: r.body.refused, sf }));
ok('own history: 2 orders found however the phone was typed, 1 delivered, 1 refused', r.body?.own?.orders === 2 && r.body.own.delivered === 1 && r.body.own.refused === 1 && r.body.own.recent.length === 2, JSON.stringify(r.body?.own));
ok('a buyer who refused before is warned about', (r.body?.warnings || []).some(w => /Refused 1/.test(w)), JSON.stringify(r.body?.warnings));

// Kept a day; Check again asks afresh.
const before = await fraudCalls();
r = await call('GET', `${C}/buyer-check?phone=01711000000`, null, t);
ok('asked again: kept for the day, Steadfast not asked', r.body?.level === 'safe' && (await fraudCalls()) === before, `${await fraudCalls()} vs ${before}`);
r = await call('GET', `${C}/buyer-check?phone=01711000000&fresh=1`, null, t);
ok('Check again: Steadfast asked afresh', r.status === 200 && (await fraudCalls()) === before + 1, `${await fraudCalls()} vs ${before}`);

// Risky, with Steadfast's fraud reports.
r = await call('GET', `${C}/buyer-check?phone=01800000000`, null, t);
ok('often refuses (30 %): Risky, its 2 fraud reports warned about', r.body?.level === 'risky' && r.body.rate === 30 && r.body.reports === 2 && r.body.warnings.some(w => /2 fraud reports/.test(w)) && /payment first/.test(r.body.summary), JSON.stringify(r.body && { l: r.body.level, rate: r.body.rate, w: r.body.warnings }));

// The store's thresholds.
r = await call('PUT', `${C}/settings`, { answers: { delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'manual'], buyerCheck: { safe: 90, checkFirst: 40 } } } }, t);
r = await call('GET', `${C}/buyer-check?phone=01711000000`, null, t);
ok('Safe from 90 %: the same 86 % is now Check first', r.body?.level === 'check' && r.body.thresholds.safe === 90 && r.body.thresholds.checkFirst === 40, JSON.stringify(r.body && { l: r.body.level, t: r.body.thresholds }));
r = await call('PUT', `${C}/settings`, { answers: { delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'manual'], buyerCheck: { safe: 50, checkFirst: 70 } } } }, t);
ok('Check first above Safe: refused in plain words', r.status === 400 || (r.body?.problems || []).some(p => /below Safe/.test(p)) || /below Safe/.test(JSON.stringify(r.body)), `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);

// A number outside Bangladesh: no courier asked.
const calls = await fraudCalls();
r = await call('GET', `${C}/buyer-check?phone=%2B44 7700 900123`, null, t);
ok('a UK number: the store’s history only, Steadfast not asked', r.status === 200 && r.body.phone === '447700900123' && r.body.sources.every(s => !s.ok && s.skipped) && (await fraudCalls()) === calls, JSON.stringify(r.body?.sources));

// The order route still answers as before (Send to courier), now with the whole check.
const o3 = await addOrder('01800000000');
r = await call('GET', `${C}/orders/${o3._id}/risk`, null, t);
ok('an order’s risk: CR-18’s fields + the check', r.body?.level === 'high' && r.body.risk.delivered === 3 && r.body.check?.level === 'risky', JSON.stringify(r.body && { l: r.body.level, risk: r.body.risk }));

// Every lookup logged, newest first.
r = await call('GET', `${C}/buyer-check/recent`, null, t);
const first = r.body?.lookups?.[0];
ok('recent lookups: newest first, who and why', first?.phone === '01800000000' && first.last?.via === 'send' && first.last.by === 'Bo Check' && r.body.lookups.some(l => l.phone === '447700900123'), JSON.stringify(r.body?.lookups?.slice(0, 2)));

stub?.kill();
done();
