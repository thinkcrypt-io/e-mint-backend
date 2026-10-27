// Site connect (docs/site-connect SC-02, SC-03): a website built anywhere gets each page's SEO from the
// panel by its address — GET /site/head?path= (JSON, each tag `set` or `fill`) or ?format=html for the
// site's own server — and track.js `data-seo` applies it. Stands alone.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Cora Connect', email: `cora${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cora ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Acme Shoes', type: 'website', domains: ['www.acme-shoes.example.com'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const key = (await call('GET', P('/project-key'), null, T)).body?.apiKey;
const head = (path, extra = '') => fetch(`${ROOT}/public/api/site/head?apiKey=${key}&path=${encodeURIComponent(path)}${extra}`);
const json = async path => {
	const x = await head(path);
	return { status: x.status, cache: x.headers.get('cache-control'), body: await x.json().catch(() => null) };
};
let x, x0;
const tag = (h, k) => h?.tags?.find(t => t.tag === k || t.name === k || t.property === k || t.rel === k);

// Nothing added to SEO yet: every page keeps its own SEO.
r = await json('/');
ok('nothing added: 200, cached 60 s, not found, no tags', r.status === 200 && r.cache?.includes('max-age=60') && r.body?.found === false && r.body.tags.length === 0 && r.body.seo === null, `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);

// Site setup → SEO: the defaults.
r = await call('PUT', P('/site-config'), { identity: { siteName: 'Acme' }, seo: { metaTitle: 'Acme — shoes made in Dhaka', titleTemplate: '%s | Acme', metaDescription: 'Hand-made leather shoes.', ogImage: '/share.jpg' } }, T);
ok('default SEO saved', r.status === 200, `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);

