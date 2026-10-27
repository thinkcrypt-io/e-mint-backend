// Site connect SC-10: GET /site/edge — what the mint-edge Worker in front of a site needs (switched off or not,
// its domains, the pages that are Mint's, redirects, robots/sitemap from Mint), and /track taking the visitor's
// address from the Worker. Stands alone.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Eddie Edge', email: `eddie${stamp}@example.com`, password: 'tenant-pass-123', organization: `Eddie ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Edge Shoes', type: 'website', domains: ['www.edge-shoes.example.com'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const key = (await call('GET', P('/project-key'), null, T)).body?.apiKey;
const edge = async () => {
	const x = await fetch(`${ROOT}/public/api/site/edge?apiKey=${key}`);
	return { status: x.status, cache: x.headers.get('cache-control'), body: await x.json().catch(() => null) };
};

r = await edge();
ok('a new site: 200, cached 60 s', r.status === 200 && r.cache?.includes('max-age=60'), `${r.status} ${r.cache}`);
ok('a new site: on, its domains, analytics on, no pages, nothing from Mint', r.body?.bypass === false && r.body.domains.join() === 'www.edge-shoes.example.com' && r.body.analytics === true && r.body.pages.length === 0 && r.body.redirects.length === 0 && r.body.robots === false && r.body.sitemap === false, JSON.stringify(r.body));
ok('a version for the Worker to compare', /^\d+\.\d+\.\d+$/.test(r.body?.version || ''), r.body?.version);

// Pages: only published ones added to SEO are Mint's.
const page = async (name, path, status = 'published', seo = true) => {
	const p = (await call('POST', P('/pages'), { name, path, status }, T)).body?.doc;
	if (seo) await call('POST', P('/seo'), { page: p?._id, seo: { metaTitle: name } }, T);
	return p;
};
await page('Team', '/team/');
await page('Home', '/');
await page('Blog post', '/blog/first.html');
await page('Draft', '/draft', 'draft');
await page('Contact', '/contact', 'published', false);
r = await edge();
ok('pages: published + added to SEO, by their plain address', r.body?.pages.join() === '/,/blog/first,/team', JSON.stringify(r.body?.pages));

// The Worker's switches, redirects and analytics off — saved on Site setup.
r = await call('PUT', P('/site-config'), { edge: { bypass: true, robots: true, sitemap: true }, redirects: [{ from: '/old-team/', to: '/team' }, { from: '/promo', to: 'https://shop.example.com/sale', permanent: false }], tracking: { mintAnalytics: false } }, T);
ok('switches saved', r.status === 200 && r.body?.edge?.bypass === true && r.body.edge.robots === true, `${r.status} ${JSON.stringify(r.body?.edge)}`);
// The site API caches the settings for a minute; a fresh read is the panel's.
r = await call('GET', P('/site-config'), null, T);
ok('the panel sees the switches', r.body?.edge?.bypass === true && r.body.edge.sitemap === true, JSON.stringify(r.body?.edge));
r = await call('PUT', P('/site-config'), { edge: { bypass: 'yes please' } }, T);
ok('a switch that isn’t on/off: 400', r.status === 400, `${r.status} ${r.body?.message}`);

// The edge answer reads the settings through the site API's minute-long cache; a new project shows them at once.
r = await call('POST', '/tenant/api/projects', { name: 'Edge Two', type: 'website', domains: ['two.example.com'] }, T);
const two = r.body;
const key2 = (await call('GET', `/tenant/api/p/${two._id}/project-key`, null, T)).body?.apiKey;
await call('PUT', `/tenant/api/p/${two._id}/site-config`, { edge: { bypass: true, robots: true }, redirects: [{ from: '/old-team/', to: '/team' }, { from: '/promo', to: 'https://shop.example.com/sale', permanent: false }], tracking: { mintAnalytics: false } }, T);
let x = await fetch(`${ROOT}/public/api/site/edge?apiKey=${key2}`);
const e2 = await x.json();
ok('bypass, robots on, sitemap off', e2.bypass === true && e2.robots === true && e2.sitemap === false, JSON.stringify(e2));
ok('redirects: plain from-address, permanent unless said', JSON.stringify(e2.redirects) === JSON.stringify([{ from: '/old-team', to: '/team', permanent: true }, { from: '/promo', to: 'https://shop.example.com/sale', permanent: false }]), JSON.stringify(e2.redirects));
ok('analytics off', e2.analytics === false);

x = await fetch(`${ROOT}/public/api/site/edge`);
ok('no key: refused', x.status === 401, x.status);
const app = (await call('POST', '/tenant/api/projects', { name: 'Edge app', type: 'app' }, T)).body;
const appKey = (await call('GET', `/tenant/api/p/${app?._id}/project-key`, null, T)).body?.apiKey;
x = await fetch(`${ROOT}/public/api/site/edge?apiKey=${appKey}`);
ok('an app project: 404', x.status === 404, x.status);

// /track: the Worker sends the page view on with the visitor's address (X-Mint-Visitor-IP).
const view = (headers, path) =>
	fetch(`${ROOT}/public/api/track?apiKey=${key}`, {
		method: 'POST',
		headers: { 'content-type': 'text/plain', origin: 'https://www.edge-shoes.example.com', referer: `https://www.edge-shoes.example.com${path}`, 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605', ...headers },
		body: JSON.stringify({ events: [{ type: 'pageview', path, vid: `v${stamp}`, sid: `s${stamp}` }] }),
	});
x = await view({ 'x-mint-visitor-ip': '203.0.113.7' }, '/team');
ok('a page view through the Worker: 202', x.status === 202, x.status);
x = await view({ 'x-mint-visitor-ip': '<script>' }, '/contact');
ok('a nonsense address is ignored, the view still counts', x.status === 202, x.status);
const { MongoClient } = await import('mongodb');
const mongo = new MongoClient(process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint');
await mongo.connect();
const db = mongo.db();
const evs = await db.collection('websiteevents').find({ project: { $in: [site._id, (await import('mongodb')).ObjectId.createFromHexString(site._id)] }, type: 'pageview' }).toArray();
const byPath = Object.fromEntries(evs.map(e => [e.path, e]));
ok('the visitor’s address is kept, not the Worker’s', byPath['/team']?.ip === '203.0.113.7', JSON.stringify(evs.map(e => ({ path: e.path, ip: e.ip }))));
ok('a nonsense address isn’t', byPath['/contact'] && byPath['/contact'].ip !== '<script>', JSON.stringify(byPath['/contact']?.ip));
await mongo.close();

// track.js: data-api points it at the Worker's /_mint/api on the site's own domain.
x = await fetch(`${ROOT}/public/track.js`);
const js = await x.text();
ok('track.js reads data-api and finds /_mint/track.js', js.includes("getAttribute('data-api')") && js.includes('/_mint/track.js'));
let parsed = true;
try {
	new Function(js);
} catch (e) {
	parsed = String(e);
}
ok('track.js parses', parsed === true, parsed);

done();
