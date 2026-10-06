// The site builder's data (docs/site-builder SB-09, D27) and its MCP tools (SB-12):
// the website kit's Site design / SEO / Pages / Contents records kept in step with
// the builder, lists of records (`collection`) through the public API's rules,
// template pages, Contents bindings, the render API's data, the editor's /data and
// /resolve, MCP prompts, the publish scope. Stands alone.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Dee Data', email: `dee${stamp}@example.com`, password: 'tenant-pass-123', organization: `Dee ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Studio ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const SB = path => P(`/site-builder${path}`);
const render = (path, q = '') => call('GET', `/public/api/${site.publicSlug}/render?path=${encodeURIComponent(path)}${q}`);

/* -------------------------------------------------------- the kit */
r = await call('GET', P('/builder/models'), null, T);
const routes = (r.body?.doc || r.body || []).map?.(m => m.route) || [];
ok('a new website has the Site design model with the kit', ['pages', 'seo', 'web-contents', 'site-design'].every(x => routes.includes(x)), routes.join(' '));

/* -------------------------------------------------------- the AI's key */
r = await call('POST', P('/builder/api-keys'), { name: 'Claude', scopes: ['read', 'build'] }, T);
const key = r.body?.secret;
ok('a key without publish', !!key, r.status);
r = await call('POST', P('/builder/api-keys'), { name: 'Claude publishes', scopes: ['read', 'build', 'publish'] }, T);
const pubKey = r.body?.secret;
ok('a key with the publish scope', !!pubKey && r.body?.doc?.scopes?.includes('publish'), JSON.stringify(r.body?.doc?.scopes));
const rpc = async (k, method, params) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return x.json().catch(() => null);
};
const tool = async (k, name, args = {}) => (await rpc(k, 'tools/call', { name, arguments: args }))?.result;
const text = res => res?.content?.[0]?.text || '';

const init = await rpc(key, 'initialize', { protocolVersion: '2025-06-18' });
ok('initialize: the site builder instructions and prompts', /SITE BUILDER/.test(init?.result?.instructions || '') && !!init?.result?.capabilities?.prompts, JSON.stringify(init?.result?.capabilities));
const names = (await rpc(key, 'tools/list', {}))?.result?.tools?.map(t => t.name) || [];
ok('site builder tools listed', ['site_builder_guide', 'get_site_builder', 'save_site_page', 'set_site_design', 'set_site_contents', 'check_site'].every(n => names.includes(n)), names.join(' '));
ok('…publish_site only for a key with the publish scope', !names.includes('publish_site') && (await rpc(pubKey, 'tools/list', {}))?.result?.tools?.some(t => t.name === 'publish_site'));
let res = await tool(key, 'publish_site', {});
ok('…and refused to call', res?.isError && /publish/.test(text(res)), text(res));
const prompts = (await rpc(key, 'prompts/list', {}))?.result?.prompts || [];
ok('prompts: Build my site, Add a list', prompts.some(p => p.name === 'build_site' && p.arguments.some(a => a.name === 'theme')) && prompts.some(p => p.name === 'add_site_list'), JSON.stringify(prompts.map(p => p.name)));
let got = await rpc(key, 'prompts/get', { name: 'build_site', arguments: { brief: 'A design studio', theme: 'editorial' } });
ok('build_site with a theme names it', /Editorial theme \(editorial\)/.test(got?.result?.messages?.[0]?.content?.text || ''), got?.result?.messages?.[0]?.content?.text?.slice(0, 120));
got = await rpc(key, 'prompts/get', { name: 'build_site', arguments: {} });
ok('…and needs a brief', /Missing argument: brief/.test(got?.error?.message || ''), JSON.stringify(got).slice(0, 100));

res = await tool(key, 'site_builder_guide');
ok('site_builder_guide: contents, models with a public API, themes, presets, blocks', /Contents/.test(text(res)) && /public list and get/.test(text(res)) && /- studio — Studio/.test(text(res)) && /hero-centered/.test(text(res)) && /- collection — List of records/.test(text(res)), text(res).length);

