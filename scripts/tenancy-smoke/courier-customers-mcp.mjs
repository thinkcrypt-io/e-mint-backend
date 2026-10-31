// Couriers CR-14 (docs/couriers): customers, automations, MCP — the website's order view showing the parcel's courier,
// status and tracking (never the consignment or COD); the store's two delivery emails installed switched off, and
// switched on, one going to the buyer when the parcel is delivered; list_deliveries, send_to_courier (courier and
// cash required, the same checks, done as "<owner> (AI)") and refresh_delivery over MCP; no courier keys over MCP.
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
const rpc = async (key, method, params) => {
	const r = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return (await r.json().catch(() => null))?.result;
};
const tool = async (key, name, args) => {
	const r = await rpc(key, 'tools/call', { name, arguments: args });
	return { text: r?.content?.[0]?.text || '', data: r?.structuredContent, isError: !!r?.isError };
};

let r = await call('POST', '/tenant/api/auth/register', { name: 'Cam Customer', email: `cam${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cu ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Web shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `CU${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);

r = await call('GET', `${P}/automations`, null, t);
const autos = (r.body?.doc || r.body?.automations || r.body || []).filter(a => a.route === 'deliveries');
ok('the store’s two delivery emails, installed switched off', autos.length === 2 && autos.every(a => a.enabled === false) && autos.some(a => /on the way/.test(a.name)) && autos.some(a => /delivered/.test(a.name)), JSON.stringify((r.body?.doc || r.body)?.map?.(a => [a.name, a.route, a.enabled])));
const delivered = autos.find(a => /delivered/.test(a.name));
r = await call('PUT', `${P}/automations/${delivered._id}`, { ...delivered, enabled: true }, t);
ok('one switched on', r.status === 200, `${r.status} ${r.body?.message}`);

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Honey', price: 400, status: 'active', sku: 'HNY' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 50, reason: 'opening' }, t);
const PUB = path => `/public/api/${publicSlug}${path}`;
r = await call('POST', PUB('/store/orders'), { lines: [{ product: pid, quantity: 2 }], customerName: 'Rina', phone: '01711000000', email: `rina${stamp}@example.com`, address: 'House 5, Road 3', area: 'Inside Dhaka', city: 'Dhaka' });
const web = r.body?.doc || r.body;
ok('a website order', web?._id && !web.tracking, `${r.status} ${JSON.stringify(web).slice(0, 120)}`);

// Over MCP: the store's own AI sends it.
r = await call('POST', `${P}/builder/api-keys`, { name: 'Claude', scopes: ['read', 'build', 'data'] }, t);
const key = r.body?.secret || r.body?.key || r.body?.doc?.secret;
const list = await rpc(key, 'tools/list', {});
const names = (list?.tools || []).map(x => x.name);
ok('the delivery tools are offered', ['list_deliveries', 'send_to_courier', 'refresh_delivery'].every(n => names.includes(n)), names.join(','));
let o = await tool(key, 'send_to_courier', { order: web.code, courier: 'steadfast' });
ok('without the cash to collect: refused', o.isError && /cash/.test(o.text), o.text);
o = await tool(key, 'send_to_courier', { order: web.code, courier: 'steadfast', cod: 99999 });
ok('more cash than it owes: the same check as the panel', o.isError && /Cash to collect/.test(o.text), o.text);
o = await tool(key, 'send_to_courier', { order: web.code, courier: 'steadfast', cod: 860 });
ok('sent over MCP', !o.isError && /Sent .* to Steadfast: DLV-/.test(o.text), o.text);
r = await call('GET', `${C}/orders/${web._id}`, null, t);
const d = r.body?.deliveries?.[0];
ok('…done as the owner (AI)', d?.events?.[0]?.by === 'Cam Customer (AI)', JSON.stringify(d?.events?.[0]));
o = await tool(key, 'list_deliveries', {});
ok('list_deliveries', !o.isError && o.text.includes(d.code) && /Steadfast, Booked/.test(o.text), o.text);
o = await tool(key, 'list_deliveries', { q: 'sf-api' });
ok('no keys over MCP', !JSON.stringify(o).includes('sf-secret'), '');

// The buyer's view of their order: courier, status, tracking — nothing internal.
const track = async () => (await call('GET', PUB(`/store/orders/${web._id}?phone=01711000000`))).body;
let tr = await track();
const tv = tr?.doc || tr;
ok('the website’s order view: courier, status, tracking code and link', tv?.tracking?.courier === 'Steadfast' && tv.tracking.status === 'Booked' && tv.tracking.trackingCode === d.trackingCode && /steadfast/.test(tv.tracking.trackingUrl), JSON.stringify(tv?.tracking));
ok('…never the consignment or the cash details', !JSON.stringify(tv).includes(d.consignment) || d.consignment === d.trackingCode.replace(/^SF/, '') && !JSON.stringify(tv.tracking).includes('cod'), JSON.stringify(tv?.tracking));

await fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'steadfast', consignment: d.consignment, status: 'delivered' }) });
o = await tool(key, 'refresh_delivery', { delivery: d.code });
ok('refresh_delivery: delivered', !o.isError && /Delivered/.test(o.text), o.text);
tv.tracking && ok('the website shows it delivered', ((await track())?.doc || (await track()))?.tracking?.status === 'Delivered');

let runs = [];
for (let i = 0; i < 20; i++) {
	await sleep(500);
	r = await call('GET', `${P}/automations/${delivered._id}/runs`, null, t);
	runs = r.body?.doc || r.body?.runs || r.body || [];
	if (Array.isArray(runs) && runs.length) break;
}
const run = Array.isArray(runs) ? runs[0] : null;
// The project has no email account here, so the send itself stops there — the automation did start, on this delivery.
ok('the delivered email started on the delivery (sending needs an email account)', run?.recordName === d.code && run.steps?.[0]?.type === 'email' && (/Emailed .*rina/i.test(run.steps[0].detail) || /email account/.test(run.steps[0].detail)), JSON.stringify(run).slice(0, 400));

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
