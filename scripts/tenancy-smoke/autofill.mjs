// Autofill (docs/autofill, AF-09…15): autofill is a setting on a field (`fillFrom`:
// from, formula, readonly, when, match), not a type. End to end on an order picking a
// customer — builder checks, create, edit, re-pick, clear, conditions on this record and
// on the picked one (read-only: cleared and still locked), a source record changing,
// bulk edit, rows, and the migration of the old autofill kinds.
// Stands alone (its own account). Local scratch server only; SMOKE_MONGO for the migration.
import { execFileSync } from 'child_process';
import { call, ok, done } from './lib.mjs';
const SMOKE_MONGO = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
if (!/127\.0\.0\.1|localhost/.test(SMOKE_MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');
const stamp = Date.now();
const tok = (await call('POST', '/tenant/api/auth/register', { name: 'Afa', email: `afa${stamp}@example.com`, password: 'autofill-pass-123', organization: `Autofill Co ${stamp}`, country: 'BD' })).body.token;
const pid = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, tok)).body?._id;
const P = p => `/tenant/api/p/${pid}${p}`;
const make = body => call('POST', P('/builder/models'), body, tok);
const get = async (route, id) => (await call('GET', P(`/${route}/${id}`), null, tok)).body;
const iso = v => (v ? new Date(v).toISOString() : null);
const said = r => JSON.stringify(r.body?.problems || r.body?.message);

let r = await make({ name: 'Customer', title: 'Customers', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'phone', label: 'Phone', kind: 'text' },
	{ key: 'email', label: 'Email', kind: 'email' },
	{ key: 'since', label: 'Since', kind: 'date' },
	{ key: 'credit', label: 'Credit', kind: 'number' },
	{ key: 'type', label: 'Type', kind: 'select', options: [{ value: 'Retail' }, { value: 'Wholesale' }] },
	{ key: 'apiToken', label: 'Token', kind: 'password' },
] });
const customer = r.body?.doc;
ok('a Customer model', r.status === 201, said(r));

const orderFields = (extra, link = { key: 'customer', label: 'Customer', kind: 'reference', ref: 'Customer' }) => [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	link,
	{ key: 'delivery', label: 'Delivery', kind: 'select', options: [{ value: 'Home' }, { value: 'Pickup' }] },
	...extra,
];
const af = (key, kind, from, formula, more = {}, fieldMore = {}) => ({ key, label: key, kind, fillFrom: { from, formula, ...more }, ...fieldMore });
const Home = [{ field: 'delivery', op: 'is', value: 'Home' }];

r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'text', 'customer', '')]) });
ok('builder: an autofill without what to take is refused', r.status === 400, said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'text', 'name', 'phone')]) });
ok('builder: it must copy from a link field', r.status === 400 && /isn't a link field/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('secret', 'text', 'customer', 'apiToken', { readonly: true })]) });
ok('builder: a hidden field can’t be copied', r.status === 400 && /hidden/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('total', 'formula', 'customer', 'credit')]) });
ok('builder: a kind that can’t autofill is refused', r.status === 400 && /can’t autofill/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('amount', 'number', 'customer', 'phone')]) });
ok('builder: the source must fit the field (a number from a text)', r.status === 400 && /pick a number/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'text', 'customer', 'mobile')]) });
ok('builder: the copied field must exist', r.status === 400 && /no field/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'text', 'customer', 'phone', { when: [{ field: 'nope', op: 'is', value: 'x' }] })]) });
ok('builder: a condition must name a real field', r.status === 400 && /isn’t a field here/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'text', 'customer', 'phone', { when: [{ field: '@.nope', op: 'is', value: 'x' }] })]) });
ok('builder: …or a field of the picked record', r.status === 400 && /doesn’t have/.test(said(r)), said(r));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'autofill', 'customer', 'phone')]) });
ok('builder: the old autofill kinds are gone', r.status === 400, said(r));

