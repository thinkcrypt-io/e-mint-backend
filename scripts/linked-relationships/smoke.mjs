// Linked Relationships smoke test (backend/docs/linked-relationships, LU-01/02/08/09).
// Runs against a throwaway local server + database only (never a shared one):
//   mongod --dbpath <scratch> --port 27997
//   npx tsc --outDir <scratch>/be/dist, then from <scratch>/be (node_modules, .env, docs, public symlinked):
//   PORT=5021 MONGO_CONNECTION_URI=mongodb://127.0.0.1:27997/emint_linked node dist/server.js
//   SMOKE_ROOT=http://localhost:5021 SMOKE_MONGO=mongodb://127.0.0.1:27997/emint_linked node scripts/linked-relationships/smoke.mjs
// It inserts two admins and roles straight into that database and builds its own models.
import { createRequire } from 'module';
const BACKEND = process.env.BACKEND_DIR || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(BACKEND + '/package.json');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: BACKEND + '/.env' });

const ROOT = process.env.SMOKE_ROOT || 'http://localhost:5021';
const MONGO = process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27997/emint_linked';
if (!/127\.0\.0\.1|localhost/.test(MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');

let fails = 0;
const ok = (label, cond, extra = '') => {
	if (!cond) fails++;
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`);
};
const call = async (method, path, body, token) => {
	const r = await fetch(ROOT + '/admin/api' + path, {
		method,
		headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
		body: body && JSON.stringify(body),
	});
	let j;
	try {
		j = await r.json();
	} catch {
		j = null;
	}
	return { status: r.status, body: j };
};

await mongoose.connect(MONGO);
const db = mongoose.connection.db;
const stamp = Date.now().toString(36);

// Two admins: one may do everything, one may add payments but only read invoices.
const roles = db.collection('adminroles');
const admins = db.collection('admins');
const full = (await roles.insertOne({ name: `LR full ${stamp}`, permissions: ['*'], isActive: true })).insertedId;
const fullAdmin = (await admins.insertOne({ name: 'LR Smoke', email: `lr-${stamp}@example.com`, role: full, isActive: true })).insertedId;
const T = jwt.sign({ _id: fullAdmin }, process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542', { expiresIn: '20m' });

// ---------------------------------------------------------------- the models
const mk = async body => {
	const r = await call('POST', '/builder/models', body, T);
	if (r.status !== 201) throw new Error(`model ${body.title}: ${r.status} ${JSON.stringify(r.body)}`);
	return r.body.doc;
};
const inv = await mk({
	title: `LR Invoice ${stamp}`,
	name: `LrInvoice${stamp}`,
	fields: [
		{ key: 'title', label: 'Title', kind: 'text', required: true },
		{ key: 'total', label: 'Total', kind: 'number' },
		{ key: 'status', label: 'Status', kind: 'select', options: [{ value: 'unpaid' }, { value: 'paid' }, { value: 'cancelled' }], default: 'unpaid' },
		{ key: 'paymentDate', label: 'Payment date', kind: 'date' },
		{ key: 'paidAmount', label: 'Paid amount', kind: 'number', default: 0 },
		{ key: 'lastPaymentNote', label: 'Last payment note', kind: 'text' },
	],
});
const pay = await mk({
	title: `LR Payment ${stamp}`,
	name: `LrPayment${stamp}`,
	fields: [
		{ key: 'invoice', label: 'Invoice', kind: 'reference', ref: inv.name, required: true },
		{ key: 'amount', label: 'Amount', kind: 'number', required: true },
		{ key: 'paymentDate', label: 'Payment date', kind: 'date' },
		{ key: 'markPaid', label: 'Mark as paid', kind: 'boolean' },
		{ key: 'note', label: 'Note', kind: 'text' },
	],
});
const I = `/${inv.route}`;
const P = `/${pay.route}`;
console.log(`models: ${inv.route}, ${pay.route}`);

const configOf = async route => {
	const r = await call('GET', `/builder/route?route=${route}`, null, T);
	return r.body?.config?.data || r.body?.code?.config || {};
};
const publishRules = async (route, rules) => {
	const draft = { ...(await configOf(route)), linkedRelationships: rules };
	const d = await call('PUT', '/builder/draft', { route, kind: 'config', draft }, T);
	if (d.status !== 200) return d;
	return call('POST', '/builder/publish', { route, kinds: ['config'] }, T);
};

const markPaid = {
	id: 'mark-paid',
	name: 'Mark invoice paid',
	when: [{ field: 'markPaid', op: 'is', value: true }],
	target: { via: 'invoice' },
	set: [
		{ field: 'status', value: 'paid' },
		{ field: 'paymentDate', from: 'paymentDate' },
	],
};
const addAmount = {
	id: 'add-amount',
	name: 'Add to paid amount',
	target: { via: 'invoice' },
	set: [{ field: 'paidAmount', inc: 'amount' }],
};
const noCancelled = {
	id: 'no-cancelled',
	name: 'No payments on cancelled invoices',
	target: { via: 'invoice', when: [{ field: 'status', op: 'is', value: 'cancelled' }] },
	block: { message: 'This invoice is cancelled — it can’t take payments.' },
};

// ---------------------------------------------------------- publish checks
let r = await publishRules(pay.route, [{ ...markPaid, set: [{ field: 'nope', value: 1 }] }]);
ok('publish refuses a field the invoice doesn’t have', r.status === 400 && JSON.stringify(r.body).includes('nope'), r.body?.problems);
r = await publishRules(pay.route, [{ ...markPaid, target: { via: 'note' } }]);
ok('publish refuses a picker that isn’t a link', r.status === 400, r.body?.problems);
r = await publishRules(pay.route, [{ ...addAmount, set: [{ field: 'title', inc: 'amount' }] }]);
ok('publish refuses adding to a text field', r.status === 400 && JSON.stringify(r.body).includes('number'), r.body?.problems);
r = await publishRules(pay.route, [markPaid, addAmount, noCancelled]);
ok('publish takes the three rules', r.status === 200, r.body);

const loop = await publishRules(inv.route, [{ id: 'back', name: 'Back', target: { via: 'title' }, set: [{ field: 'note', value: 'x' }] }]);
ok('a rule on a field that isn’t a link is refused', loop.status === 400, loop.body?.problems);

const get = async id => (await call('GET', `${I}/${id}`, null, T)).body;

// ------------------------------------------------------------- the cases
const a = (await call('POST', I, { title: 'A', total: 100 }, T)).body.doc;
ok('invoice A starts unpaid', a.status === 'unpaid');

// (1) ticked → paid, same date, history says so
r = await call('POST', P, { invoice: a._id, amount: 60, paymentDate: '2026-10-11', markPaid: true }, T);
ok('(1) payment ticked is saved', r.status === 201, r.body);
const p1 = r.body.doc;
let A = await get(a._id);
ok('(1) invoice is paid', A.status === 'paid', A.status);
ok('(1) invoice has the payment’s date', String(A.paymentDate).startsWith('2026-10-11'), A.paymentDate);
ok('(1) paid amount added', A.paidAmount === 60, A.paidAmount);
ok('(1) response lists the invoice', Array.isArray(r.body.linked) && r.body.linked.some(l => l.id === a._id), r.body.linked);
await new Promise(res => setTimeout(res, 300));
const hist = await db.collection('histories').find({ document: new mongoose.Types.ObjectId(a._id) }).toArray();
ok('(1) invoice history says “by rule”', hist.some(h => /by rule “Mark invoice paid”/.test(h.text)), hist.map(h => h.text));
ok('(1) a change is logged', (await db.collection('linkedchanges').countDocuments({ target: new mongoose.Types.ObjectId(a._id), revertedAt: null })) === 2);

// (2) ticked without a date → 400 on paymentDate, nothing saved
const b = (await call('POST', I, { title: 'B', total: 50 }, T)).body.doc;
const payCount = await db.collection(pay.collectionName).countDocuments();
r = await call('POST', P, { invoice: b._id, amount: 50, markPaid: true }, T);
ok('(2) refused without a payment date', r.status === 400 && r.body?.fields?.paymentDate, r.body);
ok('(2) no payment saved', (await db.collection(pay.collectionName).countDocuments()) === payCount);
ok('(2) invoice untouched', (await get(b._id)).status === 'unpaid');

// (3) the invoice refuses the change → 400 naming it, payment not saved
await db.collection(inv.collectionName).updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { status: 'cancelled' } });
r = await call('POST', P, { invoice: b._id, amount: 10, paymentDate: '2026-10-11' }, T);
ok('(3) block rule refuses a payment on a cancelled invoice', r.status === 400 && /cancelled/.test(r.body?.message), r.body);
ok('(3) no payment saved', (await db.collection(pay.collectionName).countDocuments()) === payCount);
await db.collection(inv.collectionName).updateOne({ _id: new mongoose.Types.ObjectId(b._id) }, { $set: { status: 'unpaid' } });

// (4) unticked → only the amount rule runs
r = await call('POST', P, { invoice: b._id, amount: 20, paymentDate: '2026-10-12' }, T);
ok('(4) unticked payment saved', r.status === 201, r.body);
const p4 = r.body.doc;
let B = await get(b._id);
ok('(4) invoice still unpaid', B.status === 'unpaid' && !B.paymentDate, B);
ok('(4) but its paid amount went up', B.paidAmount === 20, B.paidAmount);

// update: tick it later → paid; change the amount → difference only
r = await call('PUT', `${P}/${p4._id}`, { markPaid: true }, T);
ok('(5) ticking it on edit marks the invoice paid', r.status === 200 && (await get(b._id)).status === 'paid', r.body);
r = await call('PUT', `${P}/${p4._id}`, { amount: 35 }, T);
B = await get(b._id);
ok('(5) amount 20 → 35 adds 15', B.paidAmount === 35, B.paidAmount);
r = await call('PUT', `${P}/${p4._id}`, { note: 'just a note' }, T);
ok('(5) a note edit doesn’t touch the invoice', r.status === 200 && !r.body.linked, r.body.linked);
// untick → reverted
r = await call('PUT', `${P}/${p4._id}`, { markPaid: false }, T);
B = await get(b._id);
ok('(6) unticking takes it back: unpaid, no date', B.status === 'unpaid' && !B.paymentDate, B);
ok('(6) amount stays (that rule still holds)', B.paidAmount === 35, B.paidAmount);

// delete → reverted, someone’s own edit is kept
await call('PUT', `${I}/${a._id}`, { lastPaymentNote: 'by hand' }, T);
r = await call('DELETE', `${P}/${p1._id}`, null, T);
A = await get(a._id);
ok('(7) deleting the payment: invoice back to unpaid', r.status === 200 && A.status === 'unpaid', A.status);
ok('(7) date cleared, amount taken off', !A.paymentDate && A.paidAmount === 0, A);
ok('(7) the hand edit stays', A.lastPaymentNote === 'by hand');

// a hand change after the rule ran is not reverted
r = await call('POST', P, { invoice: a._id, amount: 5, paymentDate: '2026-10-13', markPaid: true }, T);
const p8 = r.body.doc;
await call('PUT', `${I}/${a._id}`, { paymentDate: '2026-12-01' }, T);
await call('DELETE', `${P}/${p8._id}`, null, T);
A = await get(a._id);
ok('(8) a date someone changed since is left alone', String(A.paymentDate).startsWith('2026-12-01') && A.status === 'unpaid', A);

// two payments marking the same invoice: removing one keeps it paid
const c = (await call('POST', I, { title: 'C', total: 10 }, T)).body.doc;
const c1 = (await call('POST', P, { invoice: c._id, amount: 5, paymentDate: '2026-10-01', markPaid: true }, T)).body.doc;
const c2 = (await call('POST', P, { invoice: c._id, amount: 5, paymentDate: '2026-10-02', markPaid: true }, T)).body.doc;
await call('DELETE', `${P}/${c1._id}`, null, T);
let C = await get(c._id);
ok('(9) one of two payments removed: still paid', C.status === 'paid' && C.paidAmount === 5, C);
await call('DELETE', `${P}/${c2._id}`, null, T);
C = await get(c._id);
ok('(9) both removed: unpaid', C.status === 'unpaid' && C.paidAmount === 0, C);

// all-or-nothing when a write fails half way: an invoice the model refuses
const d = (await call('POST', I, { title: 'D' }, T)).body.doc;
await publishRules(pay.route, [markPaid, addAmount, { id: 'bad', name: 'Bad status', target: { via: 'invoice' }, set: [{ field: 'status', value: 'not-a-status' }] }]);
const before = await db.collection(inv.collectionName).findOne({ _id: new mongoose.Types.ObjectId(d._id) });
r = await call('POST', P, { invoice: d._id, amount: 7, paymentDate: '2026-10-11', markPaid: true }, T);
const after = await db.collection(inv.collectionName).findOne({ _id: new mongoose.Types.ObjectId(d._id) });
ok('(10) an invalid value for the invoice is refused, naming it', r.status === 400 && /D/.test(r.body?.message), r.body);
ok('(10) invoice unchanged', JSON.stringify(before) === JSON.stringify(after));
ok('(10) no payment saved', !(await db.collection(pay.collectionName).findOne({ amount: 7 })));
await publishRules(pay.route, [markPaid, addAmount, noCancelled]);

// permissions: someone who can add payments but not edit invoices
const limited = (await roles.insertOne({ name: `LR limited ${stamp}`, permissions: [`create-${pay.permission}`, `view-${pay.permission}`, `view-${inv.permission}`], isActive: true })).insertedId;
const limitedAdmin = (await admins.insertOne({ name: 'LR Limited', email: `lr-l-${stamp}@example.com`, role: limited, isActive: true })).insertedId;
const L = jwt.sign({ _id: limitedAdmin }, process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542', { expiresIn: '20m' });
const e = (await call('POST', I, { title: 'E' }, T)).body.doc;
r = await call('POST', P, { invoice: e._id, amount: 1, paymentDate: '2026-10-11', markPaid: true }, L);
ok('(11) can’t edit invoices → refused, says why', r.status === 400 && /can't change/.test(r.body?.message), r.body);
await publishRules(pay.route, [{ ...markPaid, asSystem: true }, { ...addAmount, asSystem: true }, noCancelled]);
r = await call('POST', P, { invoice: e._id, amount: 1, paymentDate: '2026-10-11', markPaid: true }, L);
ok('(11) “allow anyway” lets it through', r.status === 201 && (await get(e._id)).status === 'paid', r.body);

// undo: block / keep
await publishRules(pay.route, [{ ...markPaid, undo: 'block' }, noCancelled]);
const f = (await call('POST', I, { title: 'F' }, T)).body.doc;
const f1 = (await call('POST', P, { invoice: f._id, amount: 1, paymentDate: '2026-10-11', markPaid: true }, T)).body.doc;
r = await call('DELETE', `${P}/${f1._id}`, null, T);
ok('(12) undo “block” refuses the delete', r.status === 400, r.body);
await publishRules(pay.route, [{ ...markPaid, undo: 'keep' }, noCancelled]);
r = await call('DELETE', `${P}/${f1._id}`, null, T);
ok('(12) undo “keep” deletes and leaves the invoice paid', r.status === 200 && (await get(f._id)).status === 'paid', r.body);

// chain: the invoice's own rule (paid → note on the invoice’s… itself isn’t allowed; use a third model)
const cust = await mk({ title: `LR Client ${stamp}`, name: `LrClient${stamp}`, fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'lastPaid', label: 'Last paid', kind: 'date' }] });
await call('PUT', `/builder/models/${inv._id}`, { ...(await call('GET', `/builder/models/${inv._id}`, null, T)).body.doc, fields: [...inv.fields, { key: 'client', label: 'Client', kind: 'reference', ref: cust.name }] }, T);
r = await publishRules(inv.route, [{ id: 'client-paid', name: 'Client last paid', when: [{ field: 'status', op: 'is', value: 'paid' }], target: { via: 'client' }, set: [{ field: 'lastPaid', from: 'paymentDate' }] }]);
ok('chain: invoice rule published', r.status === 200, r.body);
await publishRules(pay.route, [markPaid, noCancelled]);
const k = (await call('POST', `/${cust.route}`, { name: 'Kim' }, T)).body.doc;
const g = (await call('POST', I, { title: 'G', client: k._id }, T)).body.doc;
r = await call('POST', P, { invoice: g._id, amount: 3, paymentDate: '2026-10-20', markPaid: true }, T);
const K = (await call('GET', `/${cust.route}/${k._id}`, null, T)).body;
ok('(13) payment → invoice paid → client’s last paid date', String(K.lastPaid).startsWith('2026-10-20'), K);
r = await publishRules(cust.route, [{ id: 'loop', name: 'Loop', target: { via: 'name' }, set: [{ field: 'x', value: 1 }] }]);
ok('a broken rule on another page is refused', r.status === 400);


// ================================================================= LU-02: every write path
console.log('\n— LU-02: bulk edit, status, delete + undo, duplicate, import, tenant project, public API');
await publishRules(pay.route, [markPaid, addAmount, noCancelled]);
const oidOf = id => new mongoose.Types.ObjectId(id);
const h = (await call('POST', I, { title: 'H' }, T)).body.doc;
const h1 = (await call('POST', P, { invoice: h._id, amount: 10, paymentDate: '2026-10-01' }, T)).body.doc;
const h2 = (await call('POST', P, { invoice: h._id, amount: 15, paymentDate: '2026-10-02' }, T)).body.doc;
let H = await get(h._id);
ok('setup: two unticked payments add 25', H.paidAmount === 25 && H.status === 'unpaid', H);

// bulk edit: tick both
r = await call('PUT', `${P}/update/many`, { ids: [h1._id, h2._id], updates: { markPaid: true } }, T);
H = await get(h._id);
ok('(B1) bulk edit ticking both marks the invoice paid', r.status === 200 && H.status === 'paid', { s: r.status, b: r.body?.message, H });
ok('(B1) the bulk answer lists the linked change', Array.isArray(r.body?.linked) && r.body.linked.length >= 1, r.body?.linked);
// bulk edit refused for one row → nothing changes
await db.collection(inv.collectionName).updateOne({ _id: oidOf(b._id) }, { $set: { status: 'cancelled' } });
const b1 = (await db.collection(pay.collectionName).insertOne({ invoice: oidOf(b._id), amount: 1, note: 'raw' })).insertedId;
r = await call('PUT', `${P}/update/many`, { ids: [h1._id, String(b1)], updates: { invoice: b._id } }, T);
ok('(B2) bulk edit with a row on a cancelled invoice is refused', r.status === 400 && /cancelled/.test(r.body?.message), r.body);
ok('(B2) the other row was not changed', String((await db.collection(pay.collectionName).findOne({ _id: oidOf(h1._id) })).invoice) === h._id);
await db.collection(inv.collectionName).updateOne({ _id: oidOf(b._id) }, { $set: { status: 'unpaid' } });
await db.collection(pay.collectionName).deleteOne({ _id: b1 });

// bulk delete + undo
r = await call('POST', `${P}/bulk/delete`, { ids: [h1._id, h2._id] }, T);
H = await get(h._id);
ok('(B3) bulk delete takes both back: unpaid, 0', r.status === 200 && H.status === 'unpaid' && H.paidAmount === 0, { s: r.status, m: r.body?.message, H });
r = await call('POST', `${P}/bulk/restore`, { batch: r.body?.batch }, T);
H = await get(h._id);
ok('(B3) undo puts them back and the rules run again', r.status === 200 && H.status === 'paid' && H.paidAmount === 25, { s: r.status, m: r.body?.message, H });

// bulk duplicate: a copy is a new payment
r = await call('POST', `${P}/bulk/duplicate`, { ids: [h1._id] }, T);
H = await get(h._id);
ok('(B4) duplicating a payment adds its amount again', r.status === 200 && r.body?.created?.length === 1 && H.paidAmount === 35, { b: r.body, H });
// single copy route
r = await call('PUT', `${P}/copy/${h2._id}`, null, T);
H = await get(h._id);
ok('(B4) the single copy (row menu) too: +15', r.status === 200 && H.paidAmount === 50, { s: r.status, H });

// bulk status on invoices: their own rule (status paid → client's last paid) runs
const invCfg = await configOf(inv.route);
r = await call('PUT', '/builder/draft', { route: inv.route, kind: 'config', draft: { ...invCfg, route: { ...(invCfg.route || {}), status: { field: 'status' } } } }, T);
r = await call('POST', '/builder/publish', { route: inv.route, kinds: ['config'] }, T);
const k2 = (await call('POST', `/${cust.route}`, { name: 'Lee' }, T)).body.doc;
const j = (await call('POST', I, { title: 'J', client: k2._id, paymentDate: '2026-09-30' }, T)).body.doc;
r = await call('POST', `${I}/bulk/status`, { ids: [j._id], to: 'paid' }, T);
const K2 = (await call('GET', `/${cust.route}/${k2._id}`, null, T)).body;
ok('(B5) bulk status → paid runs the invoice’s rule on the client', r.status === 200 && String(K2.lastPaid).startsWith('2026-09-30'), { b: r.body, K2 });

// import: all-or-nothing with the rules
const m = (await call('POST', I, { title: 'M' }, T)).body.doc;
const n = (await call('POST', I, { title: 'N', status: 'cancelled' }, T)).body.doc;
const before3 = await db.collection(pay.collectionName).countDocuments();
const rows = [
	{ invoice: m._id, amount: 4, paymentDate: '2026-10-05', markPaid: true },
	{ invoice: m._id, amount: 6, paymentDate: '2026-10-06' },
	{ invoice: n._id, amount: 1, paymentDate: '2026-10-07' },
];
r = await call('POST', `${P}/bulk/import`, { format: 'json', content: JSON.stringify(rows), dryRun: true }, T);
ok('(B6) dry run shows the cancelled invoice row', r.status === 200 && r.body?.problems?.some(p => p.row === 4 && /cancelled/.test(p.message)), r.body?.problems);
r = await call('POST', `${P}/bulk/import`, { format: 'json', content: JSON.stringify(rows), dryRun: false }, T);
ok('(B6) the whole file is refused', r.status === 400 && (await db.collection(pay.collectionName).countDocuments()) === before3, r.body?.message);
ok('(B6) invoice M untouched', (await get(m._id)).status === 'unpaid');
r = await call('POST', `${P}/bulk/import`, { format: 'json', content: JSON.stringify(rows.slice(0, 2)), dryRun: false }, T);
const M = await get(m._id);
ok('(B6) two good rows: M paid with 10 added', r.status === 201 && M.status === 'paid' && M.paidAmount === 10, { b: r.body?.message, M });

// ================================================================= LU-03: the form's side
console.log('\n— LU-03: required-while, hints, preview');
await publishRules(pay.route, [markPaid, addAmount, noCancelled]);
const sch = (await call('GET', `${P}/get/schema`, null, T)).body;
ok('(F1) schema: Payment date is required while Mark as paid is ticked', sch?.paymentDate?.requiredIf?.[0]?.when?.[0]?.field === 'markPaid', sch?.paymentDate);
ok('(F1) schema: Mark as paid is read by the rule, with the route', sch?.markPaid?.linkedReads?.includes('Mark invoice paid') && sch?.markPaid?.linkedRoute === pay.route, sch?.markPaid);
const cfgForm = (await call('GET', `${P}/get/config`, null, T)).body?.form;
ok('(F1) config form carries them too', JSON.stringify(cfgForm || '').includes('requiredIf') && JSON.stringify(cfgForm).includes('linkedReads'), JSON.stringify(cfgForm || '').slice(0, 200));
const q = (await call('POST', I, { title: 'Q' }, T)).body.doc;
const countQ = await db.collection('linkedchanges').countDocuments();
r = await call('POST', `${P}/linked/preview`, { values: { invoice: q._id, amount: 9, paymentDate: '2026-10-15', markPaid: true } }, T);
ok('(F2) preview: would mark Q paid and add 9', r.status === 200 && r.body.changes.some(c => c.changes.some(x => x.field === 'status' && x.to === 'paid')) && r.body.changes.some(c => c.changes.some(x => x.field === 'paidAmount' && x.to === '9')), r.body);
ok('(F2) preview wrote nothing', (await get(q._id)).status === 'unpaid' && (await db.collection('linkedchanges').countDocuments()) === countQ);
r = await call('POST', `${P}/linked/preview`, { values: { invoice: q._id, amount: 9, markPaid: true } }, T);
ok('(F2) preview asks for the date instead of erroring', !r.body?.error && r.body?.missing?.length === 1, r.body);
r = await call('POST', P, { invoice: q._id, amount: 9, markPaid: true }, T);
ok('(F2) saving without the date is still refused under it', r.status === 400 && r.body?.fields?.paymentDate, r.body);
const qp = (await call('POST', P, { invoice: q._id, amount: 9, paymentDate: '2026-10-15', markPaid: true }, T)).body.doc;
r = await call('POST', `${P}/linked/preview`, { id: qp._id, values: { markPaid: false } }, T);
ok('(F2) preview of unticking an existing payment: puts Q back', r.body?.changes?.some(c => c.undo && c.changes.some(x => x.field === 'status' && x.to === 'unpaid')), r.body);
r = await call('POST', `/${cust.route}/linked/preview`, { values: { name: 'x' } }, T);
ok('(F2) a page without rules answers empty', r.status === 200 && r.body.changes.length === 0, r.body);

// LU-05: a refusing rule shows in the form's hint too
const zc = (await call('POST', I, { title: 'Z', status: 'cancelled' }, T)).body.doc;
r = await call('POST', `${P}/linked/preview`, { values: { invoice: zc._id, amount: 1, paymentDate: '2026-10-15' } }, T);
ok('(F4) the form hears “cancelled” before saving', /cancelled/.test(r.body?.error?.message || ''), r.body);

// LU-04: the builder's "Changed by…" list
r = await call('GET', `/builder/linked/incoming?route=${inv.route}`, null, T);
ok('(F3) invoices list the payment rules that change them', r.status === 200 && r.body.doc.some(x => x.route === pay.route && x.rule === 'Mark invoice paid' && x.fields.includes('status')), r.body);
ok('(F3) …and the refusing rule as one', r.body.doc.some(x => x.block && x.rule === 'No payments on cancelled invoices'), r.body);

// LU-06: over MCP — what a user's own AI sees and sets
{
	const key = await call('POST', '/builder/api-keys', { name: 'LR smoke', scopes: ['read', 'build'] }, T);
	let n = 1;
	const rpc = async (method, params) =>
		(await fetch(`${ROOT}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${key.body.secret}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: n++, method, params }) }).then(x => x.json())).result;
	const tool = (name, args) => rpc('tools/call', { name, arguments: args });
	ok('(M1) update_page offers linkedRelationships', !!(await rpc('tools/list', {})).tools.find(t => t.name === 'update_page')?.inputSchema?.properties?.linkedRelationships);
	ok('(M1) describe_platform explains them', /Linked Relationships/.test((await tool('describe_platform', {})).content[0].text));
	const gm = await tool('get_model', { name: pay.route });
	ok('(M2) get_model lists the rules', /Mark invoice paid/.test(gm.content[0].text) && gm.structuredContent?.page?.linkedRelationships?.length === 3, gm.structuredContent?.page?.linkedRelationships?.length);
	const rules = gm.structuredContent.page.linkedRelationships;
	let m = await tool('update_page', { route: pay.route, linkedRelationships: [{ id: 'bad', target: { via: 'invoice' }, set: [{ field: 'nope', value: 1 }] }] });
	ok('(M3) update_page refuses a field the invoice lacks', m.isError && /nope/.test(m.content[0].text), m.content[0].text);
	m = await tool('update_page', { route: pay.route, linkedRelationships: [...rules, { id: 'mcp', name: 'MCP note', target: { via: 'invoice' }, set: [{ field: 'lastPaymentNote', value: 'set over MCP' }] }] });
	const mi = (await call('POST', I, { title: 'MCP' }, T)).body.doc;
	await call('POST', P, { invoice: mi._id, amount: 1, paymentDate: '2026-10-11' }, T);
	ok('(M3) a rule set over MCP runs', !m.isError && (await get(mi._id)).lastPaymentNote === 'set over MCP', m.content[0].text);
	m = await tool('update_page', { route: pay.route, linkedRelationships: rules });
	ok('(M3) and the rules are put back', !m.isError);
	await call('DELETE', `/builder/api-keys/${key.body.doc._id}`, null, T);
}

