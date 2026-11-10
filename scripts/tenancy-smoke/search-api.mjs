// Store search's public routes (docs/search SI-05): GET /public/api/store/search and /store/search/suggest — typos,
// paging, categories by web address or id (with the ones under them), collections, brands by name, price ranges,
// sizes, in stock / on sale, counts named and ignoring their own filter, category pages (no words) with sorting,
// suggestions, explain only with a server key, the cache header, plain-words 400s; the store's search settings
// (on / off, typos, out of stock) from the panel; a plain `search=` on Products ranked by the engine once the store
// has search on; the rate limit.
//
// Needs the backend started with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000 (the index must build quickly).
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

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

let r = await call('POST', '/tenant/api/auth/register', { name: 'Sam Search', email: `sam${stamp}@example.com`, password: 'tenant-pass-123', organization: `Search API ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Search API shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, products: { variations: true } } }, t);
await call('POST', `${C}/setup`, {}, t);
await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const make = (m, body) => call('POST', `${P}/${inst[m].route}`, body, t).then(x => x.body?.doc || x.body);
const PUB = path => `/public/api/${publicSlug}${path}`;
const S = qs => call('GET', PUB(`/store/search${qs ? `?${qs}` : ''}`));

/* ---- a small shop */
const fashion = await make('category', { name: 'Fashion' });
const outer = await make('category', { name: 'Outerwear', parent: fashion._id });
const shoes = await make('category', { name: 'Shoes' });
const eid = await make('collection', { name: 'Eid Edit' });
const aarong = await make('brand', { name: 'Aarong' });
const items = [
	['Denim jacket', 4200, outer, { brand: aarong._id, collections: [eid._id] }],
	['Quilted jacket', 6800, outer],
	['Wool blend coat', 9100, outer, { collections: [eid._id] }],
	['Linen shirt', 2100, fashion, { brand: aarong._id }],
	['Oxford shirt', 2600, fashion],
	['Chelsea boots', 7400, shoes],
	['Canvas sneakers', 3300, shoes],
	['White sneakers', 3900, shoes, { collections: [eid._id] }],
];
const made = {};
for (const [name, price, cat, more] of items) made[name] = await make('product', { name, price, status: 'active', productType: 'simple', trackStock: false, category: cat._id, ...(more || {}) });
const polo = await make('product', { name: 'Cotton polo', price: 1500, status: 'active', productType: 'variation', trackStock: true, category: fashion._id, options: [{ name: 'Size', values: 'S, M' }, { name: 'Colour', values: 'Navy' }] });
const total = items.length + 1;
ok(`${total} products made`, Object.values(made).every(p => p?._id) && polo?._id);
ok('the search index has them all', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === total, 30000), JSON.stringify((await call('GET', `${C}/search/status`, null, t)).body).slice(0, 200));
await waitFor(async () => (await S('q=polo&facets=1')).body?.facets?.options?.length === 2, 10000);

/* ---- words */
r = await S('q=jaket');
ok('typos: “jaket” finds both jackets', r.status === 200 && r.body.doc.slice(0, 2).map(d => d.name).sort().join() === 'Denim jacket,Quilted jacket', `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
ok('…and says which spelling it tried', r.body.query?.typos?.[0]?.tried?.includes('jacket'), JSON.stringify(r.body.query));
ok('…each result a card: id, name, price, category, in stock', r.body.doc[0]._id && r.body.doc[0].price > 0 && r.body.doc[0].category?.name === 'Outerwear' && r.body.doc[0].inStock === true, JSON.stringify(r.body.doc[0]));
r = await S('q=shirt&limit=1&page=2');
ok('paging: page 2 of 1-per-page', r.body.doc.length === 1 && r.body.page === 2 && r.body.totalPages === r.body.total && r.body.total === 2, JSON.stringify({ ...r.body, doc: r.body.doc.map(d => d.name) }));
r = await S('q=xyzzyq');
ok('nonsense: nothing, not an error', r.status === 200 && r.body.total === 0 && r.body.doc.length === 0);

/* ---- filters */
r = await S('category=fashion');
ok('a category by web address — with the categories under it', r.body.total === 6 && r.body.doc.every(d => ['Fashion', 'Outerwear'].includes(d.category?.name)), `${r.body.total} ${r.body.doc?.map(d => d.name)}`);
r = await S(`category=${outer._id}&sort=price`);
ok('a category by id, cheapest first (a category page: no words)', r.body.doc.map(d => d.name).join() === 'Denim jacket,Quilted jacket,Wool blend coat', r.body.doc?.map(d => d.name).join());
r = await S('category=no-such-category');
ok('a category that names nothing: no products (not all of them)', r.status === 200 && r.body.total === 0, String(r.body.total));
r = await S('collection=eid-edit');
ok('a collection by web address', r.body.total === 3, r.body.doc?.map(d => d.name).join());
r = await S('q=shirt&brand=AARONG');
ok('a brand by name, any case', r.body.doc.map(d => d.name).join() === 'Linen shirt', r.body.doc?.map(d => d.name).join());
r = await S('q=sneakers&price[lte]=3500');
ok('price[lte]', r.body.doc.map(d => d.name).join() === 'Canvas sneakers', r.body.doc?.map(d => d.name).join());
r = await S('category=shoes&price[gte]=3500&price[lte]=8000&sort=-price');
ok('price[gte] and [lte], dearest first', r.body.doc.map(d => d.name).join() === 'Chelsea boots,White sneakers', r.body.doc?.map(d => d.name).join());
r = await S('q=polo&option.Size=M');
ok('a size: option.Size=M', r.body.doc.map(d => d.name).join() === 'Cotton polo', JSON.stringify(r.body).slice(0, 200));
r = await S('q=polo&option[size]=xl');
ok('…option[size]=xl, any case: none', r.body.total === 0);
r = await S('q=polo&inStock=1');
ok('in stock only: the polo (no stock) goes', r.body.total === 0, String(r.body.total));
r = await S('q=polo');
ok('…but is listed without it, marked out of stock', r.body.doc[0]?.inStock === false);

/* ---- counts */
r = await S('q=jacket coat shirt sneakers boots&facets=1');
const f = r.body.facets;
ok('counts: categories named, with web address and parent', f?.categories?.some(c => c.name === 'Outerwear' && c.slug === 'outerwear' && String(c.parent) === fashion._id && c.count === 3), JSON.stringify(f?.categories));
ok('…the parent counts the ones under it', f.categories.find(c => c.name === 'Fashion')?.count >= 5, JSON.stringify(f.categories));
ok('…brands and collections named', f.brands.some(b => b.name === 'Aarong' && b.count === 2) && f.collections.some(c => c.name === 'Eid Edit' && c.slug === 'eid-edit'), JSON.stringify([f.brands, f.collections]));
ok('…price ranges', f.price?.buckets?.length > 0 && f.price.min > 0, JSON.stringify(f.price));
r = await S(`q=jacket coat shirt sneakers boots&facets=1&category=${shoes._id}`);
ok('picking a category: the results narrow, its counts still show the others', r.body.total === 3 && r.body.facets.categories.some(c => c.name === 'Outerwear' && c.count === 3), `${r.body.total} ${JSON.stringify(r.body.facets?.categories)}`);
r = await S('q=polo&facets=1');
ok('sizes counted, as the store wrote them', JSON.stringify(r.body.facets.options.find(o => o.key === 'size')) === JSON.stringify({ key: 'size', name: 'Size', values: [{ key: 'm', value: 'M', count: 1 }, { key: 's', value: 'S', count: 1 }] }), JSON.stringify(r.body.facets.options));

/* ---- suggestions */
r = await call('GET', PUB('/store/search/suggest?q=snea'));
ok('suggestions: the word finished, products, the category', r.status === 200 && r.body.queries.includes('sneakers') && r.body.products.length === 2 && r.body.categories[0]?.name === 'Shoes', JSON.stringify(r.body).slice(0, 300));

/* ---- explain, headers, 400s */
r = await S('q=denim jacket&explain=1');
ok('explain without a server key: left out', r.status === 200 && r.body.doc[0].explain === undefined);
r = await call('POST', `${P}/api-builder/keys`, { name: 'Search tests' }, t);
const key = r.body?.secret;
ok('a server key', /^mint_sk_/.test(key || ''), JSON.stringify(r.body).slice(0, 120));
const apiKey = await projectKey(publicSlug);
const withKey = await fetch(`${ROOT}/public/api/store/search?apiKey=${apiKey}&q=denim%20jacket&explain=1`, { headers: { 'x-api-key': key } });
const wk = await withKey.json();
ok('…with one: each result explained, not cached', /name exact “denim” 10/.test(wk.doc?.[0]?.explain || '') && withKey.headers.get('cache-control') === 'no-store', `${wk.doc?.[0]?.explain} ${withKey.headers.get('cache-control')}`);
const plain = await fetch(`${ROOT}/public/api/store/search?apiKey=${apiKey}&q=coat`);
ok('a plain answer may be cached 30 s', plain.headers.get('cache-control') === 'public, max-age=30', plain.headers.get('cache-control'));
r = await S('q=coat&sort=cheapest');
ok('an unknown sort: 400 in plain words', r.status === 400 && /sort must be one of/.test(r.body?.message), JSON.stringify(r.body));
r = await S('q=coat&price[gte]=abc');
ok('a price that isn’t a number: 400', r.status === 400 && /price\[gte\] must be a number/.test(r.body?.message), JSON.stringify(r.body));
r = await S('q=coat&price[gte]=500&price[lte]=100');
ok('a price range upside down: 400', r.status === 400, JSON.stringify(r.body));

/* ---- settings from the panel */
r = await call('GET', `${C}/search/settings`, null, t);
ok('settings: a new store has search on, defaults shown', r.status === 200 && r.body.enabled === true && r.body.typos === 'normal' && r.body.outOfStock === 'show' && r.body.defaults, JSON.stringify(r.body));
r = await call('PUT', `${C}/search/settings`, { typos: 'sometimes' }, t);
ok('a bad value: 400 in plain words', r.status === 400 && /typos must be off, normal or loose/.test(r.body?.message), JSON.stringify(r.body));
r = await call('PUT', `${C}/search/settings`, { colour: 'red' }, t);
ok('an unknown setting: 400', r.status === 400 && /Unknown search settings: colour/.test(r.body?.message), JSON.stringify(r.body));
r = await call('PUT', `${C}/search/settings`, { typos: 'off', outOfStock: 'hide', dials: { popularity: 'high' } }, t);
ok('saved', r.status === 200 && r.body.typos === 'off' && r.body.outOfStock === 'hide' && r.body.dials.popularity === 'high', JSON.stringify(r.body));
r = await S('q=jaket');
ok('typos off: “jaket” finds nothing', r.body.total === 0, String(r.body.total));
r = await S('q=polo');
ok('out of stock hidden: the polo goes', r.body.total === 0, String(r.body.total));
await call('PUT', `${C}/search/settings`, { typos: 'normal', outOfStock: 'show' }, t);

/* ---- the Products list's plain search= */
r = await call('POST', `${P}/api-builder/endpoints/generate`, { model: inst.product.route, actions: ['list'], who: 'anyone' }, t);
ok('a public Products list', r.status === 200 || r.status === 201, r.body?.message);
r = await call('GET', PUB(`/${inst.product.route}?search=jaket`));
ok('Products ?search=jaket: ranked by the engine (typo found), in the list’s own shape', r.status === 200 && r.body.total === 2 && r.body.doc[0]?.name?.includes('jacket') && r.body.doc[0]?.price != null && r.body.totalPages === 1, `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
r = await call('GET', PUB(`/${inst.product.route}?search=jaket&sort=name`));
ok('…with a sort it is the old search (no typos)', r.body.total === 0, String(r.body.total));
r = await call('PUT', `${C}/search/settings`, { enabled: false }, t);
ok('search switched off', r.body.enabled === false);
r = await S('q=coat');
ok('…the search route says so (404)', r.status === 404 && r.body?.code === 'search_off', JSON.stringify(r.body));
r = await call('GET', PUB(`/${inst.product.route}?search=jaket`));
ok('…and Products ?search= is the old one again', r.status === 200 && r.body.total === 0, String(r.body.total));
await call('PUT', `${C}/search/settings`, { enabled: true }, t);

/* ---- not a store, the rate limit */
r = await call('POST', '/tenant/api/projects', { name: 'Not a shop', type: 'app' }, t);
const app = r.body;
r = await call('GET', `/public/api/${app.publicSlug}/store/search?q=coat`);
ok('a project that isn’t a store: 404', r.status === 404, String(r.status));
let limited = false;
for (let i = 0; i < 130 && !limited; i++) limited = (await S(`q=coat${i}`)).status === 429;
ok('search is rate limited (120 a minute)', limited);

await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
await call('DELETE', `/tenant/api/projects/${app._id}?force=1`, null, t);
done();
