// Store search: Insights (docs/search SI-14), on the real database. Shoppers search, open, order and come back with
// another search; the hourly rollup adds it up; then the panel's Insights answer: totals against the week before, a
// chart by day, Top searches, No results, Low click rate and Trending; one search opened (clicks by position, what
// people searched next); a product's Search card; the dashboard's search widget, and the sidebar's Search insights.
//
// A store from before SI-14 gets the dashboard widget once from upgradeStores.js (removed again, it stays removed).
//
// Needs a local SMOKE_MONGO, SMOKE_BACKEND (a folder with a fresh `dist`, for upgradeStores.js) and the backend started with
// SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000 SEARCH_DAILY_MS=2000 SEARCH_SIGNALS_MS=2000.
import { execFileSync } from 'child_process';
import { call, ok, done, ROOT, projectKey } from './lib.mjs';
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 30000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(500);
	}
};
const DAY = 24 * 60 * 60 * 1000;
const stamp = Date.now();
const mc = await new MongoClient(process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev').connect();
const db = mc.db();

let r = await call('POST', '/tenant/api/auth/register', { name: 'Nadia Insights', email: `nadiai${stamp}@example.com`, password: 'tenant-pass-123', organization: `Insights ${stamp}`, country: 'BD' });
const t = r.body?.token;
const p = (await call('POST', '/tenant/api/projects', { name: 'Insights shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', timeZone: 'Asia/Dhaka' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
ok('store ready', await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000));
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const made = {};
for (const [name, price, keywords] of [['Linen shirt', 2200, ['kurta']], ['Oud candle', 900], ['Fig candle', 850]])
	made[name] = (await call('POST', `${P}/${inst.product.route}`, { name, price, status: 'active', productType: 'simple', trackStock: false, ...(keywords && { keywords }) }, t)).body?.doc?._id;
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 3, 30000));

const key = await projectKey(p.publicSlug);
const pub = (path, q = {}) => `${ROOT}/public/api/${path}?${new URLSearchParams({ apiKey: key, ...q })}`;
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh) Smoke' };
const S = async (q, who) => (await fetch(pub('store/search', { q, ...who }), { headers: UA })).json();
const post = async (path, body, type = 'application/json') => {
	const res = await fetch(pub(path), { method: 'POST', headers: { 'content-type': type, ...UA }, body: typeof body === 'string' ? body : JSON.stringify(body) });
	return { status: res.status, body: await res.json().catch(() => null) };
};
const who = n => ({ visitor: `insv${n}${stamp}`, session: `inss${n}${stamp}` });

// "candle" by three visitors (one typed "Candles"); the first opens the fig candle (2nd result or 1st) and orders it,
// then searches "oud candle" in the same visit. "linen shirt" three times, never opened. "velvet throne" twice: nothing.
const first = await S('candle', who(1));
const fig = first.doc.find(d => d.name === 'Fig candle');
const figAt = first.doc.findIndex(d => d.name === 'Fig candle') + 1;
await S('Candles', who(2));
await S('candle', who(3));
r = await post('store/search/events', { ...who(1), events: [{ type: 'click', searchId: first.searchId, product: fig._id }] }, 'text/plain');
ok('a click goes in', r.body?.recorded === 1, JSON.stringify(r));
r = await post('store/orders', { lines: [{ product: fig._id, quantity: 2 }], customerName: 'Rafi', phone: '01700000000', address: 'Road 1', search: { ids: [first.searchId], ...who(1) } });
ok('an order from search', /^WEB-/.test(r.body?.code || ''), JSON.stringify(r).slice(0, 200));
await S('oud candle', who(1));
for (const n of [4, 5, 6]) await S('linen shirt', who(n));
await S('velvet throne', who(4));
await S('velvet throne', who(5));
// "candle" twice eight days ago (the week before): still up this week.
const evt = await db.collection('searchevents').findOne({ searchId: first.searchId, type: 'search' });
for (const n of [7, 8]) await db.collection('searchevents').insertOne({ ...evt, _id: new ObjectId(), searchId: `old${n}${stamp}`.slice(0, 16), visitor: `insv${n}${stamp}`, session: `inss${n}${stamp}`, at: new Date(Date.now() - 8 * DAY) });
// The rollup has gone back to the first event's day only once: it's told to start again.
await db.collection('commercesettings').updateOne({ project: new ObjectId(p._id) }, { $unset: { 'search.rollup.lastDay': '' } });

const proj = new ObjectId(p._id);
await waitFor(async () => {
	const rows = db.collection('searchquerydailies');
	const old = (await rows.countDocuments({ project: proj, q: 'candle' })) >= 2;
	// A run already under way may have written lastDay back: ask again until the old day is in.
	if (!old) await db.collection('commercesettings').updateOne({ project: proj }, { $unset: { 'search.rollup.lastDay': '' } });
	return old && (await rows.findOne({ project: proj, q: 'velvet throne' }))?.zero === 2 && (await rows.findOne({ project: proj, q: 'oud candle' }));
});

