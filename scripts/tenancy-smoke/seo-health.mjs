// docs/seo SEO-03: GET /site-config/seo-health — the site's SEO problems across its published pages (Website → SEO's
// health card). One page per problem; each should be reported once, with the right pages. Stands alone.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Hal Health', email: `hal${stamp}@example.com`, password: 'tenant-pass-123', organization: `Hal ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Health Shoes', type: 'website', domains: ['www.health-shoes.invalid'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;

const page = async (path, { status = 'published', menu = false, seo } = {}) => {
	const p = (await call('POST', P('/pages'), { name: `Page ${path}`, path, status, showInMenu: menu }, T)).body?.doc;
	if (seo) {
		const x = await call('POST', P('/seo'), { page: p?._id, seo }, T);
		if (x.status >= 300) console.log('seo save', x.status, x.body?.message);
	}
	return p;
};
const desc = 'Handmade leather shoes from Dhaka, made to measure and delivered across Bangladesh in a week.';
await page('/a', { seo: { metaTitle: 'Leather shoes made in Dhaka', metaDescription: desc, focusKeyword: 'leather shoes', ogImage: 'https://img.invalid/a.jpg' } });
await page('/b', { menu: true, seo: { metaTitle: 'Leather Shoes  made in Dhaka', metaDescription: desc, focusKeyword: 'Leather shoes', robots: { index: false } } });
await page('/c', { seo: { canonicalUrl: 'https://health-shoes.invalid/missing' } });
await page('/d', { seo: { metaTitle: 'A title that goes on and on well past the sixty characters Google shows', metaDescription: 'Short and its own.', canonicalUrl: 'https://www.health-shoes.invalid/a/' } });
await page('/e', { seo: { metaTitle: 'Hidden page', metaDescription: 'Its own words.', robots: { index: false } } });
await page('/f');
await page('/g', { status: 'draft', seo: { metaTitle: 'Leather shoes made in Dhaka' } });
await page('/blog/[slug]', { seo: { metaTitle: '{{record.title}}', metaDescription: desc } });

r = await call('GET', P('/site-config/seo-health'), null, T);
ok('200, published pages only', r.status === 200 && r.body?.checked === 7, `${r.status} ${r.body?.checked} ${r.body?.message || ''}`);
const g = Object.fromEntries((r.body?.groups || []).map(x => [x.key, x]));
const at = key => (g[key]?.pages || []).map(p => p.path).sort().join();
console.log('   groups:', Object.keys(g).map(k => `${k}=${at(k)}`).join(' | '));

ok('the same title (case and spaces aside), not the draft or the template', at('same-title') === '/a,/b', at('same-title'));
ok('…each with the title as its detail', g['same-title']?.pages.every(p => /leather/i.test(p.detail || '')));
ok('the same description, not the template', at('same-description') === '/a,/b', at('same-description'));
ok('the same focus keyword', at('same-keyword') === '/a,/b', at('same-keyword'));
ok('hidden but in the menu', at('hidden-in-menu') === '/b', at('hidden-in-menu'));
ok('hidden, not in the menu: a notice', at('hidden') === '/e' && g.hidden.level === 'notice', at('hidden'));
ok('a canonical to a missing page on the site’s own domain (www or not)', at('canonical-nowhere') === '/c' && g['canonical-nowhere'].level === 'error', at('canonical-nowhere'));
ok('no title of its own', at('no-title') === '/c', at('no-title'));
ok('no description', at('no-description') === '/c', at('no-description'));
ok('a long title, not the template', at('long-title') === '/d', at('long-title'));
ok('no share image and no site image: a warning', g['no-image']?.level === 'warning' && at('no-image') === '/b,/blog/[slug],/c,/d,/e', at('no-image'));
ok('a published page with no SEO record: a notice', at('no-seo') === '/f' && g['no-seo'].level === 'notice', at('no-seo'));
ok('the site isn’t hidden', !g['site-hidden']);
ok('errors first', r.body.groups[0]?.level === 'error' && r.body.counts.error === 1, JSON.stringify(r.body.counts));
ok('each item links its page and SEO record', g['no-title']?.pages[0]?.page && g['no-title'].pages[0].seo && !g['no-seo'].pages[0].seo);

r = await call('PUT', P('/site-config'), { seo: { indexing: false, ogImage: 'https://img.invalid/site.jpg' } }, T);
ok('Site setup: indexing off, a site image', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', P('/site-config/seo-health'), null, T);
const g2 = Object.fromEntries((r.body?.groups || []).map(x => [x.key, x]));
ok('the whole site hidden: an error, first', r.body?.groups[0]?.key === 'site-hidden' && g2['site-hidden'].level === 'error', r.body?.groups?.[0]?.key);
ok('with a site image, no share image is a notice', g2['no-image']?.level === 'notice', g2['no-image']?.level);

r = await call('GET', P('/site-config/seo-health'), null, null);
ok('signed out: refused', r.status === 401 || r.status === 403, r.status);
const app = (await call('POST', '/tenant/api/projects', { name: 'Health app', type: 'app' }, T)).body;
r = await call('GET', `/tenant/api/p/${app?._id}/site-config/seo-health`, null, T);
ok('an app project: 404', r.status === 404, r.status);

done();
