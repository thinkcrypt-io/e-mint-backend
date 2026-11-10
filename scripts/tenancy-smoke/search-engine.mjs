// Store search engine on the database (docs/search SI-04):
//  1. parity — the native (MongoDB) driver gives the same results as the in-memory one over the same documents,
//     for every query of a list, with filters, counts, browse and suggestions;
//  2. the bench — 20,000 products: search p95 under 250 ms and suggestions p95 under 80 ms (uncached answers, the
//     store's vocabulary warm), the SI19 budgets.
//
// Runs the engine in this process against the scratch database, so it needs SMOKE_MONGO (local) and SMOKE_BACKEND
// (a backend folder with a fresh `dist`), plus a running server at SMOKE_ROOT for setting up the store. Fixtures: the
// HINT demo catalogue (SEARCH_FIXTURES). BENCH_PRODUCTS changes the bench size (0 skips it).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { call, ok, done } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
const backend = process.env.SMOKE_BACKEND;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri) || !backend) {
	console.log('SKIP  search-engine — set a local SMOKE_MONGO and SMOKE_BACKEND');
	process.exit(0);
}
const dist = p => pathToFileURL(path.join(backend, 'dist', p)).href;
const mongoose = (await import(pathToFileURL(path.join(backend, 'node_modules/mongoose/index.js')).href)).default;
const { runInScope } = await import(dist('library/functions/tenantScope.function.js'));
const { searchWith, suggestWith, clearSearchCache } = await import(dist('library/functions/commerce/search/engine.js'));
const { nativeDriver } = await import(dist('library/functions/commerce/search/drivers/native.js'));
const { memoryDriver } = await import(dist('library/functions/commerce/search/drivers/memory.js'));
const { SEARCH_DEFAULTS } = await import(dist('library/functions/commerce/search/settings.js'));
const { dropVocab } = await import(dist('library/functions/commerce/search/vocab.js'));
const SearchDoc = (await import(dist('library/models/tenancy/searchDoc.model.js'))).default;
await mongoose.connect(uri);
const db = mongoose.connection.db;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 30000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(500);
	}
};
const stamp = Date.now();
const fixtures = JSON.parse(fs.readFileSync(process.env.SEARCH_FIXTURES || path.join(backend, 'library/functions/commerce/search/test/fixtures/hint-catalogue.json'), 'utf8'));

