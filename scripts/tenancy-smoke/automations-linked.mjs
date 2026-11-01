// Automations EC-36 (docs/ecommerce/TAX_AUTOMATIONS.md): the "Update the records that pick this one" action
// (checks, a run over many records with formulas worked out, a condition on those records, History by the
// automation, dry run, nothing to change) and system automations (switch on/off only: PUT / DELETE refused).
// Stands alone. Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const wait = ms => new Promise(r => setTimeout(r, ms));
const t = (await call('POST', '/tenant/api/auth/register', { name: 'Lia', email: `lia${stamp}@example.com`, password: 'auto-pass-123', organization: `Lia Co ${stamp}`, country: 'BD' })).body.token;
const shop = (await call('POST', '/tenant/api/projects', { name: 'Linked', type: 'app' }, t)).body;
const P = path => `/tenant/api/p/${shop._id}${path}`;
const model = body => call('POST', P('/builder/models'), body, t);
let r = await model({ name: 'Client', title: 'Clients', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'rate', label: 'Rate', kind: 'number' }] });
ok('Client model', r.status === 201, r.body?.message);
r = await model({
	name: 'Deal',
	title: 'Deals',
	fields: [
		{ key: 'title', label: 'Title', kind: 'text', required: true },
		{ key: 'client', label: 'Client', kind: 'reference', ref: 'Client' },
		{ key: 'locked', label: 'Locked', kind: 'boolean', default: false },
		{ key: 'price', label: 'Price', kind: 'number' },
		{ key: 'rate', label: 'Rate', kind: 'number' },
		{ key: 'total', label: 'Total', kind: 'formula', formula: 'price * (1 + rate / 100)' },
	],
});
ok('Deal model', r.status === 201, r.body?.message);
const route = n => ({ Client: 'clients', Deal: 'deals' })[n];
const add = async (n, body) => (await call('POST', P(`/${route(n)}`), body, t)).body?.doc;
const get = async (n, id) => {
	const x = (await call('GET', P(`/${route(n)}/${id}`), null, t)).body;
	return x?.doc || x;
};

const acme = await add('Client', { name: 'Acme', rate: 10 });
const other = await add('Client', { name: 'Other', rate: 0 });
const deals = [];
for (let i = 0; i < 5; i++) deals.push(await add('Deal', { title: `D${i}`, client: acme._id, price: 100 }));
const lockedDeal = await add('Deal', { title: 'Held', client: acme._id, price: 100, locked: true });
const foreign = await add('Deal', { title: 'Foreign', client: other._id, price: 100 });
ok('deals made, total = price × (1 + rate/100) with no rate yet', (await get('Deal', deals[0]._id)).total === 100);

const body = {
	name: 'Client rate → its deals',
	route: 'clients',
	on: ['update'],
	changed: ['rate'],
	actions: [{ type: 'updateLinked', route: 'deals', via: 'client', set: [{ field: 'rate', from: 'rate' }], when: [{ field: 'locked', op: 'is', value: false }] }],
};
const A = '/automations';
// Checks at save.
let x = await call('POST', P(A), { ...body, actions: [{ ...body.actions[0], via: 'title' }] }, t);
ok('via must be a reference to this page', x.status === 400 && /picks/.test(x.body?.message), x.body?.message);
x = await call('POST', P(A), { ...body, actions: [{ ...body.actions[0], route: 'nope' }] }, t);
ok('the page must exist', x.status === 400, x.body?.message);
x = await call('POST', P(A), { ...body, actions: [{ ...body.actions[0], set: [{ field: 'total', value: 5 }] }] }, t);
ok('a formula field can’t be set', x.status === 400, x.body?.message);
x = await call('POST', P(A), { ...body, actions: [{ ...body.actions[0], when: [{ field: 'zzz', op: 'is', value: 1 }] }] }, t);
ok('a condition on a field the page doesn’t have is refused', x.status === 400, x.body?.message);
x = await call('POST', P(A), { ...body, on: ['delete'] }, t);
ok('a delete-only automation can’t hand down', x.status === 400, x.body?.message);
x = await call('POST', P(A), body, t);
ok('saved', x.status === 201, x.body?.message);
const auto = x.body;

// Dry run.
x = await call('POST', P(`${A}/${auto._id}/test`), { record: acme._id, event: 'update' }, t);
ok('dry run counts the records it would change (5, not the locked one)', x.body?.steps?.[0]?.ok && /Would update 5 Deals/.test(x.body.steps[0].detail), x.body?.steps?.[0]?.detail);
ok('…and wrote nothing', (await get('Deal', deals[0]._id)).rate == null);

// Real run.
await call('PUT', P(`/clients/${acme._id}`), { rate: 20 }, t);
await wait(2500);
const d0 = await get('Deal', deals[0]._id);
ok('the deals pick up the rate and their total follows (120)', d0.rate === 20 && d0.total === 120, `${d0.rate} ${d0.total}`);
ok('every one of the five', (await Promise.all(deals.map(d => get('Deal', d._id)))).every(d => d.total === 120));
ok('the one failing the condition is untouched', (await get('Deal', lockedDeal._id)).rate == null);
ok('a deal of another client is untouched', (await get('Deal', foreign._id)).rate == null);
r = await call('GET', P(`${A}/${auto._id}/runs`), null, t);
const run = r.body?.doc?.[0];
ok('the run log says how many changed', run?.status === 'success' && /Updated 5 Deals/.test(run.steps?.[0]?.detail), run?.steps?.[0]?.detail || run?.error);
r = await call('GET', P(`/history?search=D0`), null, t);
ok('History reads Automation “…”', (r.body?.doc || r.body?.docs || []).some(h => /Automation “Client rate → its deals”/.test(`${h.userName} ${h.text}`)), JSON.stringify((r.body?.doc || []).map(h => h.userName)).slice(0, 200));

// Run again with the same value: nothing to change.
await call('PUT', P(`/clients/${acme._id}`), { rate: 20, name: 'Acme Ltd' }, t);
await wait(1500);
r = await call('GET', P(`${A}/${auto._id}/runs`), null, t);
ok('no change in the rate: the automation doesn’t start', r.body?.doc?.length === 1, String(r.body?.doc?.length));

// System automations.
await mongoose.connection.db.collection('automations').updateOne({ _id: new mongoose.Types.ObjectId(auto._id) }, { $set: { system: 'commerce', key: 'test.rate' } });
x = await call('PUT', P(`${A}/${auto._id}`), body, t);
ok('a system automation can’t be edited (403)', x.status === 403 && x.body?.code === 'system_automation', `${x.status} ${x.body?.message}`);
x = await call('DELETE', P(`${A}/${auto._id}`), null, t);
ok('…or deleted (403)', x.status === 403, String(x.status));
x = await call('PATCH', P(`${A}/${auto._id}`), { enabled: false }, t);
ok('…but switched off', x.status === 200 && x.body?.enabled === false && x.body?.system === 'commerce', JSON.stringify(x.body).slice(0, 120));
await call('PUT', P(`/clients/${acme._id}`), { rate: 30 }, t);
await wait(1500);
ok('switched off: the deals stay at 20', (await get('Deal', deals[0]._id)).rate === 20);
x = await call('POST', P(A), { ...body, system: 'commerce', key: 'x' }, t);
ok('people can’t make a system one', x.status === 201 && !x.body?.system, JSON.stringify(x.body?.system));

await call('DELETE', `/tenant/api/projects/${shop._id}`, null, t);
await mongoose.disconnect();
done();
