// Automations (docs/automations AU-02): triggers (create / change / delete,
// changed fields, conditions), the five actions (notify, email, webhook,
// update, create), placeholders, checks at save, failures logged, the chain
// limit, dry run, the on/off switch, permissions, deleting a project.
// Stands alone (its own accounts and a local webhook receiver). Local scratch server only.
import http from 'http';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'auto-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const email = key => `${key}${stamp}@example.com`;
const register = async (name, key) =>
	(await call('POST', '/tenant/api/auth/register', { name, email: email(key), password: PASS, organization: `${name} Co ${stamp}`, country: 'BD' })).body.token;
const wait = ms => new Promise(r => setTimeout(r, ms));
const settle = () => wait(1500);

// A webhook receiver on this machine.
const received = [];
const server = http.createServer((req, res) => {
	let body = '';
	req.on('data', c => (body += c));
	req.on('end', () => {
		received.push({ headers: req.headers, body });
		res.writeHead(req.url === '/fail' ? 500 : 200).end('ok');
	});
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const hookUrl = `http://127.0.0.1:${server.address().port}/hook`;

// Alma owns the project; Bea is a Member (no Build).
const alma = await register('Alma', 'alma');
let bea = await register('Bea', 'bea');
await mongoose.connection.db.collection('tenantusers').updateOne({ email: email('bea') }, { $set: { emailVerified: true } });
const shop = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, alma)).body;
await call('POST', P(shop._id, '/people/invitations'), { email: email('bea'), role: 'member' }, alma);
const inv = (await call('GET', '/tenant/api/invitations/for-me', null, bea)).body?.doc?.[0];
bea = (await call('POST', `/tenant/api/invitations/for-me/${inv?._id}/accept`, null, bea)).body?.token;
const beaId = (await call('GET', '/tenant/api/auth/self', null, bea)).body?._id;
ok('Bea is in Shop', !!beaId);

const model = body => call('POST', P(shop._id, '/builder/models'), body, alma);
let r = await model({ name: 'Client', title: 'Clients', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'note', label: 'Note', kind: 'text' }] });
ok('Client model', r.status === 201, r.body?.message);
r = await model({
	name: 'Deal',
	title: 'Deals',
	fields: [
		{ key: 'title', label: 'Title', kind: 'text', required: true },
		{ key: 'status', label: 'Status', kind: 'select', default: 'open', options: [{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }] },
		{ key: 'amount', label: 'Amount', kind: 'number' },
		{ key: 'contact', label: 'Contact email', kind: 'email' },
		{ key: 'client', label: 'Client', kind: 'reference', ref: 'Client' },
	],
});
ok('Deal model', r.status === 201, r.body?.message);
r = await model({ name: 'Task', title: 'Tasks', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'deal', label: 'Deal', kind: 'reference', ref: 'Deal' }] });
ok('Task model', r.status === 201, r.body?.message);

const A = (path = '') => P(shop._id, `/automations${path}`);
const save = (body, who = alma) => call('POST', A(), body, who);
const count = route => mongoose.connection.db.collection(`t_${shop._id}`).countDocuments({ _model: route });
const records = async route => (await call('GET', P(shop._id, `/${route}?limit=100`), null, alma)).body?.doc || [];

/* ---- checks at save */
r = await save({ name: 'x', route: 'deals', on: ['create'], actions: [{ type: 'notify', to: { people: [beaId] }, title: 'Hi {{nope}}' }] });
ok('an unknown placeholder is refused, under its input', r.status === 400 && r.body?.on === 'actions.0.title' && /\{\{nope\}\}/.test(r.body?.message), JSON.stringify(r.body));
r = await save({ name: 'x', route: 'deals', on: ['create'], actions: [{ type: 'webhook', url: 'http://169.254.169.254/latest' }] });
ok('a cloud metadata address is refused', r.status === 400 && r.body?.on === 'actions.0.url', JSON.stringify(r.body));
r = await save({ name: 'x', route: 'deals', on: ['create'], actions: [{ type: 'create', route: 'tasks', set: [{ field: 'deal', from: '_id' }] }] });
ok('a create that leaves out a required field is refused, naming it', r.status === 400 && /Title/.test(r.body?.message) && r.body?.on === 'actions.0.set', JSON.stringify(r.body));
r = await save({ name: 'x', route: 'deals', on: ['create'], actions: [{ type: 'notify', to: { people: ['5f0000000000000000000000'] }, title: 'Hi' }] });
ok('only people in the project can be notified', r.status === 400 && r.body?.on === 'actions.0.to.people', JSON.stringify(r.body));
r = await save({ name: 'x', route: 'deals', on: ['delete'], actions: [{ type: 'update', target: 'this', set: [{ field: 'amount', value: 1 }] }] });
ok("a deleted record can't be updated", r.status === 400 && r.body?.on === 'actions.0.target', JSON.stringify(r.body));
r = await save({ name: 'x', route: 'nope', on: ['create'], actions: [] });
ok('an unknown page is refused', r.status === 400 && r.body?.on === 'route', JSON.stringify(r.body));
r = await call('GET', A(), null, bea);
ok('without Build: 403', r.status === 403, r.status);

