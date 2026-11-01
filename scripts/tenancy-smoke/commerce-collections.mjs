// E-commerce collections (docs/ecommerce/DISCOUNTS.md DS7, EC-41): a Collections model in every store, a product in
// several; the collection's page lists its products, with Add existing / Remove (POST /<route>/bulk/link, History);
// the website's list hides inactive ones in website order, products filtered by ?collections=; and a store built
// before Collections brought up to it by scripts/upgradeStores.js (needs a local SMOKE_MONGO; the upgrade runs from
// SMOKE_BACKEND, a folder with dist/ and scripts/, default this backend).
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Cora Collections', email: `cora${stamp}@example.com`, password: 'tenant-pass-123', organization: `Coll ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Collections shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'CL' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, pos: { tax: { mode: 'none' } } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/settings`, null, t);
let inst = r.body?.installed || {};
ok('store built with Collections', r.body?.status === 'ready' && !!inst.collection && !!inst.product, `${r.body?.status} ${JSON.stringify(Object.keys(inst))}`);

const add = async (m, body) => (await call('POST', `${P}/${inst[m].route}`, body, t)).body?.doc;
const get = async (m, id) => {
	const x = (await call('GET', `${P}/${inst[m].route}/${id}`, null, t)).body;
	return x?.doc || x;
};
const idOf = x => String(x?._id ?? x ?? '');
const ids = list => (list || []).map(idOf).sort();

const sale = await add('collection', { name: 'Summer Sale', webOrder: 5 });
const featured = await add('collection', { name: 'Featured', webOrder: 9 });
const hidden = await add('collection', { name: 'Old drop', webStatus: 'inactive', webOrder: 20 });
ok('collections made, web address from the name', sale?.slug === 'summer-sale' && !!featured?._id && !!hidden?._id, sale?.slug);

const p1 = await add('product', { name: 'Linen shirt', price: 100, collections: [sale._id, featured._id] });
const p2 = await add('product', { name: 'Sandals', price: 50 });
const p3 = await add('product', { name: 'Hat', price: 30, collections: [featured._id] });
ok('a product in two collections', JSON.stringify(ids((await get('product', p1._id)).collections)) === JSON.stringify(ids([sale._id, featured._id])), JSON.stringify((await get('product', p1._id)).collections));

// The product form offers Collections; the collection's page has a Products tab.
r = await call('GET', `${P}/${inst.product.route}/get/config`, null, t);
const form = JSON.stringify(r.body?.form || r.body?.data?.form || r.body);
r = await call('GET', `${P}/${inst.collection.route}/get/view/${sale._id}`, null, t);
const tabs = r.body?.tabs || r.body?.viewTabs || [];
const tabIndex = tabs.findIndex(x => /Products/.test(x.title || ''));
ok('Collection page: a Products tab', tabIndex >= 0, JSON.stringify(tabs.map(x => x.title)));
r = await call('GET', `${P}/${inst.collection.route}/get/view/${sale._id}/tab/${tabIndex}`, null, t);
ok('…listing its products, Add existing allowed', JSON.stringify((r.body?.rows || []).map(x => x.name)) === JSON.stringify(['Linen shirt']) && r.body?.add?.link?.allowed === true && r.body?.add?.field === 'collections', JSON.stringify({ rows: r.body?.rows?.map(x => x.name), add: r.body?.add }));

// Add existing: Sandals and Hat into Summer Sale; the shirt already in it is skipped.
r = await call('POST', `${P}/${inst.product.route}/bulk/link`, { ids: [p1._id, p2._id, p3._id], field: 'collections', to: sale._id }, t);
ok('two added, one already linked', r.status === 200 && r.body?.changed === 2 && r.body?.skipped?.[0]?.why === 'already linked', JSON.stringify(r.body));
ok('Hat keeps Featured and gets Summer Sale', JSON.stringify(ids((await get('product', p3._id)).collections)) === JSON.stringify(ids([featured._id, sale._id])), JSON.stringify((await get('product', p3._id)).collections));
r = await call('GET', `${P}/${inst.collection.route}/get/view/${sale._id}/tab/${tabIndex}`, null, t);
ok('the tab now lists all three', r.body?.total === 3, String(r.body?.total));
await sleep(1500);
r = await call('GET', `${P}/history?search=Sandals`, null, t);
const lines = (r.body?.doc || r.body?.docs || []).map(h => `${h.text} ${JSON.stringify(h.changes || '')}`);
ok('History names the collection', lines.some(l => /Summer Sale/.test(l)), JSON.stringify(lines).slice(0, 300));

// Remove: the shirt out of Summer Sale, kept in Featured.
r = await call('POST', `${P}/${inst.product.route}/bulk/link`, { ids: [p1._id], field: 'collections', to: sale._id, remove: true }, t);
ok('removed', r.status === 200 && r.body?.changed === 1, JSON.stringify(r.body));
ok('…the shirt only in Featured now', JSON.stringify(ids((await get('product', p1._id)).collections)) === JSON.stringify(ids([featured._id])), JSON.stringify((await get('product', p1._id)).collections));

