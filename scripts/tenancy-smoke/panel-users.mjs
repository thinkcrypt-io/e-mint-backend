// Panel users + reports (docs/panel-users PU-01…03, RP-01…03): any project's own logins with panel roles or super
// admin, signed in at the panel app; saved reports made with Build, run and downloaded under the reader's permissions.
import { ROOT, call, ok, done } from './lib.mjs';
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Fara Farm', email: `fara${stamp}@example.com`, password: 'tenant-pass-123', organization: `Farm ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Khamar', type: 'app' }, t);
const farm = r.body;
const P = `/tenant/api/p/${farm?._id}`;
ok('app project made', !!farm?._id, JSON.stringify(r.body));

r = await call('POST', `${P}/builder/models`, { name: 'Shed', title: 'Sheds', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, t);
ok('Shed model', r.status < 300, JSON.stringify(r.body)?.slice(0, 200));
r = await call('POST', `${P}/builder/models`, {
	name: 'Animal', title: 'Animals', displayField: 'tagId',
	fields: [
		{ key: 'tagId', label: 'Tag ID', kind: 'text', required: true },
		{ key: 'shed', label: 'Shed', kind: 'reference', ref: 'Shed' },
		{ key: 'price', label: 'Price', kind: 'number' },
		{ key: 'bought', label: 'Bought', kind: 'date' },
	],
}, t);
ok('Animal model', r.status < 300, JSON.stringify(r.body)?.slice(0, 200));
const sheds = [];
for (const name of ['North', 'South']) sheds.push((await call('POST', `${P}/sheds`, { name }, t)).body?.doc);
ok('sheds made', sheds.every(s => s?._id), JSON.stringify(sheds).slice(0, 200));
const animals = [
	['C-1', 0, 50000, '2026-01-10'], ['C-2', 0, 60000, '2026-02-05'], ['C-3', 1, 40000, '2026-02-20'], ['C-4', 1, 30000, '2026-03-01'],
];
for (const [tagId, s, price, bought] of animals) await call('POST', `${P}/animals`, { tagId, shed: sheds[s]._id, price, bought }, t);
r = await call('GET', `${P}/animals`, null, t);
ok('4 animals', r.body?.totalDocs === 4, r.body?.totalDocs);

// ---- reports, made with Build
r = await call('GET', `${P}/saved-reports/models`, null, t);
ok('builder lists models with fields', r.status === 200 && r.body.doc.some(m => m.route === 'animals' && m.fields.some(f => f.key === 'price' && f.number)), JSON.stringify(r.body)?.slice(0, 300));
r = await call('POST', `${P}/saved-reports`, { name: 'Register', route: 'animals', type: 'list', columns: [] }, t);
ok('a list report without columns is refused', r.status === 400, r.body?.message);
r = await call('POST', `${P}/saved-reports`, { name: 'Animal register', category: 'Animals', route: 'animals', type: 'list', columns: [{ key: 'tagId' }, { key: 'shed', label: 'Shed' }, { key: 'price' }, { key: 'bought' }], sort: 'tagId', totals: ['price'], dateField: 'bought' }, t);
const register = r.body;
ok('list report saved', r.status === 201 && register?._id, JSON.stringify(r.body));
r = await call('POST', `${P}/saved-reports`, { name: 'By shed', route: 'animals', type: 'summary', groupBy: 'shed', sums: [{ field: 'price', label: 'Value' }], exportable: false }, t);
const byShed = r.body;
ok('summary report saved (not downloadable)', r.status === 201 && byShed.exportable === false);
r = await call('POST', `${P}/saved-reports`, { name: 'Bought per month', route: 'animals', type: 'timeline', dateField: 'bought', interval: 'month', sums: [{ field: 'price' }], formats: ['csv'] }, t);
const monthly = r.body;
r = await call('POST', `${P}/saved-reports`, { name: 'Sheds', route: 'sheds', type: 'list', columns: [{ key: 'name' }] }, t);
const shedList = r.body;

r = await call('POST', `${P}/saved-reports/${register._id}/run`, {}, t);
ok('run list: 4 rows sorted, linked shed named, total price', r.status === 200 && r.body.rows.length === 4 && r.body.rows[0][0] === 'C-1' && r.body.rows[0][1] === 'North' && r.body.footer?.[2] === 180000, JSON.stringify(r.body).slice(0, 400));
r = await call('POST', `${P}/saved-reports/${register._id}/run`, { from: '2026-02-01', to: '2026-02-28' }, t);
ok('run list with dates: Feb only', r.body?.rows?.length === 2 && r.body.footer?.[2] === 100000, JSON.stringify(r.body?.rows));
r = await call('POST', `${P}/saved-reports/${byShed._id}/run`, {}, t);
ok('summary: a row per shed, by name, counts and sums', r.status === 200 && r.body.rows.length === 2 && r.body.rows.some(x => x[0] === 'North' && x[1] === 2 && x[2] === 110000) && r.body.footer[1] === 4, JSON.stringify(r.body).slice(0, 300));
r = await call('POST', `${P}/saved-reports/${monthly._id}/run`, {}, t);
ok('timeline: Jan, Feb, Mar', r.status === 200 && r.body.rows.map(x => x[0]).join() === '2026-01,2026-02,2026-03' && r.body.rows[1][1] === 2, JSON.stringify(r.body.rows));
r = await call('POST', `${P}/saved-reports/preview`, { name: 'Try', route: 'animals', type: 'summary', groupBy: 'shed' }, t);
ok('preview an unsaved report', r.status === 200 && r.body.rows.length === 2);

const file = async (id, body, token) => {
	const res = await fetch(`${ROOT}${P}/saved-reports/${id}/export`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: token }, body: JSON.stringify(body) });
	return { status: res.status, type: res.headers.get('content-type') || '', text: res.status === 200 && !/sheet|pdf/.test(res.headers.get('content-type') || '') ? await res.text() : '', size: (await res.arrayBuffer().catch(() => new ArrayBuffer(0))).byteLength };
};
let f = await file(register._id, { format: 'csv' }, t);
ok('export csv: header, rows, Total line', f.status === 200 && /text\/csv/.test(f.type) && f.text.includes('Tag ID') && f.text.includes('Total') && f.text.includes('180000'), f.text.slice(0, 200));
f = await file(register._id, { format: 'xlsx' }, t);
ok('export xlsx', f.status === 200 && /sheet/.test(f.type), f.type);
f = await file(register._id, { format: 'pdf' }, t);
ok('export pdf', f.status === 200 && /pdf/.test(f.type), f.type);
f = await file(byShed._id, { format: 'csv' }, t);
ok('a report not downloadable: 403', f.status === 403);
f = await file(monthly._id, { format: 'pdf' }, t);
ok('a format the report has not: 400', f.status === 400);

