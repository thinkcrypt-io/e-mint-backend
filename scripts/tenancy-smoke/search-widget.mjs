// The Search widget (docs/search SI-07): only stores have it (a website's catalog doesn't, and switching it on is
// refused); switched on, mint.js is told its options and texts and its script is served; a search from a browser
// has an id that clicks keep; and an order from the checkout widget is counted as from search when its product
// was opened from one (the tab's search ids sent with it).
//
// Needs a local SMOKE_MONGO and the backend started with STRIPE_API_BASE=http://127.0.0.1:12111 (a stand-in Stripe
// runs here, as in payments.mjs).
import http from 'http';
import { call, ok, done, ROOT } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) {
	console.log('SKIP  search-widget — set a local SMOKE_MONGO');
	process.exit(0);
}
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(400);
	}
};

/* ------------------------------------------------------- a stand-in Stripe */
const KEY = 'sk_test_goodkey123';
let n = 0;
const fake = http.createServer((req, res) => {
	const send = (code, body) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)));
	if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: 'Invalid API Key provided' } });
	if (req.method === 'GET' && req.url === '/v1/balance') return send(200, { object: 'balance' });
	if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
		const id = `cs_test_sw${++n}`;
		return send(200, { id, url: `https://checkout.stripe.test/${id}`, payment_status: 'unpaid', status: 'open' });
	}
	send(404, { error: { message: 'No such thing' } });
});
await new Promise(r => fake.listen(12111, '127.0.0.1', r));

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Wren Widget', email: `wren${stamp}@example.com`, password: 'tenant-pass-123', organization: `Widgets ${stamp}`, country: 'BD' });
const t = r.body?.token;

// A website: no Search widget.
const site = (await call('POST', '/tenant/api/projects', { name: 'Plain site', type: 'website' }, t)).body;
r = await call('GET', `/tenant/api/p/${site._id}/widgets`, null, t);
ok('a website’s widget list has no Search', r.status === 200 && !r.body.catalog.some(c => c.name === 'search') && r.body.catalog.some(c => c.name === 'cart'), r.body?.catalog?.map(c => c.name).join());
r = await call('PUT', `/tenant/api/p/${site._id}/widgets`, { widgets: { search: { added: true, enabled: true } } }, t);
ok('…and adding it is refused', r.status === 400 && r.body?.code === 'widget_not_for_project', `${r.status} ${r.body?.message}`);

// A store.
const p = (await call('POST', '/tenant/api/projects', { name: 'Widget shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const make = (m, body) => call('POST', `${P}/${inst[m].route}`, body, t).then(x => x.body?.doc || x.body);
const dresses = await make('category', { name: 'Dresses' });
const red = await make('product', { name: 'Red cotton dress', price: 900, status: 'active', productType: 'simple', trackStock: false, category: dresses._id });
const blue = await make('product', { name: 'Blue cotton dress', price: 1200, status: 'active', productType: 'simple', trackStock: false, category: dresses._id });
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 2, 30000));

r = await call('GET', `${P}/widgets`, null, t);
const def = r.body?.catalog?.find(c => c.name === 'search');
ok('a store’s widget list has Search, with its layouts', def && def.options.find(o => o.key === 'layout').options.map(o => o.value).join() === 'icon,box,results', JSON.stringify(def?.options?.[0]));
r = await call('PUT', `${P}/widgets`, { widgets: { search: { enabled: true, options: { resultsUrl: '/find', perPage: 500, layout: 'nope' } } } }, t);
ok('switched on: options checked (a page too many → 60, an unknown layout → icon)', r.status === 200 && r.body.widgets.search.enabled && r.body.widgets.search.options.perPage === 60 && r.body.widgets.search.options.layout === 'icon' && r.body.widgets.search.options.resultsUrl === '/find', JSON.stringify(r.body?.widgets?.search?.options || r.body));
const key = (r.body?.script || (await call('GET', `${P}/widgets`, null, t)).body.script).match(/data-key="([^"]+)"/)[1];
const pub = path => `/public/api/${path}${path.includes('?') ? '&' : '?'}apiKey=${key}`;

r = await call('GET', pub('widgets'));
ok('mint.js is told about Search, with its texts', r.status === 200 && r.body.widgets.search?.options?.resultsUrl === '/find' && r.body.widgets.search.texts.placeholder === 'Search the store', JSON.stringify(r.body?.widgets?.search || r.body).slice(0, 200));
let res = await fetch(`${ROOT}/public/widgets/search.js`);
let js = await res.text();
ok('the widget’s script is served', res.status === 200 && /javascript/.test(res.headers.get('content-type')) && js.includes("Mint.define('search'"), `${res.status}`);
ok('…and parses', (() => { try { new Function(js); return true; } catch (e) { return e.message; } })() === true);
res = await fetch(`${ROOT}/public/mint.js`);
js = await res.text();
ok('mint.js has Mint.search', js.includes('search: search') && js.includes("'store/search/events'"));