r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([
	af('phone', 'text', 'customer', 'phone'),
	af('email', 'email', 'customer', 'email', { readonly: true }, { required: true, default: 'x' }),
	af('since', 'date', 'customer', 'since', { readonly: true }),
	af('credit', 'number', 'customer', 'credit', { readonly: true }),
	af('left', 'number', 'customer', 'credit - 10', { readonly: true }),
	af('dphone', 'text', 'customer', 'phone', { when: Home }),
	af('demail', 'email', 'customer', 'email', { readonly: true, when: Home }),
	af('wcredit', 'number', 'customer', 'credit', { readonly: true, when: [{ field: '@.type', op: 'is', value: 'Wholesale' }] }),
	af('either', 'text', 'customer', 'name', { readonly: true, when: [{ field: 'delivery', op: 'is', value: 'Pickup' }, { field: '@.type', op: 'is', value: 'Wholesale' }], match: 'any' }),
]) });
const order = r.body?.doc;
ok('an Order model with autofill on plain fields', r.status === 201, said(r));
const ef = k => order?.fields?.find(f => f.key === k);
ok('…the fields keep their own kind, fillFrom kept', ef('phone')?.kind === 'text' && ef('email')?.kind === 'email' && ef('credit')?.kind === 'number' && ef('since')?.kind === 'date' && ef('email')?.fillFrom?.readonly === true && ef('demail')?.fillFrom?.when?.[0]?.field === 'delivery' && ef('wcredit')?.fillFrom?.when?.[0]?.field === '@.type', JSON.stringify(ef('wcredit')));
ok('…read-only is never required, no default', !ef('email')?.required && ef('email')?.default === undefined, JSON.stringify(ef('email')));

r = await call('GET', P(`/builder/route?route=${order?.route}`), null, tok);
const sf = k => ((r.body?.settings?.data || r.body?.code?.settings)?.fields || []).find(f => f.key === k);
ok('settings: autofill is editable, typed as the field', sf('phone')?.edit === true && sf('phone')?.type === 'string' && sf('phone')?.schema?.fillFrom?.formula === 'phone', JSON.stringify(sf('phone')));
ok('settings: read-only isn’t editable, keeps its kind and shows as a date / number', sf('email')?.edit === false && sf('email')?.schema?.fillFrom?.readonly === true && sf('since')?.type === 'date' && sf('credit')?.type === 'number' && sf('credit')?.schema?.type === 'number', JSON.stringify(sf('credit')));

r = await call('GET', P(`/${order.route}/get/config`), null, tok);
const formOf = k => (r.body?.form || []).find(f => f.name === k);
ok('form: the field keeps its own type and carries its fill', formOf('phone')?.fillFrom?.formula === 'phone' && formOf('phone')?.type !== 'autofill', JSON.stringify(formOf('phone')));
ok('form: read-only and conditions travel to the form', formOf('email')?.fillFrom?.readonly === true && formOf('email')?.fromLabel === 'Customer' && formOf('demail')?.fillFrom?.when?.length === 1, JSON.stringify(formOf('demail')));

const rahim = (await call('POST', P(`/${customer.route}`), { name: 'Rahim', phone: '0171', email: 'rahim@example.com', since: '2026-01-05', credit: 50, type: 'Wholesale' }, tok)).body?.doc;
const karim = (await call('POST', P(`/${customer.route}`), { name: 'Karim', phone: '0181', email: 'karim@example.com', since: '2026-02-05', credit: 20, type: 'Retail' }, tok)).body?.doc;

// Create — through the API, without the form.
r = await call('POST', P(`/${order.route}`), { name: 'O1', customer: rahim._id, delivery: 'Home' }, tok);
let o1 = r.body?.doc;
ok('create: filled from the customer', r.status === 201 && o1?.phone === '0171' && o1?.email === 'rahim@example.com', `${r.status} ${JSON.stringify(o1)} ${r.body?.message}`);
ok('create: a date and a number keep their kind', iso(o1?.since) === '2026-01-05T00:00:00.000Z' && o1?.credit === 50, `${o1?.since} ${o1?.credit}`);
ok('create: a formula over the customer’s numbers', o1?.left === 40, o1?.left);
ok('create: conditions hold (Delivery = Home) → both filled', o1?.dphone === '0171' && o1?.demail === 'rahim@example.com', `${o1?.dphone} ${o1?.demail}`);
ok('create: a condition on the picked record (Type = Wholesale) holds', o1?.wcredit === 50, o1?.wcredit);
ok('create: “any” — the picked record’s condition is enough', o1?.either === 'Rahim', o1?.either);
r = await call('POST', P(`/${order.route}`), { name: 'O2', customer: rahim._id, delivery: 'Pickup', phone: '0199', email: 'mine@example.com', demail: 'also@example.com' }, tok);
let o2 = r.body?.doc;
ok('create: a typed phone is kept', r.status === 201 && o2?.phone === '0199', `${r.status} ${o2?.phone}`);
ok('create: a read-only value sent is ignored', o2?.email === 'rahim@example.com', o2?.email);
ok('create: conditions don’t hold (Pickup) → the editable one is left empty', !o2?.dphone, o2?.dphone);
ok('create: …and the read-only one is cleared whatever was sent', !o2?.demail, o2?.demail);
r = await call('POST', P(`/${order.route}`), { name: 'O3' }, tok);
let o3 = r.body?.doc;
ok('create: no customer, nothing filled', r.status === 201 && !o3?.phone && !o3?.email, JSON.stringify(o3));