// ---- panel roles
r = await call('GET', `${P}/panel-roles`, null, t);
ok('panel roles: targets include the models, Media library, History; report keys', r.status === 200 && r.body.targets.some(x => x.route === 'animals') && r.body.targets.some(x => x.route === 'image') && r.body.reports.length === 2);
r = await call('POST', `${P}/panel-roles`, { name: 'Viewer', permissions: ['view-animals', 'reports:view', 'build', 'manage-projects', 'records:edit'] }, t);
const viewer = r.body;
ok('role saved: only model and report keys kept', r.status === 201 && viewer.permissions.join() === 'view-animals,reports:view', viewer.permissions?.join());
r = await call('POST', `${P}/panel-roles`, { name: 'viewer', permissions: ['view-animals'] }, t);
ok('a second role with that name: 400', r.status === 400);
r = await call('POST', `${P}/panel-roles`, { name: 'Clerk', permissions: ['create-animals', 'reports:export'] }, t);
ok('add implies view; export implies view', r.status === 201 && r.body.permissions.join() === 'view-animals,create-animals,reports:view,reports:export', r.body.permissions?.join());
const clerk = r.body;

// ---- panel users
r = await call('POST', `${P}/panel-users`, { name: 'Vik', email: `vik${stamp}@example.com`, password: 'panel-pass-123' }, t);
ok('outside a store a login needs a role or super admin', r.status === 400, r.body?.message);
r = await call('POST', `${P}/panel-users`, { name: 'Vik', email: `vik${stamp}@example.com`, password: 'panel-pass-123', role: viewer._id }, t);
ok('a viewer login', r.status === 201 && r.body.role === viewer._id && r.body.superAdmin === false, JSON.stringify(r.body));
const vik = r.body;
r = await call('POST', `${P}/panel-users`, { name: 'Sara', email: `sara${stamp}@example.com`, password: 'panel-pass-123', superAdmin: true }, t);
const sara = r.body;
ok('a super admin login', r.status === 201 && sara.superAdmin === true);
r = await call('GET', `${P}/panel-users`, null, t);
ok('listed with the roles to pick', r.status === 200 && r.body.doc.length === 2 && r.body.roles.length === 2);
r = await call('GET', `${P}/sidebar/admin/server`, null, t);
ok('owner sidebar: Reports, Panel users, Panel roles', ['/reports', '/panel-users', '/panel-roles'].every(h => JSON.stringify(r.body || []).includes(h)));

