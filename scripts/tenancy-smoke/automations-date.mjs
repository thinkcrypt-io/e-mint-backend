// Automations: "When a date is reached" (docs/ecommerce/DISCOUNTS.md DS6, EC-42) — save checks; a record's run queued
// at its date (or so long before), moved when the date changes, dropped when it's cleared, the record deleted or the
// date already passed; the tick running it (event "date", in Runs) with conditions checked then; an automation
// switched off / on, added after its records, deleted; project delete. Needs the server started with
// AUTOMATION_TICK_MS=2000 and SMOKE_MONGO (reads the jobs). Stands alone.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const MONGO = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const dues = mongoose.connection.db.collection('automationdues');
const wait = ms => new Promise(r => setTimeout(r, ms));
const iso = ms => new Date(Date.now() + ms).toISOString();

const t = (await call('POST', '/tenant/api/auth/register', { name: 'Dora Dates', email: `dora${stamp}@example.com`, password: 'dates-pass-123', organization: `Dates ${stamp}`, country: 'BD' })).body.token;
const project = (await call('POST', '/tenant/api/projects', { name: 'Subscriptions', type: 'app' }, t)).body;
const P = path => `/tenant/api/p/${project._id}${path}`;
let r = await call(
	'POST',
	P('/builder/models'),
	{
		name: 'Subscription',
		title: 'Subscriptions',
		fields: [
			{ key: 'name', label: 'Name', kind: 'text', required: true },
			{ key: 'renews', label: 'Renews', kind: 'date' },
			{ key: 'status', label: 'Status', kind: 'select', default: 'active', options: [{ value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'paused', label: 'Paused' }] },
			{ key: 'reminded', label: 'Reminded', kind: 'text' },
		],
	},
	t
);
ok('Subscription model', r.status === 201, r.body?.message);
const route = r.body?.route || 'subscriptions';
const add = async body => (await call('POST', P(`/${route}`), body, t)).body?.doc || {};
const get = async id => {
	const x = (await call('GET', P(`/${route}/${id}`), null, t)).body;
	return x?.doc || x;
};
const edit = (id, body) => call('PUT', P(`/${route}/${id}`), body, t);
const pending = async (a, rec) => dues.find({ automation: new mongoose.Types.ObjectId(a), ...(rec && { record: new mongoose.Types.ObjectId(rec) }), state: 'pending' }).toArray();

// Save checks.
const base = { name: 'Expire', route, on: ['date'], when: [{ field: 'status', op: 'is', value: 'active' }], actions: [{ type: 'update', target: 'this', set: [{ field: 'status', value: 'expired' }] }] };
r = await call('POST', P('/automations'), { ...base, on: ['date', 'update'], date: { field: 'renews' } }, t);
ok('date with another event refused', r.status === 400 && /on its own/.test(r.body?.message), r.body?.message);
r = await call('POST', P('/automations'), { ...base, date: { field: 'name' } }, t);
ok('a field that isn’t a date refused', r.status === 400 && r.body?.on === 'date.field', `${r.status} ${r.body?.message} ${r.body?.on}`);
r = await call('POST', P('/automations'), { ...base, date: { field: 'renews', amount: -2 } }, t);
ok('a negative amount refused', r.status === 400 && r.body?.on === 'date.amount', `${r.status} ${r.body?.message}`);

r = await call('POST', P('/automations'), { ...base, date: { field: 'renews' } }, t);
const expire = r.body;
ok('“on the date” saved', r.status === 201 && expire?.date?.field === 'renews' && expire?.date?.amount === 0, JSON.stringify(r.body).slice(0, 200));
r = await call('POST', P('/automations'), { name: 'Remind', route, on: ['date'], date: { field: 'renews', amount: 1, unit: 'days', when: 'before' }, actions: [{ type: 'update', target: 'this', set: [{ field: 'reminded', value: 'yes ({{event}})' }] }] }, t);
const remind = r.body;
ok('“1 day before” saved', r.status === 201 && remind?.date?.when === 'before', JSON.stringify(r.body?.date || r.body));
await wait(2500); // the tick notices the new automations

// A record due in a few seconds: queued for Expire, not for Remind (a day before is past).
const s1 = await add({ name: 'Soon', renews: iso(5000) });
await wait(800);
ok('queued at its date', (await pending(expire._id, s1._id)).length === 1 && (await pending(remind._id, s1._id)).length === 0, JSON.stringify(await pending(expire._id, s1._id)));