// Edit.
r = await call('PUT', P(`/${order.route}/${o1._id}`), { name: 'O1 renamed' }, tok);
let A = await get(order.route, o1._id);
ok('edit: an unrelated change leaves both as they are', r.status === 200 && A.phone === '0171' && A.email === 'rahim@example.com', `${r.status} ${A.phone} ${A.email}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { phone: '0100 (delivery)' }, tok);
A = await get(order.route, o1._id);
ok('edit: the phone can be changed', r.status === 200 && A.phone === '0100 (delivery)', `${r.status} ${A.phone}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { email: 'hack@example.com', demail: 'hack@example.com' }, tok);
A = await get(order.route, o1._id);
ok('edit: the read-only value can’t be changed', A.email === 'rahim@example.com' && A.demail === 'rahim@example.com', `${r.status} ${A.email} ${A.demail} ${r.body?.message}`);
// This record's condition changes.
r = await call('PUT', P(`/${order.route}/${o2._id}`), { delivery: 'Home' }, tok);
let B = await get(order.route, o2._id);
ok('conditions: Delivery becomes Home → the read-only one fills, the empty editable one fills', r.status === 200 && B.demail === 'rahim@example.com' && B.dphone === '0171', `${r.status} ${B.demail} ${B.dphone}`);
r = await call('PUT', P(`/${order.route}/${o2._id}`), { delivery: 'Pickup' }, tok);
B = await get(order.route, o2._id);
ok('conditions: …back to Pickup → the read-only one is cleared, the editable one is kept', B.demail === null || B.demail === undefined || B.demail === '' ? B.dphone === '0171' : false, `${B.demail} ${B.dphone}`);
r = await call('PUT', P(`/${order.route}/${o2._id}`), { demail: 'typed@example.com' }, tok);
B = await get(order.route, o2._id);
ok('conditions: …and a value typed into the cleared, locked field is refused', !B.demail, B.demail);

// Re-pick and clear.
r = await call('PUT', P(`/${order.route}/${o1._id}`), { customer: karim._id }, tok);
A = await get(order.route, o1._id);
ok('re-pick: a different customer replaces the typed phone and the email', r.status === 200 && A.phone === '0181' && A.email === 'karim@example.com' && A.credit === 20, `${r.status} ${A.phone} ${A.email}`);
ok('re-pick: a condition on the picked record now fails (Retail) → cleared', !A.wcredit && !A.either, `${A.wcredit} ${A.either}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { customer: rahim._id, phone: '0555' }, tok);
A = await get(order.route, o1._id);
ok('re-pick: a phone sent with it wins; the email follows the pick', A.phone === '0555' && A.email === 'rahim@example.com' && A.wcredit === 50, `${A.phone} ${A.email} ${A.wcredit}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { customer: '' }, tok);
A = await get(order.route, o1._id);
ok('clear: the link cleared empties the read-only fields, keeps the phone', r.status === 200 && !A.email && !A.credit && !A.demail && A.phone === '0555', `${r.status} ${JSON.stringify([A.email, A.credit, A.phone])}`);
await call('PUT', P(`/${order.route}/${o1._id}`), { customer: rahim._id, phone: '0555' }, tok);

