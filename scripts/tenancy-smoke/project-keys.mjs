// Project keys (docs/api-builder D14, AB-08): the public API names a project by its key —
// /public/api/<route>?apiKey=<key> or X-Api-Key; no key → 401 api_key_missing; a key nobody
// has → 401 api_key_invalid; old /public/api/<slug>/… addresses stop; Regenerate makes a new
// key and the old one stops. Uses projects.mjs's state (pat); makes its own project.
import { call, ok, done, load, ROOT, rawFetch } from './lib.mjs';
const s = load();
const stamp = Date.now();

let r = await call('POST', '/tenant/api/projects', { name: `Keys ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid && !!slug, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;

r = await call('GET', P('/project-key'), null, s.pat);
const key = r.body?.apiKey;
ok('a new project has its key', r.status === 200 && /^mint_pk_[a-f0-9]{32}$/.test(key || ''), JSON.stringify(r.body));
r = await call('GET', `/tenant/api/p/${slug}/project-key`, null, s.pat);
ok('the same key on every read', r.body?.apiKey === key);

const model = (await call('POST', P('/builder/models'), { name: 'Plan', title: 'Plans', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'tier', label: 'Tier', kind: 'text' },
] }, s.pat)).body?.doc;
ok('model made', !!model?._id);
for (const name of ['Gold', 'Silver']) await call('POST', P('/plans'), { name, tier: 'paid' }, s.pat);
r = await call('POST', P('/api-builder/endpoints/generate'), { model: 'plans', actions: ['list', 'get', 'create'], who: 'anyone' }, s.pat);
ok('endpoints generated', r.status === 201, JSON.stringify(r.body));

const pub = (path, init = {}) =>
	rawFetch(`${ROOT}/public/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }).then(async x => ({
		status: x.status,
		headers: x.headers,
		body: await x.json().catch(() => null),
	}));

r = await pub('/plans');
ok('no key → 401 api_key_missing', r.status === 401 && r.body?.code === 'api_key_missing' && /apiKey is missing/.test(r.body?.message), JSON.stringify(r.body));
r = await pub(`/${slug}/plans`);
ok('the old address with the project name → 401 api_key_missing', r.status === 401 && r.body?.code === 'api_key_missing', r.status);
r = await pub(`/plans?apiKey=${key}`);
ok('?apiKey= → the list', r.status === 200 && r.body?.total === 2, JSON.stringify(r.body)?.slice(0, 200));
ok('apiKey is never read as a filter', r.body?.doc?.length === 2);
r = await pub('/plans', { headers: { 'x-api-key': key } });
ok('X-Api-Key header → the list', r.status === 200 && r.body?.total === 2, r.status);
r = await pub(`/plans/${r.body?.doc?.[0]?._id}?apiKey=${key}`);
ok('one record with the key', r.status === 200 && !!r.body?.name, r.status);
r = await pub(`/plans?apiKey=${key}`, { method: 'POST', body: JSON.stringify({ name: 'Bronze' }) });
ok('create with the key', r.status === 201 && r.body?.name === 'Bronze', JSON.stringify(r.body));
r = await pub(`/?apiKey=${key}`);
ok('GET / names the project', r.status === 200 && r.body?.slug === slug, JSON.stringify(r.body)?.slice(0, 120));
r = await pub('/plans?apiKey=mint_pk_00000000000000000000000000000000');
ok('a key nobody has → 401 api_key_invalid', r.status === 401 && r.body?.code === 'api_key_invalid', JSON.stringify(r.body));
r = await pub('/plans?apiKey=nonsense');
ok('a malformed key → 401 api_key_invalid', r.status === 401 && r.body?.code === 'api_key_invalid', r.status);

// Customers sign in through the key too.
r = await pub(`/auth/register?apiKey=${key}`, { method: 'POST', body: JSON.stringify({ name: 'Cara', email: `cara${stamp}@example.com`, password: 'customer-pass-1' }) });
const token = r.body?.token;
ok('a customer signs up with the key', r.status === 201 || r.status === 200 ? !!token : false, JSON.stringify(r.body)?.slice(0, 160));
r = await pub(`/auth/me?apiKey=${key}`, { headers: { authorization: `Bearer ${token}` } });
ok('and is signed in', r.status === 200 && r.body?.email === `cara${stamp}@example.com`, r.status);

// A browser's preflight for the header.
const pre = await rawFetch(`${ROOT}/public/api/plans`, { method: 'OPTIONS', headers: { origin: 'https://site.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-api-key' } });
ok('CORS preflight for X-Api-Key', pre.status < 300 && /x-api-key|\*/i.test(pre.headers.get('access-control-allow-headers') || ''), `${pre.status} ${pre.headers.get('access-control-allow-headers')}`);

// The logs never show it.
r = await call('GET', P('/api-builder/logs?hours=1'), null, s.pat);
const logged = r.body?.doc || [];
ok('calls are logged under the project', logged.length >= 3, logged.length);
ok('the key is never in a logged query', logged.every(l => !/apiKey|mint_pk_/.test(l.query || '')), JSON.stringify(logged.map(l => l.query)));

// Regenerate: a new key; the old one stops.
r = await call('POST', P('/api-builder/project-key'), null, s.pat);
const fresh = r.body?.apiKey;
ok('regenerate → a new key', r.status === 200 && /^mint_pk_/.test(fresh || '') && fresh !== key, JSON.stringify(r.body));
r = await pub(`/plans?apiKey=${key}`);
ok('the old key → 401 api_key_invalid', r.status === 401 && r.body?.code === 'api_key_invalid', r.status);
r = await pub(`/plans?apiKey=${fresh}`);
ok('the new key works', r.status === 200 && r.body?.total === 3, r.status);
r = await call('GET', P('/project-key'), null, s.pat);
ok('reading gives the new key', r.body?.apiKey === fresh);

// The scripts a site pastes name the project by its key.
const mint = await (await rawFetch(`${ROOT}/public/mint.js`)).text();
const track = await (await rawFetch(`${ROOT}/public/track.js`)).text();
const login = await (await rawFetch(`${ROOT}/public/widget.js`)).text();
ok('mint.js, track.js and widget.js read data-key', [mint, track, login].every(js => js.includes("getAttribute('data-key')") && js.includes('apiKey=')));
ok('… and not data-project', [mint, track, login].every(js => !js.includes('data-project')));

// The renderer (its secret) still names a project by its slug — only when the secret is known here.
if (process.env.SITE_REVALIDATE_SECRET) {
	r = await rawFetch(`${ROOT}/public/api/${slug}/plans`, { headers: { 'x-mint-renderer': process.env.SITE_REVALIDATE_SECRET } }).then(x => x.status);
	ok('the site renderer still names a project by its slug', r === 200, r);
}

done();
