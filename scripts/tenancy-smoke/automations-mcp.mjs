// Automations over MCP (docs/automations AU-06): list_automations, save_automation (checked like the panel's,
// changes keep what's left out), test_automation (a dry run), get_automation_runs, delete_automation — and an
// email action's [words](https://…{{field}}) link, sent through the project's email account. A tiny SMTP server
// on 127.0.0.1:2587 stands in for the real one — don't run it beside mail-accounts.mjs. Stands alone.
import net from 'net';
import { call, ok, done, ROOT } from './lib.mjs';

/* ------------------------------------------------------------- mail sink */
const PORT = 2587;
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
					sock.write('250 OK queued\r\n');
				} else msg.data += line.replace(/^\.\./, '.') + '\n';
				continue;
			}
			const up = line.toUpperCase();
			if (up.startsWith('EHLO')) sock.write('250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
			else if (up.startsWith('AUTH PLAIN')) sock.write('235 OK\r\n');
			else if (up.startsWith('RCPT TO')) {
				msg.to.push((line.match(/<([^>]+)>/) || [])[1] || '');
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
const settle = (ms = 2500) => new Promise(r => setTimeout(r, ms));
const decoded = m => (m ? m.data.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : '');

/* ------------------------------------------------------------- a project */
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Nia News', email: `nia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Nia ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('a tenant', r.status === 200 && T, `${r.status} ${r.body?.message}`);
const proj = (await call('POST', '/tenant/api/projects', { name: `Nia site ${stamp}`, type: 'app' }, T)).body;
const P = path => `/tenant/api/p/${proj._id}${path}`;
r = await call('POST', P('/builder/models'), {
	name: 'Subscriber',
	title: 'Subscribers',
	displayField: 'email',
	fields: [
		{ key: 'email', label: 'Email', kind: 'email', required: true },
		{ key: 'status', label: 'Status', kind: 'select', options: [{ value: 'subscribed' }, { value: 'unsubscribed' }], default: 'subscribed' },
		{ key: 'unsubscribeCode', label: 'Unsubscribe code', kind: 'text' },
	],
}, T);
ok('a Subscribers page', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
const route = r.body?.doc?.route || 'subscribers';

const mkKey = async (name, scopes) => (await call('POST', P('/builder/api-keys'), { name, scopes }, T)).body?.secret;
const builder = await mkKey('Builder', ['read', 'build']);
const reader = await mkKey('Reader', ['read']);
const rpc = async (k, method, params) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return x.json().catch(() => null);
};
const tool = async (k, name, args = {}) => (await rpc(k, 'tools/call', { name, arguments: args }))?.result;
const text = res => res?.content?.[0]?.text || '';

/* ---------------------------------------------------------------- tools */
const init = await rpc(builder, 'initialize', { protocolVersion: '2025-06-18' });
ok('instructions mention automations', /list_automations/.test(init?.result?.instructions || ''));
const names = (await rpc(builder, 'tools/list', {}))?.result?.tools?.map(t => t.name) || [];
ok('the five tools are listed', ['list_automations', 'save_automation', 'test_automation', 'get_automation_runs', 'delete_automation'].every(n => names.includes(n)), names.join(' '));
const readNames = (await rpc(reader, 'tools/list', {}))?.result?.tools?.map(t => t.name) || [];
ok('…a read-only key gets only the reading ones', readNames.includes('list_automations') && readNames.includes('get_automation_runs') && !readNames.includes('save_automation') && !readNames.includes('delete_automation'), readNames.filter(n => /automation/.test(n)).join(' '));

let res = await tool(builder, 'list_automations');
ok('none yet, and no email account', !res?.isError && /No automations yet/.test(text(res)) && /No email account is connected/.test(text(res)), text(res));

const welcome = {
	name: 'Welcome subscribers',
	route,
	on: ['create', 'update'],
	changed: ['status'],
	when: [{ field: 'status', op: 'is', value: 'subscribed' }],
	actions: [
		{
			type: 'email',
			to: { fields: ['email'] },
			subject: 'You’re subscribed',
			body: 'Thanks for subscribing, **{{email}}**.\n\nDon’t want these any more? [Unsubscribe](https://example.com/newsletter/unsubscribe?code={{unsubscribeCode}})',
		},
	],
};
res = await tool(builder, 'save_automation', { ...welcome, actions: [{ ...welcome.actions[0], to: { fields: ['nope'] } }] });
ok('a bad one is refused with the input at fault', res?.isError && /actions\.0\.to\.fields/.test(text(res)), text(res));
res = await tool(builder, 'save_automation', { ...welcome, actions: [{ ...welcome.actions[0], body: 'Hi {{nickname}}' }] });
ok('…an unknown placeholder too', res?.isError && /nickname/.test(text(res)), text(res));
res = await tool(reader, 'save_automation', welcome);
ok('…and a read-only key can’t save', res?.isError || !res, text(res));

r = await call('POST', P('/mail-accounts'), { name: 'News', fromName: 'Nia News', host: '127.0.0.1', port: PORT, email: 'news@nia.example', password: 'x' }, T);
ok('an email account', r.status === 201, r.body?.message);
res = await tool(builder, 'save_automation', welcome);
const id = res?.structuredContent?._id || (text(res).match(/\[id ([a-f0-9]{24})\]/) || [])[1];
ok('save_automation makes it', !res?.isError && id && /Made it/.test(text(res)) && /changed \(status\)/.test(text(res)) && /status is "subscribed"/.test(text(res)) && /news@nia\.example/.test(text(res)), text(res));

res = await tool(builder, 'list_automations');
ok('list_automations shows it and where emails go out from', /Welcome subscribers/.test(text(res)) && /Nia News <news@nia\.example>/.test(text(res)) && /Email the record's email/.test(text(res)), text(res));

res = await tool(builder, 'test_automation', { id });
ok('test_automation with no records says so', res?.isError && /no records/.test(text(res)), text(res));

/* ------------------------------------------------- it runs on the records */
const add = async b => {
	const x = (await call('POST', P(`/${route}`), b, T)).body;
	return x?.doc || x;
};
const sub = await add({ email: `reader${stamp}@example.com`, status: 'subscribed', unsubscribeCode: 'c0de_abc-123' });
ok('a subscriber', !!sub?._id, JSON.stringify(sub).slice(0, 200));
await settle();
const mail = inbox.find(m => m.to.includes(`reader${stamp}@example.com`));
const raw = decoded(mail);
ok('…gets the email', !!mail, `${inbox.length} in the sink`);
ok('…with the unsubscribe link as a link', /<a href="https:\/\/example\.com\/newsletter\/unsubscribe\?code=c0de_abc-123"[^>]*>Unsubscribe<\/a>/.test(raw), raw.slice(0, 1500));
ok('…and as words + address in the text version', /Unsubscribe: https:\/\/example\.com\/newsletter\/unsubscribe\?code=c0de_abc-123/.test(raw));

res = await tool(builder, 'test_automation', { id, record: sub._id });
ok('test_automation: a dry run, nothing sent', !res?.isError && /nothing was sent/.test(text(res)) && /Would email reader/.test(text(res)) && /conditions are met/.test(text(res)), text(res));

const before = inbox.length;
await call('PUT', P(`/${route}/${sub._id}`), { status: 'unsubscribed' }, T);
await settle();
ok('unsubscribing sends nothing', inbox.length === before, `${inbox.length - before} sent`);
await call('PUT', P(`/${route}/${sub._id}`), { status: 'subscribed' }, T);
await settle();
ok('subscribing again sends it again', inbox.length === before + 1, `${inbox.length - before} sent`);

res = await tool(builder, 'get_automation_runs', { id });
ok('get_automation_runs: the runs and their emails', !res?.isError && /“Welcome subscribers”/.test(text(res)) && /→ success/.test(text(res)) && /emails: reader\S+ sent/.test(text(res)), text(res).slice(0, 800));

/* --------------------------------------------- changing and deleting it */
res = await tool(builder, 'save_automation', { id, enabled: false });
ok('{ id, enabled: false } turns it off and keeps the rest', !res?.isError && /\(off\) “Welcome subscribers”/.test(text(res)) && /changed \(status\)/.test(text(res)), text(res));
const off = inbox.length;
await add({ email: `quiet${stamp}@example.com`, status: 'subscribed', unsubscribeCode: 'q' });
await settle();
ok('…and it no longer runs', inbox.length === off, `${inbox.length - off} sent`);
r = await call('GET', P(`/automations/${id}`), null, T);
ok('the panel sees the same automation', r.status === 200 && r.body?.enabled === false && r.body?.actions?.[0]?.body?.includes('[Unsubscribe]'), JSON.stringify(r.body).slice(0, 200));

res = await tool(builder, 'delete_automation', { id });
ok('delete_automation', !res?.isError && /Deleted/.test(text(res)), text(res));
res = await tool(builder, 'list_automations');
ok('…gone', /No automations yet/.test(text(res)), text(res));

smtp.close();
done();
process.exit(0);