/* ---- a deal is won: notify, webhook, update its client, add a task */
r = await save({
	name: 'Won deal',
	route: 'deals',
	on: ['update'],
	changed: ['status'],
	when: [{ field: 'status', op: 'is', value: 'won' }],
	actions: [
		{ type: 'notify', to: { people: [beaId] }, title: '{{title}} was won', message: '{{amount}} from {{client}} — {{link}}' },
		{ type: 'webhook', url: hookUrl },
		{ type: 'update', target: 'client', set: [{ field: 'note', value: 'Won {{title}} on {{today}}' }] },
		{ type: 'create', route: 'tasks', set: [{ field: 'title', value: 'Kick off {{title}}' }, { field: 'deal', from: '_id' }] },
	],
});
ok('saved', r.status === 201 && r.body?.secret?.startsWith('whsec_'), JSON.stringify(r.body));
const won = r.body;
const client = (await call('POST', P(shop._id, '/clients'), { name: 'Acme' }, alma)).body;
const clientId = client?._id || client?.doc?._id;
let deal = (await call('POST', P(shop._id, '/deals'), { title: 'Big order', amount: 500, client: clientId, contact: email('buyer') }, alma)).body;
const dealId = deal?._id || deal?.doc?._id;
await settle();
ok('creating a deal starts nothing (it runs on change)', (await count('Task')) === 0 && received.length === 0);
r = await call('PUT', P(shop._id, `/deals/${dealId}`), { status: 'won' }, alma);
ok('deal marked won', r.status === 200, r.body?.message);
await settle();
const notes = (await call('GET', '/tenant/api/notifications', null, bea)).body?.doc || [];
const n = notes.find(x => x.type === 'automation');
ok('Bea is notified, placeholders filled (the client by name)', n?.title === 'Big order was won' && /^500 from Acme — http/.test(n?.message || '') && /\/deals\//.test(n?.href || ''), JSON.stringify(n));
ok('the webhook got a signed POST', received.length === 1 && received[0].headers['x-mint-event'] === 'automation.update', JSON.stringify(received[0]?.headers));
const hook = received[0];
const sig = 'sha256=' + crypto.createHmac('sha256', won.secret).update(`${hook.headers['x-mint-timestamp']}.${hook.body}`).digest('hex');
ok('…with a signature made from the automation’s secret', hook.headers['x-mint-signature'] === sig);
ok('…and the record', JSON.parse(hook.body).record?.title === 'Big order');
const c = (await records('clients'))[0];
ok('the client was updated', /^Won Big order on \d{4}-\d{2}-\d{2}$/.test(c?.note || ''), c?.note);
const tasks = await records('tasks');
ok('a task was added, linked to the deal', tasks.length === 1 && tasks[0].title === 'Kick off Big order' && String(tasks[0].deal?._id || tasks[0].deal) === String(dealId), JSON.stringify(tasks));
r = await call('GET', P(shop._id, `/history?search=${encodeURIComponent('Automation “Won deal”')}`), null, alma);
ok('History says the automation did it', (r.body?.doc || []).length >= 2, JSON.stringify(r.body?.doc?.map(d => d.text)));
r = await call('GET', A(`/${won._id}/runs`), null, alma);
ok('one successful run, four steps', r.body?.doc?.length === 1 && r.body.doc[0].status === 'success' && r.body.doc[0].steps.length === 4 && r.body.doc[0].recordName === 'Big order', JSON.stringify(r.body?.doc?.[0]));

r = await call('PUT', P(shop._id, `/deals/${dealId}`), { amount: 600 }, alma);
await settle();
r = await call('GET', A(`/${won._id}/runs`), null, alma);
ok('changing only the amount starts nothing (only Status counts)', r.body?.doc?.length === 1, r.body?.doc?.length);

/* ---- a failure is logged and stops the rest */
r = await save({
	name: 'Email the buyer',
	route: 'deals',
	on: ['create'],
	actions: [
		{ type: 'email', to: { fields: ['contact'] }, subject: 'Thanks for {{title}}', body: 'Hello,\n\nWe got your order.' },
		{ type: 'create', route: 'tasks', set: [{ field: 'title', value: 'Never made' }] },
	],
});
const mail = r.body;
ok('an email automation', r.status === 201, r.body?.message);
await call('POST', P(shop._id, '/deals'), { title: 'Second', contact: email('buyer') }, alma);
await settle();
r = await call('GET', A(`/${mail._id}/runs`), null, alma);
const failed = r.body?.doc?.[0];
ok('no email server: the run failed with why', failed?.status === 'failed' && /Set up your email first/.test(failed?.error || ''), JSON.stringify(failed));
ok('…and the next action never ran', failed?.steps?.length === 1 && !(await records('tasks')).some(t => t.title === 'Never made'));
r = await call('GET', A(`/${mail._id}`), null, alma);
ok('its counters', r.body?.stats?.runs === 1 && r.body?.stats?.failures === 1 && r.body?.stats?.lastStatus === 'failed', JSON.stringify(r.body?.stats));

/* ---- dry run */
const before = await count('Task');
r = await call('POST', A(`/${won._id}/test`), { record: dealId }, alma);
ok('a dry run says what would happen', r.status === 200 && r.body?.conditions === true && r.body?.steps?.length === 4 && r.body.steps.every(s => s.ok && /^Would /.test(s.detail)), JSON.stringify(r.body));
await settle();
ok('…and does nothing', (await count('Task')) === before && received.length === 1);

/* ---- off */
r = await call('PATCH', A(`/${mail._id}`), { enabled: false }, alma);
ok('switched off', r.status === 200 && r.body?.enabled === false);
await call('POST', P(shop._id, '/deals'), { title: 'Third', contact: email('buyer') }, alma);
await settle();
r = await call('GET', A(`/${mail._id}/runs`), null, alma);
ok('…runs no more', r.body?.doc?.length === 1, r.body?.doc?.length);

/* ---- a chain stops at 3 */
r = await save({ name: 'Next task', route: 'tasks', on: ['create'], actions: [{ type: 'create', route: 'tasks', set: [{ field: 'title', value: 'After {{title}}' }] }] });
const next = r.body;
const tasksBefore = await count('Task');
await call('POST', P(shop._id, '/tasks'), { title: 'Start' }, alma);
await wait(4000);
ok('three more tasks, then it stops', (await count('Task')) === tasksBefore + 4, `${(await count('Task')) - tasksBefore}`);
r = await call('GET', A(`/${next._id}/runs`), null, alma);
const statuses = (r.body?.doc || []).map(x => `${x.depth}:${x.status}`).sort().join();
ok('…runs at depth 1–3, the 4th skipped with why', statuses === '1:success,2:success,3:success,4:skipped' && /chain of 3/.test(r.body.doc.find(x => x.status === 'skipped')?.error), statuses);

/* ---- a delete trigger, and the record's last values */
r = await save({ name: 'Deal gone', route: 'deals', on: ['delete'], actions: [{ type: 'webhook', url: hookUrl }] });
await call('DELETE', P(shop._id, `/deals/${dealId}`), null, alma);
await settle();
const last = received[received.length - 1];
ok('deleting a deal calls its webhook with the last values', last?.headers['x-mint-event'] === 'automation.delete' && JSON.parse(last.body).record?.title === 'Big order', last?.headers['x-mint-event']);

/* ---- the list, the runs, deleting */
r = await call('GET', A(), null, alma);
ok('the list', r.body?.doc?.length === 4 && !('secret' in r.body.doc[0]), r.body?.doc?.length);
r = await call('GET', A('/runs?status=failed'), null, alma);
ok('all runs, filtered', r.body?.doc?.length === 1 && r.body.doc[0].name === 'Email the buyer');
r = await call('DELETE', A(`/${mail._id}`), null, alma);
ok('deleted', r.status === 200);
r = await call('DELETE', `/tenant/api/projects/${shop._id}?force=1`, null, alma);
const pid = new mongoose.Types.ObjectId(shop._id);
const left = (await mongoose.connection.db.collection('automations').countDocuments({ project: pid })) + (await mongoose.connection.db.collection('automationruns').countDocuments({ project: pid }));
ok('deleting the project takes its automations and runs', r.status === 200 && left === 0, left);

server.close();
await mongoose.disconnect();
done();
