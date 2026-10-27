// docs/seo SEO-01: the tenant panel's SEO score reads a page's words from GET /site-config/seo-page — a builder
// page's draft + Contents, the live page for a site built elsewhere, and the other pages' focus keywords. Stands alone.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sally Score', email: `sally${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sally ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Score Studio', type: 'website', domains: ['www.score-studio.invalid'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;

r = await call('POST', P('/site-builder/starter'), { theme: 'studio' }, T);
ok('a starter site', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message}`);

// A builder page: its words and headings from the draft and its Contents.
r = await call('GET', P('/site-config/seo-page?path=/'), null, T);
ok('the home page: from the builder', r.status === 200 && r.body?.source === 'builder', `${r.status} ${JSON.stringify(r.body)?.slice(0, 200)}`);
ok('…with words', (r.body?.text || '').split(/\s+/).length > 30, (r.body?.text || '').slice(0, 120));
ok('…with headings, no markup or bindings', r.body?.headings?.length > 0 && !r.body.headings.some(h => /[<>]|\{\{/.test(h)), JSON.stringify(r.body?.headings));

// Other pages' focus keywords — not this page's own.
const pages = (await call('GET', P('/pages?limit=50'), null, T)).body?.doc || [];
const about = pages.find(p => p.path !== '/' && !p.path.includes('['));
const homePage = pages.find(p => p.path === '/');
const seoOf = async page => (await call('GET', P(`/seo?limit=50`), null, T)).body?.doc?.find(s => String(s.page?._id || s.page) === String(page._id));
const setKeyword = async (page, focusKeyword) => {
	const rec = await seoOf(page);
	return rec
		? call('PUT', P(`/seo/${rec._id}`), { seo: { ...(rec.seo || {}), focusKeyword } }, T)
		: call('POST', P('/seo'), { page: page._id, seo: { metaTitle: page.name, focusKeyword } }, T);
};
r = await setKeyword(about, 'brand studio dhaka');
ok(`a focus keyword on ${about?.path}`, r.status === 200 || r.status === 201, `${r.status} ${r.body?.message}`);
await setKeyword(homePage, 'creative studio');
r = await call('GET', P('/site-config/seo-page?path=/'), null, T);
ok('the other pages’ keywords, without this page’s own', JSON.stringify(r.body?.keywords) === JSON.stringify([{ path: about.path, keyword: 'brand studio dhaka' }]), JSON.stringify(r.body?.keywords));
r = await call('GET', P(`/site-config/seo-page?page=${about._id}`), null, T);
ok('by the page’s id (what an SEO record’s form holds)', r.status === 200 && r.body?.path === about.path && r.body.source === 'builder', JSON.stringify(r.body)?.slice(0, 160));
r = await call('GET', P(`/site-config/seo-page?path=${encodeURIComponent(`${about.path}/`)}`), null, T);
ok('a trailing slash is the same page', r.body?.path === about.path && r.body.keywords.some(k => k.path === '/' && k.keyword === 'creative studio'), JSON.stringify(r.body?.keywords));

// A page built elsewhere: its live HTML — here the site can't be reached, so no words, and why.
r = await call('POST', P('/pages'), { name: 'Pricing', path: '/pricing', status: 'published' }, T);
r = await call('GET', P('/site-config/seo-page?path=/pricing'), null, T);
ok('a page not in the builder: no words, with the reason', r.status === 200 && r.body?.source === 'none' && r.body.text === '' && /reach|answered|address/i.test(r.body.note || ''), JSON.stringify(r.body));

// Who may ask.
r = await call('GET', P('/site-config/seo-page?path=/'), null, null);
ok('signed out: refused', r.status === 401 || r.status === 403, r.status);
const app = (await call('POST', '/tenant/api/projects', { name: 'Score app', type: 'app' }, T)).body;
r = await call('GET', `/tenant/api/p/${app?._id}/site-config/seo-page?path=/`, null, T);
ok('an app project: 404', r.status === 404, r.status);

done();
