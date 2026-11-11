// Store search: the rollups (docs/search SI-13), on the real database. Searches, a click, a zero-result search and
// an order from search add up into the store day's SearchQueryDaily rows (one per normalised query, the store's own
// time zone, a day before kept apart); a product's units sold are recounted from the orders (a wrong number is put
// right, a cancelled order doesn't count); page views count by day into views30; the product shows Sold, 30 days and
// Opened from search, 30 days without its updatedAt moving; the status says when the rollups ran.
//
// A store from before gets the two product fields, read-only, from upgradeStores.js.
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
const daily = db.collection('searchquerydailies');

let r = await call('POST', '/tenant/api/auth/register', { name: 'Sami Rollup', email: `samir${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rollup ${stamp}`, country: 'BD' });
const t = r.body?.token;
const p = (await call('POST', '/tenant/api/projects', { name: 'Rollup shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', timeZone: 'Asia/Dhaka' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
ok('store ready', await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000));
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const made = {};
for (const [name, price] of [['Linen shirt', 2200], ['Oud candle', 900], ['Fig candle', 850]])
	made[name] = (await call('POST', `${P}/${inst.product.route}`, { name, price, status: 'active', productType: 'simple', trackStock: false }, t)).body?.doc?._id;
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 3, 30000));

const key = await projectKey(p.publicSlug);
const pub = (path, q = {}) => `${ROOT}/public/api/${path}?${new URLSearchParams({ apiKey: key, ...q })}`;
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh) Smoke' };
const S = async (q, who) => (await fetch(pub('store/search', { q, ...who }), { headers: UA })).json();
const post = async (path, body, type = 'application/json') => {
	const res = await fetch(pub(path), { method: 'POST', headers: { 'content-type': type, ...UA }, body: typeof body === 'string' ? body : JSON.stringify(body) });
	return { status: res.status, body: await res.json().catch(() => null) };
};
const A = { visitor: `rolla${stamp}`, session: `rsesa${stamp}` };

// Today: "candle" by two visitors (one typed "Candles"), a second page (not a new search), a zero-result search.
const first = await S('candle', A);
const fig = first.doc.find(d => d.name === 'Fig candle');
await S('Candles', { visitor: `rollb${stamp}` });
await S('candle', { ...A, page: '2' });
await S('velvet throne', A);
r = await post('store/search/events', { ...A, events: [{ type: 'click', searchId: first.searchId, product: fig._id }] }, 'text/plain');
ok('a click goes in', r.body?.recorded === 1, JSON.stringify(r));
r = await post('store/orders', { lines: [{ product: fig._id, quantity: 2 }, { product: made['Linen shirt'], quantity: 1 }], customerName: 'Rafi', phone: '01700000000', address: 'Road 1', search: { ids: [first.searchId], ...A } });
ok('an order from search', /^WEB-/.test(r.body?.code || ''), JSON.stringify(r).slice(0, 200));
// A cancelled order doesn't count as sold.
r = await post('store/orders', { lines: [{ product: made['Oud candle'], quantity: 5 }], customerName: 'Mitu', phone: '01800000000', address: 'Road 2' });
const cancelled = r.body?._id;
r = await call('POST', `${C}/orders/${cancelled}/cancel`, { reason: 'smoke' }, t);
ok('…another cancelled', r.status === 200, JSON.stringify(r.body).slice(0, 200));
// Two days ago in Dhaka (the raw event put straight in): its own day's row.
const evt = await db.collection('searchevents').findOne({ searchId: first.searchId, type: 'search' });
await db.collection('searchevents').insertOne({ ...evt, _id: new ObjectId(), searchId: `old${stamp}`.slice(0, 16), visitor: `rollc${stamp}`, at: new Date(Date.now() - 2 * DAY) });
// Three page views of the fig candle.
for (let i = 0; i < 3; i++) await post(`store/products/${fig._id}/view`, {});

const proj = new ObjectId(p._id);
const todayKey = (() => {
	const d = new Date(Date.now() + 6 * 3600 * 1000);
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
})();
const row = await waitFor(async () => {
	const x = await daily.findOne({ project: proj, day: todayKey, q: 'candle' });
	return x?.orders === 1 && x;
});
ok('today’s row: searches (first pages), visitors, a click, an order and its line’s total', row?.searches === 2 && row.visitors === 2 && row.clicks === 1 && row.orders === 1 && row.revenue === 1700 && row.zero === 0, JSON.stringify(row));
ok('…shown as typed most often, one row for “Candles” and “candle”', row?.q === 'candle' && (await daily.countDocuments({ project: proj, day: todayKey, nq: row?.nq })) === 1);
const zero = await daily.findOne({ project: proj, day: todayKey, q: 'velvet throne' });
ok('a search that found nothing is counted as one', zero?.searches === 1 && zero.zero === 1, JSON.stringify(zero));
const before = await daily.findOne({ project: proj, day: new Date(todayKey.getTime() - 2 * DAY) });
ok('a search two days ago is that day’s row (the store’s time zone)', before?.searches === 1 && before.visitors === 1 && before.clicks === 0, JSON.stringify(before));

