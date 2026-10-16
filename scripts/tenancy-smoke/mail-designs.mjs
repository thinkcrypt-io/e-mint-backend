// Messaging M-03a: how a project's emails look — designs (plain or designed:
// header, colours, footer), checks at save, the live preview, the default,
// a test send, an automation's email in the default design and in a chosen
// one, removing. A tiny SMTP server on 127.0.0.1:2587 stands in for the real
// one (dev allows local hosts) — don't run it beside mail-accounts.mjs.
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
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rita Sweets', email: `rita${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rita Sweets ${stamp}`, country: 'BD' });
const T = r.body.token;
ok('a tenant', r.status === 200 && T, `${r.status} ${r.body?.message}`);
const shop = (await call('POST', '/tenant/api/projects', { name: 'Rita shop', type: 'app' }, T)).body;
const P = path => `/tenant/api/p/${shop._id}${path}`;
const D = P('/mail-designs');
await call('PUT', `/tenant/api/projects/${shop._id}`, { business: { name: 'Rita Sweets Ltd', address: '12 Lake Road, Dhaka', phone: '', email: '', website: '', taxId: '', logo: '' } }, T);

r = await call('GET', D, null, T);
ok('no designs yet; fonts, widths, placeholders and defaults to start from', r.status === 200 && r.body.doc.length === 0 && r.body.fonts.length >= 4 && r.body.placeholders.includes('business.name') && r.body.defaults.style === 'designed', JSON.stringify(r.body).slice(0, 300));
const business = r.body.business;

/* ---- the preview */
r = await call('POST', `${D}/preview`, { design: { style: 'designed', colors: { button: '#e11d48' }, footer: { text: '{{business.name}}\n{{business.phone}}\n© {{year}}' } } }, T);
ok('the preview: a sample email in the design', r.status === 200 && r.body.html.includes('View your order') && r.body.html.includes('background:#e11d48'), r.body?.message);
ok('…the footer filled from the business details, empty lines dropped', r.body.html.includes(`${business.name}<br>© ${new Date().getFullYear()}`), business.name);
r = await call('POST', `${D}/preview`, { design: { style: 'plain', footer: { text: 'Rita' } } }, T);
ok('a plain preview: no card, no header, the button as a link, the signature', r.status === 200 && !r.body.html.includes('<table') && /<a href="https:\/\/example.com\/orders\/1042" style="color:/.test(r.body.html) && r.body.html.includes('>Rita</p>'), r.body.html?.slice(0, 200));
r = await call('POST', `${D}/preview`, { design: { header: { title: '<script>x</script>' }, colors: { text: 'red;background:url(x)' } } }, T);
ok('the preview escapes text and ignores a colour that isn’t one', !r.body.html.includes('<script>x') && !r.body.html.includes('url(x)'), '');

/* ---- checks at save */
r = await call('POST', D, { name: 'x', colors: { button: 'blue' } }, T);
ok('a colour that isn’t #rrggbb is refused', r.status === 400 && /#1f2937/.test(r.body?.message), r.body?.message);
r = await call('POST', D, { name: 'x', footer: { text: 'Hi {{nope}}' } }, T);
ok('an unknown placeholder is refused, naming the ones it takes', r.status === 400 && /\{\{nope\}\}/.test(r.body?.message) && /business.address/.test(r.body?.message), r.body?.message);
r = await call('POST', D, { name: 'x', header: { logo: 'javascript:alert(1)' } }, T);
ok('a logo that isn’t a web address is refused', r.status === 400, r.body?.message);
r = await call('POST', D, { name: '' }, T);
ok('a design needs a name', r.status === 400 && /Name/.test(r.body?.message), r.body?.message);

/* ---- save */
r = await call('POST', D, { name: 'Brand', style: 'designed', font: 'serif', header: { title: '{{business.name}}', background: '#065f46', color: '#ffffff' }, colors: { button: '#065f46' }, footer: { text: '{{business.name}} · {{business.address}}' } }, T);
const brand = r.body.doc?.find(d => d.name === 'Brand');
ok('the first design is the default, every part filled', r.status === 200 && brand?.isDefault && brand.colors.page === '#f4f4f5' && brand.font === 'serif' && brand.width === 560, JSON.stringify(r.body));
r = await call('POST', D, { name: 'Plain', style: 'plain', footer: { text: 'Rita\n{{business.name}}' } }, T);
const plain = r.body.doc?.find(d => d.name === 'Plain');
ok('a second one is not the default', plain && !plain.isDefault, JSON.stringify(r.body?.doc));
r = await call('PUT', `${D}/${plain._id}`, { ...plain, footer: { text: 'Rita, Rita Sweets' } }, T);
ok('edited', r.status === 200 && r.body.doc.find(d => d._id === plain._id)?.footer.text === 'Rita, Rita Sweets', JSON.stringify(r.body));

/* ---- send: a test, then an automation */
r = await call('POST', P('/mail-accounts'), { name: 'Hello', fromName: 'Rita Sweets', host: '127.0.0.1', port: PORT, email: 'hello@ritasweets.example', password: 'rita-pass' }, T);
ok('an email account', r.status === 201, r.body?.message);
let n = inbox.length;
r = await call('POST', `${D}/${brand._id}/send-test`, { to: 'me@example.com' }, T);
await settle();
ok('a test in the design arrives', r.status === 200 && inbox.length === n + 1 && last().data.includes('065f46'), `${r.status} ${r.body?.message}`);

await call('POST', P('/builder/models'), { name: 'Bill', title: 'Bills', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'email', label: 'Email', kind: 'email' }] }, T);
r = await call('POST', P('/automations'), { name: 'Bill made', route: 'bills', on: ['create'], actions: [{ type: 'email', to: { fields: ['email'] }, subject: 'Your bill {{name}}', body: 'Hello,\n\nYour bill is ready.' }] }, T);
const auto = r.body;
ok('an automation emailing the customer', r.status === 201, r.body?.message);
n = inbox.length;
await call('POST', P('/bills'), { name: 'B-1', email: 'cust@example.com' }, T);
await settle(2000);
ok('its email goes out in the default design', inbox.length === n + 1 && last().data.includes('065f46') && /Rita Sweets Ltd/.test(last().data), last()?.data?.slice(0, 200));

