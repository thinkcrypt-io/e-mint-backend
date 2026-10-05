// Template Studio (docs/templates) T-09: API projects and outgoing webhooks. An API project's
// sidebar leads with its API; webhooks fire on panel and public-API changes, signed
// (x-mint-signature = sha256 HMAC of "<timestamp>.<body>"), retried 3 times, logged; "Send test";
// a new secret; refused addresses; the API overview; an API template previews with endpoints
// on and a working webhook. Uses projects.mjs's state (pat). Removes what it makes.
import http from 'http';
import crypto from 'crypto';
import { call, ok, done, load, ROOT } from './lib.mjs';

const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await wait(250);
	}
};

/* ------------------------------------------------- a receiver on this machine */
const got = [];
const server = http.createServer((req, res) => {
	let raw = '';
	req.on('data', c => (raw += c));
	req.on('end', () => {
		got.push({ path: req.url, headers: req.headers, raw, body: JSON.parse(raw || 'null') });
		res.writeHead(req.url === '/fail' ? 500 : 200, { 'content-type': 'text/plain' });
		res.end(req.url === '/fail' ? 'nope' : 'thanks');
	});
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const RECV = `http://127.0.0.1:${server.address().port}`;
const verify = (m, secret) => {
	const want = `sha256=${crypto.createHmac('sha256', secret).update(`${m.headers['x-mint-timestamp']}.${m.raw}`).digest('hex')}`;
	return m.headers['x-mint-signature'] === want;
};

/* ---------------------------------------------------------- an API project */
let r = await call('POST', '/tenant/api/projects', { name: `Hooks API ${Date.now()}`, type: 'api' }, s.pat);
ok('API project made', r.status === 200 && r.body?.type === 'api', `${r.status} ${r.body?.message || ''}`);
const pid = r.body?._id;
const slug = r.body?.publicSlug;

r = await call('GET', P(pid, '/sidebar/admin/server'), null, s.pat);
const nav = r.body || [];
ok(
	'sidebar leads with API: Public API, Webhooks, Widgets, Payments, Customers',
	nav[0]?.title === 'Dashboard' && nav[1]?.sectionTitle === 'API' && nav.slice(1, 6).map(i => i.title).join() === 'Public API,Webhooks,Widgets,Payments,Customers' && !nav.some(i => i.sectionTitle === 'Audience'),
	nav.map(i => `${i.sectionTitle ? `[${i.sectionTitle}] ` : ''}${i.title}`).join(' | ')
);
r = await call('GET', P(s.crm, '/sidebar/admin/server'), null, s.pat);
ok('an app keeps Public API, Webhooks, Customers under Audience', (r.body || []).some(i => i.sectionTitle === 'Audience' && i.title === 'Public API') && (r.body || []).some(i => i.title === 'Webhooks'));

r = await call('POST', P(pid, '/builder/models'), {
	name: 'Order', title: 'Orders', displayField: 'name', fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'amount', label: 'Amount', kind: 'number' },
		{ key: 'pin', label: 'PIN', kind: 'password' },
	],
}, s.pat);
const order = r.body?.doc;
r = await call('PUT', P(pid, `/builder/models/${order?._id}/public-api`), { enabled: true, actions: ['list', 'get', 'create', 'update', 'delete'], auth: 'none' }, s.pat);
ok('Orders model with a public API', !!order?._id && r.status === 200, `${r.status} ${r.body?.message || ''}`);

/* ----------------------------------------------------------------- webhooks */
r = await call('POST', P(pid, '/webhooks'), { route: 'orders', events: ['create'], url: 'ftp://example.com/x' }, s.pat);
ok('not a web address → 400', r.status === 400, r.body?.message);
r = await call('POST', P(pid, '/webhooks'), { route: 'orders', events: ['create'], url: 'http://169.254.169.254/latest/meta-data' }, s.pat);
ok('cloud metadata address → 400', r.status === 400 && /allowed/.test(r.body?.message), r.body?.message);
r = await call('POST', P(pid, '/webhooks'), { route: 'nope', events: ['create'], url: `${RECV}/ok` }, s.pat);
ok('unknown model → 400', r.status === 400, r.body?.message);
r = await call('POST', P(pid, '/webhooks'), { route: 'orders', events: [], url: `${RECV}/ok` }, s.pat);
ok('no events → 400', r.status === 400, r.body?.message);

