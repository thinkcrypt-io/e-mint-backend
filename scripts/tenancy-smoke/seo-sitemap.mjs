// docs/seo SEO-08: GET /public/api/site/sitemap.xml lists every record a template page shows (/blog/[slug] → each
// post), with its date and image; records and pages hidden from search stay out; Site setup's extra addresses; numbered
// parts. The XML and the split past 5,000 are unit-tested in library/siteBuilder/test/sitemap.test.ts. Stands alone.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sam Sitemap', email: `sam${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sam ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Sitemap Shop', type: 'website', domains: ['www.sitemap-shop.invalid'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;

r = await call('POST', P('/builder/api-keys'), { name: 'Claude publishes', scopes: ['read', 'build', 'publish'] }, T);
const key = r.body?.secret;
const tool = async (name, args = {}) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
	return (await x.json().catch(() => null))?.result;
};
const text = res => res?.content?.[0]?.text || '';

/* ---- a blog: posts with a cover, one hidden from search, one with no slug ---- */
let res = await tool('build_feature', {
	feature: {
		title: 'Posts',
		summary: 'The blog.',
		sidebarCategory: 'Website',
		steps: [
			{
				action: 'create', name: 'Post', title: 'Posts', rationale: 'The blog.', displayField: 'title', publicApi: { enabled: true, actions: ['list', 'get'] },
				fields: [
					{ key: 'title', label: 'Title', kind: 'text', required: true },
					{ key: 'slug', label: 'Slug', kind: 'text' },
					{ key: 'cover', label: 'Cover', kind: 'image' },
					{ key: 'noIndex', label: 'Hide from search engines', kind: 'boolean' },
				],
			},
		],
	},
});
ok('a Posts model with a public API', !res?.isError, text(res).slice(0, 160));
const posts = Array.from({ length: 5 }, (_, i) => ({ title: `Post ${i + 1}`, slug: `post-${i + 1}`, cover: `https://img.invalid/p${i + 1}.jpg` }));
posts.push({ title: 'Secret', slug: 'secret', noIndex: true }, { title: 'No slug' }, { title: 'Spaced', slug: 'a b' });
res = await tool('create_records', { route: 'posts', records: posts });
ok('8 posts', !res?.isError, text(res).slice(0, 160));

/* ---- pages: home, the blog's template, a template hidden from search ---- */
res = await tool('save_site_page', { path: '/', name: 'Home', tree: [{ type: 'heading', props: { text: 'Shop', level: 1 } }], seo: { title: 'Sitemap Shop', image: 'https://img.invalid/home.jpg' } });
ok('the home page', !res?.isError, text(res).slice(0, 160));
res = await tool('save_site_page', { path: '/blog/[slug]', name: 'Post', kind: 'template', source: { model: 'posts', match: { param: 'slug', field: 'slug' } }, tree: [{ type: 'heading', props: { text: '{{record.title}}', level: 1 } }], seo: { title: '{{record.title}}' } });
// A template page's share image can't be a {{record.…}} binding (the builder wants an address): the model's image field is used.
ok('a template page for posts', !res?.isError, text(res).slice(0, 160));
res = await tool('save_site_page', { path: '/drafts/[slug]', name: 'Draft post', kind: 'template', source: { model: 'posts', match: { param: 'slug', field: 'slug' } }, tree: [{ type: 'heading', props: { text: '{{record.title}}', level: 1 } }], seo: { noIndex: true } });
ok('a template page hidden from search', !res?.isError, text(res).slice(0, 160));
res = await tool('publish_site', { note: 'SEO-08' });
ok('published', !res?.isError && /Published/.test(text(res)), text(res).slice(0, 200));

/* ---- a page from elsewhere (kit Pages), hidden by its SEO record ---- */
r = await call('POST', P('/pages'), { name: 'Old about', path: '/old-about', status: 'published' }, T);
await call('POST', P('/seo'), { page: r.body?.doc?._id, seo: { robots: { index: false } } }, T);
r = await call('POST', P('/pages'), { name: 'Prices', path: '/prices', status: 'published' }, T);
await call('POST', P('/seo'), { page: r.body?.doc?._id, seo: { metaTitle: 'Prices', ogImage: 'https://img.invalid/prices.jpg' } }, T);