// ---------------------------------------------------------- a tenant project + the public API
const TPASS = 'tenant-pass-123';
const reg = async (n, org) => (await fetch(ROOT + '/tenant/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n, email: `${n.toLowerCase()}${stamp}@example.com`, password: TPASS, organization: org, country: 'BD' }) }).then(x => x.json())).token;
const tcall = async (method, path, body, token) => {
	const x = await fetch(ROOT + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: token }) }, body: body && JSON.stringify(body) });
	return { status: x.status, body: await x.json().catch(() => null) };
};
const tok = await reg('Lin', 'Linked Co');
let t = await tcall('POST', '/tenant/api/projects', { name: 'Books', type: 'app' }, tok);
const pid = t.body?._id;
const slug = t.body?.publicSlug;
const TP = path => `/tenant/api/p/${pid}${path}`;
const tmk = async body => (await tcall('POST', TP('/builder/models'), body, tok)).body?.doc;
const tinv = await tmk({ name: 'Bill', title: 'Bills', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'status', label: 'Status', kind: 'select', options: [{ value: 'unpaid' }, { value: 'paid' }], default: 'unpaid' },
	{ key: 'paymentDate', label: 'Payment date', kind: 'date' },
] });
const tpay = await tmk({ name: 'Receipt', title: 'Receipts', fields: [
	{ key: 'bill', label: 'Bill', kind: 'reference', ref: 'Bill', required: true },
	{ key: 'paymentDate', label: 'Payment date', kind: 'date' },
	{ key: 'markPaid', label: 'Mark as paid', kind: 'boolean' },
] });
ok('tenant: models made', !!tinv?.route && !!tpay?.route, { tinv: tinv?.route, tpay: tpay?.route });
const tRule = { id: 'paid', name: 'Mark bill paid', when: [{ field: 'markPaid', op: 'is', value: true }], target: { via: 'bill' }, set: [{ field: 'status', value: 'paid' }, { field: 'paymentDate', from: 'paymentDate' }] };
const tPublish = async rules => {
	const cfg = (await tcall('GET', TP(`/builder/route?route=${tpay.route}`), null, tok)).body;
	const draft = { ...(cfg?.config?.data || cfg?.code?.config || {}), linkedRelationships: rules };
	const d = await tcall('PUT', TP('/builder/draft'), { route: tpay.route, kind: 'config', draft }, tok);
	if (d.status !== 200) return d;
	return tcall('POST', TP('/builder/publish'), { route: tpay.route, kinds: ['config'] }, tok);
};
t = await tPublish([tRule]);
ok('tenant: rule published', t.status === 200, t.body);
const tb = (await tcall('POST', TP(`/${tinv.route}`), { title: 'Rent' }, tok)).body?.doc;
t = await tcall('POST', TP(`/${tpay.route}`), { bill: tb._id, paymentDate: '2026-10-11', markPaid: true }, tok);
let TB = (await tcall('GET', TP(`/${tinv.route}/${tb._id}`), null, tok)).body;
ok('(T1) tenant: receipt marks the bill paid', t.status === 201 && TB?.status === 'paid', { s: t.status, m: t.body?.message, TB });
// another project's bill can't be reached
const t2 = (await tcall('POST', '/tenant/api/projects', { name: 'Other books', type: 'app' }, tok)).body?._id;
const otherBill = (await tcall('POST', `/tenant/api/p/${t2}/builder/models`, { name: 'Bill', title: 'Bills', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'unpaid' }, { value: 'paid' }], default: 'unpaid' }] }, tok)).body?.doc;
const ob = (await tcall('POST', `/tenant/api/p/${t2}/${otherBill.route}`, { title: 'Theirs' }, tok)).body?.doc;
t = await tcall('POST', TP(`/${tpay.route}`), { bill: ob._id, paymentDate: '2026-10-11', markPaid: true }, tok);
const OB = (await tcall('GET', `/tenant/api/p/${t2}/${otherBill.route}/${ob._id}`, null, tok)).body;
ok('(T2) a bill in another project is never changed', t.status >= 400 && OB?.status === 'unpaid', { s: t.status, m: t.body?.message, OB });

