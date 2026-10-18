// Formulas that read a linked record's number (`tax.amount`) and use a field more than once.
// Builder checks, create, edit, re-link, bulk edit, a formula changed (every record recalculated), the public API.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load(); // from projects.mjs: pat (Initech, crm)
const P = path => `/tenant/api/p/${s.crm}${path}`;
const t = Date.now().toString(36);
const make = async body => call('POST', P('/builder/models'), body, s.pat);

let r = await make({ name: `Tax${t}`, title: `Taxes ${t}`, displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'amount', label: 'Amount', kind: 'number' },
] });
const tax = r.body?.doc;
ok('a Tax model', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);

r = await call('GET', P('/builder/models/options'), null, s.pat);
const target = (r.body?.targets || []).find(x => x.name === tax?.name);
ok('link targets list its number fields (a text one only marked as text)', target?.numbers?.some(n => n.key === 'amount' && !n.text) && target.numbers.every(n => n.key !== 'name' || n.text), JSON.stringify(target?.numbers));

const invoiceFields = formula => [
	{ key: 'price', label: 'Price', kind: 'number' },
	{ key: 'qty', label: 'Quantity', kind: 'number' },
	{ key: 'tax', label: 'Tax', kind: 'reference', ref: tax?.name },
	{ key: 'total', label: 'Total', kind: 'formula', formula },
];
r = await make({ name: `Bill${t}`, title: `Bills ${t}`, fields: invoiceFields('price * qty + tax.nope') });
ok('a linked field that isn’t there is refused', r.status === 400 && /tax\.nope/.test(JSON.stringify(r.body)), `${r.status} ${JSON.stringify(r.body?.problems)}`);
r = await make({ name: `Bill${t}`, title: `Bills ${t}`, fields: invoiceFields('price * qty + tax.name') });
ok('…and one that isn’t a number', r.status === 400 && /tax\.name/.test(JSON.stringify(r.body)), `${r.status} ${JSON.stringify(r.body?.problems)}`);
r = await make({ name: `Bill${t}`, title: `Bills ${t}`, fields: invoiceFields('price * qty + tax.amount + price') });
const bill = r.body?.doc;
ok('a formula using a linked number and a field twice', r.status === 201 && bill?.fields?.find(f => f.key === 'total')?.formula === 'price * qty + tax.amount + price', `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);

const tx = async (name, amount) => (await call('POST', P(`/${tax.route}`), { name, amount }, s.pat)).body?.doc;
const vat = await tx('VAT', 12);
const low = await tx('Low', 5);
const save = body => call('POST', P(`/${bill.route}`), body, s.pat);
const total = async id => (await call('GET', P(`/${bill.route}/${id}`), null, s.pat)).body?.total;

r = await save({ price: 10, qty: 2, tax: vat._id });
const id = r.body?.doc?._id;
ok('create: 10 × 2 + VAT 12 + 10 = 42', r.status === 201 && r.body?.doc?.total === 42, `${r.status} ${r.body?.doc?.total ?? r.body?.message}`);
r = await save({ price: 10, qty: 2 });
ok('no tax picked: counts as 0 → 30', r.status === 201 && r.body?.doc?.total === 30, `${r.status} ${r.body?.doc?.total ?? r.body?.message}`);
const noTax = r.body?.doc?._id;

r = await call('PUT', P(`/${bill.route}/${id}`), { tax: low._id }, s.pat);
ok('edit: another tax → 35', r.status === 200 && (await total(id)) === 35, `${r.status} ${await total(id)}`);
r = await call('PUT', P(`/${bill.route}/${id}`), { price: 20 }, s.pat);
ok('edit: another price, same tax → 20 × 2 + 5 + 20 = 65', r.status === 200 && (await total(id)) === 65, `${r.status} ${await total(id)}`);
r = await call('PUT', P(`/${bill.route}/${id}`), { tax: '' }, s.pat);
ok('edit: tax cleared → 60', r.status === 200 && (await total(id)) === 60, `${r.status} ${r.body?.message || ''} ${await total(id)}`);

r = await call('PUT', P(`/${bill.route}/update/many`), { ids: [id, noTax], updates: { tax: vat._id } }, s.pat);
ok('bulk edit: both get VAT → 72 and 42', r.status === 200 && (await total(id)) === 72 && (await total(noTax)) === 42, `${r.status} ${r.body?.message || ''} ${await total(id)} ${await total(noTax)}`);

r = await call('PUT', P(`/builder/models/${bill._id}`), { title: bill.title, fields: invoiceFields('tax.amount * 2') }, s.pat);
ok('the formula changed → every record recalculated (24, 24)', r.status === 200 && (await total(id)) === 24 && (await total(noTax)) === 24, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message || '')} ${await total(id)} ${await total(noTax)}`);

