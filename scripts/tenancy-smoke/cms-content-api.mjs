// CMS-09 (docs/cms D10): the content API — records carry publishedAt; status=draft (or _status) shows drafts with a
// server key only; ?populate= fills links (inside sections, components and blocks too, two links deep), each as its
// own model's public API shows it, a model without one by its name; endpoints offer paths (default: one step);
// publish / unpublish webhooks; publishing refreshes the site once per burst (needs the backend started with
// SITES_RENDERER_URL=http://127.0.0.1:$SMOKE_SITE_RECV, SITE_REVALIDATE_SECRET and SITE_REFRESH_DELAY_MS — skipped
// otherwise). Uses projects.mjs's state (pat); makes its own project.
import http from 'http';
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const stamp = Date.now();
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await wait(200);
	}
};

/* ---- receivers: webhooks, and the site renderer's revalidate */
const got = [];
const hooks = http.createServer((req, res) => {
	let raw = '';
	req.on('data', c => (raw += c));
	req.on('end', () => {
		got.push({ path: req.url, headers: req.headers, body: JSON.parse(raw || 'null') });
		res.writeHead(200).end('ok');
	});
});
await new Promise(r => hooks.listen(0, '127.0.0.1', r));
const RECV = `http://127.0.0.1:${hooks.address().port}`;
const refreshed = [];
const SITE_PORT = Number(process.env.SMOKE_SITE_RECV) || 0;
const site = SITE_PORT
	? http.createServer((req, res) => {
			let raw = '';
			req.on('data', c => (raw += c));
			req.on('end', () => {
				refreshed.push({ path: req.url, body: JSON.parse(raw || 'null') });
				res.writeHead(200).end('{}');
			});
		})
	: null;
if (site) await new Promise(r => site.listen(SITE_PORT, '127.0.0.1', r));

let r = await call('POST', '/tenant/api/projects', { name: `CMS content API ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const B = path => P(`/builder${path}`);
const AB = path => P(`/api-builder${path}`);
const pub = (path, headers = {}) => fetch(`${ROOT}/public/api/${slug}${path}`, { headers }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const model = async body => (await call('POST', B('/models'), body, s.pat)).body?.doc;
const api = async m => call('PUT', B(`/models/${m._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);
const add = async (route, body) => (await call('POST', P(`/${route}`), body, s.pat)).body?.doc;

/* ---- models: Company ← Author (public, shows name + company only) ; Tag (no public API) ; Article (drafts) */
const company = await model({ name: 'Company', title: 'Companies', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'city', label: 'City', kind: 'text' }] });
await api(company);
const author = await model({ name: 'Author', title: 'Authors', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text' },
	{ key: 'aside', label: 'Private note', kind: 'text' },
	{ key: 'company', label: 'Company', kind: 'reference', ref: 'Company' },
] });
await api(author);
const tag = await model({ name: 'Tag', title: 'Tags', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'hidden', label: 'Hidden', kind: 'text' }] });
r = await call('GET', AB('/endpoints'), null, s.pat);
const authorGet = r.body?.doc?.find(e => e.model === author.route && e.action === 'get');
r = await call('PUT', AB(`/endpoints/${authorGet?._id}`), { ...authorGet, fields: { out: ['name', 'company'] } }, s.pat);
ok('Author’s Read one shows name and company only', r.status === 200 && r.body?.fields?.out?.join() === 'name,company', JSON.stringify(r.body?.message || r.body?.fields));

r = await call('POST', B('/components'), { category: 'shared', name: `cta${stamp % 100000}`, title: 'Call to action', fields: [
	{ key: 'label', label: 'Label', kind: 'text' },
	{ key: 'by', label: 'By', kind: 'reference', ref: 'Author' },
] }, s.pat);
const cta = r.body?.doc || r.body;
r = await call('POST', B('/components'), { category: 'content', name: `quote${stamp % 100000}`, title: 'Quote', fields: [
	{ key: 'text', label: 'Text', kind: 'text' },
	{ key: 'by', label: 'By', kind: 'reference', ref: 'Author' },
] }, s.pat);
const quote = r.body?.doc || r.body;
ok('components with links', !!cta?.uid && !!quote?.uid, JSON.stringify(r.body).slice(0, 200));

const article = await model({ name: 'Article', title: 'Articles', displayField: 'title', draftAndPublish: true, fields: [
	{ key: 'title', label: 'Title', kind: 'text' },
	{ key: 'author', label: 'Author', kind: 'reference', ref: 'Author' },
	{ key: 'tags', label: 'Tags', kind: 'references', ref: 'Tag' },
	{ key: 'hero', label: 'Hero', kind: 'component', component: cta.uid },
	{ key: 'body', label: 'Body', kind: 'blocks', components: [quote.uid] },
] });
ok('a drafts model with links everywhere', !!article?._id && article.draftAndPublish);
await api(article);
const route = article.route;

