// Automations (AU-03b): an email that attaches the record's PDFs — a bill's
// invoice to its customer. Save checks (a draft, another page's template, too
// many, delete-only), the dry run naming the file, the real email carrying the
// PDF (lists of other pages printed too), a removed template stopping the run.
// A tiny SMTP server on 127.0.0.1:2587 stands in for the real one — don't run
// it beside mail-accounts.mjs or mail-designs.mjs.
import fs from 'fs';
import net from 'net';
import { call, ok, done } from './lib.mjs';

/* ------------------------------------------- a mail server that keeps mail */
const PORT = 2587;
const USERS = { 'hello@ritasweets.example': 'rita-pass' };
const inbox = [];
let logins = 0;
const smtp = net.createServer(sock => {
	sock.write('220 sink ESMTP\r\n');
	let buf = '';
	let inData = false;
	let msg = { from: '', to: [], data: '' };
	sock.on('data', chunk => {
		buf += chunk.toString('utf8');
		let i;
		while ((i = buf.indexOf('\r\n')) >= 0) {
			const line = buf.slice(0, i);
			buf = buf.slice(i + 2);
			if (inData) {
				if (line === '.') {
					inData = false;
					inbox.push(msg);
					msg = { from: '', to: [], data: '' };
					sock.write('250 OK queued\r\n');
				} else msg.data += line.replace(/^\.\./, '.') + '\n';
				continue;
			}
			const up = line.toUpperCase();
			if (up.startsWith('EHLO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
			else if (up.startsWith('HELO')) sock.write('250 OK\r\n');
			else if (up.startsWith('AUTH PLAIN')) {
				const [, user, pass] = Buffer.from(line.split(' ')[2] || '', 'base64').toString().split('\0');
				logins++;
				sock.write(USERS[user] && USERS[user] === pass ? '235 OK\r\n' : '535 5.7.8 Authentication failed\r\n');
			} else if (up.startsWith('MAIL FROM')) {
				msg.from = line;
				sock.write('250 OK\r\n');
			} else if (up.startsWith('RCPT TO')) {
				msg.to.push(line);
				sock.write('250 OK\r\n');
			} else if (up === 'DATA') {
				inData = true;
				sock.write('354 go ahead\r\n');
			} else if (up === 'QUIT') {
				sock.write('221 bye\r\n');
				sock.end();
			} else if (up === 'RSET' || up === 'NOOP') sock.write('250 OK\r\n');
			else sock.write('502 not here\r\n');
		}
	});
	sock.on('error', () => undefined);
});
await new Promise(r => smtp.listen(PORT, '127.0.0.1', r));
const settle = (ms = 800) => new Promise(r => setTimeout(r, ms));
// The message as sent, quoted-printable undone (soft line breaks, =XX).
const last = () => {
	const m = inbox[inbox.length - 1];
	return m && { ...m, data: m.data.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) };
};

/* ------------------------------------------------------------- the tenant */
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rita Sweets', email: `ritap${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rita Bills ${stamp}`, country: 'BD' });
const T = r.body.token;
ok('a tenant', r.status === 200 && T, `${r.status} ${r.body?.message}`);
const shop = (await call('POST', '/tenant/api/projects', { name: 'Rita bills', type: 'app' }, T)).body;
const P = path => `/tenant/api/p/${shop._id}${path}`;
r = await call('POST', P('/mail-accounts'), { name: 'Hello', fromName: 'Rita Sweets', host: '127.0.0.1', port: PORT, email: 'hello@ritasweets.example', password: 'rita-pass' }, T);
ok('an email account', r.status === 201, r.body?.message);

const model = body => call('POST', P('/builder/models'), body, T);
await model({ name: 'Client', title: 'Clients', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'email', label: 'Email', kind: 'email' }] });
await model({
	name: 'Bill',
	title: 'Bills',
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'status', label: 'Status', kind: 'select', default: 'draft', options: [{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }] },
		{ key: 'customer', label: 'Customer', kind: 'reference', ref: 'Client' },
	],
});
await model({ name: 'BillLine', title: 'Bill lines', fields: [{ key: 'item', label: 'Item', kind: 'text', required: true }, { key: 'price', label: 'Price', kind: 'number' }, { key: 'bill', label: 'Bill', kind: 'reference', ref: 'Bill' }] });
r = await model({ name: 'Note', title: 'Notes', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] });
ok('models', r.status === 201, r.body?.message);

const invoice = {
	name: 'Invoice',
	route: 'bills',
	alias: 'bill',
	status: 'published',
	lists: [{ name: 'lines', route: 'billlines', foreignField: 'bill', sort: 'createdAt' }],
	body: [
		{ type: 'text', text: 'Invoice {{bill.name}} for {{bill.customer.name}}' },
		{ type: 'table', rows: 'lines', columns: [{ header: 'Item', value: '{{item.item}}' }, { header: 'Price', value: '{{item.price}}', align: 'right' }] },
	],
};
r = await call('POST', P('/pdf-templates'), invoice, T);
const inv = r.body;
ok('a published invoice template for bills', r.status === 201 && inv?._id, JSON.stringify(r.body).slice(0, 200));
const draft = (await call('POST', P('/pdf-templates'), { ...invoice, name: 'Draft one', status: 'draft' }, T)).body;
const noteTpl = (await call('POST', P('/pdf-templates'), { ...invoice, name: 'Note sheet', route: 'notes', alias: 'note', lists: [], body: [{ type: 'text', text: '{{note.name}}' }] }, T)).body;