r = await call('PUT', P(`/automations/${auto._id}`), { ...auto, actions: [{ ...auto.actions[0], design: plain._id }] }, T);
ok('…or picks another', r.status === 200 && r.body.actions?.[0]?.design === plain._id, JSON.stringify(r.body?.actions));
n = inbox.length;
await call('POST', P('/bills'), { name: 'B-2', email: 'cust@example.com' }, T);
await settle(2000);
ok('…and goes out plain, signed', inbox.length === n + 1 && !last().data.includes('065f46') && last().data.includes('Rita, Rita Sweets'), last()?.data?.slice(0, 300));
r = await call('PUT', P(`/automations/${auto._id}`), { ...auto, actions: [{ ...auto.actions[0], design: '5f0000000000000000000000' }] }, T);
ok('a design that isn’t the project’s is refused, under its input', r.status === 400 && r.body?.on === 'actions.0.design', JSON.stringify(r.body));

/* ---- the default, removing */
r = await call('POST', `${D}/${plain._id}/default`, null, T);
ok('make another the default', r.body.doc.find(d => d._id === plain._id)?.isDefault && !r.body.doc.find(d => d._id === brand._id)?.isDefault, JSON.stringify(r.body));
r = await call('DELETE', `${D}/${plain._id}`, null, T);
ok('removing the default makes the oldest left the default', r.body.doc.length === 1 && r.body.doc[0].isDefault, JSON.stringify(r.body));
r = await call('DELETE', `${D}/${brand._id}`, null, T);
n = inbox.length;
await call('POST', P('/automations'), { name: 'Classic', route: 'bills', on: ['create'], actions: [{ type: 'email', to: { emails: ['x@example.com'] }, subject: 'Hi', body: 'Hi' }] }, T);
await call('POST', P('/bills'), { name: 'B-3' }, T);
await settle(2000);
ok('no designs left: back to the classic look', inbox.length >= n + 1 && last().data.includes('#111827'), '');

/* ---- permissions */
const other = (await call('POST', '/tenant/api/auth/register', { name: 'Ola', email: `ola${stamp}@example.com`, password: 'tenant-pass-123', organization: `Ola ${stamp}`, country: 'BD' })).body.token;
r = await call('GET', D, null, other);
ok('another organization can’t see them', r.status === 403 || r.status === 404, r.status);

smtp.close();
done();
process.exit(0);