// Moved, cleared, deleted, already passed.
const s2 = await add({ name: 'Later', renews: iso(3600e3) });
await wait(800);
const at0 = (await pending(expire._id, s2._id))[0]?.at;
await edit(s2._id, { renews: iso(4000) });
await wait(800);
const at1 = (await pending(expire._id, s2._id))[0]?.at;
ok('moved when the date changes', at0 && at1 && at1 < at0 && (await pending(expire._id, s2._id)).length === 1, `${at0} → ${at1}`);
const s3 = await add({ name: 'Cleared', renews: iso(3600e3) });
await wait(800);
await edit(s3._id, { renews: '' }); // the form clears a date with an empty value
await wait(800);
ok('dropped when the date is cleared', (await pending(expire._id, s3._id)).length === 0);
const s4 = await add({ name: 'Deleted', renews: iso(3600e3) });
await wait(800);
await call('DELETE', P(`/${route}/${s4._id}`), null, t);
await wait(800);
ok('dropped when the record is deleted', (await dues.countDocuments({ record: new mongoose.Types.ObjectId(s4._id), state: 'pending' })) === 0);
const s5 = await add({ name: 'Past', renews: iso(-3600e3) });
await wait(800);
ok('a date already passed isn’t queued', (await pending(expire._id, s5._id)).length === 0);

// Conditions are checked when it runs; "1 day before".
const s6 = await add({ name: 'Paused one', renews: iso(4000) });
const s7 = await add({ name: 'Tomorrow', renews: iso(24 * 3600e3 + 4000) });
await wait(800);
await edit(s6._id, { status: 'paused' });

await wait(9000); // the dates pass; the 2 s tick runs them
ok('ran on its date: Soon expired', (await get(s1._id)).status === 'expired', (await get(s1._id)).status);
ok('…and the moved one too', (await get(s2._id)).status === 'expired', (await get(s2._id)).status);
ok('the past one untouched', (await get(s5._id)).status === 'active');
ok('conditions checked when it runs: the paused one left alone', (await get(s6._id)).status === 'paused');
ok('“1 day before” ran a day early', (await get(s7._id)).reminded === 'yes (reached its date)' && (await get(s7._id)).status === 'active', JSON.stringify(await get(s7._id)).slice(0, 200));
r = await call('GET', P(`/automations/${expire._id}/runs`), null, t);
ok('Runs: two, event date, success', r.body?.doc?.length === 2 && r.body.doc.every(x => x.event === 'date' && x.status === 'success'), JSON.stringify(r.body?.doc?.map(x => [x.recordName, x.event, x.status])));
ok('the jobs are kept as done', (await dues.countDocuments({ automation: new mongoose.Types.ObjectId(expire._id), state: 'done' })) >= 3);
r = await call('GET', P('/history?search=Soon'), null, t);
ok('History by the automation', (r.body?.doc || []).some(h => /Automation “Expire”/.test(h.userName || '')), JSON.stringify((r.body?.doc || []).map(h => h.userName)));

// Off → its waiting runs go; on → back for the records still ahead.
const s8 = await add({ name: 'Next year', renews: iso(365 * 24 * 3600e3) });
await wait(800);
ok('queued', (await pending(expire._id, s8._id)).length === 1);
await call('PATCH', P(`/automations/${expire._id}`), { enabled: false }, t);
await wait(3000);
ok('switched off: dropped', (await pending(expire._id)).length === 0);
await call('PATCH', P(`/automations/${expire._id}`), { enabled: true }, t);
await wait(3000);
ok('switched on: queued again', (await pending(expire._id, s8._id)).length === 1);

// Made after its records: they're queued; deleted: they go.
r = await call('POST', P('/automations'), { name: 'Week after', route, on: ['date'], date: { field: 'renews', amount: 7, unit: 'days', when: 'after' }, actions: [{ type: 'update', target: 'this', set: [{ field: 'reminded', value: 'late' }] }] }, t);
const late = r.body;
await wait(3000);
ok('a new automation queues the records already there', (await pending(late._id, s8._id)).length === 1 && (await pending(late._id, s5._id)).length === 1, `${(await pending(late._id)).length}`);
await call('DELETE', P(`/automations/${late._id}`), null, t);
await wait(3000);
ok('deleted: its runs go', (await pending(late._id)).length === 0);

// MCP-style save through the panel API keeps `date`; the list shows it.
r = await call('GET', P('/automations'), null, t);
ok('listed with its date', (r.body?.doc || []).some(a => a._id === remind._id && a.date?.unit === 'days'), JSON.stringify((r.body?.doc || []).map(a => a.date)));

r = await call('DELETE', `/tenant/api/projects/${project._id}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
ok('…its waiting runs too', (await dues.countDocuments({ project: new mongoose.Types.ObjectId(project._id) })) === 0);
await mongoose.disconnect();
done();
