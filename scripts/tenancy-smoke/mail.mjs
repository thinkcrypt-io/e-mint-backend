// Messaging M-02: an organization's own email server (nodemailer), the test
// send, the customer welcome from the business, the send log — and MINT's own
// emails on sign-up and the waitlist. A tiny SMTP server on 127.0.0.1:2587
// stands in for the organization's (dev allows local hosts; production
// refuses them). Set SMOKE_LOG to the backend's log file to also check MINT's
// own emails (in development they're written to the log for example.com).
import net from 'net';
import fs from 'fs';
import { call, ok, done } from './lib.mjs';

/* ------------------------------------------- a mail server that keeps mail */
const PORT = 2587;
const inbox = [];
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
					sock.write('250 OK queued as sink-1\r\n');
				} else msg.data += line.replace(/^\.\./, '.') + '\n';
				continue;
			}
			const up = line.toUpperCase();
			if (up.startsWith('EHLO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
			else if (up.startsWith('HELO')) sock.write('250 OK\r\n');
			else if (up.startsWith('AUTH PLAIN')) {
				const [, user, pass] = Buffer.from(line.split(' ')[2] || '', 'base64').toString().split('\0');
				sock.write(user === 'shop@example.com' && pass === 'right-pass' ? '235 OK\r\n' : '535 5.7.8 Authentication failed\r\n');
			} else if (up.startsWith('MAIL FROM')) {
				msg.from = line;
				sock.write('250 OK\r\n');
			} else if (up.startsWith('RCPT TO')) {
				if (/bounce/i.test(line)) sock.write('550 5.1.1 No such user\r\n');
				else {
					msg.to.push(line);
					sock.write('250 OK\r\n');
				}
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
const settle = (ms = 600) => new Promise(r => setTimeout(r, ms));
const last = () => inbox[inbox.length - 1];
const decoded = m => (m?.data || '').replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/* ------------------------------------------------------------- the tenant */
const stamp = Date.now();
const ownerEmail = `mona${stamp}@example.com`;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Mona Mail', email: ownerEmail, password: 'tenant-pass-123', organization: `Mona Bakes ${stamp}`, country: 'BD' });
const T = r.body.token;
ok('a tenant', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: 'Mona site', type: 'website' }, T);
const site = r.body;

r = await call('GET', '/tenant/api/org/mail', null, T);
ok('no email server yet', r.status === 200 && r.body.settings === null && Array.isArray(r.body.messages) && r.body.ports.includes(587), JSON.stringify(r.body));
r = await call('POST', '/tenant/api/org/mail/test', {}, T);
ok('a test before it’s set up → 409, saying what to do', r.status === 409 && r.body?.code === 'mail_not_set_up', `${r.status} ${r.body?.message}`);

/* --------------------------------------------------------- the settings */
const good = { host: '127.0.0.1', port: PORT, secure: false, username: 'shop@example.com', password: 'right-pass', fromName: 'Mona Bakes', fromAddress: 'Hello@MonaBakes.example', replyTo: 'orders@monabakes.example' };
r = await call('PUT', '/tenant/api/org/mail', { ...good, port: 8080 }, T);
ok('a port that isn’t for email is refused', r.status === 400 && /ports/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', '/tenant/api/org/mail', { ...good, host: 'smtp.gmail.com/../x' }, T);
ok('a host that isn’t a name is refused', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('PUT', '/tenant/api/org/mail', { ...good, fromAddress: 'not-an-address' }, T);
ok('a “from” that isn’t an address is refused', r.status === 400 && /from/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', '/tenant/api/org/mail', { ...good, password: '' }, T);
ok('a first save with a username needs the password', r.status === 400 && /password/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', '/tenant/api/org/mail', good, T);
ok('saved; the password never comes back, only that it’s set', r.status === 200 && r.body.settings.passwordSet === true && !('password' in r.body.settings) && !JSON.stringify(r.body).includes('right-pass') && r.body.settings.fromAddress === 'hello@monabakes.example', JSON.stringify(r.body));
r = await call('GET', '/tenant/api/org/mail', null, T);
ok('…nor on reading it', r.body.settings.passwordSet === true && !JSON.stringify(r.body).includes('right-pass'), JSON.stringify(r.body.settings));

r = await call('POST', '/tenant/api/org/mail/test', {}, T);
await settle();
ok('a test email goes out through the organization’s server, to the person testing', r.status === 200 && last()?.to.some(t => t.includes(ownerEmail)) && /From: .*Mona Bakes/.test(last().data) && /Reply-To: orders@monabakes.example/i.test(last().data), `${r.status} ${r.body?.message} ${inbox.length}`);
ok('…and the settings are marked as working', !!r.body.settings?.verifiedAt && !r.body.settings.lastError, JSON.stringify(r.body.settings));
r = await call('POST', '/tenant/api/org/mail/test', { to: 'friend@example.org' }, T);
ok('…or to another address', r.status === 200 && last()?.to.some(t => t.includes('friend@example.org')), `${r.status}`);

r = await call('PUT', '/tenant/api/org/mail', { ...good, password: 'wrong-pass' }, T);
ok('a new password: saved, no longer marked working', r.status === 200 && r.body.settings.verifiedAt === null, JSON.stringify(r.body.settings));
r = await call('POST', '/tenant/api/org/mail/test', {}, T);
ok('a wrong password → the reason, in plain words', r.status === 502 && /refused the username or password/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('GET', '/tenant/api/org/mail', null, T);
ok('…kept on the settings', /refused/.test(r.body.settings.lastError) && r.body.settings.lastErrorAt, JSON.stringify(r.body.settings));
r = await call('PUT', '/tenant/api/org/mail', { ...good, password: 'right-pass' }, T);
r = await call('PUT', '/tenant/api/org/mail', { ...good, password: '', fromName: 'Mona’s Bakery' }, T);
ok('an empty password keeps the stored one', r.status === 200 && r.body.settings.passwordSet, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/org/mail/test', { to: 'bounce@example.org' }, T);
ok('an address the server won’t take → said so', r.status === 502 && /wouldn’t take this address/.test(r.body?.message), `${r.status} ${r.body?.message}`);

/* ---------------------------------------- customers get a welcome from the business */
const before = inbox.length;
const custEmail = `cara${stamp}@example.com`;
r = await call('POST', `/public/api/${site.publicSlug}/auth/register`, { name: 'Cara <b>Customer</b>', email: custEmail, password: 'customer-pass-1' });
await settle(1200);
const welcome = inbox.slice(before).find(m => m.to.some(t => t.includes(custEmail)));
ok('a customer who signs up on the site gets a welcome, from the business', r.status === 200 && welcome && /Subject: Welcome to Mona site/.test(welcome.data) && /Mona=E2=80=99s_Bakery/.test(welcome.data), welcome ? welcome.data.slice(0, 300) : `none (${inbox.length - before})`);
const htmlPart = decoded(welcome).split('text/html')[1] || '';
ok('…names in it are escaped in the HTML', !htmlPart.includes('<b>Customer</b>') && htmlPart.includes('&lt;b&gt;Customer'), htmlPart.slice(0, 200));

r = await call('PUT', '/tenant/api/org/mail', { ...good, password: '', customerWelcome: false }, T);
const before2 = inbox.length;
await call('POST', `/public/api/${site.publicSlug}/auth/register`, { name: 'Dev', email: `dev${stamp}@example.com`, password: 'customer-pass-1' });
await settle(1200);
ok('welcomes switched off → none sent', inbox.length === before2, `${inbox.length - before2}`);

/* ------------------------------------------------------------- the log */
r = await call('GET', '/tenant/api/org/mail', null, T);
const kinds = r.body.messages.map(m => `${m.kind}:${m.status}`);
ok('every send is in the log, failures with their reason', kinds.includes('test:sent') && kinds.includes('test:failed') && kinds.includes('customer-welcome:sent') && r.body.messages.some(m => m.status === 'failed' && /refused/.test(m.error)), kinds.join());
ok('…newest first, subject only', r.body.messages[0].kind === 'customer-welcome' && r.body.messages.every(m => !('text' in m) && !('html' in m)), JSON.stringify(r.body.messages[0]));

/* ------------------------------------------------- who can, and removing it */
r = await call('GET', '/tenant/api/org/mail');
ok('needs a sign-in', r.status === 401, r.status);
r = await call('POST', '/tenant/api/auth/register', { name: 'Other', email: `other${stamp}@example.com`, password: 'tenant-pass-123', organization: `Other ${stamp}`, country: 'BD' });
const O = r.body.token;
r = await call('GET', '/tenant/api/org/mail', null, O);
ok('another organization sees only its own (nothing)', r.status === 200 && r.body.settings === null && r.body.messages.length === 0, JSON.stringify(r.body).slice(0, 200));
r = await call('DELETE', '/tenant/api/org/mail', null, T);
ok('removing it', r.status === 200, `${r.status}`);
const before3 = inbox.length;
await call('POST', `/public/api/${site.publicSlug}/auth/register`, { name: 'Eve', email: `eve${stamp}@example.com`, password: 'customer-pass-1' });
await settle(1000);
ok('…and customers’ sign-ups still work, quietly with no email', inbox.length === before3);

/* ----------------------------------------------------- MINT's own emails */
if (process.env.SMOKE_LOG) {
	await call('POST', '/public/waitlist', { email: `wait${stamp}@example.com`, name: 'Walt' });
	await settle(800);
	const log = fs.readFileSync(process.env.SMOKE_LOG, 'utf8');
	ok('MINT welcomes a new account (its own mail)', log.includes(`[mail → ${ownerEmail}] Welcome to MINT`), '');
	ok('MINT confirms a waitlist sign-up with the place in the queue', new RegExp(`\\[mail → wait${stamp}@example.com\\] You're on the MINT waitlist — number \\d+`).test(log), '');
} else console.log('(SMOKE_LOG not set — MINT’s own welcome and waitlist emails not checked)');

smtp.close();
done();
