// Store search: events and attribution (docs/search SI-12), on the real database. A shopper's search is logged with
// its id (cleaned: no phone or email), a click and an add to the bag go in by the beacon (text/plain), a click on a
// product the search didn't show is dropped, an order with the search ids counts its lines from search (that line's
// total only), the same visitor without ids counts too, sales reach the search document, popular searches need 3
// visitors and show in suggestions.
//
// Needs a local SMOKE_MONGO and the backend started with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(400);
	}
};
const stamp = Date.now();
const mc = await new MongoClient(process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev').connect();
const db = mc.db();
const events = db.collection('searchevents');

let r = await call('POST', '/tenant/api/auth/register', { name: 'Sami Events', email: `sami${stamp}@example.com`, password: 'tenant-pass-123', organization: `Events ${stamp}`, country: 'BD' });
const t = r.body?.token;
const p = (await call('POST', '/tenant/api/projects', { name: 'Events shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
ok('store ready', await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000));
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const made = {};
for (const [name, price] of [['Linen shirt', 2200], ['Denim jacket', 5400], ['Oud candle', 900], ['Fig candle', 850]])
	made[name] = (await call('POST', `${P}/${inst.product.route}`, { name, price, status: 'active', productType: 'simple', trackStock: false }, t)).body?.doc?._id;
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 4, 30000));

const key = await projectKey(p.publicSlug);
const pub = (path, q = {}) => `${ROOT}/public/api/${path}?${new URLSearchParams({ apiKey: key, ...q })}`;
const S = async (q, who = {}) => (await fetch(pub('store/search', { q, ...who }))).json();
const beacon = async body => {
	const res = await fetch(pub('store/search/events'), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) });
	return { status: res.status, body: await res.json().catch(() => null) };
};
const A = { visitor: `visa${stamp}`, session: `sesa${stamp}` };

let b = await S('candle', A);
ok('a search answers with its id', /^[A-Za-z0-9_-]{16}$/.test(b.searchId || ''), b.searchId);
const sid = b.searchId;
const fig = b.doc.find(d => d.name === 'Fig candle');
let res = await fetch(pub('store/search', { q: 'candle', ...A }));
ok('…kept by the shopper’s own browser only', /private/.test(res.headers.get('cache-control') || ''), res.headers.get('cache-control'));
const logged = await waitFor(() => events.findOne({ searchId: sid }));
ok('the search is logged: query, words, results, the page', logged?.type === 'search' && logged.q === 'candle' && logged.results === 2 && logged.top?.length === 2 && logged.visitor === A.visitor && logged.session === A.session && logged.page === 1, JSON.stringify(logged));
ok('…without an IP', !('ip' in (logged || {})) && !JSON.stringify(logged).includes('127.0.0.1'));

b = await S('01712345678 candle', A);
const phoneLog = await waitFor(() => events.findOne({ searchId: b.searchId }));
ok('a phone number is never stored', phoneLog?.q === '[phone] candle' && !JSON.stringify(phoneLog).includes('01712345678'), phoneLog?.q);
b = await S('rafi@example.com', A);
const mailLog = await waitFor(() => events.findOne({ searchId: b.searchId }));
ok('…nor an email', mailLog?.q === '[email]', mailLog?.q);
b = await S('', A);
ok('a category page (no words) isn’t logged', !b.searchId);

r = await beacon({ ...A, events: [{ type: 'click', searchId: sid, product: fig._id }, { type: 'click', searchId: sid, product: fig._id }, { type: 'click', searchId: sid, product: made['Denim jacket'] }, { type: 'click', searchId: 'nosuchsearch1', product: fig._id }, { type: 'cart', searchId: sid, product: fig._id }, { type: 'suggest', q: 'can' }, { type: 'nonsense' }]});
ok('the beacon (text/plain) takes a click, an add to the bag and a suggestion pick', r.status === 202 && r.body?.recorded === 3, JSON.stringify(r));
const click = await events.findOne({ searchId: sid, type: 'click' });
ok('…the click with its position on the page', String(click?.product) === fig._id && click.position === logged.top.map(String).indexOf(fig._id) + 1 && click.q === 'candle', JSON.stringify(click));
ok('…a product the search didn’t show, an unknown search, twice the same: dropped', (await events.countDocuments({ searchId: sid, type: 'click' })) === 1);
r = await beacon({ events: 'nope' });
ok('…nothing to record: fine', r.status === 202 && r.body?.recorded === 0, JSON.stringify(r));