const KEY = await projectKey(site.publicSlug);
const ORIGIN = 'https://www.sitemap-shop.invalid';
const sitemap = async (q = '') => {
	const x = await fetch(`${ROOT}/public/api/site/sitemap.xml?apiKey=${KEY}&origin=${encodeURIComponent(ORIGIN)}${q}`);
	return { status: x.status, text: await x.text() };
};
const locs = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(ORIGIN, ''));
const entry = (xml, path) => (xml.match(new RegExp(`<url><loc>${ORIGIN.replace(/[.]/g, '\\.')}${path.replace(/[.?]/g, '\\$&')}</loc>.*?</url>`)) || [''])[0];

let x = await sitemap();
let at = locs(x.text);
console.log('   sitemap:', at.join(' '));
ok('200, a urlset with image entries', x.status === 200 && x.text.includes('<urlset') && x.text.includes('xmlns:image'), x.status);
ok('every post with a slug is listed', ['/blog/post-1', '/blog/post-2', '/blog/post-3', '/blog/post-4', '/blog/post-5'].every(p => at.includes(p)));
ok('…a slug with a space, encoded', at.includes('/blog/a%20b'));
ok('…the post hidden from search, and the one with no slug, left out', !at.some(p => /secret|undefined|\/blog\/$/.test(p)));
ok('the template’s own address isn’t listed', !at.some(p => p.includes('[')));
ok('a template page hidden from search lists none of its records', !at.some(p => p.startsWith('/drafts/')));
ok('each post has its date and its cover as its image', /<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/.test(entry(x.text, '/blog/post-3')) && entry(x.text, '/blog/post-3').includes('<image:loc>https://img.invalid/p3.jpg</image:loc>'), entry(x.text, '/blog/post-3'));
ok('a post with no cover: no image entry', !entry(x.text, '/blog/a%20b').includes('image:'), entry(x.text, '/blog/a%20b'));
ok('the home page with its own image', entry(x.text, '/').includes('<image:loc>https://img.invalid/home.jpg</image:loc>'), entry(x.text, '/'));
ok('a page hidden by its SEO record is left out; another one listed with its share image', !at.includes('/old-about') && entry(x.text, '/prices').includes('https://img.invalid/prices.jpg'), entry(x.text, '/prices'));
ok('8 addresses in all: home, 6 posts, /prices', at.length === 8, at.length);

/* ---- extra addresses ---- */
r = await call('PUT', P('/site-config'), { seo: { sitemapExtra: ['/catalogue', `${ORIGIN}/landing?src=ad`, 'https://other.invalid/x', '/blog/post-1'] } }, T);
ok('Site setup: extra addresses saved', r.status === 200 && r.body?.seo?.sitemapExtra?.length === 4, `${r.status} ${r.body?.message || ''}`);
r = await call('PUT', P('/site-config'), { seo: { sitemapExtra: ['not an address'] } }, T);
ok('…one that isn’t an address: refused', r.status === 400 && /extra address/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('GET', P('/site-config'), null, T);
ok('…read back in the panel', r.body?.seo?.sitemapExtra?.includes('/catalogue'), JSON.stringify(r.body?.seo?.sitemapExtra));
x = await sitemap();
at = locs(x.text);
ok('listed: a path, and a full address on the site with its query', at.includes('/catalogue') && x.text.includes(`<loc>${ORIGIN}/landing?src=ad</loc>`), at.join(' '));
ok('…not one on another domain, nor a page twice', !x.text.includes('other.invalid') && at.filter(p => p === '/blog/post-1').length === 1);

/* ---- parts ---- */
x = await sitemap('&part=1');
ok('?part=1 on a small site: the same list', x.status === 200 && locs(x.text).length === at.length, locs(x.text).length);
x = await sitemap('&part=2');
ok('?part=2 on a small site: 404', x.status === 404, x.status);

/* ---- switched off ---- */
await call('PUT', P('/site-config'), { seo: { sitemap: false } }, T);
x = await sitemap();
ok('the sitemap switched off: an empty urlset', x.status === 200 && !x.text.includes('<url>'), x.text.slice(0, 120));

done();