// ---- signing in
r = await call('POST', '/tenant/api/panel/auth/login', { email: vik.email, password: 'panel-pass-123' });
ok('the commerce panel refuses an app project login: use_panel', r.status === 400 && r.body?.code === 'use_panel', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { email: vik.email, password: 'panel-pass-123', app: 'panel' });
const vt = r.body?.token;
ok('the panel app signs it in', r.status === 200 && vt && r.body.project.publicSlug === farm.publicSlug);
r = await call('GET', '/tenant/api/panel/auth/self', null, vt);
ok('self: role Viewer, its keys', r.status === 200 && r.body.role?.name === 'Viewer' && r.body.permissions.join() === 'view-animals,reports:view' && r.body.superAdmin === false, JSON.stringify(r.body?.role));

r = await call('GET', `${P}/animals`, null, vt);
ok('viewer reads animals', r.status === 200 && r.body.totalDocs === 4);
r = await call('POST', `${P}/animals`, { tagId: 'X' }, vt);
ok('viewer cannot add', r.status === 403);
r = await call('GET', `${P}/sheds`, null, vt);
ok('viewer cannot read sheds', r.status === 403);
r = await call('GET', `${P}/builder/models`, null, vt);
ok('no building', r.status === 403);
r = await call('GET', `${P}/panel-users`, null, vt);
ok('no panel users', r.status === 403);
r = await call('GET', `${P}/saved-reports`, null, vt);
ok('reports: the animal ones only, canBuild false', r.status === 200 && r.body.canBuild === false && r.body.doc.length === 3 && !r.body.doc.some(x => x.route === 'sheds'), JSON.stringify(r.body?.doc?.map(x => x.name)));
r = await call('POST', `${P}/saved-reports/${shedList._id}/run`, {}, vt);
ok('a report on a model it cannot read: 403', r.status === 403);
r = await call('POST', `${P}/saved-reports/${register._id}/run`, {}, vt);
ok('viewer runs a report', r.status === 200 && r.body.rows.length === 4 && r.body.report.canDownload === false);
f = await file(register._id, { format: 'csv' }, vt);
ok('viewer without reports:export cannot download', f.status === 403);
r = await call('POST', `${P}/saved-reports`, { name: 'Mine', route: 'animals', columns: [{ key: 'tagId' }] }, vt);
ok('panel users never make reports', r.status === 403);
r = await call('GET', `${P}/sidebar/admin/server`, null, vt);
ok('viewer sidebar: Reports, no Panel users', JSON.stringify(r.body || []).includes('/reports') && !JSON.stringify(r.body || []).includes('/panel-users'));

// role changed → the next request already has it
await call('PUT', `${P}/panel-users/${vik._id}`, { role: clerk._id }, t);
f = await file(register._id, { format: 'csv' }, vt);
ok('role changed to Clerk: download works at once', f.status === 200 && f.text.includes('C-1'));
r = await call('POST', `${P}/animals`, { tagId: 'C-9', price: 1 }, vt);
ok('…and adding', r.status < 300, JSON.stringify(r.body)?.slice(0, 100));