r = await call('GET', `${C}/search/insights?days=7`, null, t);
const I = r.body;
ok('insights for 7 days', r.status === 200 && I?.days === 7 && I.series?.length === 7 && I.timeZone === 'Asia/Dhaka', JSON.stringify(r.body).slice(0, 300));
ok('…totals: searches (first pages), no results, a click, the order and its total', I?.totals?.searches === 9 && I.totals.zero === 2 && I.totals.clicks === 1 && I.totals.orders === 1 && I.totals.revenue === 1700, JSON.stringify(I?.totals));
ok('…different visitors, rates', I?.totals?.visitors === 6 && Math.abs(I.totals.zeroRate - 2 / 9) < 1e-9 && Math.abs(I.totals.conversion - 1 / 9) < 1e-9, JSON.stringify(I?.totals));
ok('…against the 7 days before', I?.before?.searches === 2, JSON.stringify(I?.before));
ok('…today’s bar holds today', I?.series?.[6]?.searches === 9 && I.series[6].revenue === 1700, JSON.stringify(I?.series?.slice(-2)));
ok('Top searches: candle first, its click rate and revenue', I?.top?.[0]?.q === 'candle' && I.top[0].searches === 3 && Math.abs(I.top[0].clickRate - 1 / 3) < 1e-9 && I.top[0].revenue === 1700, JSON.stringify(I?.top?.[0]));
ok('No results: velvet throne, twice', I?.noResults?.[0]?.q === 'velvet throne' && I.noResults[0].zero === 2 && I.noResults.length === 1, JSON.stringify(I?.noResults));
ok('Low click rate: linen shirt (3 searches, results, no click), not candle', I?.lowClicks?.some(x => x.q === 'linen shirt') && !I.lowClicks.some(x => x.q === 'candle'), JSON.stringify(I?.lowClicks));
ok('Trending: candle (3 against 2), linen shirt new', I?.trending?.find(x => x.q === 'candle')?.up === 1 && I.trending.find(x => x.q === 'linen shirt')?.isNew === true, JSON.stringify(I?.trending));
r = await call('GET', `${C}/search/insights?days=13`, null, t);
ok('…a period it doesn’t know is 30 days', r.body?.days === 30 && r.body.series.length === 30);

r = await call('GET', `${C}/search/insights/query?${new URLSearchParams({ q: 'Candles', days: '7' })}`, null, t);
const Q = r.body;
ok('one search opened (“Candles” is candle)', r.status === 200 && Q?.q === 'candle' && Q.totals.searches === 3 && Q.totals.visitors === 3 && Q.before.searches === 2, JSON.stringify(Q).slice(0, 300));
ok('…clicks by position', Q?.positions?.find(x => x.position === String(figAt))?.clicks === 1 && Q.positions.reduce((a, x) => a + x.clicks, 0) === 1, JSON.stringify(Q?.positions));
ok('…what people searched next', Q?.next?.[0]?.q === 'oud candle' && Q.next[0].times === 1, JSON.stringify(Q?.next));
r = await call('GET', `${C}/search/insights/query?q=`, null, t);
ok('…no search: 400', r.status === 400);

r = await call('GET', `${C}/search/insights/product/${fig._id}`, null, t);
const F = r.body;
ok('the product’s Search card: shown, opened, sold from search', r.status === 200 && F?.indexed && F.shown >= 3 && F.clicks === 1 && F.orders === 1 && F.units === 2 && F.revenue === 1700, JSON.stringify(F));
ok('…the search that led to it', F?.queries?.[0]?.q === 'candle' && F.queries[0].clicks === 1 && F.queries[0].orders === 1, JSON.stringify(F?.queries));
r = await call('GET', `${C}/search/insights/product/${made['Linen shirt']}`, null, t);
ok('…another: shown, never opened, its search words', r.body?.shown === 3 && r.body.clicks === 0 && r.body.queries.length === 0 && r.body.keywords.includes('kurta'), JSON.stringify(r.body));

r = await call('GET', `${C}/search/insights/week`, null, t);
ok('the dashboard widget: this week’s revenue and the top search with no results', r.body?.totals?.revenue === 1700 && r.body.noResults?.[0]?.q === 'velvet throne', JSON.stringify(r.body).slice(0, 300));
r = await call('GET', `${P}/dashboard`, null, t);
ok('…on a new store’s dashboard', (r.body?.widgets || []).some(w => w.type === 'search' && w.route === 'search'), JSON.stringify((r.body?.widgets || []).map(w => w.type)));
r = await call('GET', `${P}/sidebar/web/server`, null, t);
const flat = JSON.stringify(r.body || []);
ok('the sidebar has Search insights', flat.includes('/store/search"'), flat.slice(0, 200));

// A store from before SI-14: no search widget on its dashboard. The upgrade adds it once.
if (process.env.SMOKE_BACKEND) {
	const dash = db.collection('dashboardconfigs');
	const strip = () => dash.updateOne({ project: proj, key: 'default' }, { $pull: { widgets: { type: 'search' } } });
	await strip();
	await db.collection('commercesettings').updateOne({ project: proj }, { $pull: { doneOnce: 'search-widget' } });
	const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: process.env.SMOKE_BACKEND, env: { ...process.env, MONGO_CONNECTION_URI: process.env.SMOKE_MONGO }, encoding: 'utf8' });
	const out = run();
	ok('upgradeStores dry run: an older store would get the search widget', /Insights shop:[\s\S]*?Dashboard[^\n]*Website search this week/.test(out), out.split('\n').filter(l => /Insights shop|Dashboard/.test(l)).slice(0, 4).join(' | '));
	run('--apply');
	let widgets = (await dash.findOne({ project: proj, key: 'default' }))?.widgets || [];
	const at = widgets.findIndex(w => w.type === 'search');
	ok('…applied: after the sales chart', at > 0 && widgets[at - 1].type === 'chart', widgets.map(w => w.type).join(','));
	await strip();
	run('--apply');
	widgets = (await dash.findOne({ project: proj, key: 'default' }))?.widgets || [];
	ok('…removed again, it stays removed', !widgets.some(w => w.type === 'search'), widgets.map(w => w.type).join(','));
} else console.log('(no SMOKE_BACKEND: the upgrade checks are skipped)');

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
await mc.close();
done();
