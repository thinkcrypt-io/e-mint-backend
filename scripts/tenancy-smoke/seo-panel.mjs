// SEO panel SP-01/02 (docs/seo-panel): an SEO project is a website with `edition: 'seo'`; its panel logins sign in
// at the SEO app (`app: 'seo'`) only, hold fixed SEO keys, reach only the SEO panel's paths, and until the site is
// live only setup (409 NOT_CONNECTED). Needs SMOKE_MONGO (sets the connection live directly; SP-07 does it for real).
import { call, ok, done, claims } from './lib.mjs';
const SMOKE_MONGO = process.env.SMOKE_MONGO;
if (!SMOKE_MONGO || !/127\.0\.0\.1|localhost/.test(SMOKE_MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sia Seo', email: `sia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Seo ${stamp}`, country: 'BD' });
const t = r.body?.token;

// ---- SP-01: the edition
r = await call('POST', '/tenant/api/projects', { name: 'An app', type: 'app', edition: 'seo' }, t);
ok('edition on an app project is refused', r.status === 400, r.body?.message);
r = await call('POST', '/tenant/api/projects', { name: 'A site', type: 'website', edition: 'shop' }, t);
ok('an unknown edition is refused', r.status === 400, r.body?.message);
r = await call('POST', '/tenant/api/projects', { name: 'Acme SEO', type: 'website', edition: 'seo' }, t);
const seo = r.body;
ok('an SEO project is made, edition in the answer', r.status === 200 && seo?.edition === 'seo', JSON.stringify(r.body).slice(0, 200));
r = await call('POST', '/tenant/api/projects', { name: 'Plain site', type: 'website' }, t);
const site = r.body;
ok('a plain website has no edition', r.status === 200 && !site?.edition);
const P = `/tenant/api/p/${seo._id}`;

r = await call('GET', `${P}/site-config`, null, t);
ok('site-config carries connection (status setup, step 1)', r.status === 200 && r.body?.connection?.status === 'setup' && r.body.connection.step === 1, JSON.stringify(r.body?.connection));

// ---- logins: no role needed in an SEO project
r = await call('POST', `${P}/panel-users`, { name: 'Sam Seo', username: `seo${stamp}`, password: 'seo-pass-1234' }, t);
ok('an SEO login needs no role', r.status === 201, JSON.stringify(r.body));
r = await call('POST', `${P}/panel-users`, { name: 'Boss', username: `boss${stamp}`, password: 'seo-pass-1234', superAdmin: true }, t);
ok('an SEO super admin is made', r.status === 201, JSON.stringify(r.body));
r = await call('POST', `/tenant/api/p/${site._id}/panel-users`, { name: 'Pat', username: `pat${stamp}`, password: 'seo-pass-1234' }, t);
ok('a plain website login still needs a role', r.status === 400);
r = await call('POST', `/tenant/api/p/${site._id}/panel-users`, { name: 'Pat', username: `pat${stamp}`, password: 'seo-pass-1234', superAdmin: true }, t);
ok('a plain website super admin', r.status === 201);

// ---- which app
r = await call('POST', '/tenant/api/panel/auth/login', { username: `seo${stamp}`, password: 'seo-pass-1234', app: 'panel' });
ok('SEO login at the panel app: 400 use_seo', r.status === 400 && r.body?.code === 'use_seo', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `seo${stamp}`, password: 'seo-pass-1234' });
ok('…and at the commerce panel (default app): use_seo', r.status === 400 && r.body?.code === 'use_seo', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `pat${stamp}`, password: 'seo-pass-1234', app: 'seo' });
ok('a plain website login at the SEO app: use_panel', r.status === 400 && r.body?.code === 'use_panel', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `seo${stamp}`, password: 'seo-pass-1234', app: 'seo' });
const st = r.body?.token;
ok('SEO login at the SEO app → token', r.status === 200 && !!st && r.body?.project?.edition === 'seo', JSON.stringify(r.body).slice(0, 300));
ok('token: kind panel, its project', claims(st).kind === 'panel' && claims(st).project === seo._id);
r = await call('POST', '/tenant/api/panel/auth/login', { username: `boss${stamp}`, password: 'seo-pass-1234', app: 'seo' });
const bt = r.body?.token;
ok('super admin signs in', r.status === 200 && !!bt);