let r = await call('POST', '/tenant/api/auth/register', { name: 'Eng Search', email: `eng${stamp}@example.com`, password: 'tenant-pass-123', organization: `Engine ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Engine shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const project = new mongoose.Types.ObjectId(shopId);
const org = (await db.collection('tenantprojects').findOne({ _id: project }))?.organization;
const scope = { organization: org, project };
const inStore = fn => runInScope(scope, fn);

/* ---- 1. parity on the HINT catalogue */
const cats = {};
for (const name of [...new Set(fixtures.map(f => f.category))]) cats[name] = (await call('POST', `${P}/${inst.category.route}`, { name }, t)).body?.doc;
for (const f of fixtures)
	await call('POST', `${P}/${inst.product.route}`, { name: f.name, price: f.price, status: 'active', productType: 'simple', trackStock: false, description: f.description, images: f.image ? [f.image] : [], category: cats[f.category]._id }, t);
const docCount = () => SearchDoc.collection.countDocuments({ project });
ok(`${fixtures.length} products indexed`, await waitFor(async () => (await docCount()) === fixtures.length, 60000), String(await docCount()));
const all = await SearchDoc.collection.find({ project }).toArray();
const mem = memoryDriver(all, `mem-${shopId}`);
const S = SEARCH_DEFAULTS;
const QUERIES = ['coat', 'jaket', 'denim jacket', 'shirts', 'vases', 'leather tote', 'bakpack', 'gold ring', 'emrald', 'saphire', 'stone ring', 'braclet tennis', 'jhumka', 'camra', '50mm', '85mm lens', 'vanila', 'rose gold', 'snekers', 'running shoes', 'chronogarph', 'wool-blend coat', 'oxf', 'espadril', 'velvet candle', 'xyzzyq', 'ring', 'bag', 'gold watch', 'ear'];
const top = res => res.doc.map(d => `${d.name}`).join(' | ');
let same = 0;
const diffs = [];
for (const q of QUERIES) {
	const a = await inStore(() => searchWith(nativeDriver(), S, { q, limit: 10, facets: true }));
	const b = await searchWith(mem, S, { q, limit: 10, facets: true });
	if (top(a) === top(b) && a.total === b.total && JSON.stringify(a.facets) === JSON.stringify(b.facets)) same++;
	else diffs.push(`${q}: ${a.total} [${top(a)}] vs ${b.total} [${top(b)}]`);
}
ok(`the database gives the in-memory results, counts and filters for all ${QUERIES.length} queries`, same === QUERIES.length, diffs.join(' ;; ').slice(0, 900));
const rings = cats['Ring']._id;
{
	const req = { filters: { categories: [rings] }, sort: '-price', limit: 5, facets: true };
	const a = await inStore(() => searchWith(nativeDriver(), S, req));
	const b = await searchWith(mem, S, req);
	ok('…a browse too (category, sort, page, counts)', top(a) === top(b) && a.total === b.total && a.total === fixtures.filter(f => f.category === 'Ring').length && JSON.stringify(a.facets) === JSON.stringify(b.facets), `${top(a)} vs ${top(b)}`);
}
{
	const a = await inStore(() => suggestWith(nativeDriver(), S, 'snea'));
	const b = await suggestWith(mem, S, 'snea');
	ok('…and suggestions', JSON.stringify({ ...a, ms: 0 }) === JSON.stringify({ ...b, ms: 0 }) && a.queries.includes('sneakers'), JSON.stringify(a).slice(0, 300));
}
{
	const a = await inStore(() => searchWith(nativeDriver(), S, { q: 'oxfrod shirt', explain: true, limit: 1 }));
	ok('a typo on the database: Oxford shirt, explained', a.doc[0]?.name === 'Oxford shirt' && /1 typo “oxford”/.test(a.doc[0].explain), a.doc[0]?.explain);
}

/* ---- 2. the bench */
const N = Number(process.env.BENCH_PRODUCTS ?? 20000);
if (N > 0) {
	const def = await db.collection('modeldefinitions').findOne({ _id: new mongoose.Types.ObjectId(inst.product.id) });
	const col = db.collection(def.collectionName);
	const ADJ = 'classic slim relaxed vintage modern soft warm light heavy bold minimal printed striped quilted ribbed washed raw dark bright pastel royal rustic urban coastal festive casual formal sporty cosy airy crisp gentle sharp smooth woven knitted embroidered handmade organic recycled'.split(' ');
	const MAT = 'cotton linen silk wool denim leather suede velvet satin chiffon jute bamboo canvas cashmere muslin khadi jamdani nylon polyester rayon brass copper silver gold ceramic'.split(' ');
	const ITEM = 'shirt dress saree kurta panjabi jacket coat sweater hoodie jeans trousers shorts skirt scarf shawl bag tote backpack wallet belt cap hat sandal sneaker boot loafer watch ring bracelet necklace earring candle vase mug lamp cushion rug blanket towel'.split(' ');
	const COLOUR = 'red blue green black white navy olive maroon beige grey pink yellow orange teal ivory'.split(' ');
	const catsN = {};
	for (const it of ITEM.slice(0, 20)) catsN[it] = (await call('POST', `${P}/${inst.category.route}`, { name: `${it[0].toUpperCase()}${it.slice(1)}s` }, t)).body?.doc?._id;
	const now = new Date();
	const rows = [];
	for (let i = 0; i < N; i++) {
		const adj = ADJ[i % ADJ.length];
		const mat = MAT[Math.floor(i / ADJ.length) % MAT.length];
		const item = ITEM[Math.floor(i / (ADJ.length * MAT.length)) % ITEM.length];
		const colour = COLOUR[i % COLOUR.length];
		rows.push({
			_model: def.name,
			organization: org,
			project,
			name: `${adj} ${colour} ${mat} ${item} ${i}`,
			price: 300 + ((i * 37) % 9000),
			status: 'active',
			productType: 'simple',
			trackStock: false,
			category: catsN[item] ? new mongoose.Types.ObjectId(catsN[item]) : undefined,
			description: `A ${adj} ${item} in ${mat}. Made to last, easy to wear and easy to love — goes with everything.`,
			sku: `BN-${i}`,
			views: i % 97,
			createdAt: now,
			updatedAt: now,
		});
	}
	for (let i = 0; i < rows.length; i += 2000) await col.insertMany(rows.slice(i, i + 2000));
	const t0 = Date.now();
	r = await call('POST', `${C}/search/rebuild`, {}, t);
	const built = await waitFor(async () => {
		const s = (await call('GET', `${C}/search/status`, null, t)).body;
		return s?.rebuild?.reason === 'panel' && s.rebuild.status === 'done' && s;
	}, 15 * 60 * 1000);
	ok(`${N + fixtures.length} products rebuilt`, built?.docs === N + fixtures.length, `${built?.docs} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
	console.log(`INFO  rebuild: ${((Date.now() - t0) / 1000).toFixed(1)} s (${Math.round((N + fixtures.length) / ((Date.now() - t0) / 1000))} products/s)`);

	const BENCH = ['shirt', 'linen shirt', 'red cotton kurta', 'vintage leather bag', 'jamdani saree', 'sneker', 'bracelt', 'warm wool shawl', 'navy denim jacket', 'gold ring', 'candle', 'brass vase', 'handmade jute tote', 'black boot', 'organic cotton', 'silk', 'ceramic mug', 'BN-1234', 'kurta 500', 'soft pastel cushion'];
	const SUG = ['s', 'sh', 'shi', 'lin', 'red c', 'jam', 'kur', 'snea', 'brac', 'wool s', 'gol', 'can', 'bra', 'han', 'bla', 'org', 'sil', 'cer', 'vel', 'cos'];
	const p95 = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95) - 1];
	const p50 = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.5)];
	dropVocab();
	await inStore(() => searchWith(nativeDriver(), S, { q: 'warm up' }));
	const ts = [];
	const ss = [];
	const slow = [];
	for (let round = 0; round < 5; round++) {
		for (const q of BENCH) {
			clearSearchCache();
			const a = Date.now();
			await inStore(() => searchWith(nativeDriver(), S, { q, limit: 24, facets: true }));
			ts.push(Date.now() - a);
			slow.push([Date.now() - a, q]);
		}
		for (const q of SUG) {
			clearSearchCache();
			const a = Date.now();
			await inStore(() => suggestWith(nativeDriver(), S, q));
			ss.push(Date.now() - a);
		}
	}
	console.log(`INFO  slowest searches: ${slow.sort((a, b) => b[0] - a[0]).slice(0, 8).map(([ms, q]) => `${q} ${ms}`).join(', ')}`);
	console.log(`INFO  search ms p50 ${p50(ts)} p95 ${p95(ts)} max ${Math.max(...ts)} · suggest ms p50 ${p50(ss)} p95 ${p95(ss)} max ${Math.max(...ss)}`);
	ok('search p95 under 250 ms on 20k products (with filter counts)', p95(ts) < 250, `${p95(ts)} ms`);
	ok('suggestions p95 under 80 ms', p95(ss) < 80, `${p95(ss)} ms`);
	const cachedT = Date.now();
	for (let i = 0; i < 50; i++) await inStore(() => searchWith(nativeDriver(), S, { q: 'linen shirt', limit: 24, facets: true }, 7));
	ok('a repeated search comes from the cache (under 5 ms)', (Date.now() - cachedT) / 50 < 5, `${((Date.now() - cachedT) / 50).toFixed(2)} ms`);
	const big = await inStore(() => searchWith(nativeDriver(), S, { q: 'shirt', limit: 3 }));
	ok('a word in thousands of products still answers, capped at 2,000 scored', big.total > 0 && big.total <= 2000, String(big.total));
}

await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
await mongoose.disconnect();
done();