/* ---- checks at save */
const email = attach => ({ type: 'email', to: { fields: ['customer.email'] }, subject: 'Your invoice {{name}}', body: 'Hello,\n\nYour invoice is attached.', attach });
const save = (body, method = 'POST', path = '') => call(method, P(`/automations${path}`), body, T);
r = await save({ name: 'x', route: 'bills', on: ['create'], actions: [email([draft._id])] });
ok('a draft template is refused, by name', r.status === 400 && r.body?.on === 'actions.0.attach' && /Draft one/.test(r.body?.message), JSON.stringify(r.body));
r = await save({ name: 'x', route: 'bills', on: ['create'], actions: [email([noteTpl._id])] });
ok('another page’s template is refused', r.status === 400 && r.body?.on === 'actions.0.attach', JSON.stringify(r.body));
r = await save({ name: 'x', route: 'bills', on: ['delete'], actions: [email([inv._id])] });
ok('a delete-only automation can’t attach', r.status === 400 && /deleted/.test(r.body?.message), JSON.stringify(r.body));
r = await save({ name: 'x', route: 'bills', on: ['create'], actions: [email([inv._id, '5f0000000000000000000001', '5f0000000000000000000002', '5f0000000000000000000003'])] });
ok('at most 3 PDFs', r.status === 400 && /at most 3/.test(r.body?.message), JSON.stringify(r.body));

/* ---- a bill marked sent: its invoice to the customer */
r = await save({ name: 'Send the invoice', route: 'bills', on: ['update'], changed: ['status'], when: [{ field: 'status', op: 'is', value: 'sent' }], actions: [email([inv._id])] });
const auto = r.body;
ok('saved with the PDF', r.status === 201 && auto.actions?.[0]?.attach?.[0] === inv._id, JSON.stringify(r.body).slice(0, 300));
// A new record comes back as itself or under `doc`.
const add = async (route, body) => { const b = (await call('POST', P(`/${route}`), body, T)).body; return b?.doc || b; };
const cust = await add('clients', { name: 'Sam Lee', email: 'sam@example.com' });
const bill = await add('bills', { name: 'B-1001', customer: cust._id });
const line = await add('billlines', { item: 'Cake', price: 40, bill: bill._id });
await add('billlines', { item: 'Candles', price: 5, bill: bill._id });
ok('a bill with a customer and two lines', bill?._id && cust?._id && line?._id, JSON.stringify(line));

r = await call('POST', P(`/automations/${auto._id}/test`), { record: bill._id }, T);
ok('the dry run names the file', r.status === 200 && /Would email sam@example.com: “Your invoice B-1001” with Invoice B-1001\.pdf/.test(r.body?.steps?.[0]?.detail || ''), JSON.stringify(r.body));

let n = inbox.length;
await call('PUT', P(`/bills/${bill._id}`), { status: 'sent' }, T);
await settle(3000);
const m = inbox[inbox.length - 1];
ok('the customer gets the email', inbox.length === n + 1 && m.to.some(t => /sam@example.com/.test(t)), m?.to);
ok('…with the invoice attached as a PDF', /Content-Type: application\/pdf; name="?Invoice B-1001\.pdf/.test(m?.data || '') && /Content-Disposition: attachment/.test(m?.data || ''), (m?.data || '').match(/Content-Type: application[^\n]*/)?.[0]);
const b64 = (m?.data || '').split(/Content-Disposition: attachment[^\n]*\n(?:[^\n]+\n)*\n/)[1]?.split('\n----')[0]?.replace(/\s+/g, '') || '';
const pdf = Buffer.from(b64, 'base64');
ok('…a real PDF', pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 1000, `${pdf.length} bytes`);
// SMOKE_OUT=<dir>: keep the PDF to look at.
if (process.env.SMOKE_OUT) fs.writeFileSync(`${process.env.SMOKE_OUT}/automation-invoice.pdf`, pdf);
r = await call('GET', P(`/automations/${auto._id}/runs`), null, T);
ok('Runs says what was attached', /with Invoice B-1001\.pdf/.test(r.body?.doc?.[0]?.steps?.[0]?.detail || ''), JSON.stringify(r.body?.doc?.[0]?.steps));

/* ---- the template removed: the email stops, with why */
await call('DELETE', P(`/pdf-templates/${inv._id}`), null, T);
const bill2 = await add('bills', { name: 'B-1002', customer: cust._id });
n = inbox.length;
r = await call('PUT', P(`/bills/${bill2._id}`), { status: 'sent' }, T);
ok('the bill still saves — a failing automation never blocks it', r.status === 200, `${r.status} ${r.body?.message}`);
await settle(2500);
r = await call('GET', P(`/automations/${auto._id}/runs`), null, T);
const failed = r.body?.doc?.[0];
ok('a removed PDF fails the run, saying so — and nothing is sent', failed?.status === 'failed' && /PDF it attaches is gone/.test(failed?.error || '') && inbox.length === n, JSON.stringify(failed));

smtp.close();
done();
process.exit(0);
