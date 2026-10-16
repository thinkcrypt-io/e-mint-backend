// Messaging M-14: a project's own email accounts — connect (SMTP server, port,
// address, password, sender name), Test connection (signs in, sends nothing,
// ok or not), the default that every project email goes out through, edit,
// send a test, remove (the next becomes default), the organization's server
// as the fallback, the log naming the account. A tiny SMTP server on
// 127.0.0.1:2587 stands in for the real one (dev allows local hosts).
// SMOKE_MONGO: the scratch DB, to check nothing is left after a project delete.
import net from 'net';
import { call, ok, done } from './lib.mjs';

/* ------------------------------------------- a mail server that keeps mail */
const PORT = 2587;
const USERS = { 'sales@monabakes.example': 'sales-pass', 'help@monabakes.example': 'help-pass', 'org@monabakes.example': 'org-pass' };
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
const last = () => inbox[inbox.length - 1];

/* ------------------------------------------------------------- the tenant */
const stamp = Date.now();
const ownerEmail = `mona${stamp}@example.com`;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Mona Mail', email: ownerEmail, password: 'tenant-pass-123', organization: `Mona Bakes ${stamp}`, country: 'BD' });
const T = r.body.token;
ok('a tenant', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: 'Mona site', type: 'website' }, T);
const site = r.body;
const A = `/tenant/api/p/${site._id}/mail-accounts`;

r = await call('GET', A, null, T);
ok('no accounts yet, no fallback', r.status === 200 && r.body.doc.length === 0 && r.body.fallback === null && r.body.ports.includes(587), JSON.stringify(r.body));