// Signals: set a wrong number, the nightly recount puts it right.
const productOf = async id => (await call('GET', `${P}/${inst.product.route}/${id}`, null, t)).body;
const shirtBefore = (await productOf(made['Linen shirt']))?.updatedAt;
const docs = db.collection('searchdocs');
await waitFor(async () => (await docs.findOne({ product: new ObjectId(fig._id) }))?.signals?.sold30 === 2);
await docs.updateOne({ product: new ObjectId(fig._id) }, { $set: { 'signals.sold30': 99 } });
const figDoc = await waitFor(async () => {
	const d = await docs.findOne({ product: new ObjectId(fig._id) });
	return d?.signals?.sold30 === 2 && d?.signals?.views30 === 3 && d;
});
ok('units sold recounted from the orders (a wrong 99 → 2)', figDoc?.signals?.sold30 === 2, JSON.stringify(figDoc?.signals));
ok('…views in the last 30 days, counted by day', figDoc?.signals?.views30 === 3 && Object.values(figDoc.signals.viewDays || {}).reduce((a, b) => a + b, 0) === 3, JSON.stringify(figDoc?.signals));
const oud = await docs.findOne({ product: new ObjectId(made['Oud candle']) });
ok('…a cancelled order doesn’t count', (oud?.signals?.sold30 || 0) === 0, JSON.stringify(oud?.signals));

const product = await waitFor(async () => {
	const d = await productOf(fig._id);
	return d?.sold30 === 2 && d;
});
ok('the product shows Sold, 30 days and Opened from search, 30 days', product?.sold30 === 2 && product.searchClicks30 === 1, JSON.stringify({ sold30: product?.sold30, searchClicks30: product?.searchClicks30 }));
const shirt = await waitFor(async () => {
	const d = await productOf(made['Linen shirt']);
	return d?.sold30 === 1 && d;
});
ok('…sold, never opened from search', shirt?.sold30 === 1 && shirt.searchClicks30 === 0, JSON.stringify({ sold30: shirt?.sold30, searchClicks30: shirt?.searchClicks30 }));
ok('…without moving its updatedAt (the sweep doesn’t rebuild it)', !!shirtBefore && shirt?.updatedAt === shirtBefore, JSON.stringify([shirtBefore, shirt?.updatedAt]));

r = await call('GET', `${C}/search/status`, null, t);
ok('the status says when the rollups ran', !!r.body?.rollup?.dailyAt && !!r.body.rollup.lastDay && r.body.rollup.signals?.products === 3, JSON.stringify(r.body?.rollup));

// A store from before SI-13: its Product has neither field. The upgrade adds both, read-only.
if (process.env.SMOKE_BACKEND) {
	const def = await db.collection('modeldefinitions').findOne({ project: proj, route: inst.product.route });
	await db.collection('modeldefinitions').updateOne({ _id: def._id }, { $pull: { fields: { key: { $in: ['sold30', 'searchClicks30'] } } } });
	const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: process.env.SMOKE_BACKEND, env: { ...process.env, MONGO_CONNECTION_URI: process.env.SMOKE_MONGO }, encoding: 'utf8' });
	const out = run();
	const mine = out.split('\n').filter(l => /Rollup shop|sold30/.test(l));
	ok('upgradeStores dry run: an older store would get Sold, 30 days and Opened from search', /Rollup shop:[\s\S]*?Products — adds [^\n]*sold30, searchClicks30/.test(out), mine.slice(0, 4).join(' | '));
	run('--apply');
	const after = await db.collection('modeldefinitions').findOne({ _id: def._id });
	const keys = (after?.fields || []).map(f => f.key);
	ok('…applied: the product has both', keys.includes('sold30') && keys.includes('searchClicks30'), keys.join(','));
	const rs = await db.collection('routesettings').findOne({ project: proj, route: inst.product.route });
	const edits = (rs?.data?.fields || []).filter(f => ['sold30', 'searchClicks30'].includes(f.key)).map(f => f.edit);
	ok('…read-only (the rollup alone writes them)', edits.length >= 2 && edits.every(e => e === false), JSON.stringify(edits));
} else console.log('(no SMOKE_BACKEND: the upgrade checks are skipped)');

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
await mc.close();
done();