const acme = await add(company.route, { name: 'Acme', city: 'Dhaka' });
const ana = await add(author.route, { name: 'Ana', aside: 'likes tea', company: acme._id });
const bo = await add(author.route, { name: 'Bo', aside: 'x' });
const t1 = await add(tag.route, { name: 'News', hidden: 'h' });
const a1 = await add(route, { title: 'Hello', author: ana._id, tags: [t1._id], hero: { label: 'Read', by: bo._id }, body: [{ __component: quote.uid, text: 'Wow', by: ana._id }] });
const a2 = await add(route, { title: 'Never published' });
ok('records made', !!a1?._id && !!a2?._id, JSON.stringify(a1).slice(0, 200));

/* ---- webhooks for publish / unpublish */
r = await call('GET', P('/webhooks'), null, s.pat);
ok('webhooks offer publish and unpublish, and say which models have drafts', r.body?.events?.includes('publish') && r.body?.events?.includes('unpublish') && r.body?.models?.find(m => m.route === route)?.drafts === true && r.body?.models?.find(m => m.route === tag.route)?.drafts === false, JSON.stringify(r.body?.events));
r = await call('POST', P('/webhooks'), { route, events: ['publish', 'unpublish'], url: `${RECV}/hook` }, s.pat);
ok('a webhook on publish and unpublish', r.status === 201 && r.body?.doc?.events?.join() === 'publish,unpublish', JSON.stringify(r.body?.message || r.body?.doc));

r = await call('POST', P(`/${route}/${a1._id}/publish`), {}, s.pat);
ok('published', r.status === 200, r.body?.message);
let m = await until(() => got.find(g => g.headers['x-mint-event'] === 'publish'));
ok('publish delivered, with what went live', m?.body?.event === 'publish' && m.body.record?.title === 'Hello' && m.body.source === 'panel', JSON.stringify(m?.body));

/* ---- publishedAt, default links */
r = await pub(`/${route}`);
const live = r.body?.doc?.[0];
ok('the API: published only, with publishedAt', r.body?.total === 1 && !!live?.publishedAt && !Number.isNaN(Date.parse(live.publishedAt)), JSON.stringify(r.body));
ok('…a top-level link by name, links inside left as ids', live?.author?.name === 'Ana' && !('_model' in live.author) && !('aside' in live.author) && typeof live?.hero?.by === 'string' && typeof live?.body?.[0]?.by === 'string', JSON.stringify(live));

/* ---- populate */
r = await pub(`/${route}/${a1._id}?populate=author`);
ok('populate=author: the author as its API shows it (no private note), its company an id', r.status === 200 && r.body?.author?.name === 'Ana' && !('aside' in r.body.author) && typeof r.body.author.company === 'string', JSON.stringify(r.body));
r = await pub(`/${route}/${a1._id}?populate=hero.by,body.by`);
ok('links inside a component and blocks', r.body?.hero?.by?.name === 'Bo' && !('_model' in r.body.hero.by) && r.body?.body?.[0]?.by?.name === 'Ana' && r.body.body[0].__component === quote.uid, JSON.stringify(r.body));
r = await pub(`/${route}/${a1._id}?populate=tags`);
ok('a model without a public API: by name only', r.body?.tags?.[0]?.name === 'News' && !('hidden' in r.body.tags[0]), JSON.stringify(r.body?.tags));
r = await pub(`/${route}?populate=*`);
const all = r.body?.doc?.[0];
ok('populate=* fills every link one step away', all?.author?.name === 'Ana' && all?.hero?.by?.name === 'Bo' && all?.body?.[0]?.by?.name === 'Ana' && all?.tags?.[0]?.name === 'News', JSON.stringify(all));
r = await pub(`/${route}?populate=author.company`);
ok('two links deep isn’t offered by default', r.status === 400 && /doesn’t fill “author.company”/.test(r.body?.message), JSON.stringify(r.body));
r = await pub(`/${route}?populate=title`);
ok('a path it doesn’t offer: 400 naming the ones it does', r.status === 400 && /author/.test(r.body?.message) && /hero\.by/.test(r.body?.message), r.body?.message);