r = await call('GET', '/tenant/api/panel/auth/self', null, st);
const keys = r.body?.permissions || [];
ok('self: SEO admin, the fixed SEO keys', r.body?.role?.name === 'SEO admin' && ['view-seo', 'edit-pages', 'publish-seo', 'view-analytics', 'manage-site', 'view-image'].every(k => keys.includes(k)), JSON.stringify(keys));
ok('self: no build, records:*, panel users', !keys.some(k => k === 'build' || k.startsWith('records:') || k === 'manage-panel-users'));
r = await call('GET', '/tenant/api/panel/auth/self', null, bt);
ok('super admin: manages panel users too', r.body?.role?.name === 'Super admin' && r.body.permissions.includes('manage-panel-users'));

// ---- before live: setup only
r = await call('GET', P, null, st);
ok('the project opens', r.status === 200 && r.body?.edition === 'seo');
r = await call('GET', `${P}/project-key`, null, st);
ok('the project key (for the snippet)', r.status === 200 && /^mint_pk_/.test(r.body?.apiKey || ''));
r = await call('GET', `${P}/site-config`, null, st);
ok('site-config reads', r.status === 200 && r.body?.connection?.status === 'setup');
r = await call('GET', `${P}/sidebar/admin/server`, null, st);
let side = JSON.stringify(r.body || []);
ok('sidebar before live: Set up your site + Help only', side.includes('"/setup"') && side.includes('"/help"') && !side.includes('"/t/seo"') && !side.includes('"/analytics"'), side);
r = await call('GET', `${P}/sidebar/admin/server`, null, bt);
ok('…a super admin also sees Panel users', JSON.stringify(r.body || []).includes('"/panel-users"'));
for (const [m, path] of [['GET', '/seo'], ['GET', '/pages'], ['GET', '/analytics/summary'], ['PUT', '/site-config'], ['GET', '/media']]) {
	r = await call(m, `${P}${path}`, m === 'PUT' ? { seo: { siteName: 'Acme' } } : null, st);
	ok(`before live: ${m} ${path} → 409 NOT_CONNECTED`, r.status === 409 && r.body?.code === 'NOT_CONNECTED', `${r.status} ${r.body?.code}`);
}
for (const [m, path] of [['GET', '/builder/models'], ['GET', '/automations'], ['GET', '/site-builder'], ['GET', '/api-builder/endpoints'], ['GET', '/panel-roles'], ['GET', '/people'], ['GET', '/content'], ['GET', '/web-contents'], ['GET', '/widgets'], ['GET', '/dashboard']]) {
	r = await call(m, `${P}${path}`, null, st);
	ok(`never: ${m} ${path} → 403 SEO_PANEL_ONLY`, r.status === 403 && r.body?.code === 'SEO_PANEL_ONLY', `${r.status} ${r.body?.code}`);
}
r = await call('GET', `${P}/panel-users`, null, bt);
ok('super admin lists panel users before live', r.status === 200, `${r.status}`);
r = await call('GET', `${P}/panel-users`, null, st);
ok('a plain SEO login can’t', r.status === 403);

// The owner (tenant token) isn't held by the guard.
r = await call('GET', `${P}/builder/models`, null, t);
ok('the project owner is not held by the SEO guard', r.status !== 403 || r.body?.code !== 'SEO_PANEL_ONLY', `${r.status}`);

// ---- live (SP-07 will set this; here straight in the database)
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const client = await new MongoClient(SMOKE_MONGO).connect();
const upd = await client.db().collection('websitesettings').updateOne({ project: new ObjectId(seo._id) }, { $set: { connection: { mode: 'script', siteUrl: 'https://acme.example', hostnames: ['acme.example'], status: 'live', step: 5, liveAt: new Date() } } }, { upsert: false });
await client.close();
ok('connection set live in the database', upd.matchedCount === 1, JSON.stringify(upd));

r = await call('GET', `${P}/sidebar/admin/server`, null, st);
side = JSON.stringify(r.body || []);
ok('sidebar after live: Pages & SEO, Defaults, Analytics, Media, Connection', ['/t/seo', '/t/pages', '/site-setup?tab=seo', '/analytics', '/images', '/connection'].every(h => side.includes(`"${h}"`)), side);
ok('…no Setup', !side.includes('"/setup"'));
r = await call('GET', `${P}/seo`, null, st);
ok('after live: GET /seo opens', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `${P}/pages`, null, st);
ok('after live: GET /pages opens', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `${P}/analytics/summary`, null, st);
ok('after live: analytics opens', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('PUT', `${P}/site-config`, { seo: { metaTitle: 'Acme' } }, st);
ok('after live: SEO defaults save', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `${P}/builder/models`, null, st);
ok('after live: models still 403', r.status === 403 && r.body?.code === 'SEO_PANEL_ONLY');

done();