/* -------------------------------------------------------- design */
res = await tool(key, 'set_site_design', { theme: 'editorial', tokens: { colors: { primary: { light: '#0f766e' } }, fonts: { heading: { family: 'Playfair Display' } } }, header: 'header-simple' });
ok('set_site_design', !res?.isError && /theme editorial/.test(text(res)), text(res).slice(0, 160));
r = await call('GET', P('/site-design'), null, T);
let rec = (r.body?.doc || [])[0];
ok('…saved in the Site design record', rec?.theme === 'editorial' && rec?.primaryColor === '#0f766e' && rec?.headingFont === 'Playfair Display', JSON.stringify(rec).slice(0, 200));
res = await tool(key, 'set_site_design', { theme: 'no-such-theme' });
ok('an unknown theme is refused', res?.isError, text(res).slice(0, 100));
// Changed in the panel → the builder's draft follows
await new Promise(x => setTimeout(x, 20));
r = await call('PUT', P(`/site-design/${rec._id}`), { theme: 'bistro', primaryColor: '#b91c1c' }, T);
ok('the panel changes the Site design record', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', SB('/design'), null, T);
ok('…and the builder’s design follows', r.body?.draft?.theme === 'bistro' && r.body.draft.tokens?.colors?.primary?.light === '#b91c1c' && r.body.draft.tokens?.fonts?.heading?.family === 'Playfair Display', JSON.stringify(r.body?.draft?.tokens).slice(0, 200));
let rev = r.body.draft.rev;
r = await call('PUT', SB('/design'), { rev, theme: 'calm' }, T);
r = await call('GET', P(`/site-design/${rec._id}`), null, T);
ok('the editor’s change goes into the record', r.body?.theme === 'calm', r.body?.theme);

/* -------------------------------------------------------- a list model */
const plan = {
	title: 'Services', summary: 'What the studio offers.', sidebarCategory: 'Website',
	steps: [{ action: 'create', name: 'Service', title: 'Services', rationale: 'Shown on the site.', displayField: 'title', publicApi: { enabled: true, actions: ['list', 'get'] },
		fields: [ { key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'slug', label: 'Slug', kind: 'text', required: true }, { key: 'summary', label: 'Summary', kind: 'textarea' }, { key: 'price', label: 'Price', kind: 'number' }, { key: 'featured', label: 'Featured', kind: 'boolean' } ] }],
};
res = await tool(key, 'build_feature', { feature: plan });
ok('build_feature: Services with a public API', res && !res.isError, text(res).slice(0, 160));
const rows = Array.from({ length: 7 }, (_, i) => ({ title: `Service ${i + 1}`, slug: `service-${i + 1}`, summary: `What ${i + 1} is`, price: 100 * (i + 1), featured: i < 2 }));
res = await tool(key, 'create_records', { route: 'services', records: rows, matchOn: 'slug' });
ok('create_records fills it', res && !res.isError, text(res).slice(0, 120));
const privatePlan = { title: 'Notes', summary: 'Private.', sidebarCategory: 'Website', steps: [{ action: 'create', name: 'Note', title: 'Notes', rationale: 'Team only.', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }] };
res = await tool(key, 'build_feature', { feature: privatePlan });
ok('a private model (no public API)', res && !res.isError, text(res).slice(0, 100));

/* -------------------------------------------------------- contents */
res = await tool(key, 'set_site_contents', { page: '/', records: [{ slug: 'home-hero', name: 'Home — hero', section: 'hero', content: 'Design that works', subContent: 'A small studio', btnText: 'See services', url: '/services' }] });
ok('set_site_contents', !res?.isError && /home-hero/.test(text(res)), text(res).slice(0, 120));
res = await tool(key, 'set_site_contents', { records: [{ slug: 'Bad Slug' }] });
ok('a bad slug is refused', res?.isError, text(res));

/* -------------------------------------------------------- pages */
const home = [
	{ type: 'section', props: {}, children: [
		{ type: 'heading', props: { text: 'x', level: 1 }, bind: { text: { from: 'content', slug: 'home-hero', field: 'content' } } },
		{ type: 'text', props: { html: '<p>{{content.home-hero.subContent}} · {{site.name}}</p>' } },
	] },
	{ id: 'svclist1', type: 'collection', props: { source: { model: 'services', sort: 'price', pageSize: 3 }, pagination: true }, children: [
		{ type: 'card', props: {}, children: [ { type: 'heading', props: { text: '{{item.title}}', level: 3 } }, { type: 'text', props: { html: '<p>{{item.price | money}}</p>' } } ] },
	] },
	{ preset: 'cta-banner' },
];
res = await tool(key, 'save_site_page', { path: '/', tree: home, seo: { title: 'Studio — design that works', description: 'A small studio.' } });
ok('save_site_page: home with a content binding, a list and a preset', !res?.isError, text(res).slice(0, 200));
res = await tool(key, 'save_site_page', { path: '/services/[slug]', name: 'Service', kind: 'template', source: { model: 'services', match: { param: 'slug', field: 'slug' } }, tree: [{ type: 'heading', props: { text: '{{record.title}}', level: 1 } }], seo: { title: '{{record.title}} — Studio', description: '{{record.summary}}' } });
ok('save_site_page: a template page', !res?.isError, text(res).slice(0, 200));
res = await tool(key, 'save_site_page', { path: '/notes', tree: [{ type: 'collection', props: { source: { model: 'notes' } }, children: [] }] });
ok('a page listing the private model saves (a publish problem, not an error)', !res?.isError && /public API/.test(text(res)), text(res).slice(0, 240));
res = await tool(key, 'save_site_page', { path: '/bad', tree: [{ type: 'flux', props: {} }] });
ok('a bad tree is refused, nothing saved', res?.isError && /flux/.test(text(res)), text(res).slice(0, 120));
res = await tool(key, 'save_site_page', { path: '/', ops: [{ op: 'update', id: 'svclist1', props: { columns: 2 } }] });
ok('ops change a page', !res?.isError, text(res).slice(0, 100));

// SEO and Pages records
r = await call('GET', P('/seo'), null, T);
const seoRecs = r.body?.doc || [];
ok('each page’s SEO is in its SEO record', seoRecs.some(s => s.title === 'Studio — design that works') && seoRecs.some(s => s.title === '{{record.title}} — Studio'), JSON.stringify(seoRecs.map(s => s.title)));
r = await call('GET', P('/pages'), null, T);
ok('…linked to a Pages record per builder page', ['/', '/services/[slug]', '/notes'].every(p => (r.body?.doc || []).some(x => x.path === p)), JSON.stringify((r.body?.doc || []).map(x => x.path)));

/* -------------------------------------------------------- check, publish */
res = await tool(key, 'check_site');
ok('check_site: the private list blocks Publish', /Not ready/.test(text(res)) && /Turn on Notes’s public API \(list\)/.test(text(res)), text(res).slice(0, 300));
r = await call('GET', SB('/pages'), null, T);
const notes = r.body.pages.find(p => p.path === '/notes');
await call('DELETE', SB(`/pages/${notes.id}`), null, T);
res = await tool(pubKey, 'publish_site', { note: 'First version' });
ok('publish_site with the publish scope', !res?.isError && /Published version 1/.test(text(res)), text(res).slice(0, 200));
r = await call('GET', P('/pages'), null, T);
ok('…the Pages records say published', (r.body?.doc || []).filter(x => x.path === '/' || x.path === '/services/[slug]').every(x => x.status === 'published'), JSON.stringify((r.body?.doc || []).map(x => [x.path, x.status])));

/* -------------------------------------------------------- render */
r = await render('/');
const data = r.body?.data || {};
ok('render: the list’s records (sorted, a page of 3)', r.status === 200 && data.nodes?.svclist1?.items?.map(i => i.title).join() === 'Service 1,Service 2,Service 3' && data.nodes.svclist1.totalPages === 3, JSON.stringify(data.nodes?.svclist1).slice(0, 200));
ok('…the Contents records the page binds to', data.contents?.['home-hero']?.content === 'Design that works', JSON.stringify(data.contents).slice(0, 120));
r = await render('/', '&page=3');
ok('…?page=3 is the last record', r.body?.data?.nodes?.svclist1?.items?.map(i => i.title).join() === 'Service 7' && r.body.data.nodes.svclist1.page === 3, JSON.stringify(r.body?.data?.nodes?.svclist1?.items));
r = await render('/services/service-2');
ok('a template page answers with its record', r.status === 200 && r.body?.data?.record?.title === 'Service 2' && r.body.page.path === '/services/service-2', `${r.status} ${JSON.stringify(r.body?.data?.record).slice(0, 100)}`);
ok('…its SEO filled from the record', r.body?.page?.seo?.title === 'Service 2 — Studio' && r.body.page.seo.description === 'What 2 is', JSON.stringify(r.body?.page?.seo).slice(0, 160));
r = await render('/services/nope');
ok('…no such record → 404', r.status === 404, r.status);
r = await call('PUT', P('/web-contents/' + (await call('GET', P('/web-contents'), null, T)).body.doc.find(c => c.slug === 'home-hero')._id), { content: 'Edited in the panel' }, T);
r = await render('/');
ok('a Contents edit in the panel shows without a Publish', r.body?.data?.contents?.['home-hero']?.content === 'Edited in the panel', r.body?.data?.contents?.['home-hero']?.content);

/* -------------------------------------------------------- the editor */
r = await call('GET', SB('/data'), null, T);
const svc = r.body?.models?.find(m => m.model === 'services');
const nt = r.body?.models?.find(m => m.model === 'notes');
ok('GET /data: models with list/get, fields and a sample', svc?.list && svc.get && svc.fields.some(f => f.key === 'price') && svc.sample?.title && nt && !nt.list && /public API/.test(nt.problem), JSON.stringify(nt));
ok('…and the Contents records', r.body?.contents?.items?.some(c => c.slug === 'home-hero'), r.body?.contents?.items?.length);
r = await call('GET', SB('/pages'), null, T);
const tpl = r.body.pages.find(p => p.kind === 'template');
r = await call('POST', SB('/resolve'), { tree: [{ id: 'x1234567', type: 'collection', props: { source: { model: 'services', filter: { featured: true } } }, children: [] }, { id: 'c1234567', type: 'heading', props: {}, bind: { text: { from: 'content', slug: 'home-hero', field: 'content' } } }], pageId: tpl.id }, T);
ok('POST /resolve: a filtered list, contents and a sample record for a template page', r.body?.nodes?.x1234567?.items?.length === 2 && r.body.contents?.['home-hero'] && r.body.record?.title, JSON.stringify(r.body).slice(0, 200));
r = await call('POST', SB('/resolve'), { tree: [{ id: 'x1234567', type: 'collection', props: { source: { model: 'notes' } }, children: [] }] }, T);
ok('…a private model shows nothing, and says why', r.body?.nodes?.x1234567?.items?.length === 0 && /public API/.test(r.body.nodes.x1234567.problem), JSON.stringify(r.body).slice(0, 200));
r = await call('POST', SB('/contents'), { records: [{ slug: 'about-intro', content: 'Hello' }] }, T);
ok('POST /contents saves a content by slug', r.status === 200 && r.body?.records?.[0]?.slug === 'about-intro', `${r.status} ${r.body?.message}`);

// SEO changed in the panel → the page's draft
const homeSeo = (await call('GET', P('/seo'), null, T)).body.doc.find(s => s.title === 'Studio — design that works');
await call('PUT', P(`/seo/${homeSeo._id}`), { title: 'Studio — from the panel', description: 'A small studio.', page: homeSeo.page?._id || homeSeo.page }, T);
r = await call('GET', SB('/pages'), null, T);
const homePage = r.body.pages.find(p => p.isHome);
r = await call('GET', SB(`/pages/${homePage.id}`), null, T);
ok('an SEO record edited in the panel reaches the page’s draft', r.body?.draft?.seo?.title === 'Studio — from the panel' && r.body.changed, JSON.stringify(r.body?.draft?.seo));

done();
