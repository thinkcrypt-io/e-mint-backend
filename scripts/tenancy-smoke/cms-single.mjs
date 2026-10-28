// CMS-02 (docs/cms D2): single types — one record, refused seconds (form, bulk import), the page says
// single, the public API answers with the record; a collection becomes single only with ≤ 1 record.
// uid fields — made from their source (my-first-post, -2 when taken), typed ones tidied and checked,
// other scripts kept, a bad source refused, the form's slug input knows its source.
// Uses projects.mjs's state (pat); makes its own project.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const stamp = Date.now();

let r = await call('POST', '/tenant/api/projects', { name: `CMS single ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const model = body => call('POST', P('/builder/models'), body, s.pat);

/* ---- single types */
r = await model({ name: 'SiteSettings', title: 'Site settings', kind: 'single', fields: [
	{ key: 'siteName', label: 'Site name', kind: 'text', required: true },
	{ key: 'tagline', label: 'Tagline', kind: 'text' },
] });
const settings = r.body?.doc;
ok('a single type is made', r.status === 201 && settings?.kind === 'single', JSON.stringify(r.body?.problems || r.body?.message));
const route = settings?.route;
r = await call('GET', P(`/${route}/get/route`), null, s.pat);
ok('its page says single', r.status === 200 && r.body?.single === true, JSON.stringify(r.body));
r = await call('POST', P(`/${route}`), { siteName: 'Corner Bakery', tagline: 'Fresh daily' }, s.pat);
const one = r.body?.doc;
ok('its record', r.status === 201 && !!one?._id, r.body?.message);
r = await call('POST', P(`/${route}`), { siteName: 'Another' }, s.pat);
ok('a second record is refused, saying why', r.status === 400 && /single type — it holds one record/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', P(`/${route}/bulk/import`), { format: 'json', content: JSON.stringify([{ siteName: 'X' }]), dryRun: false }, s.pat);
ok('…and by bulk import', r.status >= 400 && /single type/.test(JSON.stringify(r.body)), `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
r = await call('PUT', P(`/${route}/${one?._id}`), { tagline: 'Baked at dawn' }, s.pat);
ok('editing the one record works', r.status === 200, `${r.status} ${r.body?.message}`);

r = await call('PUT', P(`/builder/models/${settings._id}/public-api`), { enabled: true, actions: ['list'], auth: 'none' }, s.pat);
ok('public API on', r.status === 200, r.body?.message);
const pub = path => fetch(`${ROOT}/public/api/${slug}${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
r = await pub(`/${route}`);
ok('the public API answers with the record itself', r.status === 200 && r.body?.siteName === 'Corner Bakery' && r.body?.tagline === 'Baked at dawn' && !('doc' in r.body), JSON.stringify(r.body));
r = await call('GET', P('/api-builder/endpoints'), null, s.pat);
const ep = (r.body?.doc || []).find(e => e.model === route);
ok('its endpoint reads “Read site settings”', ep?.name === 'Read site settings', ep?.name);

// A collection becomes single only while it holds at most one record.
r = await model({ name: 'Banner', title: 'Banners', fields: [{ key: 'text', label: 'Text', kind: 'text' }] });
const banner = r.body?.doc;
await call('POST', P(`/${banner.route}`), { text: 'One' }, s.pat);
await call('POST', P(`/${banner.route}`), { text: 'Two' }, s.pat);
r = await call('PUT', P(`/builder/models/${banner._id}`), { title: 'Banners', kind: 'single', fields: banner.fields }, s.pat);
ok('a collection with 2 records can’t become single', r.status === 400 && /has 2 records — a single type holds one/.test(JSON.stringify(r.body)), JSON.stringify(r.body));

/* ---- uid */
r = await model({ name: 'Post', title: 'Posts', displayField: 'title', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'slug', label: 'Address', kind: 'uid', from: 'title', required: true },
	{ key: 'body', label: 'Body', kind: 'editor' },
] });
const post = r.body?.doc;
ok('a model with a uid', r.status === 201 && post?.fields?.find(f => f.key === 'slug')?.unique === true, JSON.stringify(r.body?.problems || r.body?.message));
const add = async body => call('POST', P(`/${post.route}`), body, s.pat);
r = await add({ title: 'My First Post!' });
ok('made from the title', r.status === 201 && r.body?.doc?.slug === 'my-first-post', `${r.status} ${JSON.stringify(r.body?.doc?.slug || r.body?.message)}`);
const first = r.body?.doc;
r = await add({ title: 'My first post' });
ok('taken: -2', r.body?.doc?.slug === 'my-first-post-2', r.body?.doc?.slug);
r = await add({ title: 'Café Crème Brûlée' });
ok('accents off', r.body?.doc?.slug === 'cafe-creme-brulee', r.body?.doc?.slug);
r = await add({ title: 'নতুন রুটি' });
ok('another script kept', r.body?.doc?.slug === 'নতুন-রুটি', r.body?.doc?.slug);
r = await add({ title: 'Typed', slug: '  Hello World!! ' });
ok('a typed one is tidied', r.body?.doc?.slug === 'hello-world', r.body?.doc?.slug);
r = await add({ title: 'Clash', slug: 'my-first-post' });
ok('a typed one that’s taken gets the next free -n', r.status === 201 && r.body?.doc?.slug === 'my-first-post-3', `${r.status} ${r.body?.doc?.slug || r.body?.message}`);
const clash = r.body?.doc;
r = await call('PUT', P(`/${post.route}/${clash?._id}`), { slug: 'Hello World' }, s.pat);
r = await call('GET', P(`/${post.route}/${clash?._id}`), null, s.pat);
ok('an edit to a taken one gets -2 too', (r.body?.slug || r.body?.doc?.slug) === 'hello-world-2', JSON.stringify(r.body).slice(0, 200));
r = await call('PUT', P(`/${post.route}/${first._id}`), { title: 'Renamed post' }, s.pat);
r = await call('GET', P(`/${post.route}/${first._id}`), null, s.pat);
ok('renaming keeps the address', (r.body?.slug || r.body?.doc?.slug) === 'my-first-post', JSON.stringify(r.body).slice(0, 200));
r = await call('PUT', P(`/${post.route}/${first._id}`), { slug: 'my-first-post' }, s.pat);
ok('saving its own address again is fine', r.status === 200, `${r.status} ${r.body?.message}`);
await call('PUT', P(`/builder/models/${post._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);
r = await pub(`/${post.route}?slug=My-First-Post`);
ok('the API finds a record by its address', r.status === 200 && r.body?.total === 1 && r.body.doc[0].title === 'Renamed post', JSON.stringify(r.body).slice(0, 200));
r = await call('GET', P(`/${post.route}/get/schema`), null, s.pat);
const field = (Array.isArray(r.body) ? r.body : r.body?.doc || r.body?.form || []).find?.(f => f.name === 'slug');
ok('the form gets a slug input that knows its source', r.status === 200 && JSON.stringify(r.body).includes('"slugFrom":"title"'), JSON.stringify(field || r.body).slice(0, 300));

r = await model({ name: 'Thing', title: 'Things', fields: [
	{ key: 'size', label: 'Size', kind: 'number' },
	{ key: 'address', label: 'Address', kind: 'uid', from: 'size' },
] });
ok('a uid from a number is refused', r.status === 400 && /made from “size”/.test(JSON.stringify(r.body)), JSON.stringify(r.body));

r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
done();