r = await call('POST', P(pid, '/webhooks'), { route: 'orders', events: ['delete', 'create', 'update'], url: `${RECV}/ok`, note: 'Our warehouse system' }, s.pat);
ok('webhook made, secret shown once', r.status === 201 && /^whsec_[a-f0-9]{48}$/.test(r.body?.secret) && r.body.doc.active && r.body.doc.events.join() === 'create,update,delete', `${r.status} ${r.body?.message || ''}`);
const okHook = r.body?.doc;
let secret = r.body?.secret;
r = await call('POST', P(pid, '/webhooks'), { route: 'orders', events: ['create'], url: `${RECV}/fail` }, s.pat);
const failHook = r.body?.doc;
r = await call('GET', P(pid, '/webhooks'), null, s.pat);
ok('list: both, no secrets, the models to pick from', r.body?.doc?.length === 2 && !JSON.stringify(r.body).includes('whsec_') && r.body.models.some(m => m.route === 'orders'), JSON.stringify(r.body?.models));

const pub = (path, init = {}) => fetch(`${ROOT}/public/api/${slug}/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));

r = await pub('orders', { method: 'POST', body: JSON.stringify({ name: 'First', amount: 12, pin: '1234' }) });
ok('order made through the public API', r.status === 201, r.status);
const oid = r.body?._id;
let m = await until(() => got.find(g => g.path === '/ok' && g.headers['x-mint-event'] === 'create'));
ok('create delivered: event, source api, project, the record', m && m.body.event === 'create' && m.body.source === 'api' && m.body.route === 'orders' && m.body.project.slug === slug && m.body.record.amount === 12 && m.body.record._id === oid, JSON.stringify(m?.body));
ok('…signed with the secret', m && verify(m, secret) && !verify(m, 'whsec_wrong'), m?.headers['x-mint-signature']);
ok('…no password fields in it', m && !('pin' in m.body.record), JSON.stringify(m?.body?.record));
ok('…delivery id header matches the body', m && m.headers['x-mint-delivery'] === m.body.delivery);

r = await call('PUT', P(pid, `/orders/${oid}`), { name: 'First, changed', amount: 15 }, s.pat);
ok('changed in the panel', r.status === 200, r.status);
m = await until(() => got.find(g => g.path === '/ok' && g.headers['x-mint-event'] === 'update'));
ok('update delivered from the panel', m && m.body.source === 'panel' && m.body.record.amount === 15 && verify(m, secret), JSON.stringify(m?.body));
r = await pub(`orders/${oid}`, { method: 'DELETE' });
m = await until(() => got.find(g => g.path === '/ok' && g.headers['x-mint-event'] === 'delete'));
ok('delete delivered', r.status === 200 && m?.body.record._id === oid, JSON.stringify(m?.body));
ok('the failing hook only hears create', got.filter(g => g.path === '/fail').every(g => g.headers['x-mint-event'] === 'create'));

r = await until(async () => {
	const x = await call('GET', P(pid, `/webhooks/${okHook._id}/deliveries`), null, s.pat);
	return x.body?.doc?.length === 3 && x.body.doc.every(d => !d.pending) ? x : null;
});
ok('delivery log: 3, newest first, all ok in one try', r && r.body.doc.map(d => d.event).join() === 'delete,update,create' && r.body.doc.every(d => d.ok && d.attempts === 1 && d.status === 200 && d.response === 'thanks'), JSON.stringify(r?.body?.doc?.map(d => [d.event, d.ok, d.attempts])));

// Retries: 3 more tries after the first (0.5 s, 2 s, 8 s on a development server).
r = await call('GET', P(pid, `/webhooks/${failHook._id}/deliveries`), null, s.pat);
ok('failing delivery logged while it retries', r.body?.doc?.length === 1 && r.body.doc[0].attempts >= 1 && r.body.doc[0].error === 'Answered 500', JSON.stringify(r.body?.doc?.[0]));
r = await until(async () => {
	const x = await call('GET', P(pid, `/webhooks/${failHook._id}/deliveries`), null, s.pat);
	return x.body?.doc?.[0] && !x.body.doc[0].pending ? x : null;
}, 30000);
ok('…given up after 4 tries in all', r && r.body.doc[0].attempts === 4 && !r.body.doc[0].ok && got.filter(g => g.path === '/fail').length === 4, JSON.stringify(r?.body?.doc?.[0]));
ok('…with the same delivery id each time', new Set(got.filter(g => g.path === '/fail').map(g => g.headers['x-mint-delivery'])).size === 1);
r = await call('GET', P(pid, '/webhooks'), null, s.pat);
ok('last delivery shown on the webhook', r.body?.doc?.find(w => w._id === failHook._id)?.lastDelivery?.ok === false, JSON.stringify(r.body?.doc?.map(w => w.lastDelivery)));

/* ------------------------------------------------------ test, secret, address */
r = await call('POST', P(pid, `/webhooks/${okHook._id}/test`), null, s.pat);
m = got.filter(g => g.headers['x-mint-event'] === 'test').pop();
ok('Send test: delivered now, signed, logged', r.status === 200 && r.body?.ok && r.body.event === 'test' && r.body.source === 'test' && m && verify(m, secret), JSON.stringify(r.body));
r = await call('POST', P(pid, `/webhooks/${okHook._id}/secret`), null, s.pat);
const old = secret;
secret = r.body?.secret;
ok('a new secret', r.status === 200 && /^whsec_/.test(secret) && secret !== old);
await call('POST', P(pid, `/webhooks/${okHook._id}/test`), null, s.pat);
m = got.filter(g => g.headers['x-mint-event'] === 'test').pop();
ok('…signs from now on (the old one doesn’t match)', m && verify(m, secret) && !verify(m, old));

r = await call('PUT', P(pid, `/webhooks/${okHook._id}`), { url: '' }, s.pat);
ok('no address → switched off', r.status === 200 && r.body.active === false && r.body.url === '', JSON.stringify(r.body));
r = await call('POST', P(pid, `/webhooks/${okHook._id}/test`), null, s.pat);
ok('…and no test without one', r.status === 400, r.body?.message);
const before = got.length;
await pub('orders', { method: 'POST', body: JSON.stringify({ name: 'Quiet' }) });
await wait(1200);
ok('a switched-off webhook sends nothing', got.slice(before).every(g => g.path !== '/ok'));

/* ------------------------------------------------------------ the overview */
r = await call('GET', P(pid, '/api-overview'), null, s.pat);
ok(
	'API overview: endpoints, calls, webhooks',
	r.status === 200 && r.body.endpoints?.[0]?.route === 'orders' && r.body.endpoints[0].actions.length === 5 && r.body.day.calls >= 3 && r.body.calls.some(c => c.method === 'POST' && c.path === '/orders' && c.status === 201) && r.body.webhooks.total === 2,
	JSON.stringify({ e: r.body?.endpoints, d: r.body?.day, c: r.body?.calls?.slice(0, 3), w: r.body?.webhooks })
);
r = await call('GET', P(pid, '/history?limit=50'), null, s.pat);
ok('history: webhooks added and a secret replaced', JSON.stringify(r.body).includes('added a webhook for Orders') && JSON.stringify(r.body).includes('replaced the secret'), r.status);

// Deleted while it waits to retry: nothing more is sent. 'Doomed' fails on two webhooks;
// the deleted one's delivery stays at its first try while the other keeps retrying.
r = await call('POST', P(pid, '/webhooks'), { route: 'orders', events: ['create'], url: `${RECV}/fail` }, s.pat);
const gone = r.body?.doc;
const doomed = () => got.filter(g => g.path === '/fail' && g.body?.record?.name === 'Doomed');
await pub('orders', { method: 'POST', body: JSON.stringify({ name: 'Doomed' }) });
await until(() => doomed().length >= 2);
await call('DELETE', P(pid, `/webhooks/${gone?._id}`), null, s.pat);
await wait(3500);
const tries = Object.values(doomed().reduce((a, g) => ({ ...a, [g.headers['x-mint-delivery']]: (a[g.headers['x-mint-delivery']] || 0) + 1 }), {})).sort();
ok('a deleted webhook’s retries are dropped', tries.length === 2 && tries[0] === 1 && tries[1] >= 3, JSON.stringify(tries));

r = await call('DELETE', P(pid, `/webhooks/${failHook._id}`), null, s.pat);
ok('webhook deleted', r.status === 200);
r = await call('GET', P(pid, `/webhooks/${failHook._id}/deliveries`), null, s.pat);
ok('…with its log', r.status === 404);

/* ------------------------------------------- an API template, previewed */
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
const A = '/admin/api';
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const mc = await new MongoClient(process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev').connect();
await mc.db().collection('projecttemplates').deleteMany({ key: 'smoke-api-bookings' });
r = await call('POST', `${A}/templates`, {
	type: 'api',
	key: 'smoke-api-bookings',
	blueprint: {
		overview: { name: 'Smoke API bookings' },
		questions: [{ key: 'hook_url', label: 'Where should new bookings be sent?', kind: 'url' }],
		models: { steps: [{ action: 'create', name: 'Booking', title: 'Bookings', displayField: 'guest', fields: [{ key: 'guest', label: 'Guest', kind: 'text', required: true }, { key: 'nights', label: 'Nights', kind: 'number' }] }] },
		endpoints: [{ model: 'Booking', actions: ['list', 'get', 'create'], auth: 'none', note: 'The booking form' }],
		webhooks: [
			{ model: 'Booking', events: ['create'], url: '{{hook_url}}', note: 'The front desk' },
			{ model: 'Booking', events: ['delete'], note: 'Left for the project' },
		],
	},
}, admin);
ok('API template made', r.status === 201, `${r.status} ${r.body?.message || ''}`);
const tid = r.body?.doc?._id;
ok('…no address on a webhook is a warning, not an error', r.body?.doc?.validation?.warnings?.some(w => w.path === 'webhooks[1].url') && !r.body.doc.validation.errors.length, JSON.stringify(r.body?.doc?.validation?.errors));
r = await call('PUT', `${A}/templates/${tid}/draft`, { part: 'webhooks', value: [{ model: 'Booking', events: ['create'], url: 'not a url' }] }, admin);
ok('…an address that isn’t one is an error', r.body?.doc?.validation?.errors?.some(e => e.path === 'webhooks[0].url'), JSON.stringify(r.body?.doc?.validation?.errors));
await call('PUT', `${A}/templates/${tid}/draft`, { part: 'webhooks', value: [{ model: 'Booking', events: ['create'], url: '{{hook_url}}', note: 'The front desk' }, { model: 'Booking', events: ['delete'], note: 'Left for the project' }] }, admin);

r = await call('POST', `${A}/templates/${tid}/preview`, { answers: { hook_url: `${RECV}/ok` } }, admin);
ok('previews as an API project, endpoints on, webhooks made', r.status === 201 && r.body.project.type === 'api' && r.body.result.endpoints.join() === 'bookings' && r.body.result.webhooks.join() === 'bookings,bookings' && r.body.result.warnings.some(w => /no address/.test(w)), `${r.status} ${r.body?.message || ''} ${JSON.stringify(r.body?.result)}`);
const pv = r.body?.project;
const PT = (await call('POST', '/tenant/api/auth/preview', { ticket: r.body?.ticket })).body?.token;
r = await call('GET', P(pv?._id, '/webhooks'), null, PT);
const hooks = r.body?.doc || [];
ok('the answered address is on, the other switched off', hooks.length === 2 && hooks[0].active && hooks[0].url === `${RECV}/ok` && !hooks[1].active && hooks[1].url === '', JSON.stringify(hooks));
r = await call('POST', P(pv?._id, `/webhooks/${hooks[0]?._id}/test`), null, PT);
m = got.filter(g => g.headers['x-mint-event'] === 'test' && g.body?.route === 'bookings').pop();
ok('a test delivery from the preview, signed and logged', r.status === 200 && r.body.ok && m && /^sha256=[a-f0-9]{64}$/.test(m.headers['x-mint-signature']), JSON.stringify(r.body));
r = await call('GET', P(pv?._id, `/webhooks/${hooks[0]?._id}/deliveries`), null, PT);
ok('…in its log', r.body?.doc?.length === 1 && r.body.doc[0].event === 'test');
r = await fetch(`${ROOT}/public/api/${pv?.publicSlug}/bookings`).then(x => x.status);
ok('the preview’s endpoint answers', r === 200, r);
r = await fetch(`${ROOT}/public/api/${pv?.publicSlug}/`).then(x => x.json());
ok('the endpoint’s note in the API info', r?.models?.[0]?.note === 'The booking form', JSON.stringify(r?.models?.[0]?.note));

await call('DELETE', `${A}/templates/previews/${pv?._id}`, null, admin);
await mc.db().collection('projecttemplates').deleteMany({ key: 'smoke-api-bookings' });
ok('preview deleted with its webhooks', (await mc.db().collection('projectwebhooks').countDocuments({ project: new (await import('../../node_modules/mongodb/lib/index.js')).ObjectId(pv?._id) })) === 0);
await mc.close();

r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('API project deleted', r.status === 200, `${r.status} ${r.body?.message || ''}`);
server.close();
done();