// The source record changes.
r = await call('PUT', P(`/${customer.route}/${rahim._id}`), { email: 'rahim.new@example.com', phone: '0172', credit: 70 }, tok);
ok('the customer is edited', r.status === 200, r.body?.message);
A = await get(order.route, o1._id);
B = await get(order.route, o2._id);
ok('follow: read-only copies change with the customer', A.email === 'rahim.new@example.com' && B.email === 'rahim.new@example.com' && A.credit === 70 && A.left === 60, `${A.email} ${B.email} ${A.credit} ${A.left}`);
ok('follow: a conditional copy follows where its conditions hold…', A.demail === 'rahim.new@example.com' && A.wcredit === 70, `${A.demail} ${A.wcredit}`);
ok('follow: …and stays cleared where they don’t (Pickup)', !B.demail, B.demail);
ok('follow: typed phones stay', B.phone === '0199' && A.phone === '0555', `${A.phone} ${B.phone}`);
r = await call('PUT', P(`/${customer.route}/${rahim._id}`), { type: 'Retail' }, tok);
A = await get(order.route, o1._id);
ok('follow: the customer’s Type changes → a copy conditional on it is cleared', !A.wcredit && !A.either && A.email === 'rahim.new@example.com', `${A.wcredit} ${A.either}`);
r = await call('PUT', P(`/${customer.route}/${rahim._id}`), { type: 'Wholesale' }, tok);
A = await get(order.route, o1._id);
ok('follow: …and filled again when it holds again', A.wcredit === 70 && A.either === 'Rahim', `${A.wcredit} ${A.either}`);
const C = await get(order.route, o3._id);
ok('follow: other orders are untouched', !C.email);
r = await call('PUT', P(`/${customer.route}/${karim._id}`), { since: '2026-03-03' }, tok);
A = await get(order.route, o1._id);
ok('follow: another customer’s change doesn’t reach this order', iso(A.since) === '2026-01-05T00:00:00.000Z', iso(A.since));

// Bulk edits.
r = await call('PUT', P(`/${order.route}/update/many`), { ids: [o2._id, o3._id], updates: { customer: karim._id } }, tok);
const D = await get(order.route, o3._id);
const E = await get(order.route, o2._id);
ok('bulk edit: picking a customer sets the read-only fields', r.status === 200 && D.email === 'karim@example.com' && E.email === 'karim@example.com' && iso(E.since) === '2026-03-03T00:00:00.000Z', `${r.status} ${D.email} ${E.email} ${r.body?.message}`);
ok('bulk edit: …a conditional one stays cleared where its conditions don’t hold', !E.demail && !D.demail, `${E.demail} ${D.demail}`);
r = await call('PUT', P(`/${order.route}/update/many`), { ids: [o2._id, o3._id], updates: { delivery: 'Home' } }, tok);
const D2 = await get(order.route, o3._id);
const E2 = await get(order.route, o2._id);
ok('bulk edit: changing the field a condition reads fills the read-only copy', r.status === 200 && D2.demail === 'karim@example.com' && E2.demail === 'karim@example.com', `${r.status} ${D2.demail} ${E2.demail} ${r.body?.message}`);
// Deleting the customer leaves the copies.
r = await call('DELETE', P(`/${customer.route}/${karim._id}`), null, tok);
const F = await get(order.route, o3._id);
ok('a deleted customer leaves the copies as they are', F.email === 'karim@example.com', `${r.status} ${F.email}`);

