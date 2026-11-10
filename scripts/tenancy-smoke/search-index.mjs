// Store search index (docs/search SI-03): a store's products get search documents by themselves — the first sweep
// builds a store never indexed; saves, variant SKUs, a category rename, a stock move and a discount reach them in
// seconds; a product made inactive or deleted loses its document; a product written straight into the database
// (no hook) is picked up by the sweep; one deleted straight from it is caught by the drift check; a rebuild from the
// panel gives the same documents.
//
// Needs a local SMOKE_MONGO (it reads the search documents and writes behind the API's back) and the backend started
// with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000 SEARCH_DRIFT_MS=6000. Fixtures: the HINT demo catalogue
// (hint-site/data/products.json, SEARCH_FIXTURES to point elsewhere), first 60 products.
import fs from 'fs';
import { call, ok, done } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) {
	console.log('SKIP  search-index — set a local SMOKE_MONGO');
	process.exit(0);
}
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 15000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(400);
	}
};
const stamp = Date.now();

const fixturePath = process.env.SEARCH_FIXTURES || new URL('../../../../hint-site/data/products.json', import.meta.url);
const fixtures = fs.existsSync(fixturePath)
	? JSON.parse(fs.readFileSync(fixturePath, 'utf8')).slice(0, 60)
	: Array.from({ length: 60 }, (_, i) => ({ name: `Item ${i}`, category: ['Clothes', 'Bags', 'Shoes'][i % 3], price: 100 + i, description: 'A thing', images: [] }));

