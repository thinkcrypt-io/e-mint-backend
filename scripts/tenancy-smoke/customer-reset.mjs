// Widgets W-25: forgot password for a project's customers — MINT's Customers
// and accounts the project's own model holds. The link is emailed from the
// business's own email server (a tiny SMTP server on 127.0.0.1:2525 stands in,
// as in mail.mjs), leads back to the page asked from when it's on the
// project's own site (localhost in development) or else to MINT's reset page,
// works once, and signs every device out.
import net from 'net';
import { ROOT, call, ok, done, projectKey, rawFetch } from './lib.mjs';

/* ------------------------------------------- a mail server that keeps mail */
const PORT = 2525;
const inbox = [];
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
					sock.write('250 OK\r\n');
				} else msg.data += line.replace(/^\.\./, '.') + '\n';
				continue;
			}
			const up = line.toUpperCase();
			if (up.startsWith('EHLO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
			else if (up.startsWith('AUTH PLAIN')) sock.write('235 OK\r\n');
			else if (up.startsWith('RCPT TO')) {
				msg.to.push(line);
				sock.write('250 OK\r\n');
			} else if (up === 'DATA') {
				inData = true;
				sock.write('354 go ahead\r\n');
			} else if (up === 'QUIT') {
				sock.write('221 bye\r\n');
				sock.end();
			} else sock.write('250 OK\r\n');
		}
	});
	sock.on('error', () => undefined);
});
await new Promise(r => smtp.listen(PORT, '127.0.0.1', r));
const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
const decoded = m => (m?.data || '').replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
// Reset emails only — sign-ups get a welcome too.
const mailTo = email => inbox.filter(m => m.to.some(t => t.toLowerCase().includes(email.toLowerCase())) && /Subject: Reset your password/.test(decoded(m)));
const linkIn = m => decoded(m).match(/(https?:\/\/\S+?)#mint_reset=([A-Za-z0-9._-]+)/);

/* ------------------------------------------------------------- the tenant */
const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rita Reset', email: `rita${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rita ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Reset site', type: 'website' }, T);
const site = r.body;
const pub = path => `/public/api/${site.publicSlug}${path}`;
ok('a tenant and a website project', !!(T && site?.publicSlug), `${r.status} ${r.body?.message}`);

r = await call('GET', P(site._id, '/widgets'), null, T);
const login = r.body.catalog.find(t => t.name === 'login');
ok('login offers “Forgot your password?”, on by default, and its texts', login.options.some(o => o.key === 'allowReset') && r.body.widgets.login.options.allowReset === true && ['forgotLink', 'forgotSent', 'resetTitle', 'resetButton'].every(k => login.texts.some(t => t.key === k)));
r = await call('GET', pub('/'));
ok('the API’s index names the forgot and reset calls', r.body?.auth?.forgot === 'auth/forgot' && r.body.auth.reset === 'auth/reset', JSON.stringify(r.body?.auth));

r = await call('POST', pub('/auth/register'), { name: 'Cara Customer', email: `cara${stamp}@example.com`, password: 'old-password-1' });
const cara = r.body;
ok('a customer', r.status === 200 && cara.token, `${r.status} ${r.body?.message}`);

r = await call('POST', pub('/auth/forgot'), { email: `cara${stamp}@example.com` });
ok('without an email server: 409 mail_not_set_up, saying so', r.status === 409 && r.body?.code === 'mail_not_set_up' && /can’t send emails/.test(r.body.message), `${r.status} ${r.body?.code}`);

r = await call('PUT', '/tenant/api/org/mail', { host: '127.0.0.1', port: PORT, secure: false, username: 'shop@example.com', password: 'right-pass', fromName: 'Reset Shop', fromAddress: 'hello@resetshop.example' }, T);
ok('(the organization’s email server set up)', r.status === 200, `${r.status} ${r.body?.message}`);

