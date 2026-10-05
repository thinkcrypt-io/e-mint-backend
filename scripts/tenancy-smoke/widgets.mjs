// Site widgets runtime (docs/widgets W-03): mint.js, widget scripts, the
// project's widget settings and what a site is told.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Wanda Widgets', email: `wanda${stamp}@example.com`, password: 'tenant-pass-123', organization: `Wanda ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Shop site', type: 'website' }, T);
const site = r.body;
ok('a website project to put widgets on', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: 'Bookings', type: 'api' }, T);
const apiProject = r.body;
const P = (pid, path = '') => `/tenant/api/p/${pid}/widgets${path}`;

/* ------------------------------------------------------------- scripts */
let res = await fetch(`${ROOT}/public/mint.js`);
let js = await res.text();
const version = (js.match(/\|\| '([0-9a-f]{10})'/) || [])[1];
const parses = code => { try { new Function(code); return true; } catch (e) { return e.message; } };
ok('mint.js parses (escapes inside the served string survive)', parses(js) === true, parses(js));
ok('mint.js is served as JavaScript with its version baked in', res.status === 200 && /javascript/.test(res.headers.get('content-type')) && version && !js.includes('__VERSION__'), `${res.status} ${version}`);
res = await fetch(`${ROOT}/public/widgets/login.js?v=${version}`);
js = await res.text();
ok('the login widget script parses', parses(js) === true, parses(js));
ok('the login widget script, cached hard for its version', res.status === 200 && js.includes("Mint.define('login'") && /max-age=86400/.test(res.headers.get('cache-control')), res.headers.get('cache-control'));
res = await fetch(`${ROOT}/public/widgets/login.js`);
ok('…and briefly without one', /max-age=300/.test(res.headers.get('cache-control')));
res = await fetch(`${ROOT}/public/widgets/nope.js`);
ok('an unknown widget is a 404', res.status === 404);
res = await fetch(`${ROOT}/public/widget.js`);
ok('widget.js (the old login widget) still works', res.status === 200 && (await res.text()).includes('data-mint-login'));

/* ------------------------------------------------------- the settings */
r = await call('GET', P(site._id), null, T);
ok('settings: the catalogue, every widget off, the tag to add', r.status === 200 && r.body.catalog?.some(w => w.name === 'login' && w.options.length && w.texts.length) && r.body.widgets.login.enabled === false && r.body.script.includes(`data-project="${site.publicSlug}"`), JSON.stringify(r.body).slice(0, 300));
r = await call('GET', `/public/api/${site.publicSlug}/widgets`);
ok('a site is told about switched-on widgets only — none yet', r.status === 200 && Object.keys(r.body.widgets).length === 0 && /^#[0-9a-f]{6}$/i.test(r.body.theme.primaryColor), JSON.stringify(r.body));

r = await call('PUT', P(site._id), { widgets: { login: { enabled: true, options: { layout: 'button', bogus: 1, startWith: 'nowhere' }, texts: { signInTitle: '  Welcome back  ', made: 'up' } } }, theme: { radius: 99, colorMode: 'neon', primaryColor: '#0f766e', fontFamily: 'Inter; } body { display:none' } }, T);
const w = r.body?.widgets?.login;
ok('saving: on, a known option kept, unknown ones dropped, bad values back to defaults', r.status === 200 && w.enabled && w.options.layout === 'button' && w.options.startWith === 'signin' && !('bogus' in w.options) && w.texts.signInTitle === 'Welcome back' && !('made' in w.texts), JSON.stringify(w));
ok('the look: radius clamped, unknown mode → auto, colour kept, no CSS smuggled in the font', r.body.theme.radius === 24 && r.body.theme.colorMode === 'auto' && r.body.theme.primaryColor === '#0f766e' && !/[;{}]/.test(r.body.theme.fontFamily), JSON.stringify(r.body.theme));
r = await call('PUT', P(site._id), { widgets: { cart: { enabled: true } } }, T);
ok('an unknown widget is refused', r.status === 400 && /no “cart” widget/.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await call('GET', `/public/api/${site.publicSlug}/widgets`);
ok('the site now gets the login widget, its options, texts and look', r.body.widgets.login?.options.layout === 'button' && r.body.widgets.login.texts.signInTitle === 'Welcome back' && r.body.theme.radius === 24 && !('enabled' in r.body.widgets.login), JSON.stringify(r.body));

r = await call('PUT', P(apiProject._id), { widgets: { login: { enabled: true } } }, T);
ok('API projects can use widgets too', r.status === 200 && r.body.widgets.login.enabled, `${r.status}`);
r = await call('GET', `/public/api/${apiProject.publicSlug}/widgets`);
ok('…an API project’s look defaults to near-black', r.body.theme.primaryColor === '#111827' && r.body.widgets.login, JSON.stringify(r.body.theme));

r = await call('PUT', P(site._id), { widgets: { login: { enabled: false } } }, T);
r = await call('GET', `/public/api/${site.publicSlug}/widgets`);
ok('switched off, it disappears from the site at once', !r.body.widgets.login, JSON.stringify(r.body.widgets));

r = await call('GET', P(site._id));
ok('settings need a sign-in', r.status === 401, r.status);

done();
