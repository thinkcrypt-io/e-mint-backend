// Automations (AU-03c): an automation email kept as sent — viewing it and
// resending a failed one. Bold, italic and a list (right under a line) in the message; one of two
// addresses refused (the other still goes); the run listing its emails; the
// email as sent (HTML + text, the PDF's name); Resend carrying the same
// subject, body and PDF; no second resend; a resend that fails again; an email
// with no account connected logged failed and resent once one is; Project →
// Email's log doing the same; another project's email a 404.
// A tiny SMTP server on 127.0.0.1:2525 stands in for the real one — don't run
// it beside mail-accounts.mjs.
import net from 'net';
import { call, ok, done } from './lib.mjs';

/* ------------------------------------- a mail server that can refuse some */
const PORT = 2525;
const USERS = { 'hello@ritasweets.example': 'rita-pass' };
const inbox = [];
const refused = new Set(['nope@example.com']);
const smtp = net.createServer(sock => {
	sock.write('220 sink ESMTP\r\n');
	let buf = '';
	let inData = false;
	let msg = { to: [], data: '' };
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
					msg = { to: [], data: '' };
					sock.write('250 OK queued\r\n');
				} else msg.data += line.replace(/^\.\./, '.') + '\n';
				continue;
			}
			const up = line.toUpperCase();
			if (up.startsWith('EHLO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
			else if (up.startsWith('HELO')) sock.write('250 OK\r\n');
			else if (up.startsWith('AUTH PLAIN')) {
				const [, user, pass] = Buffer.from(line.split(' ')[2] || '', 'base64').toString().split('\0');
				sock.write(USERS[user] && USERS[user] === pass ? '235 OK\r\n' : '535 5.7.8 Authentication failed\r\n');
			} else if (up.startsWith('MAIL FROM')) sock.write('250 OK\r\n');
			else if (up.startsWith('RCPT TO')) {
				const to = (line.match(/<([^>]+)>/) || [])[1] || '';
				if (refused.has(to.toLowerCase())) sock.write('550 5.1.1 No such mailbox here\r\n');
				else {
					msg.to.push(to);
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
const settle = (ms = 2500) => new Promise(r => setTimeout(r, ms));
const decoded = m => m && m.data.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/* ------------------------------------------------------------- the tenant */
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rita Sweets', email: `ritar${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rita Resend ${stamp}`, country: 'BD' });
const T = r.body.token;
ok('a tenant', r.status === 200 && T, `${r.status} ${r.body?.message}`);
const shop = (await call('POST', '/tenant/api/projects', { name: 'Rita resend', type: 'app' }, T)).body;
const other = (await call('POST', '/tenant/api/projects', { name: 'Rita other', type: 'app' }, T)).body;
const P = (path, p = shop) => `/tenant/api/p/${p._id}${path}`;
const account = { name: 'Hello', fromName: 'Rita Sweets', host: '127.0.0.1', port: PORT, email: 'hello@ritasweets.example', password: 'rita-pass' };
r = await call('POST', P('/mail-accounts'), account, T);
ok('an email account', r.status === 201, r.body?.message);

r = await call('POST', P('/builder/models'), { name: 'Client', title: 'Clients', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'email', label: 'Email', kind: 'email' }] }, T);
ok('a Clients page', r.status === 201, r.body?.message);
r = await call('POST', P('/pdf-templates'), { name: 'Card', route: 'clients', alias: 'client', status: 'published', body: [{ type: 'text', text: 'Welcome card for {{client.name}}' }] }, T);
const card = r.body;
ok('a published PDF for clients', r.status === 201 && card?._id, JSON.stringify(r.body).slice(0, 200));

const body = 'Hello {{name}},\n\nThanks for **joining** — *really*.\n\nYou get:\n- One cake\n- Two candles\n\nPrice 2*3*4 stays as it is.';
r = await call(
	'POST',
	P('/automations'),
	{ name: 'Welcome', route: 'clients', on: ['create'], actions: [{ type: 'email', to: { fields: ['email'], emails: ['nope@example.com'] }, subject: 'Welcome {{name}}', body, attach: [card._id] }] },
	T
);
const auto = r.body;
ok('an automation emailing the client and a typed address', r.status === 201, JSON.stringify(r.body).slice(0, 200));

const add = async (route, b) => {
	const x = (await call('POST', P(`/${route}`), b, T)).body;
	return x?.doc || x;
};

/* ---- one address refused, the other still goes */
let n = inbox.length;
const sam = await add('clients', { name: 'Sam *Star* Lee', email: 'sam@example.com' });
await settle();
ok('the client got it', inbox.length === n + 1 && inbox[inbox.length - 1].to.includes('sam@example.com'), JSON.stringify(inbox.map(m => m.to)));
r = await call('GET', P(`/automations/${auto._id}/runs`), null, T);
let run = r.body?.doc?.[0];
ok('the run failed, saying who did and didn’t get it', run?.status === 'failed' && /Emailed sam@example.com, but not nope@example.com/.test(run?.steps?.[0]?.detail || ''), JSON.stringify(run?.steps));
const emails = run?.emails || [];
const good = emails.find(e => e.to === 'sam@example.com');
const bad = emails.find(e => e.to === 'nope@example.com');
ok('the run lists both emails', emails.length === 2 && good?.status === 'sent' && bad?.status === 'failed', JSON.stringify(emails));
ok('only the failed one can be resent', bad?.canResend === true && good?.canResend === false && bad?.kept && /No such mailbox/.test(bad?.error || ''), JSON.stringify(bad));
ok('it names the PDF it carried', bad?.files?.[0]?.filename?.endsWith('.pdf'), JSON.stringify(bad?.files));

/* ---- the email as sent */
r = await call('GET', P(`/automations/emails/${bad._id}`), null, T);
const view = r.body;
ok('the email as sent', r.status === 200 && view.subject === 'Welcome Sam *Star* Lee' && view.to === 'nope@example.com', JSON.stringify(view).slice(0, 200));
ok('…bold, italic and a list in the HTML', /<b>joining<\/b>/.test(view.html) && /<i>really<\/i>/.test(view.html) && /You get:<\/p><ul[^>]*><li>One cake<\/li><li>Two candles<\/li><\/ul>/.test(view.html), view.html?.slice(0, 400));
ok('…a value’s * and a sum’s * left alone', /Hello Sam \*Star\* Lee/.test(view.html) && /2\*3\*4/.test(view.html), view.html?.match(/Hello[^<]*/)?.[0]);
ok('…the text without the marks', /Thanks for joining — really\./.test(view.text) && /- One cake/.test(view.text) && /Hello Sam \*Star\* Lee/.test(view.text), view.text);
const sent = decoded(inbox[inbox.length - 1]);
ok('the client’s copy had the same HTML', /<b>joining<\/b>/.test(sent || ''), (sent || '').slice(0, 200));

/* ---- resend */
refused.delete('nope@example.com');
n = inbox.length;
r = await call('POST', P(`/automations/emails/${bad._id}/resend`), {}, T);
const again = r.body;
ok('resent', r.status === 200 && again?.status === 'sent' && again?.resendOf === bad._id && again?.to === 'nope@example.com', JSON.stringify(r.body).slice(0, 300));
const m2 = decoded(inbox[inbox.length - 1]);
ok('…the same email, PDF and all', inbox.length === n + 1 && inbox[inbox.length - 1].to.includes('nope@example.com') && /Subject: Welcome Sam \*Star\* Lee/.test(m2) && /<b>joining<\/b>/.test(m2) && /Content-Type: application\/pdf/.test(m2), m2?.slice(0, 300));
r = await call('GET', P(`/automations/${auto._id}/runs`), null, T);
run = r.body?.doc?.[0];
const after = run?.emails?.find(e => e._id === bad._id);
ok('the failed one says it was resent, and the run still lists two', run?.emails?.length === 2 && after?.resent?.status === 'sent' && after?.canResend === false, JSON.stringify(after));
r = await call('POST', P(`/automations/emails/${bad._id}/resend`), {}, T);
ok('no second resend', r.status === 400 && /already resent/.test(r.body?.message), JSON.stringify(r.body));
r = await call('POST', P(`/automations/emails/${good._id}/resend`), {}, T);
ok('a sent one isn’t resent', r.status === 400 && /nothing to resend/.test(r.body?.message), JSON.stringify(r.body));

/* ---- a resend that fails too */
refused.add('nope@example.com');
await add('clients', { name: 'Ada', email: 'ada@example.com' });
await settle();
run = (await call('GET', P(`/automations/${auto._id}/runs`), null, T)).body?.doc?.[0];
const bad2 = run?.emails?.find(e => e.status === 'failed');
r = await call('POST', P(`/automations/emails/${bad2?._id}/resend`), {}, T);
ok('a resend refused again says why', r.status === 502 && /No such mailbox/.test(r.body?.message), JSON.stringify(r.body));
r = await call('GET', P(`/automations/emails/${bad2?._id}`), null, T);
ok('…and it can still be resent', r.body?.resent?.status === 'failed' && r.body?.canResend === true, JSON.stringify(r.body?.resent));

/* ---- no email account: logged failed, resent once one is connected */
const acct = (await call('GET', P('/mail-accounts'), null, T)).body?.doc?.[0];
r = await call('DELETE', P(`/mail-accounts/${acct?._id}`), null, T);
ok('the account removed', r.status === 200 && !r.body?.doc?.length, JSON.stringify(r.body));
refused.clear();
await add('clients', { name: 'Bo', email: 'bo@example.com' });
await settle();
run = (await call('GET', P(`/automations/${auto._id}/runs`), null, T)).body?.doc?.[0];
const unsent = run?.emails?.find(e => e.to === 'bo@example.com');
ok('with no account the email is logged as failed, saying so', run?.status === 'failed' && unsent?.status === 'failed' && /Connect an email account/.test(unsent?.error || '') && unsent?.canResend, JSON.stringify(run?.emails));
r = await call('POST', P(`/automations/emails/${unsent?._id}/resend`), {}, T);
ok('resend before connecting one says so', r.status === 409 && /Connect an email account/.test(r.body?.message), JSON.stringify(r.body));
await call('POST', P('/mail-accounts'), account, T);
n = inbox.length;
r = await call('POST', P(`/automations/emails/${unsent?._id}/resend`), {}, T);
ok('connected: resend goes', r.status === 200 && r.body?.status === 'sent' && inbox.length === n + 1 && inbox[inbox.length - 1].to.includes('bo@example.com'), JSON.stringify(r.body).slice(0, 200));

/* ---- Project → Email's log */
r = await call('GET', P('/mail-accounts'), null, T);
const log = r.body?.messages || [];
const failedRow = log.find(m => m._id === bad2?._id);
ok('the project’s log marks kept and resendable emails', failedRow?.kept && failedRow?.canResend && log.some(m => m.resendOf === bad._id), JSON.stringify(failedRow));
r = await call('GET', P(`/mail-accounts/messages/${bad2?._id}`), null, T);
ok('…shows one with its body', r.status === 200 && /<b>joining<\/b>/.test(r.body?.html || ''), JSON.stringify(r.body).slice(0, 200));
n = inbox.length;
r = await call('POST', P(`/mail-accounts/messages/${bad2?._id}/resend`), {}, T);
ok('…and resends it', r.status === 200 && r.body?.status === 'sent' && inbox.length === n + 1, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', P(`/mail-accounts/messages/${bad._id}`, other), null, T);
ok('another project can’t see it', r.status === 404, JSON.stringify(r.body));
r = await call('POST', P(`/automations/emails/${bad2?._id}/resend`, other), {}, T);
ok('…or resend it', r.status === 404, JSON.stringify(r.body));
r = await call('GET', P('/automations/emails/nonsense'), null, T);
ok('a bad id is a 404', r.status === 404, JSON.stringify(r.body));

smtp.close();
done();
process.exit(0);
