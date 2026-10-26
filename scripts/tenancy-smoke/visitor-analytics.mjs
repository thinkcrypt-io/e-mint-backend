// Visitor analytics (docs/multi-tenancy WO-56): what the tracker sends beyond page views — IP
// (whole / masked / off), ISP and timezone, screen, language, device model, ad click ids and
// the visit's channel, time on page and scroll, the signed-in customer and identify() — and
// the reports over it: new breakdowns, Visitors, one visitor's journey, Live. Stands alone.
// The ISP check looks up a real address (8.8.8.8) on ipwho.is, so it needs the internet.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Vera Visits', email: `vera${stamp}@example.com`, password: 'tenant-pass-123', organization: `Vera ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Visits site', type: 'website', domains: ['visits.example.com'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const key = (await call('GET', P(site._id, '/project-key'), null, T)).body?.apiKey;
const pub = (path, init = {}) =>
	fetch(`${ROOT}/public/api${path}${path.includes('?') ? '&' : '?'}apiKey=${key}`, init).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const android = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const track = (body, { ip = '8.8.8.8', ua = android } = {}) =>
	pub('/track', { method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://visits.example.com', 'user-agent': ua, 'x-forwarded-for': ip }, body: JSON.stringify(body) });

// A signed-in customer (mint.js keeps this token; the tracker sends it).
r = await pub('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Cathy Customer', email: `cathy${stamp}@example.com`, password: 'customer-pass-1' }) });
const customerToken = r.body?.token;
ok('a site customer signed up', !!customerToken, JSON.stringify(r.body));

r = await track({
	visitorId: 'va1', sessionId: 'sa1', screen: '412x915', language: 'bn-BD', timezone: 'Asia/Dhaka', token: customerToken,
	events: [
		{ type: 'pageview', eventId: 'e1', entry: true, path: '/', title: 'Home', referrer: 'https://www.google.com/', click: 'gclid', utmCampaign: 'autumn', utmTerm: 'shoes' },
		{ type: 'pageview', eventId: 'e2', path: '/pricing', title: 'Pricing', referrer: 'https://www.google.com/' },
		{ type: 'click', name: 'Buy now', element: { tag: 'a', text: 'Buy now', href: 'https://pay.example.org' } },
	],
});
ok('batch recorded', r.status === 202 && r.body?.recorded === 3, JSON.stringify(r.body));
r = await track({ visitorId: 'va1', sessionId: 'sa1', events: [{ type: 'engagement', eventId: 'e1', duration: 42000, scroll: 80 }, { type: 'engagement', eventId: 'e2', duration: 15000, scroll: 30 }] });
ok('engagement-only batch: nothing new counted', r.status === 202 && r.body?.recorded === 0, JSON.stringify(r.body));
r = await track({ visitorId: 'va1', sessionId: 'sa1', events: [{ type: 'engagement', eventId: 'e1', duration: 9000, scroll: 50 }] });