let r = await call('POST', '/tenant/api/auth/register', { name: 'Sia Search', email: `sia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Search ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Search shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, products: { variations: true } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
ok('the store is built', inst.product && inst.category && inst.variant, Object.keys(inst).join());

const project = new ObjectId(shopId);
const docs = db.collection('searchdocs');
const docOf = id => docs.findOne({ project, product: new ObjectId(id) });
const make = (m, body) => call('POST', `${P}/${inst[m].route}`, body, t).then(x => x.body?.doc || x.body);
const edit = (m, id, body) => call('PUT', `${P}/${inst[m].route}/${id}`, body, t);

/* ---- the catalogue, and the first build */
const all = await make('category', { name: 'All' });
const cats = {};
for (const name of [...new Set(fixtures.map(f => f.category))]) cats[name] = await make('category', { name, parent: all._id });
const brand = await make('brand', { name: 'Aarong' });
const eid = await make('collection', { name: 'Eid Edit' });
const made = [];
for (const [i, f] of fixtures.entries())
	made.push(
		await make('product', {
			name: f.name,
			price: f.price,
			status: 'active',
			productType: 'simple',
			trackStock: false,
			description: f.description,
			images: f.images,
			category: cats[f.category]._id,
			...(i % 5 === 0 && { brand: brand._id, collections: [eid._id] }),
		})
	);
ok(`${fixtures.length} products made`, made.every(p => p?._id), JSON.stringify(made.find(p => !p?._id))?.slice(0, 200));
const count = () => docs.countDocuments({ project });
ok('every product gets a search document by itself', await waitFor(async () => (await count()) === made.length, 30000), `${await count()} of ${made.length}`);

const first = made[0];
let d = await docOf(first._id);
const nameWords = fixtures[0].name.toLowerCase().split(/\s+/);
ok('its name, category (with the one above) and card are in it', nameWords.every(w => d?.terms?.includes(w)) && d.fields.category.words.includes('all') && d.card?.name === fixtures[0].name && d.card.image === fixtures[0].images?.[0], JSON.stringify({ terms: d?.terms?.slice(0, 12), cat: d?.fields?.category, card: d?.card }).slice(0, 300));
ok('…its category ids, brand and collection as filters', String(d.facets.categories[1]) === String(all._id) && String(d.facets.brand) === String(brand._id) && d.fields.collection.words.includes('eid'), JSON.stringify(d.facets));
ok('…prefixes and trigrams for as-you-type and typos', d.prefixes.includes(nameWords[0].slice(0, 2)) && d.grams.length > 0);
ok('…kept with the store’s organization and project', String(d.project) === shopId && d.organization);
r = await call('GET', `${C}/search/status`, null, t);
ok('status: documents match products, built, not queued', r.status === 200 && r.body.docs === made.length && r.body.products === made.length && r.body.builtAt && r.body.version > 0, JSON.stringify(r.body).slice(0, 300));

/* ---- saves reach it in seconds */
await edit('product', first._id, { name: 'Midnight Velvet Blazer' });
ok('a renamed product: its document follows', await waitFor(async () => (await docOf(first._id))?.fields?.name?.words?.join(' ') === 'midnight velvet blazer', 10000), JSON.stringify((await docOf(first._id))?.fields?.name));

const shirt = await make('product', { name: 'Oxford Shirt', price: 2400, status: 'active', productType: 'variation', trackStock: true, category: cats[fixtures[0].category]._id, options: [{ name: 'Size', values: 'S, M' }] });
const variantsOf = async () => (await call('GET', `${P}/${inst.variant.route}?product=${shirt._id}`, null, t)).body?.doc || [];
const vs = await waitFor(async () => ((await variantsOf()).length === 2 ? variantsOf() : null), 10000);
ok('a product with sizes gets two variants', vs?.length === 2, JSON.stringify(vs?.map(v => v.title)));
ok('…and its sizes are search filters', await waitFor(async () => (await docOf(shirt._id))?.facets?.opts?.includes('size=m'), 10000), JSON.stringify((await docOf(shirt._id))?.facets));
const m = vs.find(v => /M/.test(v.title));
await edit('variant', m._id, { sku: 'OX-M-100' });
ok('a variant’s new SKU is a code of its product', await waitFor(async () => (await docOf(shirt._id))?.codes?.includes('oxm100'), 10000), JSON.stringify((await docOf(shirt._id))?.codes));

const cat0 = cats[fixtures[0].category];
await edit('category', cat0._id, { name: 'Outerwear' });
ok('a renamed category: its products’ documents follow', await waitFor(async () => (await docOf(shirt._id))?.fields?.category?.words?.includes('outerwear') && (await docOf(first._id))?.fields?.category?.words?.includes('outerwear'), 10000), JSON.stringify((await docOf(shirt._id))?.fields?.category));
await edit('category', all._id, { name: 'Everything' });
ok('…and a renamed parent reaches the products of the categories under it', await waitFor(async () => (await docOf(shirt._id))?.fields?.category?.words?.includes('everything'), 10000));

/* ---- stock and discounts */
ok('no stock: out of stock', (await docOf(shirt._id))?.facets?.inStock === false);
const outlet = ((await call('GET', `${P}/${inst.outlet.route}`, null, t)).body?.doc || [])[0];
r = await call('POST', `${C}/stock/set`, { variant: m._id, outlet: outlet._id, onHand: 5, reason: 'opening' }, t);
ok('stock set', r.status === 200, JSON.stringify(r.body).slice(0, 200));
ok('a stock move: in stock', await waitFor(async () => (await docOf(shirt._id))?.facets?.inStock === true, 10000), JSON.stringify((await docOf(shirt._id))?.facets));

r = await call('POST', `${P}/${inst.discount.route}`, { name: 'Outerwear week', percent: 20, categories: [cat0._id] }, t);
ok('a discount on the category', r.status < 300, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
ok('…puts its products on sale at the lower price', await waitFor(async () => {
	const x = await docOf(shirt._id);
	return x?.facets?.onSale === true && x.facets.price === 1920 && x.card.discountPercent === 20;
}, 15000), JSON.stringify((await docOf(shirt._id))?.facets));

/* ---- gone */
await edit('product', made[1]._id, { status: 'archived' });
ok('a product made archived loses its document', await waitFor(async () => !(await docOf(made[1]._id)), 10000));
await edit('product', made[1]._id, { status: 'active' });
ok('…and gets it back when active again', await waitFor(async () => !!(await docOf(made[1]._id)), 10000));
await call('DELETE', `${P}/${inst.product.route}/${made[2]._id}`, null, t);
ok('a deleted product loses its document', await waitFor(async () => !(await docOf(made[2]._id)), 10000));

/* ---- behind the API's back: the sweep and the drift check */
const def = await db.collection('modeldefinitions').findOne({ _id: new ObjectId(inst.product.id) });
const col = db.collection(def.collectionName);
const sneaky = new ObjectId();
const now = new Date();
await col.insertOne({ _id: sneaky, _model: def.name, organization: d.organization, project, name: 'Hidden Gem Lantern', price: 900, status: 'active', productType: 'simple', trackStock: false, createdAt: now, updatedAt: now });
ok('a product written straight into the database is found by the sweep', await waitFor(async () => (await docOf(sneaky))?.fields?.name?.words?.includes('lantern'), 15000));
await col.deleteOne({ _id: made[3]._id ? new ObjectId(made[3]._id) : null });
ok('one deleted straight from it is caught by the drift check', await waitFor(async () => !(await docOf(made[3]._id)), 30000));
r = await call('GET', `${C}/search/status`, null, t);
ok('…which says what it found', r.body?.lastDrift && r.body.docs === r.body.products, JSON.stringify(r.body).slice(0, 400));

/* ---- a rebuild from the panel */
const strip = x => {
	const { _id, builtAt, ...rest } = x;
	return rest;
};
const before = (await docs.find({ project }).sort({ product: 1 }).toArray()).map(strip);
r = await call('POST', `${C}/search/rebuild`, {}, t);
ok('rebuild starts (202)', r.status === 202, String(r.status));
await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.rebuild?.reason === 'panel' && (await call('GET', `${C}/search/status`, null, t)).body?.rebuild?.status === 'done', 30000);
r = await call('GET', `${C}/search/status`, null, t);
ok('…and finishes', r.body?.rebuild?.status === 'done' && r.body.rebuild.reason === 'panel', JSON.stringify(r.body?.rebuild));
const after = (await docs.find({ project }).sort({ product: 1 }).toArray()).map(strip);
ok('a rebuild gives the same documents', JSON.stringify(after) === JSON.stringify(before), `${before.length} → ${after.length}`);

/* ---- who may */
r = await call('POST', `${C}/search/rebuild`, {}, undefined);
ok('rebuild needs a signed-in manager', r.status === 401 || r.status === 403, String(r.status));

await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
await mc.close();
done();
