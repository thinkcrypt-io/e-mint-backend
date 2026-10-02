// WO-33: an AI builds a website through the tenant MCP, and the panel manages it. Uses projects.mjs's state (pat, crm).
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const rpc = async (key, method, params) => {
	const r = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return (await r.json().catch(() => null))?.result;
};
const tool = (key, name, args = {}) => rpc(key, 'tools/call', { name, arguments: args });
const text = res => res?.content?.[0]?.text || '';
const keyFor = async pid => {
	const r = await call('POST', P(pid, '/builder/api-keys'), { name: 'Site builder', scopes: ['read', 'build', 'data'] }, s.pat);
	return r.body?.secret || r.body?.key || r.body?.doc?.secret;
};

let r = await call('POST', '/tenant/api/projects', { name: 'Bakery site', type: 'website' }, s.pat);
ok('create a website project', r.status === 200 && r.body?.type === 'website', r.status);
const site = r.body._id, slug = r.body.publicSlug;
const key = await keyFor(site);
const pub = path => fetch(`${ROOT}/public/api/${slug}/${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));

// What the AI is offered
const init = await rpc(key, 'initialize', { protocolVersion: '2025-06-18' });
ok('website instructions in initialize', /This project is a WEBSITE/.test(init?.instructions || ''));
const names = (await rpc(key, 'tools/list', {}))?.tools?.map(t => t.name) || [];
ok('website tools listed', ['describe_website', 'get_site', 'update_site_settings', 'upsert_page', 'upload_media', 'create_records', 'set_public_api', 'site_snippets'].every(n => names.includes(n)), names.join(' '));
const appKey = await keyFor(s.crm);
const appNames = (await rpc(appKey, 'tools/list', {}))?.tools?.map(t => t.name) || [];
ok("an app project doesn't get the website tools", !appNames.includes('upsert_page') && !appNames.includes('describe_website') && appNames.includes('set_public_api') && appNames.includes('create_records'), appNames.join(' '));
r = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${appKey}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'upsert_page', arguments: { path: '/' } } }) }).then(x => x.json());
ok('…and can’t call them', /Unknown tool/.test(r?.error?.message || ''), JSON.stringify(r).slice(0, 100));

let res = await tool(key, 'describe_website');
ok('describe_website: the site API with this project’s address', text(res).includes(`/public/api/${slug}`) && /upsert_page/.test(text(res)), text(res).slice(0, 80));

// Settings
res = await tool(key, 'update_site_settings', { settings: { siteName: 'Crumb & Co', favicon: 'https://cdn.example.com/favicon.png', primaryColor: '#7c2d12', metaTitle: 'Crumb & Co bakery', nonsense: 1 }, domains: ['crumb.example.com'] });
ok('update_site_settings creates them', !res?.isError && /Created the site settings/.test(text(res)) && /Ignored.*nonsense/.test(text(res)), text(res).slice(0, 160));
res = await tool(key, 'update_site_settings', { settings: { primaryColor: 'not a colour?', siteName: '' } });
ok('bad settings are refused', res?.isError && /Nothing saved/.test(text(res)), text(res).slice(0, 120));
res = await tool(key, 'update_site_settings', { domains: ['not a domain'] });
ok('a bad domain is refused', res?.isError, text(res).slice(0, 80));

// Pages
const home = {
	path: '/', name: 'Home', template: 'home',
	seo: { title: 'Crumb & Co — fresh bread daily', description: 'A neighbourhood bakery.', keywords: ['bakery', 'bread'] },
	contents: [
		{ slug: 'hero', section: 'hero', category: 'content', content: 'Fresh bread, every morning', subContent: 'Since 1998', btnText: 'See the menu', url: '/menu' },
		{ slug: 'why', section: 'features', category: 'card', card: [{ title: 'Sourdough', description: '48-hour ferment' }, { title: 'Local flour' }] },
		{ slug: 'hours', category: 'list', list: ['Mon–Fri 7–18', 'Sat 8–14'] },
	],
};
res = await tool(key, 'upsert_page', home);
ok('upsert_page creates the home page', !res?.isError && /Created the page \//.test(text(res)), text(res).slice(0, 160));
res = await tool(key, 'upsert_page', { path: 'about/', seo: { title: 'About us', description: 'Our story.' }, contents: [{ name: 'Story', category: 'rich-content', richContent: '<p>We bake.</p>' }] });
ok('a second page, path tidied, slug from the name', !res?.isError && /Created the page \/about/.test(text(res)) && /story/.test(text(res)), text(res).slice(0, 160));
res = await tool(key, 'upsert_page', { path: '/bad', seo: { title: 'No description' }, contents: [{ slug: 'x', category: 'nope' }, { slug: 'x' }] });
ok('a bad page is refused, nothing saved', res?.isError && /seo\.description/.test(text(res)) && /category/.test(text(res)) && /used twice/.test(text(res)), text(res).slice(0, 200));
r = await pub('pages/by-path?path=/bad');
ok('…not even the page', r.status === 404);

// A list as its own model, with its public API, filled by create_records
res = await tool(key, 'build_feature', {
	feature: {
		title: 'Products', summary: 'What the bakery sells.', sidebarCategory: 'new',
		steps: [{ action: 'create', name: 'Product', title: 'Products', rationale: 'The menu.', displayField: 'name', publicApi: { enabled: true, actions: ['list', 'get'] },
			fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'slug', label: 'Slug', kind: 'text', unique: true }, { key: 'price', label: 'Price', kind: 'number' }, { key: 'image', label: 'Image', kind: 'image' }] }],
	},
});
ok('build_feature with publicApi', !res?.isError && /Public API on: Products/.test(text(res)), text(res).slice(0, 240));
const products = [{ name: 'Sourdough loaf', slug: 'sourdough', price: 6 }, { name: 'Croissant', slug: 'croissant', price: 3, colour: 'gold' }];
res = await tool(key, 'create_records', { route: 'products', records: products, matchOn: 'slug' });
ok('create_records adds them', !res?.isError && /2 created, 0 updated/.test(text(res)) && /Ignored.*colour/.test(text(res)), text(res).slice(0, 160));
res = await tool(key, 'create_records', { route: 'products', records: [{ name: 'Sourdough loaf', slug: 'sourdough', price: 7 }], matchOn: 'slug' });
ok('…again with matchOn updates, no duplicate', !res?.isError && /0 created, 1 updated/.test(text(res)), text(res).slice(0, 120));
res = await tool(key, 'create_records', { route: 'products', records: [{ slug: 'nameless', price: 'cheap' }] });
ok('an invalid record is refused', res?.isError && /name is required/.test(text(res)) && /price/.test(text(res)), text(res).slice(0, 160));

// Media: the refusals (a real upload goes to the S3 bucket — set SMOKE_UPLOAD=1 to try it)
res = await tool(key, 'upload_media', {});
ok('upload_media needs a url or data', res?.isError);
res = await tool(key, 'upload_media', { url: 'ftp://example.com/x.png' });
ok('…only http(s)', res?.isError && /(http|storage)/.test(text(res)), text(res).slice(0, 80));
if (process.env.SMOKE_UPLOAD) {
	const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
	res = await tool(key, 'upload_media', { data: png, filename: 'dot.png' });
	ok('upload_media uploads', !res?.isError && /^https?:/.test(res?.structuredContent?.url || ''), text(res).slice(0, 120));
}

// The site reads it all
r = await pub('site');
ok('GET /site: the settings and menu', r.body?.settings?.siteName === 'Crumb & Co' && r.body.settings.favicon?.includes('favicon') && r.body.menu.map(m => m.path).sort().join() === '/,/about', JSON.stringify(r.body?.menu));
r = await pub('pages/by-path?path=/');
ok('the home page: SEO and blocks in order', r.body?.seo?.title?.startsWith('Crumb') && r.body?.contents?.map(c => c.slug).join() === 'hero,why,hours', r.body?.contents?.map(c => c.slug).join());
ok('block fields come through', r.body?.contents?.[0]?.btnText === 'See the menu' && r.body.contents[1].card?.length === 2 && r.body.contents[2].list?.length === 2);
const hero = r.body?.contents?.[0];
r = await pub('products?sort=name');
ok('the list on the public API', r.status === 200 && r.body?.doc?.map(p => `${p.name}:${p.price}`).join() === 'Croissant:3,Sourdough loaf:7', JSON.stringify(r.body?.doc?.map(p => p.name)));

// Edited in the panel → the site changes, no code
r = await call('PUT', P(site, `/web-contents/${hero?._id}`), { content: 'Warm bread, every morning' }, s.pat);
ok('edit the hero in the panel', r.status === 200, r.status);
r = await pub('pages/by-path?path=/');
ok('the site API serves the edit', r.body?.contents?.[0]?.content === 'Warm bread, every morning', r.body?.contents?.[0]?.content);

// Building again updates instead of duplicating
res = await tool(key, 'upsert_page', { ...home, contents: home.contents.slice(0, 2), removeOthers: true });
ok('upsert_page again: updated, the dropped block archived', !res?.isError && /Updated the page \//.test(text(res)) && /Archived 1/.test(text(res)), text(res).slice(0, 200));
r = await call('GET', P(site, '/web-contents?limit=50'), null, s.pat);
const blocks = r.body?.doc || [];
ok('no duplicate blocks', blocks.length === 4 && blocks.filter(b => b.slug === 'hero').length === 1, `${blocks.length} ${blocks.map(b => b.slug).join()}`);
r = await pub('pages/by-path?path=/');
ok('the archived block leaves the site', r.body?.contents?.map(c => c.slug).join() === 'hero,why', r.body?.contents?.map(c => c.slug).join());

res = await tool(key, 'get_site');
ok('get_site shows the pages and blocks', /\| \/ \| Home \| published \| Crumb/.test(text(res)) && /crumb\.example\.com/.test(text(res)), text(res).slice(0, 200));
res = await tool(key, 'site_snippets');
ok('site_snippets: env and the tracker', text(res).includes(`MINT_API=${ROOT}/public/api/${slug}`) && text(res).includes(`data-project="${slug}"`), text(res).slice(0, 120));
res = await tool(key, 'set_public_api', { model: 'Product', enabled: false });
r = await pub('products');
ok('set_public_api turns it off', !res?.isError && r.status === 404, r.status);

// WO-34: the site setup — tags, code, SEO & indexing, redirects, headers
const text_ = async path => fetch(`${ROOT}/public/api/${slug}/${path}`).then(async x => ({ status: x.status, type: x.headers.get('content-type') || '', body: await x.text() }));
r = await call('GET', P(site, '/web-contents?page=1&limit=10'), null, s.pat);
ok('a list with ?page=1 on a model with a `page` field (was a cast error)', r.status === 200 && Array.isArray(r.body?.doc), `${r.status} ${r.body?.message || ''}`);
const homeId = (await pub('pages/by-path?path=/')).body?.page?._id;
r = await call('GET', P(site, `/web-contents?page=1&page_in=${homeId}`), null, s.pat);
ok('…and page_in still filters by page (its 3 blocks, one archived)', r.status === 200 && r.body?.doc?.length === 3, `${r.status} ${r.body?.doc?.length}`);
r = await call('PUT', P(site, '/site-config'), { tracking: { ga4: 'G-ABC1234XYZ' }, seo: { canonicalDomain: 'crumb.example.com', googleVerification: 'abc123' }, redirects: [{ from: '/old-menu', to: '/about' }], headers: [{ name: 'X-Frame-Options', value: 'DENY' }], code: { head: '<meta name="theme-color" content="#7c2d12">' } }, s.pat);
ok('save the site setup', r.status === 200 && r.body?.tracking?.ga4 === 'G-ABC1234XYZ' && r.body?.tracking?.mintAnalytics === true && r.body?.redirects?.length === 1, `${r.status} ${r.body?.message || ''}`);
r = await call('PUT', P(site, '/site-config'), { tracking: { ga4: 'UA-123' } }, s.pat);
ok('a bad tag ID is refused', r.status === 400 && /G-XXXXXXXXXX/.test(r.body?.message || ''), r.body?.message);
r = await call('PUT', P(site, '/site-config'), { headers: [{ name: 'Bad Header', value: 'x' }] }, s.pat);
ok('a bad header name is refused', r.status === 400, r.body?.message);
res = await tool(key, 'update_site_settings', { config: { tracking: { metaPixel: '1234567890' } } });
ok('the MCP sets tags too, merged with what is saved', !res?.isError && /tags: ga4, metaPixel/.test(text(res)), text(res).slice(0, 160));
r = await pub('site');
ok('GET /site carries the setup', r.body?.config?.tracking?.ga4 === 'G-ABC1234XYZ' && r.body.config.tracking.metaPixel === '1234567890' && r.body.config.redirects[0].to === '/about' && r.body.config.origin === 'https://crumb.example.com', JSON.stringify(r.body?.config?.tracking));
r = await pub('site/tags');
ok('GET /site/tags: what track.js injects', r.body?.ga4 === 'G-ABC1234XYZ' && r.body?.head?.includes('theme-color') && r.body?.googleVerification === 'abc123', JSON.stringify(r.body).slice(0, 120));
r = await text_('site/robots.txt');
ok('robots.txt allows and names the sitemap', r.status === 200 && /Allow: \//.test(r.body) && r.body.includes('Sitemap: https://crumb.example.com/sitemap.xml'), r.body);
r = await text_('site/sitemap.xml');
ok('sitemap.xml lists the published pages', r.status === 200 && r.type.includes('xml') && r.body.includes('<loc>https://crumb.example.com/</loc>') && r.body.includes('/about</loc>'), r.body.slice(0, 200));
await call('PUT', P(site, '/site-config'), { seo: { indexing: false } }, s.pat);
r = await text_('site/robots.txt');
ok('indexing off → Disallow, no sitemap line', /Disallow: \//.test(r.body) && !r.body.includes('Sitemap:'), r.body);
r = await call('GET', P(site, '/site-overview'), null, s.pat);
ok('the website overview: pages and a checklist', r.status === 200 && r.body?.counts?.published === 2 && r.body.checklist.find(c => c.key === 'favicon')?.done === true && r.body.checklist.find(c => c.key === 'logo')?.done === false, JSON.stringify(r.body?.counts));
r = await call('GET', P(s.crm, '/site-config'), null, s.pat);
ok('an app project has no site setup', r.status === 404, r.status);
r = await fetch(`${ROOT}/public/track.js`).then(x => x.text());
ok('track.js injects the tags', r.includes("/site/tags") && r.includes('googletagmanager.com/gtag/js'));
done();