// A search from a browser, a click, then the checkout widget's order.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const visitor = `v${stamp}`.slice(0, 24);
res = await fetch(`${ROOT}${pub(`store/search?q=red%20dress&visitor=${visitor}`)}`, { headers: { 'user-agent': UA } });
const found = await res.json();
ok('a search from a browser has an id', !!found.searchId && found.doc?.[0]?._id === String(red._id), JSON.stringify(found).slice(0, 200));
res = await fetch(`${ROOT}${pub('store/search/events')}`, { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA }, body: JSON.stringify({ visitor, events: [{ type: 'click', searchId: found.searchId, product: String(red._id) }] }) });
ok('the click is kept', (await res.json()).recorded === 1);

// The checkout widget writes into a model of the project's own (a store's own website orders go through /orders).
r = await call('POST', `${P}/builder/models`, {
	name: 'WebOrder', title: 'Web orders',
	fields: [
		{ key: 'status', label: 'Status', kind: 'select', required: true, default: 'pending_payment', options: [{ value: 'pending_payment', label: 'Awaiting payment' }, { value: 'paid', label: 'Paid' }] },
		{ key: 'items', label: 'Items', kind: 'sectionlist', fields: [{ key: 'name', label: 'Product', kind: 'text' }, { key: 'quantity', label: 'Qty', kind: 'number' }, { key: 'unitPrice', label: 'Unit price', kind: 'number' }] },
		{ key: 'total', label: 'Total', kind: 'number' },
		{ key: 'contactEmail', label: 'Email', kind: 'email', required: true },
		{ key: 'paymentReference', label: 'Payment reference', kind: 'text' },
	],
}, t);
ok('an orders model for the checkout widget', r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('GET', `${P}/widgets/shop`, null, t);
const g = r.body?.guess;
const order = { model: 'WebOrder', fields: { items: 'items', status: 'status', email: 'contactEmail', total: 'total', paymentReference: 'paymentReference' }, item: { name: 'name', quantity: 'quantity', unitPrice: 'unitPrice' }, statuses: { pending: 'pending_payment', paid: 'paid' } };
r = await call('PUT', `${P}/widgets/shop`, { shop: { ...g, order } }, t);
ok('the store’s products and that model work as the Shop', r.status === 200 && !!r.body.shop?.order, `${r.status} ${r.body?.message} ${JSON.stringify(g || null).slice(0, 300)}`);
await call('PUT', `${P}/widgets`, { widgets: { cart: { enabled: true }, checkout: { enabled: true } } }, t);
r = await call('PUT', `${P}/payments/settings`, { stripe: { enabled: true, mode: 'test', publishableKey: 'pk_test_abc', secretKey: KEY, webhookSecret: 'whsec_x' }, successUrl: 'https://shop.example/thanks?ref={ref}', cancelUrl: 'https://shop.example/cart' }, t);
ok('Stripe (stand-in) on', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('POST', pub('checkout'), {
	provider: 'stripe', email: 'buyer@example.com', name: 'Bea Buyer', phone: '01700000000',
	lines: [{ product: String(red._id), quantity: 2 }, { product: String(blue._id), quantity: 1 }],
	search: { ids: [found.searchId], visitor },
});
ok('checkout writes the order', r.status === 200 && !!r.body.order, `${r.status} ${r.body?.message}`);
const placed = r.body?.order?._id || r.body?.order?.id;
const sold = await waitFor(async () => db.collection('searchevents').findOne({ type: 'order', searchId: found.searchId }));
ok('the red dress’s line is counted as from that search (2 sold, its revenue)', sold && String(sold.product) === String(red._id) && sold.quantity === 2 && sold.revenue === 1800 && (!placed || String(sold.order) === String(placed)), JSON.stringify(sold));
ok('…the blue one isn’t (not opened from a search)', !(await db.collection('searchevents').findOne({ type: 'order', product: new ObjectId(String(blue._id)) })) && !(await db.collection('searchevents').findOne({ type: 'order', product: String(blue._id) })));
const sd = await waitFor(async () => {
	const d = await db.collection('searchdocs').findOne({ product: new ObjectId(String(blue._id)) });
	return d?.signals?.sold30 >= 1 && d;
});
ok('every product’s sales go up in the search index', !!sd);

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
await call('DELETE', `/tenant/api/projects/${site._id}?force=1`, null, t);
fake.close();
await mc.close();
done();