// Rows (AF-07): an invoice item's product fills its rate, per row.
r = await make({ name: 'Product', title: 'Products', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'rate', label: 'Rate', kind: 'number' },
	{ key: 'unit', label: 'Unit', kind: 'text' },
	{ key: 'active', label: 'Active', kind: 'boolean' },
] });
const product = r.body?.doc;
r = await make({ name: 'Invoice', title: 'Invoices', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'items', label: 'Items', kind: 'sectionlist', fields: [
		{ key: 'product', label: 'Product', kind: 'reference', ref: 'Product' },
		af('unit', 'text', 'product', 'unit'),
		af('rate', 'number', 'product', 'rate', { readonly: true, when: [{ field: '@.active', op: 'is', value: true }] }),
		{ key: 'qty', label: 'Qty', kind: 'number' },
		{ key: 'total', label: 'Total', kind: 'formula', formula: 'qty * rate' },
	] },
] });
const invoice = r.body?.doc;
ok('rows: an Invoice with autofill inside its items', r.status === 201, said(r));
const pen = (await call('POST', P(`/${product.route}`), { name: 'Pen', rate: 12, unit: 'pcs', active: true }, tok)).body?.doc;
const ink = (await call('POST', P(`/${product.route}`), { name: 'Ink', rate: 40, unit: 'bottle', active: true }, tok)).body?.doc;
const old = (await call('POST', P(`/${product.route}`), { name: 'Old', rate: 5, unit: 'box', active: false }, tok)).body?.doc;
r = await call('POST', P(`/${invoice.route}`), { name: 'I1', items: [{ product: pen._id, qty: 3 }, { product: ink._id, qty: 2, unit: 'big bottle', rate: 1 }, { qty: 1 }, { product: old._id, qty: 1, rate: 9 }] }, tok);
let i1 = r.body?.doc;
ok('rows: each row filled from its own product', r.status === 201 && i1?.items?.[0]?.unit === 'pcs' && i1.items[0].rate === 12 && i1.items[1].rate === 40 && i1.items[1].unit === 'big bottle', `${r.status} ${JSON.stringify(i1?.items)} ${r.body?.message}`);
ok('rows: a row formula uses the filled value', i1?.items?.[0]?.total === 36 && i1?.items?.[1]?.total === 80, JSON.stringify(i1?.items?.map(x => x.total)));
ok('rows: a row without a product is left empty', i1?.items?.[2] && !i1.items[2].unit && !i1.items[2].rate);
ok('rows: a condition on the picked product (inactive) clears the locked rate', i1?.items?.[3] && !i1.items[3].rate && i1.items[3].unit === 'box', JSON.stringify(i1?.items?.[3]));
await call('PUT', P(`/${product.route}/${pen._id}`), { rate: 15 }, tok);
i1 = await get(invoice.route, i1._id);
ok('rows: a read-only rate follows its product, the typed unit stays', i1.items[0].rate === 15 && i1.items[0].total === 45 && i1.items[1].unit === 'big bottle' && i1.items[1].rate === 40, JSON.stringify(i1.items));
await call('PUT', P(`/${product.route}/${pen._id}`), { active: false }, tok);
i1 = await get(invoice.route, i1._id);
ok('rows: the product turning inactive clears the rate', !i1.items[0].rate && i1.items[1].rate === 40, JSON.stringify(i1.items.map(x => x.rate)));

// Migration (AF-10): the old kinds become the kind they copy, with the setting.
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const client = await MongoClient.connect(SMOKE_MONGO);
const col = client.db().collection('modeldefinitions');
const legacy = await col.insertOne({
	name: `Legacy${stamp}`,
	route: `legacy${stamp}`,
	fields: [
		{ key: 'phone', kind: 'autofill', fills: 'text', fillFrom: { from: 'customer', formula: 'phone' } },
		{ key: 'credit', kind: 'autofillreadonly', fills: 'number', required: true, fillFrom: { from: 'customer', formula: 'credit' } },
		{ key: 'items', kind: 'sectionlist', fields: [{ key: 'rate', kind: 'autofillreadonly', fills: 'number', fillFrom: { from: 'product', formula: 'rate' } }] },
	],
});
const script = new URL('../migrateAutofill.js', import.meta.url).pathname;
const run = (...args) => execFileSync('node', [script, ...args], { env: { ...process.env, MONGO_CONNECTION_URI: SMOKE_MONGO }, encoding: 'utf8' });
let out = run();
const kept = await col.findOne({ _id: legacy.insertedId });
ok('migration: a dry run changes nothing', kept.fields[0].kind === 'autofill' && /Dry run/.test(out), out.split('\n').slice(-3).join(' '));
out = run('--apply');
const mig = await col.findOne({ _id: legacy.insertedId });
ok('migration: the old kinds become their value kind', mig.fields[0].kind === 'text' && mig.fields[1].kind === 'number' && mig.fields[2].fields[0].kind === 'number', JSON.stringify(mig.fields));
ok('migration: read-only gets the setting, and is no longer required', mig.fields[1].fillFrom.readonly === true && mig.fields[1].required === undefined && mig.fields[2].fields[0].fillFrom.readonly === true && !mig.fields[0].fillFrom.readonly && mig.fields[0].fills === undefined, JSON.stringify(mig.fields));
out = run('--apply');
ok('migration: a re-run finds nothing', /0 field\(s\)/.test(out), out.split('\n').slice(-2).join(' '));
await col.deleteOne({ _id: legacy.insertedId });
await client.close();

done();