// public API: rules start only when they opt in
t = await tcall('PUT', TP(`/builder/models/${tpay._id}/public-api`), { enabled: true, actions: ['create'], auth: 'none' }, tok);
ok('public API on for receipts', t.status === 200, t.body?.message);
const pb = (await tcall('POST', TP(`/${tinv.route}`), { title: 'Web' }, tok)).body?.doc;
t = await tcall('POST', `/public/api/${slug}/${tpay.route}`, { bill: pb._id, paymentDate: '2026-10-11', markPaid: true });
let PB = (await tcall('GET', TP(`/${tinv.route}/${pb._id}`), null, tok)).body;
ok('(T3) a website save leaves the bill alone without “also for website saves”', t.status === 201 && PB?.status === 'unpaid', { s: t.status, m: t.body?.message, PB });
t = await tPublish([{ ...tRule, fromApi: true }]);
t = await tcall('POST', `/public/api/${slug}/${tpay.route}`, { bill: pb._id, paymentDate: '2026-10-12', markPaid: true });
PB = (await tcall('GET', TP(`/${tinv.route}/${pb._id}`), null, tok)).body;
ok('(T3) with it on, the website save marks the bill paid', t.status === 201 && PB?.status === 'paid' && String(PB.paymentDate).startsWith('2026-10-12'), { s: t.status, m: t.body?.message, PB });
t = await tcall('POST', `/public/api/${slug}/${tpay.route}`, { bill: ob._id, paymentDate: '2026-10-12', markPaid: true });
ok('(T3) …but not another project’s bill', t.status >= 400 && (await tcall('GET', `/tenant/api/p/${t2}/${otherBill.route}/${ob._id}`, null, tok)).body?.status === 'unpaid', { s: t.status, m: t.body?.message });

