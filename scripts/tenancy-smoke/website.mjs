// Website projects: the kit, and the site API. Uses projects.mjs's state (pat).
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;

let r = await call('POST', '/tenant/api/projects', { name: 'Company site', type: 'website', domains: ['www.example.com'] }, s.pat);
ok('create a website project', r.status === 200 && r.body?.type === 'website', `${r.status} ${r.body?.message || ''}`);
const site = r.body._id, slug = r.body.publicSlug;
r = await call('GET', P(site, '/builder/models'), null, s.pat);
const models = (r.body?.doc || r.body || []).map(m => `${m.name}:${m.route}`);
ok('the kit: four models', ['SiteSettings:site-settings', 'WebPage:pages', 'PageSeo:seo', 'WebContent:web-contents'].every(x => models.includes(x)), models.join(' '));
const pub = (path) => fetch(`${ROOT}/public/api/${slug}/${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
r = await pub('');
ok('kit models are public (read-only)', r.body?.models?.length === 4 && r.body.models.every(m => m.actions.join() === 'list,get'), JSON.stringify(r.body?.models?.map(m => m.route)));
r = await call('GET', P(site, '/sidebar/crm/server'), null, s.pat);
ok('the Website sidebar section lists them', JSON.stringify(r.body).includes('/t/pages') && JSON.stringify(r.body).includes('/t/web-contents'));

await call('POST', P(site, '/site-settings'), { siteName: 'Example Co', email: 'hello@example.com', primaryColor: '#123456' }, s.pat);
// A create answers { message, doc }.
const made = r => ({ _id: r.body?._id || r.body?.doc?._id });
const home = made(await call('POST', P(site, '/pages'), { name: 'Home', path: '/', status: 'published', template: 'home' }, s.pat));
const about = made(await call('POST', P(site, '/pages'), { name: 'About', path: '/about', status: 'published', priority: 5 }, s.pat));
await call('POST', P(site, '/pages'), { name: 'Secret', path: '/secret', status: 'draft' }, s.pat);
r = await call('POST', P(site, '/pages'), { name: 'Dup', path: '/about', status: 'draft' }, s.pat);
ok('page paths are unique', r.status >= 400, r.status);
await call('POST', P(site, '/seo'), { page: about._id, title: 'About Example Co', description: 'Who we are', keywords: ['about', 'team'] }, s.pat);
await call('POST', P(site, '/web-contents'), { name: 'About hero', page: about._id, section: 'hero', category: 'content', content: 'We build things.', priority: 10 }, s.pat);
await call('POST', P(site, '/web-contents'), { name: 'Team cards', page: about._id, section: 'team', category: 'card', card: [{ title: 'Ada', subTitle: 'Founder' }], priority: 5 }, s.pat);
await call('POST', P(site, '/web-contents'), { name: 'Hidden block', page: about._id, isVisible: false, category: 'content' }, s.pat);
await call('POST', P(site, '/web-contents'), { name: 'Draft block', page: about._id, status: 'draft', category: 'content' }, s.pat);

r = await pub('site');
ok('GET /site: settings + menu', r.status === 200 && r.body?.settings?.siteName === 'Example Co' && r.body.menu.map(m => m.path).join() === '/about,/', JSON.stringify(r.body?.menu));
r = await pub('pages/by-path?path=/about');
ok('a page with its SEO', r.status === 200 && r.body?.page?.name === 'About' && r.body?.seo?.title === 'About Example Co', r.status);
ok('only visible, published contents, by priority', r.body?.contents?.map(c => c.name).join() === 'About hero,Team cards', r.body?.contents?.map(c => c.name).join());
ok('card rows come through', r.body?.contents?.[1]?.card?.[0]?.title === 'Ada');
r = await pub('pages/by-path?path=/secret');
ok('draft pages are not served', r.status === 404);
r = await pub('pages/by-path?path=/');
ok('home page (no SEO yet)', r.status === 200 && r.body?.seo === null && r.body?.contents?.length === 0);
r = await pub('web-contents?section=team');
ok('per-model API filters too', r.status === 200 && r.body?.total === 1);
r = await fetch(`${ROOT}/public/api/${slug}/pages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', path: '/x' }) });
ok('the kit is read-only to the public', r.status === 404);
r = await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat);
const appSlug = r.body?.publicSlug;
r = await fetch(`${ROOT}/public/api/${appSlug}/site`);
ok('/site is only for website projects', r.status === 404);
done();
