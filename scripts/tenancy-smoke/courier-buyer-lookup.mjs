// Couriers CR-23 (docs/couriers BUYER_CHECK.md §5): Check a buyer — any phone looked up by a person with that
// number's orders in this store, the recent lookups (who, how), a bad number refused, and check_buyer over MCP for
// the store owner's own AI (logged as "<owner> (AI)", via mcp; fresh asks the courier again).
// Backend with COURIER_STUB_URL.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done, ROOT } from './lib.mjs';

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
const rpc = async (key, method, params) => {
	const r = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return (await r.json().catch(() => null))?.result;
};
const tool = async (key, name, args) => {
	const r = await rpc(key, 'tools/call', { name, arguments: args });
	return { text: r?.content?.[0]?.text || '', data: r?.structuredContent, isError: !!r?.isError };
};

let r = await call('POST', '/tenant/api/auth/register', { name: 'Lia Lookup', email: `lia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Lu ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Lookup shop', type: 'ecommerce' }, t);
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${r.body?._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `LU${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);
const pid = (await call('POST', `${P}/products`, { name: 'Honey', price: 500, status: 'active', sku: 'HNY' }, t)).body?.doc?._id;
r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 100, reason: 'opening' }, t);
r = await call('POST', `/public/api/${publicSlug}/store/orders`, { lines: [{ product: pid, quantity: 1 }], customerName: 'Karim', phone: '01800000000', address: 'House 5, Road 3', area: 'Inside Dhaka', city: 'Dhaka' });
const order = r.body?.doc || r.body;
ok('a website order to 01800000000', !!order?._id, `${r.status}`);
await sleep(1500);

// A person types the number on Check a buyer.
r = await call('GET', `${C}/buyer-check?phone=${encodeURIComponent('+880 1800-000000')}`, null, t);
ok('lookup: Risky, 30 %, Steadfast’s row', r.status === 200 && r.body?.level === 'risky' && r.body.rate === 30 && r.body.sources?.some(s => s.id === 'steadfast' && s.ok), `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
ok('…with that number’s orders in this store', r.body?.own?.orders === 1 && r.body.own.recent?.[0]?.code === order.code, JSON.stringify(r.body?.own));
r = await call('GET', `${C}/buyer-check/recent`, null, t);
let row = r.body?.lookups?.find(l => l.phone === '01800000000');
ok('recent lookups: the number, its level, by the person, on Check a buyer', row?.level === 'risky' && row.last?.via === 'lookup' && row.last.by === 'Lia Lookup', JSON.stringify(row));

r = await call('GET', `${C}/buyer-check?phone=12345`, null, t);
ok('a number that isn’t a phone is refused', r.status === 400, `${r.status} ${r.body?.message}`);

// The store owner's own AI.
r = await call('POST', `${P}/builder/api-keys`, { name: 'Claude', scopes: ['read', 'build', 'data'] }, t);
const key = r.body?.secret || r.body?.key || r.body?.doc?.secret;
const names = ((await rpc(key, 'tools/list', {}))?.tools || []).map(x => x.name);
ok('check_buyer is offered over MCP', names.includes('check_buyer'), names.join(','));
const before = await fraudCalls('01800000000');
let o = await tool(key, 'check_buyer', { phone: '01800000000' });
ok('check_buyer: Risky 30 %, the fraud reports, Steadfast’s count and the order', !o.isError && /Risky · 30% delivered/.test(o.text) && /2 fraud reports/.test(o.text) && /Steadfast: 3 of 10 delivered/.test(o.text) && o.text.includes(order.code) && o.data?.level === 'risky', o.text);
ok('…the kept answer, Steadfast not asked again', (await fraudCalls('01800000000')) === before, `${await fraudCalls('01800000000')} vs ${before}`);
o = await tool(key, 'check_buyer', { phone: '01800000000', fresh: true });
ok('fresh: true asks Steadfast again', !o.isError && (await fraudCalls('01800000000')) === before + 1, `${await fraudCalls('01800000000')} vs ${before}`);
r = await call('GET', `${C}/buyer-check/recent`, null, t);
row = r.body?.lookups?.find(l => l.phone === '01800000000');
ok('logged as the owner (AI), via mcp', row?.last?.via === 'mcp' && row.last.by === 'Lia Lookup (AI)', JSON.stringify(row?.last));
o = await tool(key, 'check_buyer', { phone: 'abc' });
ok('check_buyer refuses a bad number', o.isError && /phone/i.test(o.text), o.text);

stub?.kill();
done();
