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
r = await call('POST', `${P}/panel-admins`, { name: 'Sam Store', email: `Sam${stamp}@Example.com`, password: 'short' }, t);
ok('a short password is refused', r.status === 400, r.body?.message);
r = await call('POST', `${P}/panel-admins`, { name: 'Sam Store', email: `Sam${stamp}@Example.com`, password: 'store-pass-123' }, t);
ok('a login is made (201), email lower-cased, no password back', r.status === 201 && r.body?.email === `sam${stamp}@example.com` && !('password' in (r.body || {})), JSON.stringify(r.body));
const sam = r.body;
r = await call('POST', `${P}/panel-admins`, { name: 'Sam again', email: `sam${stamp}@example.com`, password: 'store-pass-123' }, t);
ok('the same email again in this store: 409 email_taken', r.status === 409 && r.body?.code === 'email_taken', JSON.stringify(r.body));
r = await call('POST', `/tenant/api/p/${other._id}/panel-admins`, { name: 'Sam other', email: `sam${stamp}@example.com`, password: 'store-pass-123' }, t);
ok('…and in another store: 409 — one email, one store', r.status === 409 && r.body?.code === 'email_taken');
r = await call('POST', `/tenant/api/p/${app._id}/panel-admins`, { name: 'X', email: `x${stamp}@example.com`, password: 'store-pass-123' }, t);
ok('an app project has no store logins (404)', r.status === 404);
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
ok('sidebar: POS, Orders, the store’s tables, Couriers, Email accounts, Media', ['/store/pos', '/store/orders', '/t/products', '/store/couriers', '/email-accounts', '/images'].every(h => side.includes(`"${h}"`)), side.slice(0, 300));
ok('sidebar: no Build, automations, settings, API pages, members, panel admins, organization', !['/model-builder', '/builder', '/automations', '/project-settings', '/store/settings"', '/public-api', '/project-people', '/panel-admins', '/projects', '/org/members', '/site-setup', '/widgets'].some(h => side.includes(`"${h}`) && !side.includes(`"${h}/`)) && !side.includes('"/model-builder"') && !side.includes('"/automations"') && !side.includes('"/project-settings"') && !side.includes('"/store/settings"') && !side.includes('"/projects"') && !side.includes('"/panel-admins"'), side);

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

// developer tools and settings: no
const refusals = [
	['GET', `${S}/builder/models`],
	['POST', `${S}/builder/models`, { name: 'Hack', route: 'hacks' }],
	['GET', `${S}/automations`],
	['DELETE', `${S}/sidebaritems/6afac6db57e4f840bec55293`],
	['PUT', `${S}/commerce/settings`, { answers: { store: { orderPrefix: 'XX' } } }],
	['PUT', `${S}/dashboard`, {}],
	['GET', `${S}/api-builder/endpoints`],
	['GET', `${S}/webhooks`],
	['GET', `${S}/panel-admins`],
	['POST', `${S}/panel-admins`, { name: 'Y', email: `y${stamp}@example.com`, password: 'store-pass-123' }],
	['GET', `${S}/people`],
	['GET', `${S}/access-users`],
	['PUT', `/tenant/api/projects/${shop._id}`, { name: 'Renamed' }],
];
for (const [m, path, body] of refusals) {
	r = await call(m, path, body, st);
	ok(`refused: ${m} ${path.replace(S, '<store>')}`, r.status === 403 || r.status === 404, `${r.status} ${r.body?.message}`);
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
r = await call('POST', `/tenant/api/p/${other._id}/panel-admins`, { name: 'Sam other', email: sam.email, password: 'store-pass-123' }, t);
ok('the email is free again — another store can use it', r.status === 201);
done();