// ---- super admin
r = await call('POST', '/tenant/api/panel/auth/login', { email: sara.email, password: 'panel-pass-123', app: 'panel' });
const sat = r.body?.token;
r = await call('GET', '/tenant/api/panel/auth/self', null, sat);
ok('super admin: records, reports, manage-panel-users, no build', r.body?.role?.name === 'Super admin' && r.body.permissions.includes('records:delete') && r.body.permissions.includes('manage-panel-users') && !r.body.permissions.includes('build'), r.body?.permissions?.join());
r = await call('GET', `${P}/sheds`, null, sat);
ok('reads every model', r.status === 200);
r = await call('GET', `${P}/builder/models`, null, sat);
ok('still no building', r.status === 403);
r = await call('GET', `${P}/project-settings`, null, sat);
ok('no project settings route for them (not 200)', r.status !== 200, r.status);
r = await call('POST', `${P}/panel-roles`, { name: 'Milker', permissions: ['view-animals', 'edit-animals'] }, sat);
ok('super admin makes a role', r.status === 201, JSON.stringify(r.body));
r = await call('POST', `${P}/panel-users`, { name: 'Mo', email: `mo${stamp}@example.com`, password: 'panel-pass-123', role: r.body._id }, sat);
ok('…and a user', r.status === 201);
r = await call('PUT', `${P}/panel-users/${sara._id}`, { superAdmin: false }, sat);
ok('cannot demote themselves', r.status === 400);
r = await call('DELETE', `${P}/panel-users/${sara._id}`, null, sat);
ok('cannot remove themselves', r.status === 400);
r = await call('DELETE', `${P}/panel-roles/${clerk._id}`, null, sat);
ok('a role in use cannot be deleted', r.status === 400, r.body?.message);
f = await file(register._id, { format: 'xlsx' }, sat);
ok('super admin downloads', f.status === 200);
r = await call('GET', `${P}/sidebar/admin/server`, null, sat);
ok('super admin sidebar: Reports, Panel users, Panel roles', ['/reports', '/panel-users', '/panel-roles'].every(h => JSON.stringify(r.body || []).includes(h)));
r = await call('PUT', `${P}/panel-users/${vik._id}`, { isActive: false }, sat);
r = await call('GET', `${P}/animals`, null, vt);
ok('switched off → signed out', r.status === 401);
// ---- MCP (PU-05, RP-04): the panel login's own AI at /tenant/panel-mcp, a developer's at /tenant/mcp
const rpc = async (path, key, method, params = {}) => (await call('POST', path, { jsonrpc: '2.0', id: 1, method, params }, `Bearer ${key}`)).body;
r = await call('POST', '/tenant/api/panel/auth/mcp-keys', { name: 'Claude' }, sat);
const smk = r.body?.secret;
ok('super admin makes a panel AI key', r.status === 201 && !!smk, JSON.stringify(r.body));
let m = await rpc('/tenant/panel-mcp', smk, 'tools/list');
let tn = (m?.result?.tools || []).map(x => x.name);
ok('panel MCP: records, reports, panel access; no building, no saving reports', ['query_records', 'list_reports', 'run_report', 'list_panel_access', 'save_panel_role', 'save_panel_user'].every(n => tn.includes(n)) && !['build_feature', 'save_report', 'delete_report', 'update_page', 'check_buyer'].some(n => tn.includes(n)), tn.join(','));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'list_reports', arguments: {} });
ok('list_reports: the farm’s reports', !m?.result?.isError && m?.result?.content?.[0]?.text?.includes(register.name), JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'run_report', arguments: { id: register._id } });
ok('run_report: rows and a panel.tcrypt.site link', !m?.result?.isError && /row\(s\)/.test(m?.result?.content?.[0]?.text || '') && (m?.result?.content?.[0]?.text || '').includes('panel.tcrypt.site'), JSON.stringify(m).slice(0, 400));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'run_report', arguments: { id: byShed._id } });
ok('run_report: a summary', !m?.result?.isError, JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'list_panel_access', arguments: {} });
ok('list_panel_access: roles and users', !m?.result?.isError && (m?.result?.content?.[0]?.text || '').includes('Viewer'), JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'save_panel_role', arguments: { name: 'Vet', permissions: ['edit-sheds', 'build', 'reports:view'] } });
ok('save_panel_role: edit implies view, build dropped', !m?.result?.isError && /view-sheds/.test(m?.result?.content?.[0]?.text || '') && !/build/.test(m?.result?.content?.[0]?.text || ''), JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'save_panel_user', arguments: { name: 'Nobody', email: `nob${stamp}@example.com`, password: 'panel-pass-123' } });
ok('save_panel_user: a role is needed', !!m?.result?.isError, JSON.stringify(m).slice(0, 200));
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'save_panel_user', arguments: { id: sara._id, superAdmin: false } });
ok('save_panel_user: cannot demote themselves', !!m?.result?.isError);
m = await rpc('/tenant/panel-mcp', smk, 'tools/call', { name: 'save_report', arguments: { name: 'x', route: 'animals' } });
ok('panel MCP: save_report refused', !!(m?.error || m?.result?.isError));

