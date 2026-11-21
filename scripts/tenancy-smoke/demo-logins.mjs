// Demo logins (docs/panel-users/DEMO_LOGINS.md): one per project, opened by its link for an hour.
// Local scratch server only: node scripts/tenancy-smoke/demo-logins.mjs
import jwt from 'jsonwebtoken';
import { call, ok, done, claims } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Demo owner', email: `demo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Demo ${stamp}`, country: 'BD' });
const t = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Farm demo', type: 'app' }, t);
const P = `/tenant/api/p/${r.body._id}`;
await call('POST', `${P}/builder/models`, { name: 'Animal', title: 'Animals', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, t);
r = await call('POST', `${P}/panel-roles`, { name: 'Viewer', permissions: ['view-animals', 'reports:view'] }, t);
const viewer = r.body;

r = await call('GET', `${P}/panel-users`, null, t);
ok('no demo login yet: demo is null', r.status === 200 && r.body.demo === null, JSON.stringify(r.body.demo));
r = await call('POST', `${P}/panel-users/demo`, {}, t);
ok('outside a store a demo needs a role or super admin', r.status === 400, r.body?.message);
r = await call('POST', `${P}/panel-users/demo`, { role: viewer._id }, t);
ok('demo login made', r.status === 201 && r.body.demo?.demo === true && r.body.demo.demoKey?.length >= 30, JSON.stringify(r.body));
const demo = r.body.demo;
r = await call('POST', `${P}/panel-users/demo`, { superAdmin: true }, t);
ok('a second demo login: 409 demo_exists', r.status === 409 && r.body.code === 'demo_exists');
r = await call('GET', `${P}/panel-users`, null, t);
ok('list leaves it out of doc, answers it as demo', r.status === 200 && !r.body.doc.some(a => a.demo) && r.body.demo?._id === demo._id && r.body.demo.demoKey === demo.demoKey);

r = await call('POST', '/tenant/api/panel/auth/demo', { key: 'nope-nope-nope-nope-nope', app: 'panel' });
ok('a wrong key: 400 demo_link_off', r.status === 400 && r.body.code === 'demo_link_off', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/demo', { key: demo.demoKey, app: 'commerce' });
ok('the store app refuses a non-store demo: use_panel', r.status === 400 && r.body.code === 'use_panel');
r = await call('POST', '/tenant/api/panel/auth/demo', { key: demo.demoKey, app: 'panel' });
const dt = r.body.token;
const c = dt && claims(dt);
ok('demo link signs in', r.status === 200 && !!dt && r.body.project?.publicSlug && r.body.expiresAt, JSON.stringify(r.body).slice(0, 200));
ok('its token says demo and lasts an hour', c?.demo === true && c.exp - c.iat === 3600, JSON.stringify(c));

r = await call('GET', '/tenant/api/panel/auth/self', null, dt);
ok('self: demo, the role’s keys only', r.status === 200 && r.body.demo === true && r.body.permissions.includes('view-animals') && !r.body.permissions.includes('manage-panel-users'), r.body.permissions?.join());
r = await call('GET', `${P}/animals`, null, dt);
ok('reads its project’s records', r.status === 200, r.status);
r = await call('PUT', '/tenant/api/panel/auth/change-password', { oldPassword: 'x', password: 'whatever-123' }, dt);
ok('can’t change a password: 403 DEMO_ONLY', r.status === 403 && r.body.code === 'DEMO_ONLY');
r = await call('POST', '/tenant/api/panel/auth/mcp-keys', { name: 'Claude' }, dt);
ok('can’t make AI keys: 403', r.status === 403);
await call('PUT', '/tenant/api/panel/auth/update/self', { name: 'Hacked', theme: 'ocean' }, dt);
r = await call('GET', '/tenant/api/panel/auth/self', null, dt);
ok('keeps its name; theme is theirs', r.body.name === 'Demo' && r.body.theme === 'ocean', `${r.body.name} ${r.body.theme}`);

// As super admin: everything, but never the panel users.
r = await call('PUT', `${P}/panel-users/${demo._id}`, { superAdmin: true, role: null, name: 'Renamed', password: 'something-123' }, t);
ok('access changed; name and password ignored', r.status === 200 && r.body.superAdmin === true && r.body.name === 'Demo', JSON.stringify(r.body).slice(0, 200));
r = await call('POST', '/tenant/api/panel/auth/demo', { key: demo.demoKey, app: 'panel' });
const st = r.body.token;
r = await call('GET', '/tenant/api/panel/auth/self', null, st);
ok('super admin demo: no manage-panel-users', r.body.permissions.includes('records:view') && !r.body.permissions.includes('manage-panel-users'), r.body.permissions?.join());
r = await call('GET', `${P}/panel-users`, null, st);
ok('super admin demo can’t open Panel users', r.status === 403);
r = await call('POST', `${P}/panel-users`, { name: 'Sneak', username: `sneak${stamp}`, password: 'sneaky-pass-1', superAdmin: true }, st);
ok('nor make a login', r.status === 403);

// A real panel super admin doesn't see or change it.
r = await call('POST', `${P}/panel-users`, { name: 'Boss', username: `boss${stamp}`, password: 'boss-pass-123', superAdmin: true }, t);
r = await call('POST', '/tenant/api/panel/auth/login', { username: `boss${stamp}`, password: 'boss-pass-123', app: 'panel' });
const bt = r.body.token;
r = await call('GET', `${P}/panel-users`, null, bt);
ok('panel super admin: no demo in the list', r.status === 200 && !('demo' in r.body) && !r.body.doc.some(a => a.demo));
r = await call('PUT', `${P}/panel-users/${demo._id}`, { isActive: false }, bt);
ok('panel super admin can’t change it: 404', r.status === 404);
r = await call('POST', `${P}/panel-users/demo/new-link`, {}, bt);
ok('nor make a new link: 403', r.status === 403);

// Expired: any token past its time answers SESSION_EXPIRED.
const secret = process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';
const { iat, exp, ...payload } = claims(dt);
const old = jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 5 }, secret);
r = await call('GET', '/tenant/api/panel/auth/self', null, `Bearer ${old}`);
ok('an expired token: 401 SESSION_EXPIRED', r.status === 401 && r.body.code === 'SESSION_EXPIRED', JSON.stringify(r.body));

// New link: the old one stops and its demos are signed out.
r = await call('POST', `${P}/panel-users/demo/new-link`, {}, t);
ok('new link', r.status === 200 && r.body.demo.demoKey && r.body.demo.demoKey !== demo.demoKey);
const key2 = r.body.demo.demoKey;
r = await call('POST', '/tenant/api/panel/auth/demo', { key: demo.demoKey, app: 'panel' });
ok('the old link stops', r.status === 400 && r.body.code === 'demo_link_off');
r = await call('GET', '/tenant/api/panel/auth/self', null, st);
ok('its open demos are signed out', r.status === 401 && r.body.code === 'SESSION_REVOKED', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/demo', { key: key2, app: 'panel' });
ok('the new link works', r.status === 200 && !!r.body.token);

// Switched off, then removed.
await call('PUT', `${P}/panel-users/${demo._id}`, { isActive: false }, t);
r = await call('POST', '/tenant/api/panel/auth/demo', { key: key2, app: 'panel' });
ok('switched off: the link refuses', r.status === 400 && r.body.code === 'demo_link_off');
r = await call('DELETE', `${P}/panel-users/${demo._id}`, null, t);
r = await call('GET', `${P}/panel-users`, null, t);
ok('removed: demo is null again', r.body.demo === null);

done();
