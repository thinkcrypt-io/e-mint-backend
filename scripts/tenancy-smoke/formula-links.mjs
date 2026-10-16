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
ok('link targets list its number fields', target?.numbers?.some(n => n.key === 'amount') && !target.numbers.some(n => n.key === 'name'), JSON.stringify(target?.numbers));

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

/* ---- the public API */
r = await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat);
const slug = r.body?.publicSlug;
r = await call('PUT', P(`/builder/models/${bill._id}/public-api`), { enabled: true, actions: ['create', 'get'], auth: 'none' }, s.pat);
ok('public API on', r.status === 200, r.body?.message);
r = await fetch(`${ROOT}/public/api/${slug}/${bill.route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ price: 1, tax: low._id }) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
ok('public create reads the linked tax → 10', r.status === 201 && (r.body?.doc ?? r.body)?.total === 10, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

await call('DELETE', P(`/builder/models/${bill?._id}?dropData=true`), null, s.pat);
await call('DELETE', P(`/builder/models/${tax?._id}?dropData=true`), null, s.pat);
done();
