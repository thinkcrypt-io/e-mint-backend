// Row menu over MCP smoke test: update_page { rowMenu } and get_model's page.rowMenu.
// Runs against a throwaway local server + database only (never a shared one):
//   mongod --dbpath <scratch> --port 27991
//   npx tsc --outDir <scratch>/be/dist, then from <scratch>/be (node_modules, .env, docs, public symlinked):
//   PORT=5031 MONGO_CONNECTION_URI=mongodb://127.0.0.1:27991/emint_rowmenu node dist/server.js
//   SMOKE_ROOT=http://localhost:5031 SMOKE_MONGO=mongodb://127.0.0.1:27991/emint_rowmenu node scripts/row-menu/smoke.mjs
import { createRequire } from 'module';
const BACKEND = process.env.BACKEND_DIR || new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(BACKEND + '/package.json');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: BACKEND + '/.env' });

const ROOT = process.env.SMOKE_ROOT || 'http://localhost:5031';
const MONGO = process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27991/emint_rowmenu';
if (!/127\.0\.0\.1|localhost/.test(MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');

let fails = 0;
const ok = (label, cond, extra = '') => {
	if (!cond) fails++;
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`);
};
const call = async (method, path, body, token) => {
	const r = await fetch(ROOT + '/admin/api' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
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
const role = (await db.collection('adminroles').insertOne({ name: `RM full ${stamp}`, permissions: ['*'], isActive: true })).insertedId;
const admin = (await db.collection('admins').insertOne({ name: 'RM Smoke', email: `rm-${stamp}@example.com`, role, isActive: true })).insertedId;
const T = jwt.sign({ _id: admin }, process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542', { expiresIn: '20m' });

const made = await call(
	'POST',
	'/builder/models',
	{
		title: `RM Bill ${stamp}`,
		name: `RmBill${stamp}`,
		fields: [
			{ key: 'name', label: 'Name', kind: 'text', required: true },
			{ key: 'status', label: 'Status', kind: 'select', options: [{ value: 'due' }, { value: 'paid' }, { value: 'void' }], default: 'due' },
			{ key: 'total', label: 'Total', kind: 'number' },
		],
	},
	T
);
if (made.status !== 201) throw new Error(`model: ${made.status} ${JSON.stringify(made.body)}`);
const bill = made.body.doc;
await new Promise(r => setTimeout(r, 11000)); // dynamic models sync every 10s

const tpl = async (name, kind) => {
	const r = await call('POST', '/pdf-templates', { name, kind, route: bill.route, alias: 'bill', body: [{ type: 'text', text: '{{bill.name}}' }] }, T);
	const doc = r.body?.doc || r.body;
	if (!doc?._id) throw new Error(`template ${name}: ${r.status} ${JSON.stringify(r.body)}`);
	return doc;
};
const invoice = await tpl('Smoke invoice', 'invoice');
const receipt = await tpl('Smoke receipt', 'receipt');

const key = await call('POST', '/builder/api-keys', { name: 'RM smoke', scopes: ['read', 'build'] }, T);
let n = 1;
const rpc = async (method, params) =>
	(
		await fetch(`${ROOT}/mcp`, {
			method: 'POST',
			headers: { authorization: `Bearer ${key.body.secret}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
			body: JSON.stringify({ jsonrpc: '2.0', id: n++, method, params }),
		}).then(x => x.json())
	).result;
const tool = (name, args) => rpc('tools/call', { name, arguments: args });
const text = r => r?.content?.[0]?.text || '';
const menuOf = async () => (await db.collection('routeconfigs').findOne({ route: bill.route }))?.data?.route?.menu;

ok('(R1) update_page offers rowMenu', !!(await rpc('tools/list', {})).tools.find(t => t.name === 'update_page')?.inputSchema?.properties?.rowMenu);

let r = await tool('update_page', { route: bill.route, rowMenu: [{ type: 'teleport', title: 'Beam me up' }] });
ok('(R2) an unknown type is refused', r.isError && /unknown type/.test(text(r)), text(r));
r = await tool('update_page', { route: bill.route, rowMenu: [{ type: 'download-pdf', title: 'Receipt', template: 'No such template' }] });
ok('(R3) a template the page lacks is refused', r.isError && /no PDF template/.test(text(r)), text(r));
r = await tool('update_page', { route: bill.route, rowMenu: [{ type: 'download-pdf', title: 'Receipt', showIf: [{ field: 'nope', op: 'is', value: 'paid' }] }] });
ok('(R4) showIf on a field the page lacks is refused', r.isError && /showIf/.test(text(r)), text(r));
r = await tool('update_page', { route: bill.route, rowMenu: [{ type: 'download-pdf', title: 'Receipt', showIf: [{ field: 'status', op: 'equals', value: 'paid' }] }] });
ok('(R5) an unknown op is refused', r.isError && /op/.test(text(r)), text(r));
r = await tool('update_page', { route: bill.route, rowMenu: [{ type: 'set-field', title: 'Void' }] });
ok('(R6) a missing required parameter is refused', r.isError && /needs key/.test(text(r)), text(r));
ok('(R6) …and nothing was saved', !(await menuOf()), await menuOf());

r = await tool('update_page', {
	route: bill.route,
	rowMenu: [
		{ type: 'view-server-modal', title: 'View' },
		{ type: 'download-pdf', title: 'Download receipt', template: receipt.name, showIf: [{ field: 'status', op: 'is', value: 'paid' }] },
		{ type: 'download-pdf', title: 'Download invoice', template: String(invoice._id), showIf: [{ field: 'status', op: 'not', value: 'paid' }, { field: 'status', op: 'not', value: 'void' }] },
		{ type: 'set-field', title: 'Mark as void', key: 'status', value: 'void', showIf: [{ field: 'status', op: 'not', value: 'void' }] },
		{ type: 'delete', title: 'Delete' },
	],
});
ok('(R7) a good menu is published', !r.isError && /Row menu:/.test(text(r)), text(r));
const saved = await menuOf();
ok('(R7) five items, in order', saved?.map(m => m.title).join('|') === 'View|Download receipt|Download invoice|Mark as void|Delete', saved);
ok('(R8) a template named by name is stored by id', saved?.[1]?.template === String(receipt._id), saved?.[1]);
ok('(R8) …and one given by id stays that id', saved?.[2]?.template === String(invoice._id), saved?.[2]);
ok('(R9) showIf kept, match all by default', saved?.[2]?.showIf?.length === 2 && saved[2].showMatch === undefined, saved?.[2]);

const gm = await tool('get_model', { name: bill.route });
ok('(R10) get_model returns page.rowMenu', gm.structuredContent?.page?.rowMenu?.length === 5 || /Download receipt \(download-pdf/.test(text(gm)), text(gm).split('\n').find(l => l.startsWith('Row menu')));
ok('(R10) …and says when an item shows', /only when status is paid/.test(text(gm)), text(gm).split('\n').find(l => l.startsWith('Row menu')));

const kept = await db.collection('routeversions').findOne({ route: bill.route, kind: 'config', note: /MCP/ }, { sort: { version: -1 } });
ok('(R11) a version is kept in the route builder', kept?.data?.route?.menu?.length === 5, kept?.version);

r = await tool('update_page', { route: bill.route, rowMenu: [] });
ok('(R12) an empty list clears the menu', !r.isError && Array.isArray(await menuOf()) && !(await menuOf()).length, await menuOf());

await mongoose.disconnect();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