// ------------------------------------------ LU-08/09: the wizard, transfers
// In its own block: its names are short and the earlier sections use some of them.
{
	// An account page, and a transfer page made in the wizard with its two rules.
	const acct = await mk({
		title: `LR Account ${stamp}`,
		name: `LrAccount${stamp}`,
		fields: [
			{ key: 'title', label: 'Title', kind: 'text', required: true },
			{ key: 'balance', label: 'Balance', kind: 'number', default: 0 },
		],
	});
	const A = `/${acct.route}`;
	const xferDef = {
		title: `LR Transfer ${stamp}`,
		name: `LrTransfer${stamp}`,
		fields: [
			{ key: 'fromAccount', label: 'From account', kind: 'reference', ref: acct.name, required: true },
			{ key: 'toAccount', label: 'To account', kind: 'reference', ref: acct.name, required: true },
			{ key: 'amount', label: 'Amount', kind: 'number', required: true },
		],
	};
	const pv = await call('POST', '/builder/models/preview', xferDef, T);
	ok('(W) the wizard makes the transfer pages', pv.status === 200 && !!pv.body?.config, pv.body?.message);
	const takeOff = { id: 'take', name: 'Take from the sending account', target: { via: 'fromAccount' }, set: [{ field: 'balance', dec: 'amount', min: 0 }] };
	const giveTo = { id: 'give', name: 'Give to the receiving account', target: { via: 'toAccount' }, set: [{ field: 'balance', inc: 'amount' }] };
	let w = await call('POST', '/builder/models', { ...xferDef, config: { ...pv.body.config, linkedRelationships: [{ ...takeOff, set: [{ field: 'nope', dec: 'amount' }] }] } }, T);
	ok('(W1) the wizard refuses a rule on a field the account doesn’t have', w.status === 400 && JSON.stringify(w.body).includes('nope'), w.body);
	w = await call('POST', '/builder/models', { ...xferDef, config: { ...pv.body.config, linkedRelationships: [takeOff, giveTo] } }, T);
	ok('(W2) …and made nothing: the same name is free, and the page comes with its two rules', w.status === 201 && w.body?.doc?.name === xferDef.name, { s: w.status, b: w.body?.message || w.body?.doc?.name, p: w.body?.problems });
	const xfer = w.body.doc;
	const X = `/${xfer.route}`;
	ok('(W2) the rules are published with the page', (await configOf(xfer.route)).linkedRelationships?.length === 2);

	const mkAcct = async (title, balance) => (await call('POST', A, { title, balance }, T)).body?.doc;
	const bal = async id => (await call('GET', `${A}/${id}`, null, T)).body?.balance;
	const cash = await mkAcct('Cash', 100);
	const bank = await mkAcct('Bank', 0);
	let x = await call('POST', X, { fromAccount: cash._id, toAccount: bank._id, amount: 30 }, T);
	const x1 = x.body?.doc;
	ok('(X1) a transfer moves the amount', x.status === 201 && (await bal(cash._id)) === 70 && (await bal(bank._id)) === 30, { s: x.status, m: x.body?.message });
	x = await call('POST', X, { fromAccount: cash._id, toAccount: bank._id, amount: 80 }, T);
	ok('(X2) more than the balance is refused, under Amount, and nothing moves', x.status === 400 && /Not enough Balance/.test(x.body?.message) && !!x.body?.fields?.amount && (await bal(cash._id)) === 70 && (await bal(bank._id)) === 30, x.body);
	x = await call('PUT', `${X}/${x1._id}`, { amount: 60 }, T);
	ok('(X3) editing 30 → 60 moves only the 30 more', x.status === 200 && (await bal(cash._id)) === 40 && (await bal(bank._id)) === 60, { s: x.status, m: x.body?.message });
	x = await call('PUT', `${X}/${x1._id}`, { amount: 200 }, T);
	ok('(X4) editing to more than is left is refused', x.status === 400 && (await bal(cash._id)) === 40 && (await call('GET', `${X}/${x1._id}`, null, T)).body?.amount === 60, x.body?.message);
	x = await call('DELETE', `${X}/${x1._id}`, null, T);
	ok('(X5) deleting the transfer gives it back', x.status === 200 && (await bal(cash._id)) === 100 && (await bal(bank._id)) === 0, { s: x.status, m: x.body?.message });
	const both = await Promise.all([1, 2].map(() => call('POST', X, { fromAccount: cash._id, toAccount: bank._id, amount: 60 }, T)));
	ok('(X6) two transfers of 60 at once from 100: one goes through', both.filter(b => b.status === 201).length === 1 && (await bal(cash._id)) === 40 && (await bal(bank._id)) === 60, both.map(b => [b.status, b.body?.message]));
	const xferCount = async () => (await call('GET', `${X}?limit=100`, null, T)).body?.doc?.length;
	ok('(X6) …and the other leaves no transfer behind', (await xferCount()) === 1, await xferCount());

	// Its own message; the receiving side can have a floor too (taking a transfer back).
	let rr = await publishRules(xfer.route, [{ ...takeOff, set: [{ field: 'balance', dec: 'amount', min: 0, message: 'Not enough money in the sending account.' }] }, { ...giveTo, set: [{ field: 'balance', inc: 'amount', min: 0 }] }]);
	ok('floors with a message publish', rr.status === 200, rr.body);
	x = await call('POST', X, { fromAccount: cash._id, toAccount: bank._id, amount: 1000 }, T);
	ok('(X7) the refusal says the rule’s own message', x.status === 400 && x.body?.message === 'Not enough money in the sending account.', x.body?.message);
	const spent = (await call('GET', `${X}?limit=1`, null, T)).body?.doc?.[0];
	await call('PUT', `${A}/${bank._id}`, { balance: 10 }, T);
	x = await call('DELETE', `${X}/${spent._id}`, null, T);
	ok('(X8) a transfer whose money was spent can’t be taken back below 0', x.status === 400 && /taken back/.test(x.body?.message) && (await bal(bank._id)) === 10 && (await bal(cash._id)) === 40, x.body?.message);
	// The floor is the field's on this page: set only on the take-off, it still holds the receiver's take-back.
	rr = await publishRules(xfer.route, [{ ...takeOff, set: [{ field: 'balance', dec: 'amount', min: 0, message: 'Not enough money in the sending account.' }] }, giveTo]);
	x = await call('DELETE', `${X}/${spent._id}`, null, T);
	ok('(X9) a floor on the take-off alone also stops the receiver going below 0', rr.status === 200 && x.status === 400 && /Not enough Balance/.test(x.body?.message) && (await bal(bank._id)) === 10 && (await bal(cash._id)) === 40, x.body?.message);

	// Conditions compared with this record's fields.
	rr = await publishRules(xfer.route, [{ ...takeOff, set: [{ field: 'balance', value: 1, min: 0 }] }]);
	ok('a floor on a plain value is refused', rr.status === 400, rr.body?.message);
	rr = await publishRules(xfer.route, [{ id: 'bad-ref', name: 'Bad ref', target: { via: 'fromAccount', when: [{ field: 'balance', op: 'lt', value: { ref: 'this.nope' } }] }, block: { message: 'x' } }]);
	ok('a condition comparing with a field this page lacks is refused', rr.status === 400 && JSON.stringify(rr.body).includes('this.nope'), rr.body?.problems);
	const enough = { id: 'enough', name: 'Enough to send', on: ['create'], target: { via: 'fromAccount', when: [{ field: 'balance', op: 'lt', value: { ref: 'this.amount' } }] }, block: { message: 'Balance too low (condition).' } };
	const twoAccounts = { id: 'two', name: 'Two different accounts', target: { via: 'toAccount', when: [{ field: '_id', op: 'is', value: { ref: 'this.fromAccount' } }] }, block: { message: 'Pick two different accounts.' } };
	rr = await publishRules(xfer.route, [{ ...takeOff, set: [{ field: 'balance', dec: 'amount' }] }, giveTo, enough, twoAccounts]);
	ok('conditions compared with this record publish', rr.status === 200, rr.body);
	x = await call('POST', X, { fromAccount: cash._id, toAccount: bank._id, amount: 41 }, T);
	ok('(C1) Balance is less than this transfer’s Amount: refused', x.status === 400 && x.body?.message === 'Balance too low (condition).' && (await bal(cash._id)) === 40, x.body?.message);
	x = await call('POST', X, { fromAccount: cash._id, toAccount: bank._id, amount: 40 }, T);
	ok('(C1) …exactly the balance goes through', x.status === 201 && (await bal(cash._id)) === 0 && (await bal(bank._id)) === 50, x.body?.message);
	x = await call('POST', X, { fromAccount: bank._id, toAccount: bank._id, amount: 5 }, T);
	ok('(C2) the same account on both sides is refused', x.status === 400 && /two different accounts/.test(x.body?.message) && (await bal(bank._id)) === 50, x.body?.message);
	const hints = (await call('GET', `${X}/get/schema`, null, T)).body;
	ok('(C3) the form knows Amount is read by the rules', JSON.stringify(hints || {}).includes('linkedReads'), Object.keys(hints || {}).slice(0, 5));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
await mongoose.disconnect();
process.exit(fails ? 1 : 0);
