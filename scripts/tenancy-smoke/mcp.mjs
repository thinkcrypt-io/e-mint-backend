// Tenant MCP: a project key builds and reads inside its project only. Uses projects.mjs's state.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const rpc = async (path, key, method, params, id = 1) => {
	const r = await fetch(ROOT + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
	let j; try { j = await r.json(); } catch { j = null; }
	return { status: r.status, body: j };
};
const tool = async (key, name, args) => (await rpc('/tenant/mcp', key, 'tools/call', { name, arguments: args })).body?.result;

let r = await call('POST', P(s.crm, '/builder/api-keys'), { name: 'Claude', scopes: ['read', 'build', 'data'] }, s.pat);
ok('create a project key', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message || ''}`);
const key = r.body?.secret || r.body?.key || r.body?.doc?.secret;
ok('secret shown once', typeof key === 'string' && key.startsWith('emk_'), typeof key);
r = await call('GET', P(s.crm, '/builder/api-keys'), null, s.pat);
ok("listed in the project's keys", r.status === 200 && JSON.stringify(r.body).includes('Claude'));
r = await call('GET', P(s.site, '/builder/api-keys'), null, s.pat);
ok("not in another project's keys", r.status === 200 && !JSON.stringify(r.body).includes('Claude'));

r = await rpc('/tenant/mcp', key, 'initialize', { protocolVersion: '2025-06-18' });
ok('initialize', r.status === 200 && !!r.body?.result?.serverInfo, r.status);
r = await rpc('/tenant/mcp', key, 'tools/list', {});
ok('tools/list', r.body?.result?.tools?.length >= 7, r.body?.result?.tools?.length);
let res = await tool(key, 'list_models', {});
const listed = JSON.stringify(res);
ok('list_models: only the project’s models', listed.includes('Invoice') && listed.includes('Client') && !listed.includes('"Admin"') && !listed.includes('Heroku'), res?.content?.[0]?.text?.slice(0, 120));
res = await tool(key, 'describe_platform', {});
ok('describe_platform: names are the project’s own', /Names belong to this project only/.test(res?.content?.[0]?.text || ''), res?.content?.[0]?.text?.slice(0, 80));
const plan = {
	title: 'Support desk', summary: 'Tickets linked to clients.', sidebarCategory: 'Pages',
	steps: [{ action: 'create', name: 'Ticket', title: 'Tickets', rationale: 'Track client requests.', displayField: 'subject',
		fields: [ { key: 'subject', label: 'Subject', kind: 'text', required: true }, { key: 'client', label: 'Client', kind: 'reference', ref: 'Client' }, { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open' }, { value: 'closed' }], default: 'open' } ] }],
};
res = await tool(key, 'plan_feature', { feature: plan });
ok('plan_feature ok (links to the project’s Client)', res && !res.isError, res?.content?.[0]?.text?.slice(-160));
res = await tool(key, 'build_feature', { feature: plan });
ok('build_feature builds it in the project', res && !res.isError && /\/t\/tickets/.test(res.content?.[0]?.text || ''), res?.content?.[0]?.text?.slice(0, 200));
r = await call('POST', P(s.crm, '/tickets'), { subject: 'Printer on fire', status: 'open' }, s.pat);
ok('the new model takes records', r.status === 201, r.status);
res = await tool(key, 'query_records', { route: 'tickets' });
ok('query_records reads them', res && !res.isError && JSON.stringify(res).includes('Printer on fire'), res?.content?.[0]?.text?.slice(0, 120));
r = await call('GET', P(s.site, '/tickets'), null, s.pat);
ok("not in the organization's other project", r.status === 404);

// Isolation between kinds of keys
r = await rpc('/mcp', key, 'tools/list', {});
ok('a project key is refused by the admin MCP', r.status === 401, r.status);
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
const ak = await call('POST', '/admin/api/builder/api-keys', { name: 'admin-key', scopes: ['read'] }, admin);
const adminKey = ak.body?.secret || ak.body?.key || ak.body?.doc?.secret;
r = await rpc('/tenant/mcp', adminKey, 'tools/list', {});
ok('an admin key is refused by the tenant MCP', r.status === 401, r.status);
r = await rpc('/mcp', adminKey, 'tools/call', { name: 'list_models', arguments: {} });
const adminList = r.body?.result?.content?.[0]?.text || '';
ok("the admin MCP doesn't list tenant models", r.status === 200 && !/^- Ticket —/m.test(adminList) && !/\bT[0-9a-f]{24}_/.test(adminList), r.status);
// Revoke
const keys = (await call('GET', P(s.crm, '/builder/api-keys'), null, s.pat)).body;
const id = (keys?.doc || keys || []).find?.(k => k.name === 'Claude')?._id;
r = await call('DELETE', P(s.crm, `/builder/api-keys/${id}`), null, s.pat);
ok('revoke the key', r.status === 200, r.status);
r = await rpc('/tenant/mcp', key, 'tools/list', {});
ok('a revoked key stops working', r.status === 401, r.status);
done();