// Refused: a field that picks one record, a bad id, nothing picked.
r = await call('POST', `${P}/${inst.product.route}/bulk/link`, { ids: [p1._id], field: 'category', to: sale._id }, t);
ok('a single link refused (400)', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', `${P}/${inst.product.route}/bulk/link`, { ids: [p1._id], field: 'collections', to: 'nope' }, t);
ok('a bad record refused (400)', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', `${P}/${inst.product.route}/bulk/link`, { ids: [], field: 'collections', to: sale._id }, t);
ok('nothing picked refused (400)', r.status === 400, `${r.status} ${r.body?.message}`);

// The website: collections in website order without the inactive one; products by collection.
const models = (await call('GET', `${P}/builder/models`, null, t)).body;
const modelId = m => (models?.doc || models || []).find(x => x.route === inst[m].route)?._id || inst[m].id;
for (const m of ['collection', 'product']) {
	r = await call('PUT', `${P}/builder/models/${modelId(m)}/public-api`, { enabled: true, actions: ['list', 'get'], auth: 'none' }, t);
	ok(`${m}s on the API`, r.status === 200, r.body?.message);
}
r = await call('GET', `/public/api/${publicSlug}/${inst.collection.route}`);
ok('website: inactive left out, highest order first', JSON.stringify((r.body?.doc || []).map(x => x.name)) === JSON.stringify(['Featured', 'Summer Sale']), `${r.status} ${JSON.stringify(r.body?.doc?.map(x => x.name) || r.body)}`);
r = await call('GET', `/public/api/${publicSlug}/${inst.product.route}?collections=${sale._id}`);
ok('website: ?collections= lists that collection’s products', JSON.stringify((r.body?.doc || []).map(x => x.name).sort()) === JSON.stringify(['Hat', 'Sandals']), `${r.status} ${JSON.stringify(r.body?.doc?.map(x => x.name) || r.body)}`);

// A store from before Collections: no Collections model, Products without the field.
const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  upgrading an older store — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	const db = mc.db();
	const project = new ObjectId(shopId);
	const defs = db.collection('modeldefinitions');
	const configs = db.collection('routeconfigs');
	const coll = await defs.findOne({ _id: new ObjectId(inst.collection.id) });
	await db.collection('sidebaritems').deleteOne({ _id: coll.sidebarItem });
	await configs.deleteMany({ route: coll.route, project });
	await db.collection('routesettings').deleteMany({ route: coll.route, project });
	await defs.deleteOne({ _id: coll._id });
	await db.collection(coll.collectionName).deleteMany({ _model: coll.name });
	await db.collection('commercesettings').updateOne({ project }, { $unset: { 'installed.collection': '' } });
	const prod = await defs.findOne({ _id: new ObjectId(inst.product.id) });
	await defs.updateOne({ _id: prod._id }, { $set: { fields: prod.fields.filter(f => f.key !== 'collections'), systemFields: prod.systemFields.filter(k => k !== 'collections'), version: (prod.version || 1) + 1 } });
	const strip = rows => rows.map(x => (Array.isArray(x) ? x.filter(k => k !== 'collections') : x)).filter(x => x !== 'collections');
	const page = await configs.findOne({ route: prod.route, project });
	await configs.updateOne({ _id: page._id }, { $set: { 'data.form': page.data.form.map(s => ({ ...s, fields: strip(s.fields) })) } });
	await db.collection(prod.collectionName).updateMany({ _model: prod.name }, { $unset: { collections: '' } });

	const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
	const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: backend, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' });
	// Only this store's part of the output (the scratch database may hold other stores).
	const mine = out => {
		const lines = out.split('\n');
		const at = lines.findIndex(l => l.startsWith('Collections shop:'));
		if (at < 0) return lines.filter(l => /FAILED/.test(l)).join(' | ');
		const end = lines.findIndex((l, i) => i > at && !l.startsWith('  '));
		return lines.slice(at, end < 0 ? undefined : end).join(' | ');
	};
	let out = run();
	ok('dry run: Collections to build, Products to gain the field', /Collections — built for this store/.test(mine(out)) && /Products — adds collections/.test(mine(out)), mine(out));
	ok('…and nothing written', !(await defs.findOne({ project, title: 'Collections' })));
	out = run('--apply');
	ok('applied', /Collections shop:/.test(out) && !/FAILED/.test(out), mine(out));
	const settings = await db.collection('commercesettings').findOne({ project });
	const nc = settings.installed.collection;
	ok('Collections built and recorded', !!nc?.id && !!(await defs.findOne({ _id: new ObjectId(nc.id), system: 'commerce' })), JSON.stringify(nc));
	const prodAfter = await defs.findOne({ _id: prod._id });
	const f = prodAfter.fields.find(x => x.key === 'collections');
	ok('Products: Collections field, many, to Collection, locked', f?.kind === 'references' && /Collection/.test(f.ref) && prodAfter.systemFields.includes('collections'), JSON.stringify(f));
	const pp = await configs.findOne({ route: prod.route, project });
	ok('…in the product form', JSON.stringify(pp.data.form).includes('"collections"'), JSON.stringify(pp.data.form.map(s => s.fields)));
	const cp = await configs.findOne({ route: nc.route, project });
	ok('the collection page gets its Products tab', (cp?.data?.viewTabs || []).some(x => x.related === prod.route && x.foreignField === 'collections'), JSON.stringify(cp?.data?.viewTabs));
	out = run('--apply');
	ok('again: up to date', /Collections shop: up to date/.test(out), mine(out));
	await mc.close();
	await sleep(11000);
	inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || inst;
	const nu = await add('collection', { name: 'New in' });
	r = await call('POST', `${P}/${inst.product.route}/bulk/link`, { ids: [p2._id], field: 'collections', to: nu?._id }, t);
	ok('after the upgrade a product can be added to a new collection', r.status === 200 && r.body?.changed === 1, `${r.status} ${JSON.stringify(r.body)}`);
}

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
done();
