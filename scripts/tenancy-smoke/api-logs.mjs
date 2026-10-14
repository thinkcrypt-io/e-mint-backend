// API request logs (docs/api-builder AB-06): every call to a project's public API is logged —
// endpoint, who (anyone / customer / server key), status, the error the caller got, query with
// secrets masked, client — never bodies or tokens; the panel's list, filters, cursor, summary
// and one call; get_api_logs over MCP; another project never sees them.
// Uses projects.mjs's state (pat); makes its own projects.
import mongoose from 'mongoose';
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const stamp = Date.now();
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';

let r = await call('POST', '/tenant/api/projects', { name: `Logs ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid && !!slug, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const AB = path => P(`/api-builder${path}`);
const product = (
	await call('POST', P('/builder/models'), { name: 'Product', title: 'Products', displayField: 'name', fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'price', label: 'Price', kind: 'number', min: 0 },
	] }, s.pat)
).body?.doc;
ok('model made', !!product?._id);
await call('POST', P('/products'), { name: 'Alpha', price: 10 }, s.pat);

const pub = (path, init = {}) =>
	fetch(`${ROOT}/public/api/${slug}${path}`, { ...init, headers: { 'content-type': 'application/json', 'user-agent': 'curl/8.4.0', ...(init.headers || {}) } }).then(async x => ({
		status: x.status,
		body: await x.json().catch(() => null),
	}));
const settle = () => new Promise(res => setTimeout(res, 400));

r = await call('POST', AB('/endpoints/generate'), { model: 'products', actions: ['list', 'get', 'create'], who: 'anyone' }, s.pat);
ok('endpoints generated', r.status === 200 || r.status === 201, r.body?.message);
r = await call('POST', AB('/endpoints'), { name: 'Import products', model: 'products', action: 'create', path: '/products/import', access: { who: 'key' } }, s.pat);
const importId = r.body?._id;
ok('a key endpoint', r.status === 201, r.body?.message);
r = await call('POST', AB('/keys'), { name: 'Till' }, s.pat);
const key = r.body?.secret;
ok('a server key', /^mint_sk_/.test(key || ''));
r = await pub('/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Lou', email: `lou${stamp}@example.com`, password: 'customer-pass-1' }) });
const lou = r.body?.token;
ok('a customer', !!lou, JSON.stringify(r.body));

/* ---- calls */
r = await pub('/products?limit=5&token=abc123&q=al', { headers: { origin: 'https://shop.example.com' } });
ok('list call', r.status === 200, r.status);
r = await pub('/products/not-an-id');
ok('a 404', r.status === 404);
r = await pub('/products/import', { method: 'POST', body: JSON.stringify({ name: 'X' }) });
ok('a 401 without the key', r.status === 401 && r.body?.code === 'key_required');
r = await pub('/products/import', { method: 'POST', body: JSON.stringify({ name: 'From the till', price: 5 }), headers: { 'x-api-key': key } });
ok('a create with the key', r.status === 201, JSON.stringify(r.body));
r = await pub('/products', { method: 'POST', body: JSON.stringify({ price: -1 }), headers: { authorization: `Bearer ${lou}` } });
ok('a 400 from a customer', r.status === 400, r.status);
r = await pub('/auth/me', { headers: { authorization: `Bearer ${lou}` } });
ok('auth/me', r.status === 200);
await pub('/track', { method: 'POST', body: JSON.stringify({ type: 'pageview', path: '/' }) });
await settle();

/* ---- the list */
r = await call('GET', AB('/logs?hours=1'), null, s.pat);
const calls = r.body?.doc || [];
ok('logs listed, newest first', r.status === 200 && calls.length >= 6 && new Date(calls[0].at) >= new Date(calls[calls.length - 1].at), r.status);
ok('beacons (/track) aren’t logged', !calls.some(c => c.path === '/track'));
const list = calls.find(c => c.method === 'GET' && c.path === '/products');
ok('a list call: endpoint, query with the token masked, origin, client', list?.endpoint?.name && list.query === 'limit=5&token=•••&q=al' && list.origin === 'https://shop.example.com' && list.client === 'curl/8.4.0' && list.who === 'anyone' && list.status === 200 && list.ms >= 0, JSON.stringify(list));
const denied = calls.find(c => c.path === '/products/import' && c.status === 401);
ok('a refused call keeps the error the caller got', denied?.error === 'This endpoint needs a server key.' && denied.code === 'key_required' && denied.endpoint?._id === importId, JSON.stringify(denied));
const keyed = calls.find(c => c.path === '/products/import' && c.status === 201);
ok('a key call names the key', keyed?.who === 'key' && keyed.key?.name === 'Till', JSON.stringify(keyed));
const bad = calls.find(c => c.status === 400);
ok('a customer’s call names them', bad?.who === 'customer' && bad.customer?.email === `lou${stamp}@example.com` && !!bad.error, JSON.stringify(bad));
const me = calls.find(c => c.path === '/auth/me');
ok('calls outside endpoints are logged too (no endpoint)', me && me.endpoint === null && me.who === 'customer', JSON.stringify(me));
ok('no bodies or tokens in the log', !JSON.stringify(calls).includes('From the till') && !JSON.stringify(calls).includes(key) && !JSON.stringify(calls).includes(lou));

/* ---- filters and cursor */
r = await call('GET', AB('/logs?hours=1&status=errors'), null, s.pat);
ok('status=errors', r.body?.doc?.length >= 3 && r.body.doc.every(c => c.status >= 400), JSON.stringify(r.body?.doc?.map(c => c.status)));
r = await call('GET', AB(`/logs?endpoint=${importId}`), null, s.pat);
ok('by endpoint', r.body?.doc?.length === 2 && r.body.doc.every(c => c.endpoint?._id === importId));
r = await call('GET', AB('/logs?who=key'), null, s.pat);
ok('by who', r.body?.doc?.length === 1 && r.body.doc[0].key?.name === 'Till');
r = await call('GET', AB('/logs?endpoint=none'), null, s.pat);
ok('endpoint=none: calls no endpoint answered', r.body?.doc?.length >= 2 && r.body.doc.every(c => !c.endpoint));
r = await call('GET', AB('/logs?q=needs%20a%20server'), null, s.pat);
ok('search reaches the error text', r.body?.doc?.length === 1 && r.body.doc[0].status === 401);
r = await call('GET', AB('/logs?limit=2'), null, s.pat);
ok('a page of 2, more to come', r.body?.doc?.length === 2 && r.body.hasMore === true);
const next = await call('GET', AB(`/logs?limit=2&before=${r.body.doc[1]._id}`), null, s.pat);
ok('…the next page continues after it', next.body?.doc?.length === 2 && next.body.doc[0]._id !== r.body.doc[1]._id && next.body.doc[0].at <= r.body.doc[1].at);

/* ---- one call, the summary */
r = await call('GET', AB(`/logs/${denied._id}`), null, s.pat);
ok('one call', r.status === 200 && r.body?.code === 'key_required');
r = await call('GET', AB('/logs/6a0000000000000000000000'), null, s.pat);
ok('a call that isn’t there: 404 saying calls are kept 7 days', r.status === 404 && /7 days/.test(r.body?.message));
r = await call('GET', AB('/logs/summary?hours=24'), null, s.pat);
const sum = r.body;
ok('summary: totals, times, an hourly chart', r.status === 200 && sum.total >= 6 && sum.errors >= 3 && sum.avgMs >= 0 && sum.p95Ms >= 0 && sum.series.length >= 24 && sum.series.reduce((n, b) => n + b.ok + b.errors, 0) === sum.total, JSON.stringify({ ...sum, series: sum?.series?.length }));
ok('…the commonest errors and busiest endpoints', sum.topErrors.some(e => e.code === 'key_required' && e.count === 1) && sum.topEndpoints[0]?.calls >= 1, JSON.stringify({ e: sum.topErrors, p: sum.topEndpoints }));
r = await call('GET', AB('/logs/summary?hours=1&status=ok'), null, s.pat);
ok('summary follows the filters; the hour in 5-minute bars', r.body?.errors === 0 && r.body.total >= 2 && r.body.series.length >= 12, JSON.stringify({ t: r.body?.total, e: r.body?.errors, n: r.body?.series?.length }));

/* ---- MCP */
r = await call('POST', P('/builder/api-keys'), { name: 'AI', scopes: ['read'] }, s.pat);
const mk = r.body?.secret || r.body?.key || r.body?.doc?.secret;
const rpc = async (method, params) =>
	(await fetch(`${ROOT}/tenant/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${mk}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(x => x.json())).result;
const t = await rpc('tools/call', { name: 'get_api_logs', arguments: { status: 'errors' } });
const text = t?.content?.[0]?.text || '';
ok('get_api_logs: the numbers, the commonest errors, the calls', !t?.isError && /calls, \d+ failed/.test(text) && /Commonest errors/.test(text) && /401 key_required: This endpoint needs a server key/.test(text) && !/→ 200/.test(text), text.slice(0, 500));

/* ---- another project sees none of them */
r = await call('POST', '/tenant/api/projects', { name: `Logs other ${stamp}`, type: 'app' }, s.pat);
const other = r.body?._id;
r = await call('GET', `/tenant/api/p/${other}/api-builder/logs`, null, s.pat);
ok('another project’s log is empty', r.status === 200 && r.body?.doc?.length === 0, JSON.stringify(r.body));
r = await call('GET', `/tenant/api/p/${other}/api-builder/logs/${denied._id}`, null, s.pat);
ok('…and can’t open this one’s calls', r.status === 404);

/* ---- deleting the project takes its log */
await call('DELETE', `/tenant/api/projects/${other}?force=1`, null, s.pat);
r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
await mongoose.connect(MONGO);
const left = await mongoose.connection.db.collection('apicalls').countDocuments({ project: new mongoose.Types.ObjectId(pid) });
ok('…with its log', left === 0, left);
await mongoose.disconnect();

done();