/* ---- the linked record changes: everything reading it follows */
const putTax = (taxId, body) => call('PUT', P(`/${tax.route}/${taxId}`), body, s.pat);
r = await putTax(vat._id, { amount: 20 });
ok('the Tax’s amount edited → both bills recalculated (40, 40)', r.status === 200 && (await total(id)) === 40 && (await total(noTax)) === 40, `${r.status} ${r.body?.message || ''} ${await total(id)} ${await total(noTax)}`);
r = await call('PUT', P(`/${tax.route}/update/many`), { ids: [vat._id], updates: { amount: 15 } }, s.pat);
ok('…by a bulk edit too (30, 30)', r.status === 200 && (await total(id)) === 30 && (await total(noTax)) === 30, `${r.status} ${r.body?.message || ''} ${await total(id)} ${await total(noTax)}`);

// One further: a Payment reads the bill's total (a formula itself) — and the Tax reads a bill back, a loop.
r = await make({ name: `Pay${t}`, title: `Payments ${t}`, fields: [
	{ key: 'paid', label: 'Paid', kind: 'number' },
	{ key: 'bill', label: 'Bill', kind: 'reference', ref: bill.name },
	{ key: 'due', label: 'Due', kind: 'formula', formula: 'bill.total - paid' },
] });
const pay = r.body?.doc;
ok('a Payment model reading bill.total', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('POST', P(`/${pay?.route}`), { paid: 5, bill: id }, s.pat);
const payId = r.body?.doc?._id;
const due = async () => (await call('GET', P(`/${pay.route}/${payId}`), null, s.pat)).body?.due;
ok('payment: 30 − 5 = 25', r.status === 201 && r.body?.doc?.due === 25, `${r.status} ${r.body?.doc?.due ?? r.body?.message}`);
r = await call('PUT', P(`/builder/models/${tax._id}`), { title: tax.title, displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'amount', label: 'Amount', kind: 'number' },
	{ key: 'bill', label: 'Bill', kind: 'reference', ref: bill.name },
	{ key: 'share', label: 'Share', kind: 'formula', formula: 'bill.total / 2' },
] }, s.pat);
ok('the Tax reads a bill back (a loop: Bill → Tax → Bill)', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await putTax(vat._id, { bill: id });
ok('…the VAT reads the first bill: 30 / 2 = 15', r.status === 200 && r.body?.doc?.share === 15, `${r.status} ${r.body?.doc?.share ?? r.body?.message}`);
const started = Date.now();
r = await putTax(vat._id, { amount: 20 });
const vatNow = (await call('GET', P(`/${tax.route}/${vat._id}`), null, s.pat)).body;
ok('the Tax edited again → bills 40, payment 35, the VAT’s share 20 — and the loop ends', r.status === 200 && (await total(id)) === 40 && (await total(noTax)) === 40 && (await due()) === 35 && vatNow?.share === 20, `${r.status} ${r.body?.message || ''} ${await total(id)} ${await total(noTax)} due ${await due()} share ${vatNow?.share} (${Date.now() - started} ms)`);
r = await putTax(vat._id, { name: 'VAT' });
ok('a field no formula reads: nothing else changes', r.status === 200 && (await total(id)) === 40 && (await due()) === 35, `${r.status} ${await total(id)} ${await due()}`);

r = await call('DELETE', P(`/${tax.route}/${vat._id}`), null, s.pat);
ok('the Tax deleted → its bills read 0 for it (0, 0), the payment 0 − 5 = −5', r.status === 200 && (await total(id)) === 0 && (await total(noTax)) === 0 && (await due()) === -5, `${r.status} ${r.body?.message || ''} ${await total(id)} ${await total(noTax)} due ${await due()}`);

/* ---- the public API */
r = await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat);
const slug = r.body?.publicSlug;
r = await call('PUT', P(`/builder/models/${bill._id}/public-api`), { enabled: true, actions: ['create', 'get'], auth: 'none' }, s.pat);
ok('public API on', r.status === 200, r.body?.message);
r = await fetch(`${ROOT}/public/api/${slug}/${bill.route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ price: 1, tax: low._id }) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
ok('public create reads the linked tax → 10', r.status === 201 && (r.body?.doc ?? r.body)?.total === 10, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

await call('DELETE', P(`/builder/models/${pay?._id}?dropData=true`), null, s.pat);
// The Tax and the Bill link each other: the Tax's link goes first, so either can be deleted.
await call('PUT', P(`/builder/models/${tax?._id}`), { title: tax?.title, displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'amount', label: 'Amount', kind: 'number' },
] }, s.pat);
for (const m of [bill, tax]) {
	r = await call('DELETE', P(`/builder/models/${m?._id}?dropData=true`), null, s.pat);
	ok(`cleanup: ${m?.name} deleted`, r.status === 200, `${r.status} ${r.body?.message || ''}`);
}
done();