// a viewer's key: can run, but not manage
r = await call('POST', `${P}/panel-users`, { name: 'Vi Two', email: `vi2${stamp}@example.com`, password: 'panel-pass-123', role: viewer._id }, t);
r = await call('POST', '/tenant/api/panel/auth/login', { email: `vi2${stamp}@example.com`, password: 'panel-pass-123', app: 'panel' });
const v2 = r.body?.token;
r = await call('POST', '/tenant/api/panel/auth/mcp-keys', { name: 'Claude' }, v2);
const vmk = r.body?.secret;
m = await rpc('/tenant/panel-mcp', vmk, 'tools/call', { name: 'run_report', arguments: { id: register._id } });
ok('viewer key: runs the animal register', !m?.result?.isError, JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/panel-mcp', vmk, 'tools/call', { name: 'run_report', arguments: { id: shedList._id } });
ok('viewer key: a report on a model they can’t view is refused', !!m?.result?.isError, JSON.stringify(m).slice(0, 200));
m = await rpc('/tenant/panel-mcp', vmk, 'tools/call', { name: 'list_panel_access', arguments: {} });
ok('viewer key: panel access refused', !!m?.result?.isError);

// the developer's own key: saves reports
const dk = (await call('POST', `${P}/builder/api-keys`, { name: 'dev', scopes: ['read', 'build', 'data'] }, t)).body?.secret;
m = await rpc('/tenant/mcp', dk, 'tools/list');
tn = (m?.result?.tools || []).map(x => x.name);
ok('developer MCP: report tools', ['list_reports', 'run_report', 'save_report', 'delete_report', 'list_panel_access'].every(n => tn.includes(n)), tn.join(','));
m = await rpc('/tenant/mcp', dk, 'tools/call', { name: 'save_report', arguments: { name: 'Bad', route: 'animals', type: 'summary' } });
ok('save_report: a summary without groupBy is refused', !!m?.result?.isError, JSON.stringify(m).slice(0, 200));
m = await rpc('/tenant/mcp', dk, 'tools/call', { name: 'save_report', arguments: { name: 'Animals by shed', route: 'animals', type: 'summary', groupBy: 'shed', preview: true } });
ok('save_report preview: runs, saves nothing', !m?.result?.isError && /Preview \(not saved\)/.test(m?.result?.content?.[0]?.text || ''), JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/mcp', dk, 'tools/call', { name: 'save_report', arguments: { name: 'Animals by shed', route: 'animals', type: 'summary', groupBy: 'shed', exportable: true, formats: ['csv'] } });
const newId = (m?.result?.content?.[0]?.text || '').match(/id ([a-f0-9]{24})/)?.[1];
ok('save_report: saved', !m?.result?.isError && !!newId, JSON.stringify(m).slice(0, 300));
m = await rpc('/tenant/mcp', dk, 'tools/call', { name: 'delete_report', arguments: { id: newId } });
ok('delete_report', !m?.result?.isError);

done();
