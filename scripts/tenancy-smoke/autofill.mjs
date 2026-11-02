// Autofill fields (docs/autofill): Autofill and Autofill (read-only), end to end
// on an order picking a customer — builder checks, create, edit, re-pick,
// clear, a source record changing, bulk edit, and rows (AF-07).
// Stands alone (its own account). Local scratch server only.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const tok = (await call('POST', '/tenant/api/auth/register', { name: 'Afa', email: `afa${stamp}@example.com`, password: 'autofill-pass-123', organization: `Autofill Co ${stamp}`, country: 'BD' })).body.token;
const pid = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, tok)).body?._id;
const P = p => `/tenant/api/p/${pid}${p}`;
const make = body => call('POST', P('/builder/models'), body, tok);
const get = async (route, id) => (await call('GET', P(`/${route}/${id}`), null, tok)).body;
const iso = v => (v ? new Date(v).toISOString() : null);

let r = await make({ name: 'Customer', title: 'Customers', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'phone', label: 'Phone', kind: 'text' },
	{ key: 'email', label: 'Email', kind: 'email' },
	{ key: 'since', label: 'Since', kind: 'date' },
	{ key: 'credit', label: 'Credit', kind: 'number' },
	{ key: 'apiToken', label: 'Token', kind: 'password' },
] });
const customer = r.body?.doc;
ok('a Customer model', r.status === 201, JSON.stringify(r.body?.problems));

const orderFields = (extra, link = { key: 'customer', label: 'Customer', kind: 'reference', ref: 'Customer' }) => [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	link,
	...extra,
];
const af = (key, kind, from, formula, fills = 'text') => ({ key, label: key, kind, fillFrom: { from, formula }, fills });

