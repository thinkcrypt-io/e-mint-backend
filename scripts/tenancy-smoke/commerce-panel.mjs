// Commerce panel CP-01/02 (docs/commerce-panel): a store's own logins (PanelAdmin) — made by the project's managers,
// one email one store, signed in at the commerce panel with fixed keys: records, couriers, email accounts; never
// building, automations, settings, other projects or the organization.
import { call, ok, done, claims } from './lib.mjs';
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Pia Panel', email: `pia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Panel ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Panel shop', type: 'ecommerce' }, t);
const shop = r.body;
const P = `/tenant/api/p/${shop?._id}`;
r = await call('POST', '/tenant/api/projects', { name: 'Other shop', type: 'ecommerce' }, t);
const other = r.body;
r = await call('POST', '/tenant/api/projects', { name: 'An app', type: 'app' }, t);
const app = r.body;

// Build the store so its sidebar and models are there.
await call('PUT', `${P}/commerce/settings`, { answers: { store: { orderPrefix: 'PS' }, outlets: [{ name: 'Main', code: 'MAIN' }], delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast'] } } }, t);
r = await call('POST', `${P}/commerce/setup`, {}, t);
const t0 = Date.now();
let v;
for (;;) {
	await new Promise(res => setTimeout(res, 1000));
	v = (await call('GET', `${P}/commerce/settings`, null, t)).body;
	if (v?.status !== 'building' || Date.now() - t0 > 180000) break;
}
ok('store built', v?.status === 'ready', v?.status);

// ---- managers make logins
r = await call('POST', `${P}/panel-admins`, { name: 'Sam Store', username: `u1${stamp}`, email: `Sam${stamp}@Example.com`, password: 'short' }, t);
ok('a short password is refused', r.status === 400, r.body?.message);
r = await call('POST', `${P}/panel-admins`, { name: 'Sam Store', username: `u2${stamp}`, email: `Sam${stamp}@Example.com`, password: 'store-pass-123' }, t);
ok('a login is made (201), email lower-cased, no password back', r.status === 201 && r.body?.email === `sam${stamp}@example.com` && !('password' in (r.body || {})), JSON.stringify(r.body));
const sam = r.body;
r = await call('POST', `${P}/panel-admins`, { name: 'Sam again', username: `u3${stamp}`, email: `sam${stamp}@example.com`, password: 'store-pass-123' }, t);
ok('the same email again in this store: 409 email_taken', r.status === 409 && r.body?.code === 'email_taken', JSON.stringify(r.body));
r = await call('POST', `/tenant/api/p/${other._id}/panel-admins`, { name: 'Sam other', username: `u4${stamp}`, email: `sam${stamp}@example.com`, password: 'store-pass-123' }, t);
ok('…and in another store: 409 — one email, one store', r.status === 409 && r.body?.code === 'email_taken');
r = await call('POST', `/tenant/api/p/${app._id}/panel-admins`, { name: 'X', username: `u5${stamp}`, email: `x${stamp}@example.com`, password: 'store-pass-123' }, t);
ok('an app project login needs a role (panel users, docs/panel-users)', r.status === 400);
r = await call('GET', `${P}/panel-admins`, null, t);
ok('listed', r.status === 200 && r.body?.doc?.length === 1 && r.body.doc[0].email === sam.email);
r = await call('GET', `${P}/sidebar/admin/server`, null, t);
ok('owner sidebar: Project → Panel admins', JSON.stringify(r.body || []).includes('/panel-admins'));

// ---- the login signs in
r = await call('POST', '/tenant/api/panel/auth/login', { email: sam.email, password: 'wrong-pass-123' });
ok('wrong password refused', r.status === 400);
r = await call('POST', '/tenant/api/auth/login', { email: sam.email, password: 'store-pass-123' });
ok('the tenant sign-in does not know store logins', r.status === 400);
r = await call('POST', '/tenant/api/panel/auth/login', { email: sam.email.toUpperCase(), password: 'store-pass-123' });
const st = r.body?.token;
ok('panel sign-in → token + the project', r.status === 200 && st && r.body?.project?.publicSlug === shop.publicSlug, JSON.stringify(r.body));
const c = claims(st);
ok('token: kind panel, its project and organization', c.kind === 'panel' && c.project === shop._id && !!c.org && !!c.sid);

r = await call('GET', '/tenant/api/panel/auth/self', null, st);
const selfPerms = r.body?.permissions;
ok('self: one organization, one project, Store admin, fixed keys', r.status === 200 && r.body?.panel === true && r.body?.projects?.length === 1 && r.body.projects[0].publicSlug === shop.publicSlug && r.body.organizations?.length === 1 && r.body.role?.name === 'Store admin' && r.body.permissions.includes('manage-couriers') && !r.body.permissions.includes('build') && !r.body.permissions.includes('manage-projects'), JSON.stringify(r.body?.permissions));
r = await call('GET', '/tenant/api/panel/auth/self', null, t);
ok('a tenant token is refused on the panel account routes', r.status === 403);

// ---- where it may go
const S = `/tenant/api/p/${shop.publicSlug}`;
r = await call('GET', S, null, st);
ok('its project opens (by slug)', r.status === 200 && r.body?._id === shop._id);
r = await call('GET', `/tenant/api/p/${other._id}`, null, st);
ok('another project of the organization: 404', r.status === 404);
for (const path of ['/tenant/api/auth/self', '/tenant/api/org/members', '/tenant/api/projects', '/tenant/api/notifications', '/tenant/api/sidebar/admin/server']) {
	r = await call('GET', path, null, st);
	ok(`refused outside its project: ${path}`, r.status === 403 && r.body?.code === 'PANEL_ONLY', `${r.status} ${r.body?.code}`);
}
r = await call('GET', `/admin/api/auth/self`, null, st);
ok('the admin API refuses it', r.status === 401);

r = await call('GET', `${S}/sidebar/admin/server`, null, st);
const side = JSON.stringify(r.body || []);
ok('sidebar: POS, Orders, the store’s tables, Delivery settings, Email accounts, Media', ['/store/pos', '/store/orders', '/t/products', '/store/settings/delivery', '/email-accounts', '/images'].every(h => side.includes(`"${h}"`)), side.slice(0, 300));
ok('sidebar: no model/page/sidebar builders, project settings, members, panel admins, organization', !['"/model-builder"', '"/builder"', '"/project-settings"', '"/store/setup"', '"/project-people"', '"/panel-admins"', '"/projects"', '"/org/members"', '"/website-setup"', '"/sidebar-builder"', '"/dashboard-builder"', '"/components"'].some(h => side.includes(h)), side);
// CP-08: the API group and the two Build tools (PDF templates, Automations), behind manage-api / manage-pdf / manage-automations.
ok('sidebar: API group (Overview, Endpoints, Keys, Logs, Reference, Webhooks, Widgets, Payments)', ['/public-api', '/public-api/endpoints', '/public-api/keys', '/public-api/logs', '/public-api/reference', '/webhooks', '/widgets', '/site-payments'].every(h => side.includes(`"${h}"`)), side);
ok('sidebar: Build tools — PDF templates and Automations', ['/pdf-templates', '/automations'].every(h => side.includes(`"${h}"`)), side);
ok('self: holds manage-api, manage-pdf, manage-automations', ['manage-api', 'manage-pdf', 'manage-automations'].every(k => (selfPerms || []).includes(k)), JSON.stringify(selfPerms));
// CP-06: every Store settings page, Site settings, Connect AI.
ok('sidebar: Store settings pages, Site settings, Connect AI', ['/store/settings', '/store/settings/products', '/store/settings/search', '/store/settings/delivery', '/store/settings/pos', '/store/settings/printer', '/store/settings/payments', '/site-setup', '/connect-ai'].every(h => side.includes(`"${h}"`)), side);

// records: yes
r = await call('GET', `${S}/products?limit=5`, null, st);
ok('reads the store’s products', r.status === 200 && Array.isArray(r.body?.doc), r.status);
r = await call('GET', `${S}/outlets?limit=5`, null, st);
const outlet = r.body?.doc?.[0];
ok('reads outlets', r.status === 200 && !!outlet);
r = await call('POST', `${S}/categories`, { name: `Panel cat ${stamp}` }, st);
ok('adds a record (a category)', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('GET', `${S}/commerce/settings`, null, st);
ok('reads the store settings', r.status === 200);
r = await call('GET', `${S}/commerce/couriers`, null, st);
ok('couriers: lists them', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('PUT', `${S}/commerce/couriers/steadfast/use`, { on: false }, st);
ok('couriers: switches one off for deliveries', r.status === 200 && !r.body?.answers?.delivery?.couriers?.includes('steadfast') && r.body?.answers?.delivery?.rates?.length === 1, `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.answers?.delivery)}`);
r = await call('PUT', `${S}/commerce/couriers/steadfast/use`, { on: true }, st);
ok('…and on again, the rest of Delivery settings unchanged', r.status === 200 && r.body?.answers?.delivery?.couriers?.includes('steadfast') && r.body?.answers?.delivery?.enabled === true);
r = await call('GET', `${S}/mail-accounts`, null, st);
ok('email accounts: lists them', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', `${S}/mail-designs`, null, st);
ok('email designs: reads them', r.status === 200, `${r.status} ${r.body?.message}`);

// CP-06: store settings and site settings — yes; building the store again and domains — no
r = await call('PUT', `${S}/commerce/settings`, { answers: { store: { orderPrefix: 'PZ' } } }, st);
ok('store settings: saved', r.status === 200 && r.body?.answers?.store?.orderPrefix === 'PZ', `${r.status} ${r.body?.message}`);
r = await call('PUT', `${S}/commerce/search/settings`, { typos: 'normal' }, st);
ok('search settings: saved', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('POST', `${S}/commerce/setup`, {}, st);
ok('building the store again: refused', r.status === 403, `${r.status} ${r.body?.message}`);
r = await call('PUT', `${S}/site-config`, { identity: { siteName: `Panel shop ${stamp}` } }, st);
ok('site settings: saved', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('PUT', `${S}/site-config`, { domains: ['shop.example.com'] }, st);
ok('site domains: refused', r.status === 403, `${r.status} ${r.body?.message}`);

// CP-07: its own AI — a key for /tenant/commerce-mcp, the store's records only
r = await call('POST', '/tenant/api/panel/auth/mcp-keys', { name: 'Claude' }, st);
const mk = r.body?.secret;
ok('a store key is made, the secret once', r.status === 201 && /^emk_/.test(mk || '') && !('hash' in (r.body?.doc || {})), JSON.stringify(r.body));
r = await call('GET', '/tenant/api/panel/auth/mcp-keys', null, st);
ok('…listed', r.status === 200 && r.body?.doc?.length === 1);
r = await call('GET', '/tenant/api/panel/auth/mcp-keys', null, t);
ok('a tenant token has no store keys (403)', r.status === 403);
const rpc = (path, method, params, key) => call('POST', path, { jsonrpc: '2.0', id: 1, method, params }, `Bearer ${key}`);
r = await rpc('/tenant/commerce-mcp', 'tools/list', {}, mk);
const names = (r.body?.result?.tools || []).map(x => x.name);
ok('commerce MCP: records tools only', names.includes('query_records') && names.includes('check_buyer') && names.includes('set_stock') && !names.some(n => ['build_feature', 'update_page', 'save_automation', 'save_endpoint', 'save_email_design', 'set_public_api', 'publish_site', 'update_site_settings', 'update_dashboard'].includes(n)), names.join(','));
r = await rpc('/tenant/commerce-mcp', 'tools/call', { name: 'query_records', arguments: { route: 'products', limit: 2 } }, mk);
ok('commerce MCP: reads the store’s products', r.status === 200 && !r.body?.result?.isError, JSON.stringify(r.body).slice(0, 300));
r = await rpc('/tenant/commerce-mcp', 'tools/call', { name: 'build_feature', arguments: {} }, mk);
ok('commerce MCP: build_feature refused', !!(r.body?.error || r.body?.result?.isError), JSON.stringify(r.body).slice(0, 200));
r = await rpc('/tenant/mcp', 'tools/list', {}, mk);
ok('the tenant MCP refuses a store key', r.status === 401 || !!r.body?.error, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const keyId = (await call('GET', '/tenant/api/panel/auth/mcp-keys', null, st)).body?.doc?.[0]?._id;
r = await call('DELETE', `/tenant/api/panel/auth/mcp-keys/${keyId}`, null, st);
ok('store key revoked', r.status === 200);
r = await rpc('/tenant/commerce-mcp', 'tools/list', {}, mk);
ok('…and refused after', r.status === 401 || !!r.body?.error, `${r.status}`);

// developer tools and settings: no
const refusals = [
	['GET', `${S}/builder/models`],
	['POST', `${S}/builder/models`, { name: 'Hack', route: 'hacks' }],
	['DELETE', `${S}/sidebaritems/6afac6db57e4f840bec55293`],
	['PUT', `${S}/dashboard`, {}],
	['GET', `${S}/panel-admins`],
	['POST', `${S}/panel-admins`, { name: 'Y', username: `u6${stamp}`, email: `y${stamp}@example.com`, password: 'store-pass-123' }],
	['GET', `${S}/people`],
	['GET', `${S}/access-users`],
	['PUT', `/tenant/api/projects/${shop._id}`, { name: 'Renamed' }],
];
for (const [m, path, body] of refusals) {
	r = await call(m, path, body, st);
	ok(`refused: ${m} ${path.replace(S, '<store>')}`, r.status === 403 || r.status === 404, `${r.status} ${r.body?.message}`);
}

// CP-08: the API, webhooks, widgets, payments, PDF templates and automations are open to a store login
for (const path of ['/api-builder/endpoints', '/webhooks', '/automations', '/widgets', '/pdf-templates']) {
	r = await call('GET', `${S}${path}`, null, st);
	ok(`allowed: GET <store>${path}`, r.status === 200, `${r.status} ${r.body?.message}`);
}
r = await call('GET', `${S}/pdf-templates`, null, st);
ok('PDF templates: listed', r.status === 200, `${r.status}`);
// …while building stays shut
for (const [m, path, body] of [['POST', `${S}/builder/models`, { name: 'Hack2', route: 'hacks2' }], ['PUT', `${S}/dashboard`, {}], ['GET', `${S}/builder/keys`]]) {
	r = await call(m, path, body, st);
	ok(`still refused: ${m} ${path.replace(S, '<store>')}`, r.status === 403 || r.status === 404, `${r.status} ${r.body?.message}`);
}

// ---- account
r = await call('PUT', '/tenant/api/panel/auth/update/preferences', { field: 'p:x.orders', preferences: ['a', 'b'] }, st);
ok('table preferences saved', r.status === 200);
r = await call('PUT', '/tenant/api/panel/auth/update/self', { name: 'Sam S.' }, st);
ok('renames self', r.status === 200 && r.body?.name === 'Sam S.');
r = await call('PUT', '/tenant/api/panel/auth/change-password', { oldPassword: 'nope', password: 'store-pass-456' }, st);
ok('change password: wrong current refused', r.status === 400);

// ---- managers switch it off / reset / remove
r = await call('PUT', `${P}/panel-admins/${sam._id}`, { isActive: false }, t);
ok('switched off', r.status === 200 && r.body?.isActive === false);
r = await call('GET', `${S}`, null, st);
ok('…its session is signed out', r.status === 401, `${r.status} ${r.body?.code}`);
r = await call('POST', '/tenant/api/panel/auth/login', { email: sam.email, password: 'store-pass-123' });
ok('…and it can’t sign in', r.status === 400);
r = await call('PUT', `${P}/panel-admins/${sam._id}`, { isActive: true, password: 'store-pass-789' }, t);
ok('switched on with a new password', r.status === 200 && r.body?.isActive === true);
r = await call('POST', '/tenant/api/panel/auth/login', { email: sam.email, password: 'store-pass-789' });
const st2 = r.body?.token;
ok('signs in with the new password', r.status === 200 && !!st2);
r = await call('POST', '/tenant/api/panel/auth/logout', {}, st2);
ok('logout', r.status === 200);
r = await call('GET', '/tenant/api/panel/auth/self', null, st2);
ok('…signed out', r.status === 401);
r = await call('DELETE', `${P}/panel-admins/${sam._id}`, null, t);
ok('removed', r.status === 200);
r = await call('POST', `/tenant/api/p/${other._id}/panel-admins`, { name: 'Sam other', username: `u7${stamp}`, email: sam.email, password: 'store-pass-123' }, t);
ok('the email is free again — another store can use it', r.status === 201);
done();