// An order with this session's search ids: the candle line counts, the shirt doesn't.
const order = async (lines, extra = {}) => {
	const res = await fetch(pub('store/orders'), { method: 'POST', headers: { 'content-type': 'application/json', ...extra.headers }, body: JSON.stringify({ lines, customerName: 'Rafi', phone: '01700000000', address: 'Road 1', ...extra.body }) });
	return { status: res.status, body: await res.json().catch(() => null) };
};
r = await order([{ product: fig._id, quantity: 2 }, { product: made['Linen shirt'], quantity: 1 }], { body: { search: { ids: [sid] } } });
ok('an order with search ids is placed as usual', r.status === 200 && /^WEB-/.test(r.body?.code || ''), JSON.stringify(r).slice(0, 200));
const oid = r.body?._id;
const from = await waitFor(async () => (await events.find({ order: new ObjectId(oid) }).toArray()).length && events.find({ order: new ObjectId(oid) }).toArray());
ok('only its line from search counts, with that line’s total', from?.length === 1 && String(from[0].product) === fig._id && from[0].quantity === 2 && from[0].revenue === 1700 && from[0].searchId === sid && from[0].q === 'candle', JSON.stringify(from));
const doc = await waitFor(async () => {
	const d = await db.collection('searchdocs').findOne({ product: new ObjectId(fig._id) });
	return d?.signals?.sold30 === 2 && d;
});
ok('the units sold reach the search document', doc?.signals?.sold30 === 2, JSON.stringify(doc?.signals));
const shirt = await db.collection('searchdocs').findOne({ product: new ObjectId(made['Linen shirt']) });
ok('…for every product ordered, from search or not', shirt?.signals?.sold30 === 1, JSON.stringify(shirt?.signals));

// The same visitor, a later order without ids (another tab): still from search, by the visitor id (track.js's header).
r = await order([{ product: fig._id, quantity: 1 }], { headers: { 'x-mint-visitor': A.visitor } });
const byVisitor = await waitFor(async () => (await events.find({ order: new ObjectId(r.body?._id) }).toArray()).length && events.find({ order: new ObjectId(r.body?._id) }).toArray());
ok('the same visitor, no ids: still from search', byVisitor?.length === 1 && byVisitor[0].revenue === 850, JSON.stringify(byVisitor));
r = await order([{ product: fig._id, quantity: 1 }], { headers: { 'x-mint-visitor': `someoneelse${stamp}` } });
await sleep(1500);
ok('another visitor without ids: not from search', (await events.countDocuments({ order: new ObjectId(r.body?._id) })) === 0);

// Popular: "candle" by three visitors, "jacket" by two — only candle is shown.
for (const v of ['visb', 'visc']) await S('candle', { visitor: `${v}${stamp}` });
await S('Candles', { visitor: `visd${stamp}` });
for (const v of ['visb', 'visc']) await S('jacket', { visitor: `${v}${stamp}` });
await waitFor(async () => (await events.countDocuments({ type: 'search', project: new ObjectId(p._id), q: { $in: ['candle', 'Candles', 'jacket'] } })) >= 7, 5000);
r = await call('GET', `/public/api/${p.publicSlug}/store/search/popular`);
ok('popular: searches made by 3 visitors or more, as they were typed most', r.status === 200 && r.body.queries?.length === 1 && r.body.queries[0].q === 'candle' && r.body.queries[0].searches === 5, JSON.stringify(r.body));
r = await call('GET', `/public/api/${p.publicSlug}/store/search/suggest?q=can`);
ok('…and first in the suggestions', r.body?.queries?.[0] === 'candle', JSON.stringify(r.body?.queries));

r = await call('PUT', `${C}/search/settings`, { enabled: false }, t);
r = await beacon({ ...A, events: [{ type: 'click', searchId: sid, product: fig._id }] });
ok('search switched off: the beacon 404s', r.status === 404, JSON.stringify(r));

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
await mc.close();
done();