// Another visitor: Facebook organically (fbclid, no paid UTM), then a second visit by email; identify().
await track({ visitorId: 'vb1', sessionId: 'sb1', screen: '1440x900', language: 'en-US', user: { id: 'u-77', name: 'Ben Buyer', email: 'ben@example.com' },
	events: [{ type: 'pageview', eventId: 'f1', entry: true, path: '/blog', referrer: 'https://l.facebook.com/', click: 'fbclid' }] },
	{ ip: '203.0.113.9', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15' });
await track({ visitorId: 'vb1', sessionId: 'sb2', events: [{ type: 'pageview', eventId: 'f2', entry: true, path: '/', utmSource: 'newsletter', utmMedium: 'email' }] }, { ip: '203.0.113.9' });

r = await call('GET', P(site._id, '/analytics/visitors/va1'), null, T);
const v = r.body?.visitor, visit = r.body?.visits?.[0];
ok('journey: one visit, steps in order', r.status === 200 && r.body.visits.length === 1 && visit.steps.map(s => s.path || s.name).join(',') === '/,/pricing,Buy now', JSON.stringify(visit?.steps?.map(s => s.path || s.name)));
ok('visit length: its pages’ times added up (42 + 15 s)', visit?.duration === 57, visit?.duration);
ok('time on page: the larger figure kept (42 s), scroll 80%', visit?.steps?.[0]?.duration === 42 && visit.steps[0].scroll === 80, JSON.stringify(visit?.steps?.[0]));
ok('visit: Paid search · Google Ads, campaign, landing and exit', visit?.channel === 'Paid search' && visit.source === 'Google Ads' && visit.utmCampaign === 'autumn' && visit.landing === '/' && visit.exit === '/pricing', JSON.stringify(visit));
ok('visitor: the customer by name and email', v?.name === 'Cathy Customer' && v.email === `cathy${stamp}@example.com` && !!v.customer, JSON.stringify(v));
ok('visitor: whole IP, screen, language, browser timezone', v?.place?.ip === '8.8.8.8' && v.screen === '412x915' && v.language === 'bn-BD' && v.place.timezone === 'Asia/Dhaka', JSON.stringify(v));
ok('visitor: ISP and country from the address (ipwho.is)', !!v?.place?.isp && v.place.countryCode === 'US', JSON.stringify(v?.place));
ok('visitor: device model from the user agent', /Samsung/i.test(v?.deviceModel || ''), v?.deviceModel);
ok('visitor: first arrival, counts', v?.first?.channel === 'Paid search' && v.first.landing === '/' && v.visits === 1 && v.pageviews === 2 && v.events === 1, JSON.stringify({ first: v?.first, visits: v?.visits, pv: v?.pageviews, ev: v?.events }));

r = await call('GET', P(site._id, '/analytics/visitors/vb1'), null, T);
ok('identify(): name, email, user id', r.body?.visitor?.name === 'Ben Buyer' && r.body.visitor.userId === 'u-77', JSON.stringify(r.body?.visitor));
ok('two visits, newest first: Email then Social · Facebook', r.body?.visits?.map(x => `${x.channel}:${x.source}`).join('|') === 'Email:newsletter|Social:Facebook', JSON.stringify(r.body?.visits?.map(x => [x.channel, x.source])));
ok('first arrival stays the first (Social), last source the newest', r.body?.visitor?.first?.channel === 'Social' && r.body.visitor.lastChannel === 'Email' && r.body.visitor.visits === 2);

r = await call('GET', P(site._id, '/analytics/visitors'), null, T);
ok('Visitors list: both, last seen first', r.status === 200 && r.body?.total === 2 && r.body.rows[0].visitorId === 'vb1', JSON.stringify(r.body?.rows?.map(x => x.visitorId)));
r = await call('GET', P(site._id, '/analytics/visitors?q=cathy'), null, T);
ok('search by email', r.body?.total === 1 && r.body.rows[0].visitorId === 'va1');
r = await call('GET', P(site._id, '/analytics/visitors?q=8.8.8'), null, T);
ok('search by IP (dots taken literally)', r.body?.total === 1);
r = await call('GET', P(site._id, '/analytics/visitors?channel=Email&known=true'), null, T);
ok('filter by channel + known', r.body?.total === 1 && r.body.rows[0].visitorId === 'vb1', JSON.stringify(r.body?.rows?.map(x => x.visitorId)));
r = await call('GET', P(site._id, '/analytics/visitors?sort=visits'), null, T);
ok('sort by visits', r.body?.rows?.[0]?.visitorId === 'vb1');
r = await call('GET', P(site._id, '/analytics/visitors?sort=firstSeen'), null, T);
ok('sort by first seen', r.body?.rows?.[0]?.visitorId === 'vb1');

const top = async dim => (await call('GET', P(site._id, `/analytics/top?dim=${dim}`), null, T)).body?.rows || [];
let rows = await top('channels');
ok('channels count visits (3)', rows.reduce((n, x) => n + x.count, 0) === 3 && rows.some(x => x.value === 'Paid search'), JSON.stringify(rows));
rows = await top('sources');
ok('sources', ['Google Ads', 'Facebook', 'newsletter'].every(s => rows.some(x => x.value === s)), JSON.stringify(rows));
rows = await top('campaigns');
ok('campaigns', rows.some(x => x.value === 'autumn'));
rows = await top('entries');
ok('entry pages', rows.find(x => x.value === '/')?.count === 2, JSON.stringify(rows));
rows = await top('isps');
ok('ISPs', rows.some(x => x.value), JSON.stringify(rows));
rows = await top('languages');
ok('languages', rows.some(x => x.value === 'bn-BD'));
rows = await top('screens');
ok('screens', rows.some(x => x.value === '1440x900'));
rows = await top('models');
ok('device models', rows.some(x => /Samsung/i.test(x.value)), JSON.stringify(rows));
rows = await top('cities');
ok('cities read "City, Country" with a code', rows.some(x => x.value.includes(', ') && x.code), JSON.stringify(rows));
rows = await top('paths');
ok('top pages carry time on page (s)', rows.find(x => x.value === '/pricing')?.avgDuration === 15, JSON.stringify(rows));
r = await call('GET', P(site._id, '/analytics/summary'), null, T);
ok('summary: average visit (timed visits only)', r.body?.current?.avgDuration === 57, JSON.stringify(r.body?.current));
r = await call('GET', P(site._id, '/analytics/live'), null, T);
ok('Live: both on the site now, with name and page', r.body?.now === 2 && r.body.visitors.some(x => x.name === 'Ben Buyer' && x.path === '/'), JSON.stringify(r.body));

// IPs masked, then not kept.
r = await call('PUT', P(site._id, '/site-config'), { tracking: { visitorIp: 'masked' } }, T);
ok('Site setup: visitor IPs masked', r.status === 200 && r.body?.tracking?.visitorIp === 'masked', `${r.status} ${JSON.stringify(r.body?.tracking || r.body)}`);

await track({ visitorId: 'vc1', sessionId: 'sc1', events: [{ type: 'pageview', eventId: 'g1', entry: true, path: '/' }] }, { ip: '8.8.4.4' });
r = await call('GET', P(site._id, '/analytics/visitors/vc1'), null, T);
ok('masked: last part zeroed', r.body?.visitor?.place?.ip === '8.8.4.0', JSON.stringify(r.body?.visitor?.place));
await call('PUT', P(site._id, '/site-config'), { tracking: { visitorIp: 'off' } }, T);

await track({ visitorId: 'vd1', sessionId: 'sd1', events: [{ type: 'pageview', eventId: 'h1', entry: true, path: '/' }] }, { ip: '1.1.1.1' });
r = await call('GET', P(site._id, '/analytics/visitors/vd1'), null, T);
ok('off: no IP kept, place still found', !r.body?.visitor?.place?.ip && !!r.body?.visitor?.place?.country, JSON.stringify(r.body?.visitor?.place));

// A forged customer token names nobody.
await track({ visitorId: 've1', sessionId: 'se1', token: customerToken.slice(0, -4) + 'AAAA', events: [{ type: 'pageview', eventId: 'i1', entry: true, path: '/' }] });
r = await call('GET', P(site._id, '/analytics/visitors/ve1'), null, T);
ok('a forged token is ignored', r.status === 200 && !r.body?.visitor?.customer && !r.body.visitor.email, JSON.stringify(r.body?.visitor));

r = await call('GET', P(site._id, '/analytics/visitors/nobody'), null, T);
ok('unknown visitor 404', r.status === 404);
r = await call('POST', '/tenant/api/auth/register', { name: 'Otto Other', email: `otto${stamp}@example.com`, password: 'tenant-pass-123', organization: `Otto ${stamp}`, country: 'BD' });
r = await call('GET', P(site._id, '/analytics/visitors'), null, r.body.token);
ok("another organization can't read the visitors", r.status === 404 || r.status === 403, r.status);

r = await fetch(`${ROOT}/public/track.js`).then(x => x.text());
ok('track.js has identify, click ids and time on page', r.includes('identify:') && r.includes("'gclid'") && r.includes("type: 'engagement'"));
done();