/* ------------------------------------------------------- test connection */
const sales = { name: 'Sales', fromName: 'Mona Bakes Sales', host: '127.0.0.1', port: PORT, email: 'Sales@MonaBakes.example', password: 'sales-pass' };
const sent0 = inbox.length;
r = await call('POST', `${A}/test`, sales, T);
ok('Test connection: right password → ok, in words', r.status === 200 && r.body.ok === true && /signed in as sales@monabakes.example/.test(r.body.message), JSON.stringify(r.body));
ok('…and nothing was sent', inbox.length === sent0, `${inbox.length - sent0}`);
r = await call('POST', `${A}/test`, { ...sales, password: 'nope' }, T);
ok('wrong password → not ok, the reason in plain words (200, not an error)', r.status === 200 && r.body.ok === false && /refused the username or password/.test(r.body.message), JSON.stringify(r.body));
r = await call('POST', `${A}/test`, { ...sales, port: 2525 }, T);
ok('nobody answering on that port → not ok, says check the port', r.status === 200 && r.body.ok === false && /port/.test(r.body.message), JSON.stringify(r.body));
r = await call('POST', `${A}/test`, { ...sales, port: 8080 }, T);
ok('a port that isn’t for email → 400', r.status === 400 && /ports/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', `${A}/test`, { ...sales, password: '' }, T);
ok('no password → not ok, says to type it', r.body?.ok === false && /password/.test(r.body.message), JSON.stringify(r.body));

/* ---------------------------------------------------------------- connect */
r = await call('POST', A, { ...sales, password: '' }, T);
ok('connecting needs the password', r.status === 400 && /password/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', A, { ...sales, email: 'not-an-address' }, T);
ok('…and a real address', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', A, sales, T);
const s = r.body.doc?.[0];
ok('connected: the first is the default, checked and working', r.status === 201 && r.body.doc.length === 1 && s.isDefault && s.verifiedAt && !s.lastError && s.email === 'sales@monabakes.example' && s.secure === false, JSON.stringify(r.body));
ok('…the password never comes back', !JSON.stringify(r.body).includes('sales-pass') && !('password' in s), '');

const help = { name: 'Support', fromName: 'Mona Bakes Help', host: '127.0.0.1', port: PORT, email: 'help@monabakes.example', password: 'wrong' };
r = await call('POST', A, help, T);
const h = r.body.doc?.find(a => a.name === 'Support');
ok('a second account with a bad password is still saved — not default, marked not working', r.status === 201 && h && !h.isDefault && /refused/.test(h.lastError) && !h.verifiedAt, JSON.stringify(h));

r = await call('POST', `${A}/test`, { ...sales, password: '', id: s._id }, T);
ok('Test while editing, password left empty → uses the saved one', r.body.ok === true, JSON.stringify(r.body));

/* ------------------------------------------------- emails use the default */
let before = inbox.length;
const custEmail = `cara${stamp}@example.com`;
await call('POST', `/public/api/${site.publicSlug}/auth/register`, { name: 'Cara', email: custEmail, password: 'customer-pass-1' });
await settle(1200);
let welcome = inbox.slice(before).find(m => m.to.some(t => t.includes(custEmail)));
ok('a customer’s welcome goes out through the default account, under its sender name', welcome && /MAIL FROM:<sales@monabakes.example>/i.test(welcome.from) && /From: Mona Bakes Sales/.test(welcome.data), welcome ? welcome.data.slice(0, 200) : 'none');

r = await call('PUT', `${A}/${h._id}`, { ...help, password: 'help-pass' }, T);
const h2 = r.body.doc?.find(a => a._id === h._id);
ok('fixing its password: re-checked, now working', r.status === 200 && h2.verifiedAt && !h2.lastError, JSON.stringify(h2));
r = await call('PUT', `${A}/${h._id}`, { ...help, password: '', name: 'Help desk' }, T);
ok('an edit with an empty password keeps the stored one', r.status === 200 && r.body.doc.find(a => a._id === h._id).name === 'Help desk' && r.body.doc.find(a => a._id === h._id).verifiedAt, JSON.stringify(r.body.doc));

r = await call('POST', `${A}/${h._id}/default`, null, T);
ok('make it the default — only one default', r.status === 200 && r.body.doc.filter(a => a.isDefault).map(a => a._id).join() === h._id, JSON.stringify(r.body.doc.map(a => [a.name, a.isDefault])));
before = inbox.length;
await call('POST', `/public/api/${site.publicSlug}/auth/register`, { name: 'Dan', email: `dan${stamp}@example.com`, password: 'customer-pass-1' });
await settle(1200);
welcome = inbox.slice(before).find(m => m.to.some(t => t.includes(`dan${stamp}`)));
ok('…the next email goes through it', welcome && /MAIL FROM:<help@monabakes.example>/i.test(welcome.from) && /From: Mona Bakes Help/.test(welcome.data), welcome ? welcome.from : 'none');

r = await call('POST', `${A}/${s._id}/send-test`, { to: 'friend@example.org' }, T);
await settle();
ok('Send a test email through a chosen (non-default) account', r.status === 200 && last()?.to.some(t => t.includes('friend@example.org')) && /MAIL FROM:<sales@monabakes.example>/i.test(last().from), `${r.status} ${r.body?.message}`);
r = await call('POST', `${A}/${s._id}/send-test`, {}, T);
await settle();
ok('…to you by default', r.status === 200 && last()?.to.some(t => t.includes(ownerEmail)), `${r.status}`);

/* ------------------------------------------------------------- the log */
r = await call('GET', A, null, T);
const log = r.body.messages;
ok('the project’s log names the account each went through', log.length >= 4 && log.every(m => m.account) && log.some(m => m.account === s._id && m.kind === 'test') && log.some(m => m.account === h._id && m.kind === 'customer-welcome'), JSON.stringify(log.map(m => [m.kind, m.account])));

/* ------------------------------------------------- who can see it */
r = await call('GET', A);
ok('needs a sign-in', r.status === 401, `${r.status}`);
r = await call('POST', '/tenant/api/auth/register', { name: 'Other', email: `other${stamp}@example.com`, password: 'tenant-pass-123', organization: `Other ${stamp}`, country: 'BD' });
const O = r.body.token;
r = await call('GET', A, null, O);
ok('another organization can’t open this project’s accounts', r.status === 404 || r.status === 403, `${r.status}`);
r = await call('POST', `${A}/${s._id}/default`, null, O);
ok('…nor change them', r.status === 404 || r.status === 403, `${r.status}`);
r = await call('POST', '/tenant/api/projects', { name: 'Other site', type: 'website' }, O);
r = await call('POST', `/tenant/api/p/${r.body._id}/mail-accounts/${s._id}/default`, null, O);
ok('…not even through a project of their own', r.status === 404, `${r.status}`);

/* ------------------------------------------- remove; the organization fallback */
r = await call('DELETE', `${A}/${h._id}`, null, T);
ok('removing the default → the one left becomes the default', r.status === 200 && r.body.doc.length === 1 && r.body.doc[0]._id === s._id && r.body.doc[0].isDefault, JSON.stringify(r.body.doc));
await call('PUT', '/tenant/api/org/mail', { host: '127.0.0.1', port: PORT, secure: false, username: 'org@monabakes.example', password: 'org-pass', fromName: 'Mona Org', fromAddress: 'org@monabakes.example' }, T);
r = await call('DELETE', `${A}/${s._id}`, null, T);
ok('removing the last one', r.status === 200 && r.body.doc.length === 0, `${r.status}`);
r = await call('GET', A, null, T);
ok('…the page says emails fall back to the organization’s server', r.body.fallback === 'org@monabakes.example', JSON.stringify(r.body.fallback));
before = inbox.length;
await call('POST', `/public/api/${site.publicSlug}/auth/register`, { name: 'Eve', email: `eve${stamp}@example.com`, password: 'customer-pass-1' });
await settle(1200);
welcome = inbox.slice(before).find(m => m.to.some(t => t.includes(`eve${stamp}`)));
ok('…and they do', welcome && /MAIL FROM:<org@monabakes.example>/i.test(welcome.from), welcome ? welcome.from : 'none');
r = await call('GET', '/tenant/api/org/mail', null, T);
ok('the organization’s log still shows everything, the project sends included', r.body.messages.some(m => m.account === s._id) && r.body.messages.some(m => !m.account && m.kind === 'customer-welcome'), '');
await call('DELETE', '/tenant/api/org/mail', null, T);

/* ------------------------------------------- deleting the project takes its accounts */
r = await call('POST', A, sales, T);
ok('an account again, before deleting the project', r.status === 201 && r.body.doc.length === 1, `${r.status}`);
const mongoose = (await import('mongoose')).default;
await mongoose.connect(process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev');
r = await call('DELETE', `/tenant/api/projects/${site._id}?force=1`, null, T);
const leftover = await mongoose.connection.db.collection('mailaccounts').countDocuments({ project: new mongoose.Types.ObjectId(site._id) });
ok('deleting the project removes its email accounts (sealed passwords and all)', r.status === 200 && leftover === 0, `${r.status} ${leftover}`);
await mongoose.disconnect();

smtp.close();
done();