// A page of the site that lives elsewhere, and its SEO.
r = await call('POST', P('/pages'), { name: 'About', path: '/about', status: 'published' }, T);
const about = r.body?.doc || r.body;
ok('a page by its address', !!about?._id, `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
r = await call('POST', P('/seo'), { page: about._id, seo: { metaTitle: 'About us', metaDescription: 'Who makes "Acme" <shoes>.', ogImage: 'https://cdn.example.com/about.jpg', robots: { index: false } } }, T);
ok('its SEO', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
await call('POST', P('/pages'), { name: 'Draft', path: '/draft', status: 'draft' }, T);
await call('POST', P('/pages'), { name: 'Contact', path: '/contact', status: 'published' }, T);

r = await json('/about');
const h = r.body;
ok('found: the page', h?.found === true && h.page?.path === '/about', JSON.stringify(h?.page));
ok('title: its own, with the template, set', tag(h, 'title')?.content === 'About us | Acme' && tag(h, 'title').mode === 'set', JSON.stringify(tag(h, 'title')));
ok('description: its own, set', tag(h, 'description')?.content === 'Who makes "Acme" <shoes>.' && tag(h, 'description').mode === 'set');
ok('robots: noindex, set', /noindex/.test(tag(h, 'robots')?.content || '') && tag(h, 'robots').mode === 'set', JSON.stringify(tag(h, 'robots')));
ok('canonical: the domain + path, fill', tag(h, 'canonical')?.content === 'https://www.acme-shoes.example.com/about' && tag(h, 'canonical').mode === 'fill', JSON.stringify(tag(h, 'canonical')));
ok('share image: its own, set; Twitter large card', tag(h, 'og:image')?.content === 'https://cdn.example.com/about.jpg' && tag(h, 'og:image').mode === 'set' && tag(h, 'twitter:card')?.content === 'summary_large_image');
ok('og:site_name from Site setup', tag(h, 'og:site_name')?.content === 'Acme');
ok('JSON-LD: a WebPage', h?.jsonLd?.[0]?.['@type'] === 'WebPage' && h.jsonLd[0].name === 'About us | Acme', JSON.stringify(h?.jsonLd));
ok('resolved seo for a server (Next.js)', h?.seo?.title === 'About us | Acme' && h.seo.noIndex === true && h.seo.image === 'https://cdn.example.com/about.jpg', JSON.stringify(h?.seo));

for (const alias of ['/about/', '/about.html', '/about/index.html', 'about', '/about?ref=x#top']) {
	r = await json(alias);
	ok(`${alias} is the same page`, r.body?.found === true && r.body.path === '/about', JSON.stringify({ path: r.body?.path, found: r.body?.found }));
}

r = await json('/draft');
ok('a draft page is not found', r.body?.found === false);
r = await json('/contact');
ok('a page with no SEO record: nothing (it keeps its own, Site setup defaults and all)', r.body?.found === false && r.body.tags.length === 0 && r.body.jsonLd.length === 0 && r.body.page?.path === '/contact', JSON.stringify(r.body));
r = await json('/pricing');
ok('an address Mint doesn’t know: nothing', r.body?.found === false && r.body.tags.length === 0 && r.body.page === null);
r = await json('/');
ok('home not added: nothing, though Site setup has a default title', r.body?.found === false && r.body.tags.length === 0);

// The home page added to SEO with nothing of its own: Site setup's defaults are its SEO.
const home = (await call('POST', P('/pages'), { name: 'Home', path: '/', status: 'published' }, T)).body?.doc;
r = await call('POST', P('/seo'), { page: home?._id, seo: {} }, T);
ok('home added to SEO', r.status === 201, `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
r = await json('/');
ok('home: the default title is its own (set), no template', tag(r.body, 'title')?.content === 'Acme — shoes made in Dhaka' && tag(r.body, 'title').mode === 'set');
ok('home: default description is its own (set); default share image only fills', tag(r.body, 'description')?.mode === 'set' && tag(r.body, 'og:image')?.content === 'https://www.acme-shoes.example.com/share.jpg' && tag(r.body, 'og:image').mode === 'fill');
ok('home: WebPage + WebSite + Organization JSON-LD', (r.body?.jsonLd || []).map(s => s['@type']).join(',') === 'WebPage,WebSite,Organization', JSON.stringify(r.body?.jsonLd));
x0 = await head('/contact', '&format=html');
ok('format=html for a page not added: empty', (await x0.text()) === '');

x = await head('/about', '&format=html');
const html = await x.text();
ok('format=html: text/html', x.status === 200 && /text\/html/.test(x.headers.get('content-type') || ''), x.headers.get('content-type'));
ok('format=html: title and escaped description', html.includes('<title>About us | Acme</title>') && html.includes('content="Who makes &quot;Acme&quot; &lt;shoes&gt;."'), html.slice(0, 300));
ok('format=html: JSON-LD script', html.includes('<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"'));

x = await fetch(`${ROOT}/public/api/site/head?path=/about`);
ok('no key: refused', x.status === 401, x.status);

// An app project has no site.
const app = (await call('POST', '/tenant/api/projects', { name: 'Acme app', type: 'app' }, T)).body;
const appKey = (await call('GET', `/tenant/api/p/${app?._id}/project-key`, null, T)).body?.apiKey;
x = await fetch(`${ROOT}/public/api/site/head?apiKey=${appKey}&path=/`);
ok('an app project: 404', x.status === 404, x.status);

// Website setup → Existing website → Test connection: a stand-in for the customer's site on this machine.
const http = await import('node:http');
const snippet = (k, extra = 'data-seo') => `<script src="${ROOT}/public/track.js" data-key="${k}" ${extra}></script>`;
const PAGES = {
	'/about': `<html><head><title>Old title</title>${snippet(key)}</head><body>About</body></html>`,
	'/printed': `<html><head><title>About us | Acme</title>${snippet(key)}</head></html>`,
	'/deferred': `<html><head>${snippet(key, 'data-seo defer')}</head></html>`,
	'/plain': `<html><head>${snippet(key, 'defer')}</head></html>`,
	'/none': '<html><head><title>No snippet</title></head></html>',
	'/other': `<html><head>${snippet('mint_pk_someone_else')}</head></html>`,
};
const server = http.createServer((q, s) => {
	const body = PAGES[q.url];
	s.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
	s.end(body || 'not here');
});
await new Promise(res => server.listen(0, '127.0.0.1', res));
const SITE = `http://127.0.0.1:${server.address().port}`;
await call('POST', P('/pages'), { name: 'Printed', path: '/printed', status: 'published' }, T).then(async x => call('POST', P('/seo'), { page: x.body?.doc?._id, seo: { metaTitle: 'About us' } }, T));
await call('POST', P('/pages'), { name: 'Plain', path: '/plain', status: 'published' }, T).then(async x => call('POST', P('/seo'), { page: x.body?.doc?._id, seo: { metaTitle: 'Plain' } }, T));
const test = async url => (await call('POST', P('/site-config/connection'), { url }, T)).body;
const item = (r, k) => r?.items?.find(i => i.key === k);

r = await test(`${SITE}/about`);
ok('test: localhost isn’t a project domain → missing', item(r, 'domain')?.status === 'missing', JSON.stringify(item(r, 'domain')));
ok('test: the snippet with this key and data-seo → ok', item(r, 'snippet')?.status === 'ok', JSON.stringify(item(r, 'snippet')));
ok('test: no visits yet → idle', item(r, 'visits')?.status === 'idle', JSON.stringify(item(r, 'visits')));
ok('test: /about is added, put on by the snippet → ok', item(r, 'seo')?.status === 'ok' && /in the browser/.test(item(r, 'seo').message), JSON.stringify(item(r, 'seo')));
ok('test: not connected while something is missing', r?.connected === false);

await fetch(`${ROOT}/public/api/track?apiKey=${key}`, {
	method: 'POST',
	headers: { 'content-type': 'text/plain', origin: 'https://www.acme-shoes.example.com', 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605.1.15', 'x-forwarded-for': '203.0.113.7' },
	body: JSON.stringify({ visitorId: 'sc1', sessionId: 'sc1', events: [{ type: 'pageview', eventId: 'sc-e1', path: '/about', title: 'About' }] }),
});
r = await test(`${SITE}/printed`);
ok('test: visits arriving → ok, with the last page', item(r, 'visits')?.status === 'ok' && item(r, 'visits').message.includes('/about'), JSON.stringify(item(r, 'visits')));
ok('test: Mint’s title already in the HTML → link previews see it', item(r, 'seo')?.status === 'ok' && /link previews see it/.test(item(r, 'seo').message), JSON.stringify(item(r, 'seo')));
r = await test(`${SITE}/deferred`);
ok('test: data-seo with defer → warning', item(r, 'snippet')?.status === 'warning' && /defer/.test(item(r, 'snippet').message), JSON.stringify(item(r, 'snippet')));
r = await test(`${SITE}/plain`);
ok('test: no data-seo → warning; an added page nothing puts on → warning', item(r, 'snippet')?.status === 'warning' && item(r, 'seo')?.status === 'warning', JSON.stringify([item(r, 'snippet'), item(r, 'seo')]));
r = await test(`${SITE}/none`);
ok('test: no snippet in the HTML → idle (a tag manager may add it)', item(r, 'snippet')?.status === 'idle' && item(r, 'seo')?.status === 'idle', JSON.stringify([item(r, 'snippet'), item(r, 'seo')]));
r = await test(`${SITE}/other`);
ok('test: another project’s key → missing', item(r, 'snippet')?.status === 'missing', JSON.stringify(item(r, 'snippet')));
r = await test(`${SITE}/gone`);
ok('test: a page that answers 404 → missing', item(r, 'snippet')?.status === 'missing' && /404/.test(item(r, 'snippet').message), JSON.stringify(item(r, 'snippet')));
r = await test('/about');
ok('test: a path uses the project’s domain; its domain → ok', r?.url === 'https://www.acme-shoes.example.com/about' && item(r, 'domain')?.status === 'ok', JSON.stringify(r?.url));
r = await test('');
ok('test: no address → the home page', r?.url === 'https://www.acme-shoes.example.com/', r?.url);
r = await call('POST', `/tenant/api/p/${app?._id}/site-config/connection`, { url: SITE }, T);
ok('test: an app project → 404', r.status === 404, r.status);
server.close();

const js = await (await fetch(`${ROOT}/public/track.js`)).text();
ok('track.js: data-seo asks /site/head on every page view', js.includes("hasAttribute('data-seo')") && js.includes("'/site/head'") && js.includes('seo();'));
ok('track.js parses', (() => { try { new Function(js); return true; } catch (e) { return e.message; } })() === true);

done();