r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([{ key: 'phone', label: 'Phone', kind: 'autofill' }]) });
ok('builder: an autofill without its link and field is refused', r.status === 400 && /pick the link/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'autofill', 'name', 'phone')]) });
ok('builder: it must copy from a link field', r.status === 400 && /isn't a link field/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('secret', 'autofillreadonly', 'customer', 'apiToken')]) });
ok('builder: a hidden field can’t be copied', r.status === 400 && /hidden/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body?.problems));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'autofill', 'customer', '')]) });
ok('builder: it must say what to take', r.status === 400, JSON.stringify(r.body?.problems));
r = await make({ name: 'Order', title: 'Orders', displayField: 'name', fields: orderFields([af('phone', 'autofill', 'customer', 'phone', 'text'), { ...af('email', 'autofillreadonly', 'customer', 'email'), required: true, default: 'x' }, af('since', 'autofillreadonly', 'customer', 'since', 'date'), af('credit', 'autofillreadonly', 'customer', 'credit', 'number'), af('left', 'autofillreadonly', 'customer', 'credit - 10', 'number')]) });
const order = r.body?.doc;
ok('an Order model with both kinds', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
const ef = k => order?.fields?.find(f => f.key === k);
ok('…kinds, links and value kinds kept', ef('phone')?.kind === 'autofill' && ef('email')?.kind === 'autofillreadonly' && ef('email')?.fillFrom?.from === 'customer' && ef('credit')?.fills === 'number' && ef('since')?.fills === 'date');
ok('…read-only is never required, no default', !ef('email')?.required && ef('email')?.default === undefined, JSON.stringify(ef('email')));

r = await call('GET', P(`/builder/route?route=${order?.route}`), null, tok);
const sf = k => ((r.body?.settings?.data || r.body?.code?.settings)?.fields || []).find(f => f.key === k);
ok('settings: autofill is editable, typed as what it copies', sf('phone')?.edit === true && sf('phone')?.schema?.type === 'autofill' && sf('phone')?.type === 'string', JSON.stringify(sf('phone')));
ok('settings: read-only isn’t editable and shows as a date / number', sf('email')?.edit === false && sf('email')?.schema?.type === 'autofillreadonly' && sf('since')?.type === 'date' && sf('credit')?.type === 'number' && sf('credit')?.schema?.viewType === 'number', JSON.stringify(sf('credit')));

r = await call('GET', P(`/${order.route}/get/config`), null, tok);
const formOf = k => (r.body?.form || []).find(f => f.name === k);
ok('form: autofill is a plain text input with its fill', formOf('phone')?.type === 'string' && formOf('phone')?.fillFrom?.formula === 'phone', JSON.stringify(formOf('phone')));
ok('form: read-only keeps its own type and the kind it holds', formOf('email')?.type === 'autofillreadonly' && formOf('email')?.fills === 'text' && formOf('credit')?.fills === 'number', JSON.stringify(formOf('email')));

const rahim = (await call('POST', P(`/${customer.route}`), { name: 'Rahim', phone: '0171', email: 'rahim@example.com', since: '2026-01-05', credit: 50 }, tok)).body?.doc;
const karim = (await call('POST', P(`/${customer.route}`), { name: 'Karim', phone: '0181', email: 'karim@example.com', since: '2026-02-05', credit: 20 }, tok)).body?.doc;

// Create — through the API, without the form.
r = await call('POST', P(`/${order.route}`), { name: 'O1', customer: rahim._id }, tok);
let o1 = r.body?.doc;
ok('create: both filled from the customer', r.status === 201 && o1?.phone === '0171' && o1?.email === 'rahim@example.com', `${r.status} ${JSON.stringify(o1)} ${r.body?.message}`);
ok('create: a date and a number keep their kind', iso(o1?.since) === '2026-01-05T00:00:00.000Z' && o1?.credit === 50, `${o1?.since} ${o1?.credit}`);
ok('create: a formula over the customer’s numbers', o1?.left === 40, o1?.left);
r = await call('POST', P(`/${order.route}`), { name: 'O2', customer: rahim._id, phone: '0199', email: 'mine@example.com' }, tok);
let o2 = r.body?.doc;
ok('create: a typed phone is kept', r.status === 201 && o2?.phone === '0199', `${r.status} ${o2?.phone}`);
ok('create: a read-only value sent is ignored', o2?.email === 'rahim@example.com', o2?.email);
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
r = await call('PUT', P(`/${order.route}/${o1._id}`), { email: 'hack@example.com' }, tok);
A = await get(order.route, o1._id);
ok('edit: the read-only value can’t be changed', A.email === 'rahim@example.com', `${r.status} ${A.email} ${r.body?.message}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { customer: karim._id }, tok);
A = await get(order.route, o1._id);
ok('re-pick: a different customer replaces the typed phone and the email', r.status === 200 && A.phone === '0181' && A.email === 'karim@example.com' && A.credit === 20, `${r.status} ${A.phone} ${A.email}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { customer: rahim._id, phone: '0555' }, tok);
A = await get(order.route, o1._id);
ok('re-pick: a phone sent with it wins; the email follows the pick', A.phone === '0555' && A.email === 'rahim@example.com', `${A.phone} ${A.email}`);
r = await call('PUT', P(`/${order.route}/${o1._id}`), { customer: '' }, tok);
A = await get(order.route, o1._id);
ok('clear: the link cleared empties the read-only fields, keeps the phone', r.status === 200 && !A.email && !A.credit && A.phone === '0555', `${r.status} ${JSON.stringify([A.email, A.credit, A.phone])}`);
await call('PUT', P(`/${order.route}/${o1._id}`), { customer: rahim._id, phone: '0555' }, tok);

// The source record changes.
r = await call('PUT', P(`/${customer.route}/${rahim._id}`), { email: 'rahim.new@example.com', phone: '0172', credit: 70 }, tok);
ok('the customer is edited', r.status === 200, r.body?.message);
A = await get(order.route, o1._id);
const B = await get(order.route, o2._id);
ok('follow: read-only copies change with the customer', A.email === 'rahim.new@example.com' && B.email === 'rahim.new@example.com' && A.credit === 70 && A.left === 60, `${A.email} ${B.email} ${A.credit} ${A.left}`);
ok('follow: typed phones stay', B.phone === '0199' && A.phone === '0555', `${A.phone} ${B.phone}`);
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
// Deleting the customer leaves the copies.
r = await call('DELETE', P(`/${customer.route}/${karim._id}`), null, tok);
const F = await get(order.route, o3._id);
ok('a deleted customer leaves the copies as they are', F.email === 'karim@example.com', `${r.status} ${F.email}`);

// Rows (AF-07): an invoice item's product fills its rate, per row.
r = await make({ name: 'Product', title: 'Products', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'rate', label: 'Rate', kind: 'number' },
	{ key: 'unit', label: 'Unit', kind: 'text' },
] });
const product = r.body?.doc;
r = await make({ name: 'Invoice', title: 'Invoices', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'items', label: 'Items', kind: 'sectionlist', fields: [
		{ key: 'product', label: 'Product', kind: 'reference', ref: 'Product' },
		{ key: 'unit', label: 'Unit', kind: 'autofill', fillFrom: { from: 'product', formula: 'unit' }, fills: 'text' },
		{ key: 'rate', label: 'Rate', kind: 'autofillreadonly', fillFrom: { from: 'product', formula: 'rate' }, fills: 'number' },
		{ key: 'qty', label: 'Qty', kind: 'number' },
		{ key: 'total', label: 'Total', kind: 'formula', formula: 'qty * rate' },
	] },
] });
const invoice = r.body?.doc;
ok('rows: an Invoice with autofill inside its items', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
const pen = (await call('POST', P(`/${product.route}`), { name: 'Pen', rate: 12, unit: 'pcs' }, tok)).body?.doc;
const ink = (await call('POST', P(`/${product.route}`), { name: 'Ink', rate: 40, unit: 'bottle' }, tok)).body?.doc;
r = await call('POST', P(`/${invoice.route}`), { name: 'I1', items: [{ product: pen._id, qty: 3 }, { product: ink._id, qty: 2, unit: 'big bottle', rate: 1 }, { qty: 1 }] }, tok);
let i1 = r.body?.doc;
ok('rows: each row filled from its own product', r.status === 201 && i1?.items?.[0]?.unit === 'pcs' && i1.items[0].rate === 12 && i1.items[1].rate === 40 && i1.items[1].unit === 'big bottle', `${r.status} ${JSON.stringify(i1?.items)} ${r.body?.message}`);
ok('rows: a row formula uses the filled value', i1?.items?.[0]?.total === 36 && i1?.items?.[1]?.total === 80, JSON.stringify(i1?.items?.map(x => x.total)));
ok('rows: a row without a product is left empty', i1?.items?.[2] && !i1.items[2].unit && !i1.items[2].rate);
await call('PUT', P(`/${product.route}/${pen._id}`), { rate: 15 }, tok);
i1 = await get(invoice.route, i1._id);
ok('rows: a read-only rate follows its product, the typed unit stays', i1.items[0].rate === 15 && i1.items[0].total === 45 && i1.items[1].unit === 'big bottle' && i1.items[1].rate === 40, JSON.stringify(i1.items));

done();
