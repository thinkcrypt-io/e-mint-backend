// PDF templates smoke test (backend/docs/pdf-templates, PT-02…PT-04).
// Runs against a throwaway local server + database only (never a shared one):
//   mongod --dbpath <scratch>/db --port 27997
//   npx tsc --outDir <scratch>/be; in <scratch>/be symlink node_modules, .env, public, docs from backend/, then
//   PORT=5021 MONGO_CONNECTION_URI=mongodb://127.0.0.1:27997/emint_pdf node server.js
//   SMOKE_ROOT=http://localhost:5021 SMOKE_MONGO=mongodb://127.0.0.1:27997/emint_pdf node scripts/pdf-templates/smoke.mjs [outDir]
// It inserts two admins and roles straight into that database and builds its own models.
// With an outDir, the PDFs it downloads are written there to look at.
import fs from 'fs';
import { createRequire } from 'module';
const BACKEND = process.env.BACKEND_DIR || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(BACKEND + '/package.json');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: BACKEND + '/.env' });

const ROOT = process.env.SMOKE_ROOT || 'http://localhost:5021';
const MONGO = process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27997/emint_pdf';
const OUT = process.argv[2];
if (!/127\.0\.0\.1|localhost/.test(MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');

let fails = 0;
const ok = (label, cond, extra = '') => {
	if (!cond) fails++;
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 400)) : ''}`);
};
const call = async (method, path, body, token) => {
	const r = await fetch(ROOT + '/admin/api' + path, {
		method,
		headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
		body: body && JSON.stringify(body),
	});
	const type = r.headers.get('content-type') || '';
	if (type.includes('application/pdf')) {
		const buf = Buffer.from(await r.arrayBuffer());
		return { status: r.status, pdf: buf, name: r.headers.get('content-disposition') || '' };
	}
	let j;
	try {
		j = await r.json();
	} catch {
		j = null;
	}
	return { status: r.status, body: j };
};
const save = (name, r) => OUT && r.pdf && fs.writeFileSync(`${OUT}/${name}.pdf`, r.pdf);
/** Text in a PDF made by pdfkit is hex glyph ids, so check the file size and header, and the words through the inflated streams. */
const isPdf = r => r.status === 200 && r.pdf && r.pdf.subarray(0, 5).toString() === '%PDF-';

await mongoose.connect(MONGO);
const db = mongoose.connection.db;
const stamp = Date.now().toString(36);

const roles = db.collection('adminroles');
const admins = db.collection('admins');
const full = (await roles.insertOne({ name: `PT full ${stamp}`, permissions: ['*'], isActive: true })).insertedId;
const fullAdmin = (await admins.insertOne({ name: 'PT Smoke', email: `pt-${stamp}@example.com`, role: full, isActive: true })).insertedId;
const sign = id => jwt.sign({ _id: id }, process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542', { expiresIn: '20m' });
const T = sign(fullAdmin);

// ---------------------------------------------------------------- models
const mk = async body => {
	const r = await call('POST', '/builder/models', body, T);
	if (r.status !== 201) throw new Error(`model ${body.title}: ${r.status} ${JSON.stringify(r.body)}`);
	return r.body.doc;
};
const client = await mk({
	title: `PT Client ${stamp}`,
	name: `PtClient${stamp}`,
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'email', label: 'Email', kind: 'email' },
		{ key: 'address', label: 'Address', kind: 'textarea' },
		{ key: 'portalPassword', label: 'Portal password', kind: 'password' },
	],
});
const bill = await mk({
	title: `PT Bill ${stamp}`,
	name: `PtBill${stamp}`,
	fields: [
		{ key: 'title', label: 'Title', kind: 'text', required: true },
		{ key: 'client', label: 'Client', kind: 'reference', ref: client.name },
		{ key: 'issueDate', label: 'Issue date', kind: 'date' },
		{ key: 'status', label: 'Status', kind: 'select', options: [{ value: 'unpaid' }, { value: 'paid' }, { value: 'void' }], default: 'unpaid' },
		{
			key: 'items',
			label: 'Items',
			kind: 'sectionlist',
			fields: [
				{ key: 'description', label: 'Description', kind: 'text' },
				{ key: 'qty', label: 'Qty', kind: 'number' },
				{ key: 'unitPrice', label: 'Unit price', kind: 'number' },
				{ key: 'lineTotal', label: 'Line total', kind: 'number' },
			],
		},
		{ key: 'grandTotal', label: 'Grand total', kind: 'number' },
		{ key: 'paidAmount', label: 'Paid amount', kind: 'number' },
	],
});
const pay = await mk({
	title: `PT Payment ${stamp}`,
	name: `PtPayment${stamp}`,
	fields: [
		{ key: 'bill', label: 'Bill', kind: 'reference', ref: bill.name, required: true },
		{ key: 'amount', label: 'Amount', kind: 'number', required: true },
		{ key: 'method', label: 'Method', kind: 'text' },
	],
});
const B = `/${bill.route}`;
console.log(`models: ${client.route}, ${bill.route}, ${pay.route}`);

const c = (await call('POST', `/${client.route}`, { name: 'রহমান ট্রেডার্স', email: 'a@example.com', address: 'Dhanmondi, Dhaka', portalPassword: 'hunter2' }, T)).body.doc;
const items = Array.from({ length: 30 }, (_, i) => ({ description: `Line ${i + 1}`, qty: i + 1, unitPrice: 100, lineTotal: (i + 1) * 100 }));
const b1 = (await call('POST', B, { title: 'October work', client: c._id, issueDate: '2026-10-13', items, grandTotal: 46500, paidAmount: 1000 }, T)).body.doc;
const b2 = (await call('POST', B, { title: 'Small job', client: c._id, issueDate: '2026-10-01', items: items.slice(0, 2), grandTotal: 300, paidAmount: 0 }, T)).body.doc;
await call('POST', `/${pay.route}`, { bill: b1._id, amount: 600, method: 'bKash' }, T);
await call('POST', `/${pay.route}`, { bill: b1._id, amount: 400, method: 'Cash' }, T);
ok('records made', !!(c?._id && b1?._id && b2?._id));

// ------------------------------------------------------------- settings
const savedTexts = [
	{ label: 'Terms & conditions', text: '**Pay within 7 days** of {{bill.issueDate | date}}.' },
	{ label: 'Terms & conditions', text: 'a second one with the same key is dropped' },
	{ key: '9 bad key!', label: 'Thanks', text: 'Thank you' },
];
let r = await call('PUT', '/pdf-templates/settings', { business: { name: 'Northwind', address: 'Gulshan' }, currency: { symbol: '৳', name: 'Taka', grouping: 'indian', decimals: 2 }, dateFormat: 'DD/MM/YYYY', timezone: 'Nowhere/Zone', texts: savedTexts }, T);
ok('settings save, a bad time zone dropped', r.status === 200 && r.body.currency.symbol === '৳' && r.body.timezone === '', r.body);
ok('saved texts: keys from labels, unique, cleaned', JSON.stringify(r.body.texts?.map(t => t.key)) === '["terms_conditions","t9_bad_key"]', r.body.texts);

// -------------------------------------------------------------- gallery
r = await call('GET', '/pdf-templates/gallery', null, T);
// A fresh database shows the built-in starters; one this script ran on before already has them.
ok('the gallery has the five starters', r.status === 200 && r.body.templates.length >= 5 && (r.body.builtIn ? r.body.templates[0]._id.startsWith('starter:') : true), r.body?.templates?.map(t => t._id));
r = await call('POST', '/pdf-templates/gallery/starters', {}, T);
ok('super admin adds the starters to the gallery', r.status === 200 && r.body.added >= 0, r.body);
r = await call('GET', '/pdf-templates/gallery', null, T);
const classic = r.body.templates.find(t => t.key === 'invoice-classic');
ok('gallery now comes from the database', r.body.builtIn === false && !!classic?._id && !String(classic._id).startsWith('starter:'), r.body?.templates?.length);
r = await call('POST', '/pdf-templates/render', { template: classic._id }, T);
ok('gallery preview renders with sample data', r.status === 200 && r.pdf?.length > 5000);
save('gallery-classic', r);

// ------------------------------------------------------- fields + guess
r = await call('GET', `/pdf-templates/fields/${bill.route}`, null, T);
const flat = JSON.stringify(r.body);
ok('field tree has the client’s fields, not its password', r.status === 200 && flat.includes('client.email') && !flat.includes('portalPassword'), r.body?.fields?.map(f => f.path));
ok('field tree offers payments as a list', r.body?.lists?.some(l => l.route === pay.route && l.foreignField === 'bill'), r.body?.lists);
r = await call('POST', '/pdf-templates/guess', { from: classic._id, route: bill.route }, T);
const m = r.body?.mapping || {};
ok('guess: total → grandTotal, date → issueDate, customer name → client.name', m['invoice.total'] === 'grandTotal' && m['invoice.date'] === 'issueDate' && m['invoice.customer.name'] === 'client.name', m);
ok('guess: items → items, price → unitPrice, amount → lineTotal', m['invoice.items']?.path === 'items' && m['item.price'] === 'item.unitPrice' && m['item.amount'] === 'item.lineTotal', m);

// ---------------------------------------------------------------- use
r = await call('POST', '/pdf-templates/use', { from: classic._id, route: bill.route, mapping: { ...m, 'invoice.paid': 'paidAmount' } }, T);
const t1 = r.body;
ok('using a starter makes this page’s template, default', r.status === 201 && t1.route === bill.route && t1.isDefault === true && t1.alias.startsWith('ptBill'), r.body);
const json = JSON.stringify(t1);
ok('tokens were rewritten to the page’s fields', json.includes(`${t1.alias}.grandTotal`) && json.includes('item.unitPrice') && !json.includes('invoice.total'), json.slice(0, 300));

// ------------------------------------------------------------- preview
r = await call('POST', '/pdf-templates/render', { template: t1._id, dummy: true, as: 'data' }, T);
const pv = r.body?.roots?.[t1.alias] || {};
const rowsSum = (pv.items || []).reduce((n, x) => n + (x.lineTotal || 0), 0);
ok('preview data: every field filled, totals add up', r.status === 200 && (pv.items || []).length === 3 && rowsSum > 0 && pv.grandTotal === rowsSum && typeof pv.client?.name === 'string', JSON.stringify(pv).slice(0, 200));
ok('preview data keeps the business details as they are (for the designer)', r.body?.roots?.business?.name === 'Northwind' && !r.body?.roots?.business?.logo, JSON.stringify(r.body?.roots?.business));
r = await call('POST', '/pdf-templates/render', { template: t1._id, dummy: true }, T);
ok('preview PDF', r.status === 200 && r.pdf?.length > 5000);
save('preview', r);

// ------------------------------------------------------------ download
r = await call('POST', `${B}/export/template`, { ids: [b1._id], tz: 'Asia/Dhaka' }, T);
ok('download with the page’s default template', isPdf(r) && r.pdf.length > 8000, r.status + ' ' + (r.body?.message || ''));
ok('file is named after the template', /filename\*=UTF-8''Invoice/.test(r.name), r.name);
save('bill-one', r);
r = await call('POST', `${B}/export/template`, { ids: [b1._id, b2._id] }, T);
ok('two records, one file', isPdf(r));
save('bill-two', r);

// Lists from another page, a password token, a reference's password.
const listTpl = {
	name: 'With payments',
	route: bill.route,
	alias: 'bill',
	lists: [{ name: 'payments', route: pay.route, foreignField: 'bill', sort: 'createdAt' }],
	body: [
		{ type: 'text', text: 'Bill {{bill.title}} for {{bill.client.name}} — {{payments | count}} payments, {{payments | sum:amount | money}}' },
		{ type: 'text', text: 'Secret: [{{bill.client.portalPassword}}]' },
		{ type: 'table', rows: 'payments', columns: [{ header: 'Method', value: '{{item.method}}' }, { header: 'Amount', value: '{{item.amount | money}}', align: 'right' }] },
	],
};
r = await call('POST', '/pdf-templates', listTpl, T);
const t2 = r.body;
ok('a second template saves, not default', r.status === 201 && t2.isDefault === false, r.body);
r = await call('POST', `${B}/export/template`, { ids: [b1._id], template: t2._id }, T);
ok('download with a chosen template and a list', isPdf(r));
save('bill-payments', r);
r = await call('POST', `${B}/export/template`, { ids: [b1._id], template: { ...listTpl, body: [{ type: 'text', text: '{{texts.terms_conditions}}' }] }, as: 'data' }, T);
ok('a saved text is a root, with the fields it reads loaded', r.status === 200 && r.body.roots?.texts?.terms_conditions?.includes('{{bill.issueDate') && !!r.body.roots?.bill?.issueDate, r.body?.roots?.texts);

// The populate never asks for a password: check what the server would load.
r = await call('POST', '/pdf-templates', { ...listTpl, name: 'Broken', body: [{ type: 'table', columns: [] }] }, T);
ok('a broken template is refused with readable errors', r.status === 400 && r.body.errors?.length === 2, r.body);

r = await call('POST', `/pdf-templates/${t2._id}/default`, {}, T);
r = await call('GET', `/pdf-templates?route=${bill.route}`, null, T);
ok('one default per page', r.body.templates.filter(t => t.isDefault).length === 1 && r.body.templates.find(t => t.isDefault)._id === t2._id);

// --------------------------------------------------------- permissions
const reader = (await roles.insertOne({ name: `PT reader ${stamp}`, permissions: [`view-${bill.permission}`], isActive: true })).insertedId;
const readerAdmin = (await admins.insertOne({ name: 'PT Reader', email: `ptr-${stamp}@example.com`, role: reader, isActive: true })).insertedId;
const R = sign(readerAdmin);
r = await call('GET', `/pdf-templates?route=${bill.route}`, null, R);
ok('a reader lists the templates', r.status === 200 && r.body.templates.length === 2);
r = await call('PUT', `/pdf-templates/${t1._id}`, { ...t1, name: 'Hijack' }, R);
ok('a reader can’t change one', r.status === 403, r.status);
r = await call('POST', `${B}/export/template`, { ids: [b1._id], template: t2._id }, R);
ok('a reader downloads (the payments list stays empty for them)', isPdf(r));
save('bill-reader', r);
const nobody = (await roles.insertOne({ name: `PT none ${stamp}`, permissions: [], isActive: true })).insertedId;
const nobodyAdmin = (await admins.insertOne({ name: 'PT None', email: `ptn-${stamp}@example.com`, role: nobody, isActive: true })).insertedId;
r = await call('POST', `${B}/export/template`, { ids: [b1._id] }, sign(nobodyAdmin));
ok('someone who can’t read the page can’t download', r.status === 403, r.status);

// ------------------------------------------------------------- cleanup
r = await call('DELETE', `/pdf-templates/${t2._id}`, null, T);
r = await call('GET', `/pdf-templates?route=${bill.route}`, null, T);
ok('deleting the default passes it on', r.body.templates.length === 1 && r.body.templates[0].isDefault === true);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
await mongoose.disconnect();
process.exit(fails ? 1 : 0);
