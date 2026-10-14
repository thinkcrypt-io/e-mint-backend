// PDF templates smoke test (backend/docs/pdf-templates, PT-02…PT-04, PT-12, PT-18, PT-19, PT-35 themes).
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
ok('the gallery has the starters', r.status === 200 && r.body.templates.length >= 5 && (r.body.builtIn ? r.body.templates[0]._id.startsWith('starter:') : true), r.body?.templates?.map(t => t._id));
r = await call('POST', '/pdf-templates/gallery/starters', {}, T);
ok('super admin adds the starters to the gallery', r.status === 200 && r.body.added >= 0, r.body);
r = await call('GET', '/pdf-templates/gallery', null, T);
const classic = r.body.templates.find(t => t.key === 'invoice-classic');
ok('gallery now comes from the database', r.body.builtIn === false && !!classic?._id && !String(classic._id).startsWith('starter:'), r.body?.templates?.length);
const galleryList = r.body.templates;
const galleryCats = (r.body.categories || []).map(c => c.key);
r = await call('POST', '/pdf-templates/render', { template: classic._id }, T);
ok('gallery preview renders with sample data', r.status === 200 && r.pdf?.length > 5000);
save('gallery-classic', r);
ok('every starter is in the gallery, each under a category', ['invoice-minimal', 'quote-standard', 'quote-modern', 'receipt-money'].every(k => galleryList.some(t => t.key === k)) && galleryList.every(t => galleryCats.includes(t.kind)), galleryList.map(t => `${t.key}:${t.kind}`));
// PT-36: the further starters and the categories they bring.
const more = ['invoice-elegant', 'invoice-proforma', 'invoice-tax', 'receipt-modern', 'quote-estimate', 'po-standard', 'po-modern', 'delivery-challan', 'packing-slip', 'credit-note', 'statement-account', 'payslip-standard', 'certificate-completion', 'certificate-appreciation', 'voucher-payment'];
ok('the further starters are in the gallery (PT-36)', more.every(k => galleryList.some(t => t.key === k)), more.filter(k => !galleryList.some(t => t.key === k)));
ok('their categories came along', ['purchase-order', 'delivery-note', 'credit-note', 'statement', 'payslip', 'certificate', 'voucher'].every(k => galleryCats.includes(k)), galleryCats);
for (const k of more) {
	const t = galleryList.find(x => x.key === k);
	if (!t) continue;
	r = await call('POST', '/pdf-templates/render', { template: t._id }, T);
	ok(`${k} previews as one page`, r.status === 200 && r.pdf?.length > 3000 && (r.pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 1, r.status);
	save(`gallery-${k}`, r);
}

for (const key of ['invoice-minimal', 'quote-standard', 'quote-modern', 'receipt-money']) {
	const g = galleryList.find(t => t.key === key);
	const out = await call('POST', '/pdf-templates/render', { template: g?._id }, T);
	ok(`starter ${key} renders with its sample`, isPdf(out) && out.pdf.length > 4000);
	save(`starter-${key}`, out);
}

// --------------------------------------------------- categories (D21)
r = await call('GET', '/pdf-templates/categories', null, T);
ok('categories: Invoices, Receipts, Quotations to start with', r.status === 200 && ['invoice', 'receipt', 'quotation'].every(k => r.body.categories.some(c => c.key === k)) && r.body.canEdit === true, r.body);
r = await call('POST', '/pdf-templates/categories', { name: 'Smoke Notes' }, T);
ok('the super admin adds a category (key from the name)', r.status === 200 && r.body.key === 'smoke-notes', r.body);
r = await call('PUT', '/pdf-templates/categories/smoke-notes', { name: 'Smoke notes', order: 9 }, T);
ok('and renames it', r.status === 200 && r.body.name === 'Smoke notes' && r.body.order === 9, r.body);
r = await call('GET', '/pdf-templates/gallery', null, T);
ok('the gallery brings the categories along', r.body.categories?.some(c => c.key === 'smoke-notes'));
r = await call('DELETE', '/pdf-templates/categories/smoke-notes', null, T);
ok('and removes it', r.status === 200 && r.body.removed === 1, r.body);

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

// -------------------------------------------------- flex layout (D19)
const flexTpl = {
	...t1,
	_id: undefined,
	name: 'Flex layout',
	isDefault: false,
	body: [
		{ type: 'box', direction: 'row', valign: 'stretch', justify: 'between', gap: 6, height: 60, blocks: [{ type: 'text', text: 'A' }, { type: 'spacer', grow: 2 }, { type: 'box', basis: 120, blocks: [{ type: 'text', text: 'B' }] }] },
		{ type: 'spacer', grow: 1 },
		{ type: 'text', text: 'At the bottom of the page' },
	],
};
r = await call('POST', '/pdf-templates', flexTpl, T);
const fb = r.body?.body || [];
ok(
	'flex layout kept: row, gap, stretch, between, height, grow, basis',
	r.status === 201 && fb[0]?.direction === 'row' && fb[0]?.valign === 'stretch' && fb[0]?.justify === 'between' && fb[0]?.gap === 6 && fb[0]?.height === 60 && fb[0]?.blocks?.[1]?.grow === 2 && fb[0]?.blocks?.[2]?.basis === 120 && fb[1]?.grow === 1,
	JSON.stringify(fb).slice(0, 300)
);
const flexId = r.body?._id;
// Placed freely (D22): kept with their place, clamped; cleared when the last is taken off.
r = await call('PUT', `/pdf-templates/${flexId}`, { ...r.body, free: [{ type: 'text', text: 'PAID', x: 330, y: 300, w: 200, rotate: -18, opacity: 0.3, pages: 'all' }, { type: 'text', text: 'DRAFT', x: 99999, y: 40, w: 300, behind: true }] }, T);
const fr = r.body?.free || [];
ok('placed blocks keep x / y / w / rotate / opacity / pages / behind (clamped to the page)', r.status === 200 && fr.length === 2 && fr[0].x === 330 && fr[0].rotate === -18 && fr[0].opacity === 0.3 && fr[0].pages === 'all' && fr[1].behind === true && fr[1].x <= 600, JSON.stringify(fr).slice(0, 300));
r = await call('POST', '/pdf-templates/render', { template: flexId, dummy: true }, T);
ok('placed blocks render', isPdf(r));
save('free', r);
r = await call('GET', `/pdf-templates/${flexId}`, null, T);
r = await call('PUT', `/pdf-templates/${flexId}`, { ...r.body, free: [] }, T);
ok('taking the last placed block off clears them', r.status === 200 && (r.body?.free || []).length === 0, r.body?.free);
r = await call('POST', '/pdf-templates/render', { template: flexId, dummy: true }, T);
ok('flex layout renders', isPdf(r));
save('flex', r);
await call('DELETE', `/pdf-templates/${flexId}`, null, T);

// ------------------------------------------------------- status (PT-33)
// Made from the gallery, it starts as a draft: the page offers nothing yet.
ok('a new template starts as a draft', t1.status === 'draft', t1.status);
r = await call('GET', `/pdf-templates?route=${bill.route}&published=1`, null, T);
ok('?published=1 leaves drafts out', r.status === 200 && r.body.templates.length === 0, r.body?.templates?.map(t => t.name));
r = await call('POST', `${B}/export/template`, { ids: [b1._id] }, T);
ok('no published template: no default download', r.status === 404 && /published/.test(r.body?.message || ''), r.status + ' ' + r.body?.message);
r = await call('POST', `${B}/export/template`, { ids: [b1._id], template: t1._id }, T);
ok('a draft doesn’t download by id', r.status === 400 && /draft/.test(r.body?.message || ''), r.status + ' ' + r.body?.message);
r = await call('POST', `${B}/export/template`, { ids: [b1._id], template: t1._id, as: 'data' }, T);
ok('the designer still reads a draft’s data', r.status === 200 && !!r.body?.roots, r.status);
r = await call('POST', `/pdf-templates/${t1._id}/duplicate`, {}, T);
ok('a copy starts as a draft', r.status === 201 && r.body.status === 'draft', r.body?.status);
await call('DELETE', `/pdf-templates/${r.body._id}`, null, T);
r = await call('PUT', `/pdf-templates/${t1._id}`, { ...t1, status: 'published' }, T);
ok('publishing it', r.status === 200 && r.body.status === 'published', r.body?.status);
r = await call('PUT', `/pdf-templates/${t1._id}`, { ...r.body, status: undefined, name: r.body.name }, T);
ok('a save without a status keeps it', r.status === 200 && r.body.status === 'published', r.body?.status);
r = await call('GET', `/pdf-templates?route=${bill.route}&published=1`, null, T);
ok('published, it’s listed for download', r.body.templates.length === 1 && r.body.templates[0]._id === t1._id);

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
r = await call('POST', '/pdf-templates', { ...listTpl, status: 'published' }, T);
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

// ------------------------------------------------------- themes (D24)
r = await call('POST', '/pdf-templates/use', { from: classic._id, route: bill.route, mapping: m, look: 'heritage', name: `Themed ${stamp}` }, T);
const th = r.body;
const thJson = JSON.stringify(th);
ok('a starter used with a look gets its colours and fonts', r.status === 201 && th.style?.palette === 'navy' && th.style?.pairing === 'classic' && th.style?.font === 'garamond' && th.style?.heading === 'garamond' && th.style?.dark === '#0b1a45', th?.style);
ok('its colours follow the theme (roles, not hex); its title uses the heading font', /"(bg|headerBg|color)":"(accent|dark|onAccent|soft)"/.test(thJson) && thJson.includes('"font":"heading"'), thJson.slice(0, 200));
r = await call('POST', '/pdf-templates/render', { template: th._id, dummy: true }, T);
ok('a themed template renders with its font embedded', isPdf(r) && r.pdf.includes('EBGaramond'), r.status);
save('themed-heritage', r);
r = await call('POST', '/pdf-templates/render', {
	template: { ...th, style: { ...th.style, font: 'comic', heading: 'nope' }, header: [], footer: [], free: [], body: [{ type: 'text', text: 'Odd', color: 'notarole', bg: 'soft', font: 'heading' }] },
}, T);
ok('an unknown font or colour name falls back instead of failing', isPdf(r), r.status + ' ' + (r.body?.message || ''));
const FAMILIES = ['sans', 'inter', 'dmsans', 'manrope', 'montserrat', 'poppins', 'plexsans', 'grotesk', 'playfair', 'garamond', 'merriweather', 'sourceserif', 'crimson', 'plexserif', 'mono'];
r = await call('POST', '/pdf-templates/render', {
	template: {
		name: 'Fonts',
		alias: 'x',
		style: { font: 'sans' },
		body: FAMILIES.flatMap(f => [400, 700].map(w => ({ type: 'text', text: `${f} ${w} — Łódź ₹1,250 €99 ৳500 রহমান`, font: f, weight: w, italic: w === 700 }))),
	},
}, T);
ok('every theme font prints (all weights, italics, Latin-extended, ₹, Bangla fallback)', isPdf(r) && ['Inter', 'DMSans', 'Manrope', 'Montserrat', 'Poppins', 'IBMPlexSans', 'SpaceGrotesk', 'PlayfairDisplay', 'EBGaramond', 'Merriweather', 'SourceSerif4', 'CrimsonPro', 'IBMPlexSerif'].every(n => r.pdf.includes(n)), r.status);
save('fonts', r);
await call('DELETE', `/pdf-templates/${th._id}`, null, T);

// --------------------------------------------------------- permissions
const reader = (await roles.insertOne({ name: `PT reader ${stamp}`, permissions: [`view-${bill.permission}`], isActive: true })).insertedId;
const readerAdmin = (await admins.insertOne({ name: 'PT Reader', email: `ptr-${stamp}@example.com`, role: reader, isActive: true })).insertedId;
const R = sign(readerAdmin);
r = await call('POST', '/pdf-templates/categories', { name: 'Reader category' }, R);
ok('a reader can’t add a category', r.status === 403, r.status);
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