r = await call('GET', AB('/endpoints'), null, s.pat);
const list = r.body?.doc?.find(e => e.model === route && e.action === 'list');
const opts = r.body?.models?.find(x => x.route === route)?.populate || [];
ok('the endpoint page lists the links it can offer', ['author', 'tags', 'hero.by', 'body.by', 'author.company'].every(p => opts.some(o => o.path === p)) && opts.find(o => o.path === 'tags')?.full === false && opts.find(o => o.path === 'author.company')?.links === 2, JSON.stringify(opts));
ok('…and which go by default', r.body?.models?.find(x => x.route === route)?.populateDefault?.join() === 'author,tags,hero.by,body.by', JSON.stringify(r.body?.models?.find(x => x.route === route)?.populateDefault));
r = await call('PUT', AB(`/endpoints/${list?._id}`), { ...list, populate: ['title'] }, s.pat);
ok('an endpoint refuses a path that isn’t a link', r.status === 400 && r.body?.on === 'populate' && /isn’t a link/.test(r.body?.message), JSON.stringify(r.body));
r = await call('PUT', AB(`/endpoints/${list?._id}`), { ...list, populate: ['tags.name'] }, s.pat);
ok('…or goes past a model without a public API', r.status === 400 && /no public API/.test(r.body?.message), r.body?.message);
r = await call('PUT', AB(`/endpoints/${list?._id}`), { ...list, populate: ['author', 'author.company'] }, s.pat);
ok('an endpoint offers two links deep', r.status === 200 && r.body?.populate?.join() === 'author,author.company', JSON.stringify(r.body?.message || r.body?.populate));
r = await pub(`/${route}?populate=author.company`);
ok('…author.company: the company filled inside the author', r.body?.doc?.[0]?.author?.company?.name === 'Acme' && r.body.doc[0].author.company.city === 'Dhaka', JSON.stringify(r.body?.doc?.[0]?.author));
r = await pub(`/${route}?populate=hero.by`);
ok('…and only what it offers now', r.status === 400, r.status);
await call('PUT', AB(`/endpoints/${list?._id}`), { ...list, populate: null }, s.pat);

/* ---- drafts with a server key */
r = await pub(`/${route}?status=draft`);
ok('status=draft without a key: 401', r.status === 401 && r.body?.code === 'key_required', JSON.stringify(r.body));
r = await call('POST', AB('/keys'), { name: 'Preview server' }, s.pat);
const key = r.body?.secret;
await call('PUT', P(`/${route}/${a1._id}`), { title: 'Hello, edited' }, s.pat);
r = await pub(`/${route}?status=draft&sort=title`, { 'x-api-key': key });
ok('status=draft with a key: every draft as it is, publishedAt null when not live', r.status === 200 && r.body?.total === 2 && r.body.doc.map(d => d.title).join() === 'Hello, edited,Never published' && r.body.doc[1].publishedAt === null && !!r.body.doc[0].publishedAt, JSON.stringify(r.body?.doc));
r = await pub(`/${route}/${a1._id}?_status=draft&populate=author`, { 'x-api-key': key });
ok('_status=draft works too, with populate', r.body?.title === 'Hello, edited' && r.body?.author?.name === 'Ana', JSON.stringify(r.body));
r = await pub(`/${route}/${a1._id}`);
ok('…while the public still gets what’s published', r.body?.title === 'Hello', r.body?.title);
r = await pub(`/${route}?status=maybe`, { 'x-api-key': key });
ok('status takes published or draft', r.status === 400, r.status);
r = await pub(`/${company.route}?status=draft`, { 'x-api-key': key });
ok('a model without drafts: status=draft is just its records', r.status === 200 && r.body?.total === 1 && !('publishedAt' in r.body.doc[0]), JSON.stringify(r.body));

/* ---- unpublish, bulk publish → one site refresh */
refreshed.length = 0;
r = await call('POST', P(`/${route}/${a1._id}/unpublish`), {}, s.pat);
m = await until(() => got.find(g => g.headers['x-mint-event'] === 'unpublish'));
ok('unpublish delivered, with the draft', m?.body?.record?.title === 'Hello, edited', JSON.stringify(m?.body));
if (site) {
	await until(() => refreshed.length > 0, 8000);
	ok('taking it off refreshes the site', refreshed.length === 1 && refreshed[0].path === '/api/revalidate' && refreshed[0].body?.slug === slug, JSON.stringify(refreshed));
	refreshed.length = 0;
	r = await call('POST', P(`/${route}/bulk/publish`), { ids: [a1._id, a2._id] }, s.pat);
	await until(() => refreshed.length > 0, 8000);
	await wait(1500);
	ok('bulk publish of 2: one refresh', r.body?.published === 2 && refreshed.length === 1, JSON.stringify({ n: refreshed.length, p: r.body?.published }));
	ok('…and a publish webhook for each', got.filter(g => g.headers['x-mint-event'] === 'publish').length === 3);
} else console.log('  (site refresh checks skipped — start the backend with SITES_RENDERER_URL etc. and set SMOKE_SITE_RECV)');

r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
hooks.close();
site?.close();
done();
