// Website analytics: the tracker endpoint and the reports. Uses projects.mjs's state (pat).
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;

let r = await call('POST', '/tenant/api/projects', { name: 'Shop site', type: 'website', domains: ['shop.example.com'] }, s.pat);
const site = r.body._id, slug = r.body.publicSlug;
const browserUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const track = (body, { origin = 'https://shop.example.com', ua = browserUA, type = 'text/plain' } = {}) =>
	fetch(`${ROOT}/public/api/${slug}/track`, { method: 'POST', headers: { 'content-type': type, origin, 'user-agent': ua }, body: JSON.stringify(body) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));

r = await track({ visitorId: 'v1', sessionId: 's1', events: [
	{ type: 'pageview', path: '/', title: 'Home', referrer: 'https://www.google.com/search?q=x' },
	{ type: 'pageview', path: '/pricing', title: 'Pricing', referrer: 'https://shop.example.com/' },
	{ type: 'click', name: 'Buy now', element: { tag: 'a', text: 'Buy now', href: 'https://pay.example.org' } },
	{ type: 'event', name: 'signup', props: { plan: 'pro', nested: { no: 1 } } },
] });
ok('sendBeacon-style text/plain batch recorded', r.status === 202 && r.body?.recorded === 4, JSON.stringify(r.body));
r = await track({ visitorId: 'v2', sessionId: 's2', events: [{ type: 'pageview', path: '/' }] }, { origin: 'https://www.shop.example.com', type: 'application/json' });
ok('www. and JSON bodies count too', r.body?.recorded === 1, JSON.stringify(r.body));
r = await track({ visitorId: 'v3', sessionId: 's3', events: [{ type: 'pageview', path: '/' }] }, { origin: 'https://evil.example.net' });
ok('other sites are dropped quietly', r.status === 202 && !r.body?.recorded, JSON.stringify(r.body));
r = await track({ visitorId: 'v4', sessionId: 's4', events: [{ type: 'pageview', path: '/' }] }, { ua: 'Googlebot/2.1' });
ok('bots are dropped', !r.body?.recorded);
r = await track({ visitorId: 'v5', sessionId: 's5', events: [{ type: 'hack', path: '/' }] });
ok('unknown event types ignored', !r.body?.recorded);
const app = (await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat)).body;
r = await fetch(`${ROOT}/public/api/${app.publicSlug}/track`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ events: [{ type: 'pageview', path: '/' }] }) }).then(x => x.json());
ok('app projects record nothing', r.ok === false);

r = await call('GET', P(site, '/analytics/summary'), null, s.pat);
ok('summary', r.status === 200 && r.body?.current?.pageviews === 3 && r.body.current.visitors === 2 && r.body.current.sessions === 2, JSON.stringify(r.body?.current));
ok('bounce rate (s2 had one page) and pages/session', r.body?.current?.bounceRate === 50 && r.body.current.pagesPerSession === 1.5);
r = await call('GET', P(site, '/analytics/timeseries'), null, s.pat);
ok('timeseries: a row per day, today counted', r.status === 200 && r.body?.days?.length >= 30 && r.body.days.at(-1).pageviews === 3, `${r.body?.days?.length} ${JSON.stringify(r.body?.days?.at(-1))}`);
r = await call('GET', P(site, '/analytics/top?dim=paths'), null, s.pat);
ok('top paths', r.body?.rows?.[0]?.value === '/' && r.body.rows[0].count === 2);
r = await call('GET', P(site, '/analytics/top?dim=referrers'), null, s.pat);
ok('referrers: google, internal ones blank', r.body?.rows?.some(x => x.value === 'google.com') && !r.body.rows.some(x => x.value.includes('shop.example.com')), JSON.stringify(r.body?.rows));
r = await call('GET', P(site, '/analytics/top?dim=devices'), null, s.pat);
ok('devices (mobile)', r.body?.rows?.[0]?.value === 'mobile', JSON.stringify(r.body?.rows));
r = await call('GET', P(site, '/analytics/top?dim=clicks'), null, s.pat);
ok('clicks', r.body?.rows?.[0]?.value === 'Buy now');
r = await call('GET', P(site, '/analytics/top?dim=events'), null, s.pat);
ok('custom events', r.body?.rows?.[0]?.value === 'signup');
r = await call('GET', P(site, '/analytics/top?dim=nope'), null, s.pat);
ok('unknown dimension 400', r.status === 400);
r = await call('GET', P(site, '/analytics/summary?from=2026-02-01&to=2025-01-01'), null, s.pat);
ok('bad range 400', r.status === 400);
r = await call('GET', P(s.crm, '/analytics/summary'), null, s.pat);
ok("another project's analytics are its own (0)", r.status === 200 && r.body?.current?.pageviews === 0);
r = await call('GET', P(site, '/analytics/summary'), null, s.other);
ok("another org can't read them", r.status === 404);
r = await call('GET', P(site, '/sidebar/crm/server'), null, s.pat);
ok('sidebar: Audience → Analytics for websites', JSON.stringify(r.body).includes('/analytics'));
r = await call('GET', P(s.crm, '/sidebar/crm/server'), null, s.pat);
ok('…not for apps', !JSON.stringify(r.body).includes('"/analytics"'));
r = await fetch(`${ROOT}/public/track.js`);
const js = await r.text();
ok('track.js served', r.status === 200 && js.includes('MintAnalytics') && r.headers.get('cross-origin-resource-policy') === 'cross-origin');
done();
