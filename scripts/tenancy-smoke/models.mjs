import { call, ok, done, load } from './lib.mjs';
const s = load(); // from smoke-projects: pat (Initech, crm + site), other (Umbrella)
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const client = { name: 'Client', title: 'Clients', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'email', label: 'Email', kind: 'email' }] };
const invoice = (prefix) => ({ name: 'Invoice', title: 'Invoices', code: { enabled: true, prefix, padding: 4 }, displayField: 'title', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'amount', label: 'Amount', kind: 'number' },
	{ key: 'client', label: 'Client', kind: 'reference', ref: 'Client' },
] });

let r = await call('POST', '/tenant/api/projects', { name: 'Ops' }, s.other);
const ops = r.body._id;
r = await call('GET', P(s.crm, '/sidebarcategories'), null, s.pat);
const section = r.body?.doc?.[0]?._id;
ok('project has its sidebar section', !!section && r.body.doc.length === 1, r.body?.doc?.length);
// Project A (Initech CRM)
r = await call('POST', P(s.crm, '/builder/models'), client, s.pat);
ok('A: create Client model', r.status === 201 && r.body?.doc?.route === 'clients', `${r.status} ${r.body?.message || ''} ${JSON.stringify(r.body?.problems || '')}`);
r = await call('POST', P(s.crm, '/builder/models'), { ...invoice('INV'), sidebar: { category: section } }, s.pat);
ok('A: create Invoice model (refs Client)', r.status === 201 && r.body?.doc?.route === 'invoices' && r.body?.doc?.collectionName === `t_${s.crm}_invoices`, `${r.status} ${r.body?.message || ''} ${r.body?.doc?.collectionName || ''} ${JSON.stringify(r.body?.problems || '')}`);
// Project B (Umbrella Ops) — same names
r = await call('POST', P(ops, '/builder/models'), client, s.other);
ok('B: same model name in another org', r.status === 201 && r.body?.doc?.name === 'Client', `${r.status} ${r.body?.message || ''}`);
r = await call('POST', P(ops, '/builder/models'), invoice('UMB'), s.other);
ok('B: Invoice too', r.status === 201, r.body?.message);
r = await call('POST', P(s.crm, '/builder/models'), { ...client }, s.pat);
ok('A: a second Client gets a new name', r.status === 201 && r.body?.doc?.name === 'Client2', r.body?.doc?.name);
const client2Id = r.body?.doc?._id;
// Records
r = await call('POST', P(s.crm, '/clients'), { name: 'Acme Ltd', email: 'acme@example.com' }, s.pat);
ok('A: create a client record', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message || ''}`);
const acme = r.body?._id || r.body?.doc?._id;
r = await call('POST', P(s.crm, '/invoices'), { title: 'First invoice', amount: 120, client: acme }, s.pat);
ok('A: create an invoice', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', P(s.crm, '/invoices?limit=10'), null, s.pat);
ok('A: list invoices — code INV-0001', r.status === 200 && r.body?.doc?.length === 1 && r.body.doc[0].code === 'INV-0001', `${r.status} ${JSON.stringify(r.body?.doc?.[0]?.code)}`);
const invId = r.body?.doc?.[0]?._id;
r = await call('GET', P(s.crm, `/invoices/${invId}`), null, s.pat);
ok('A: get one (client populated)', r.status === 200 && (r.body?.client?.name === 'Acme Ltd' || r.body?.doc?.client?.name === 'Acme Ltd'), JSON.stringify(r.body?.client || r.body?.doc?.client));
r = await call('GET', P(ops, '/invoices?limit=10'), null, s.other);
ok("B: doesn't see A's invoices", r.status === 200 && r.body?.doc?.length === 0, r.body?.doc?.length);
r = await call('POST', P(ops, '/invoices'), { title: 'Umbrella one' }, s.other);
r = await call('GET', P(ops, '/invoices'), null, s.other);
ok('B: its own numbering (UMB-0001)', r.body?.doc?.[0]?.code === 'UMB-0001', r.body?.doc?.[0]?.code);
// Isolation across orgs
r = await call('GET', P(s.crm, '/invoices'), null, s.other);
ok("B's token can't open A's project", r.status === 404);
r = await call('GET', P(s.site, '/invoices'), null, s.pat);
ok("A's other project doesn't have A's models", r.status === 404, r.status);
// Config / builder
r = await call('GET', P(s.crm, '/invoices/get/config'), null, s.pat);
ok('table config served', r.status === 200 && !!r.body, r.status);
r = await call('GET', P(s.crm, '/builder/models'), null, s.pat);
ok('builder lists the project models only', r.status === 200 && (r.body?.doc || r.body)?.length === 3, JSON.stringify((r.body?.doc || r.body || []).map?.(d => d.name)));
r = await call('GET', P(s.crm, '/builder/model/Admin'), null, s.pat);
ok("platform models can't be inspected", r.status === 404, r.status);
r = await call('GET', P(s.crm, `/builder/model/T${ops}_Invoice`), null, s.pat);
ok("another project's models can't be inspected", r.status === 404, r.status);
r = await call('GET', P(s.crm, '/builder/routes'), null, s.pat);
const routes = JSON.stringify(r.body);
ok('route builder lists only project routes', r.status === 200 && routes.includes('invoices') && !routes.includes('herokus') && !routes.includes('"admins"'), r.status);
r = await call('POST', P(s.crm, '/builder/models/ai'), { prompt: 'x' }, s.pat);
ok('Build with AI refused for projects', r.status === 403);
r = await call('PUT', P(s.crm, '/builder/state'), { settings: 'code' }, s.pat);
ok('global source switch refused', r.status === 403);
r = await call('GET', P(s.crm, '/herokus'), null, s.pat);
ok('admin code routes are not reachable', r.status === 404, r.status);
// Sidebar
r = await call('GET', P(s.crm, '/sidebar/crm/server'), null, s.pat);
ok('project sidebar lists its models', r.status === 200 && JSON.stringify(r.body).includes('/invoices'), r.status);
ok('sidebar: Files → Media library, not under Build', r.body?.some?.(i => i.sectionTitle === 'Files' && i.href === '/images') && r.body.filter(i => i.href === '/images').length === 1);
r = await call('GET', P(s.crm, '/sidebar/crm/admin'), null, s.pat);
ok("admin's built-in nav not served", r.status === 404);
// Super admin unaffected
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
r = await call('GET', '/admin/api/builder/models', null, admin);
ok('super admin builder sees no tenant models', r.status === 200 && (r.body?.doc || r.body).length === 0, (r.body?.doc || r.body).length);
r = await call('GET', '/admin/api/clients', null, admin);
ok('super admin has no tenant routes', r.status !== 200 || !JSON.stringify(r.body).includes('Acme Ltd'), r.status);
// Delete a model, then the project with data
r = await call('DELETE', P(s.crm, `/builder/models/${client2Id}?dropData=true`), null, s.pat);
ok('delete a model', r.status === 200, r.body?.message);
r = await call('DELETE', `/tenant/api/projects/${ops}`, null, s.other);
ok('project with models needs force', r.status === 400 && r.body?.code === 'has_models');
r = await call('DELETE', `/tenant/api/projects/${ops}?force=1`, null, s.other);
ok('owner force-deletes it', r.status === 200, r.body?.message);
r = await call('GET', P(ops, '/invoices'), null, s.other);
ok('…its routes are gone', r.status === 404);
console.log('ops', ops);
done();
