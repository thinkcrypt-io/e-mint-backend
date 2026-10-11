// Linked Relationships smoke test (backend/docs/linked-relationships, LU-01/LU-02).
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

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
await mongoose.disconnect();
process.exit(fails ? 1 : 0);