/* ------------------------------------------------- the link, and where to */
r = await call('POST', pub('/auth/forgot'), { email: `nobody${stamp}@example.com` });
const unknownAnswer = r.body?.message;
ok('an email with no account gets the same answer', r.status === 200 && /on its way/.test(unknownAnswer), `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/auth/forgot'), { email: 'not-an-email' });
ok('…a malformed email is refused', r.status === 400, `${r.status}`);

r = await call('POST', pub('/auth/forgot'), { email: `CARA${stamp}@example.com`, returnTo: 'https://evil.example/steal' });
ok('an account’s email: the same answer', r.status === 200 && r.body.message === unknownAnswer, `${r.status} ${r.body?.message}`);
await settle();
ok('…no email went to the address with no account', mailTo(`nobody${stamp}@example.com`).length === 0);
let mail = mailTo(`cara${stamp}@example.com`).pop();
let link = linkIn(mail);
ok('…one went to the customer, from the business, “Reset your password for Reset site”', !!mail && /Subject: Reset your password for Reset site/.test(decoded(mail)) && /Reset Shop/.test(decoded(mail)), decoded(mail).slice(0, 300));
const key = await projectKey(site.publicSlug);
ok('a page not on the project’s own site: the link goes to MINT’s reset page instead', link && link[1] === `${ROOT}/public/reset-password?apiKey=${key}`, link?.[1]);
const firstToken = link?.[2];

r = await call('POST', pub('/auth/forgot'), { email: `cara${stamp}@example.com`, returnTo: 'http://localhost:4100/account?tab=1#old' });
await settle();
mail = mailTo(`cara${stamp}@example.com`).pop();
link = linkIn(mail);
ok('a page on the site (localhost in development): the link comes back to it, the token after #', link && link[1] === 'http://localhost:4100/account?tab=1', link?.[1]);
const token = link?.[2];

/* --------------------------------------------------------- MINT's page */
let page = await rawFetch(`${ROOT}/public/reset-password?apiKey=${key}`);
let html = await page.text();
ok('MINT’s reset page: the project’s name, a form, no outside files, a strict CSP', page.status === 200 && /Reset site/.test(html) && /New password/.test(html) && !/src="http/.test(html) && /script-src 'nonce-/.test(page.headers.get('content-security-policy') || '') && page.headers.get('referrer-policy') === 'no-referrer', `${page.status} ${page.headers.get('content-security-policy')}`);
page = await rawFetch(`${ROOT}/public/reset-password?apiKey=mint_pk_${'0'.repeat(32)}`);
ok('…not for a key no project has', page.status === 404, page.status);

/* ----------------------------------------------------- choosing a password */
r = await call('POST', pub('/auth/reset'), { token, password: 'short' });
ok('a short password is refused', r.status === 400 && /8 characters/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/auth/reset'), { token: 'nonsense.token.here', password: 'new-password-1' });
ok('a made-up token is refused', r.status === 400 && r.body?.code === 'reset_invalid', `${r.status} ${r.body?.code}`);
r = await call('POST', pub('/auth/reset'), { token, password: 'new-password-1' });
ok('the link’s token sets the password and signs in', r.status === 200 && r.body.token && r.body.customer?.email === `cara${stamp}@example.com`, `${r.status} ${r.body?.message}`);
const fresh = r.body.token;
r = await call('GET', pub('/auth/me'), null, `Bearer ${cara.token}`);
ok('…every other device is signed out', r.status === 401, r.status);
r = await call('GET', pub('/auth/me'), null, `Bearer ${fresh}`);
ok('…the new session works', r.status === 200, r.status);
r = await call('POST', pub('/auth/login'), { email: `cara${stamp}@example.com`, password: 'old-password-1' });
ok('the old password no longer signs in', r.status === 400, r.status);
r = await call('POST', pub('/auth/login'), { email: `cara${stamp}@example.com`, password: 'new-password-1' });
ok('the new one does', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/auth/reset'), { token, password: 'another-password-1' });
ok('a link works once', r.status === 400 && r.body?.code === 'reset_invalid', `${r.status} ${r.body?.code}`);
r = await call('POST', pub('/auth/reset'), { token: firstToken, password: 'another-password-1' });
ok('…and an older link from before the reset is spent too', r.status === 400 && r.body?.code === 'reset_invalid', `${r.status} ${r.body?.code}`);

r = await call('POST', '/tenant/api/projects', { name: 'Other site', type: 'website' }, T);
const other = r.body;
r = await call('POST', `/public/api/${other.publicSlug}/auth/register`, { name: 'Cara Elsewhere', email: `cara${stamp}@example.com`, password: 'other-password-1' });
r = await call('POST', `/public/api/${other.publicSlug}/auth/forgot`, { email: `cara${stamp}@example.com` });
await settle();
const otherToken = linkIn(mailTo(`cara${stamp}@example.com`).pop())?.[2];
r = await call('POST', pub('/auth/reset'), { token: otherToken, password: 'cross-project-1' });
ok('another project’s link doesn’t work here', !!otherToken && r.status === 400 && r.body?.code === 'reset_invalid', `${r.status} ${r.body?.code}`);
await call('DELETE', `/tenant/api/projects/${other._id}?force=true`, null, T);

/* ------------------------------------------- the model holds the accounts */
r = await call('POST', P(site._id, '/builder/models'), {
	name: 'Member',
	title: 'Members',
	displayField: 'fullName',
	signIn: { enabled: true },
	fields: [
		{ key: 'fullName', label: 'Full name', kind: 'text' },
		{ key: 'email', label: 'Email', kind: 'email', required: true },
	],
}, T);
const mroute = (await call('GET', P(site._id, '/widgets/auth'), null, T)).body?.models?.find(m => m.name === 'Member')?.route;
r = await call('PUT', P(site._id, '/widgets/auth'), { auth: { model: 'Member', accounts: 'model', fields: { email: 'email', name: 'fullName' } } }, T);
ok('(Members holds the accounts)', r.status === 200 && r.body.auth?.accounts === 'model', `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/auth/register'), { name: 'Hal Held', email: `hal${stamp}@example.com`, password: 'held-password-1' });
ok('(an account Members holds)', r.status === 200, `${r.status} ${r.body?.message}`);
await call('POST', P(site._id, `/${mroute}`), { fullName: 'Desk Added', email: `desk${stamp}@example.com` }, T);

r = await call('POST', pub('/auth/forgot'), { email: `hal${stamp}@example.com` });
r = await call('POST', pub('/auth/forgot'), { email: `desk${stamp}@example.com` });
await settle();
const halToken = linkIn(mailTo(`hal${stamp}@example.com`).pop())?.[2];
ok('an account the model holds gets a link', !!halToken);
ok('…a record the team added (no account) doesn’t', mailTo(`desk${stamp}@example.com`).length === 0);
r = await call('POST', pub('/auth/reset'), { token: halToken, password: 'held-password-2' });
ok('…and its link sets the password', r.status === 200 && r.body.customer?.record, `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/auth/login'), { email: `hal${stamp}@example.com`, password: 'held-password-2' });
ok('…which signs in', r.status === 200, `${r.status} ${r.body?.message}`);

r = await call('GET', '/tenant/api/org/mail', null, T);
ok('the reset emails are in the send log, subject only', (r.body?.messages || []).some(m => m.kind === 'customer-reset' && /Reset your password/.test(m.subject)), JSON.stringify((r.body?.messages || []).slice(0, 2)));

await call('DELETE', `/tenant/api/projects/${site._id}?force=true`, null, T);
smtp.close();
done();
