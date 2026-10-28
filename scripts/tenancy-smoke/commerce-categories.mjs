// E-commerce EC-21 (docs/ecommerce): the store's Categories — a web address made from the name (-2 when taken,
// typed or not), Status and Order on the POS and on the website, more images; the POS's category bar
// (GET /commerce/categories); the Categories list endpoint hiding what's inactive on the website, highest
// Order on website first; and scripts/upgradeStores.js bringing a store built before up to it, keeping
// the order people had set. The old store is made by editing the scratch DB (SMOKE_MONGO, local only);
// the upgrade runs from SMOKE_BACKEND (a folder with dist/ and scripts/, default this backend).
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done, ROOT } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Cato Cats', email: `cato${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cats ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Meat shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'MS' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/settings`, null, t);
const cat = r.body?.installed?.category;
ok('store built', r.body?.status === 'ready' && !!cat, r.body?.status);

r = await call('GET', `${P}/builder/models/${cat.id}`, null, t);
const fields = Object.fromEntries((r.body?.doc?.fields || r.body?.fields || []).map(f => [f.key, f]));
ok('web address: made from the name', fields.slug?.kind === 'uid' && fields.slug?.from === 'name', JSON.stringify(fields.slug));
ok('status on POS and website, active by default', fields.posStatus?.default === 'active' && fields.webStatus?.default === 'active');
ok('order on POS and website, more images', fields.sortOrder?.label === 'Order on POS' && fields.webOrder?.kind === 'number' && fields.images?.kind === 'images');

const add = async body => (await call('POST', `${P}/${cat.route}`, body, t)).body?.doc;
const a = await add({ name: 'Local Chicken', sortOrder: 1, webOrder: 9 });
ok('left empty: local-chicken, shown everywhere', a?.slug === 'local-chicken' && a?.posStatus === 'active' && a?.webStatus === 'active', JSON.stringify(a).slice(0, 200));
const b = await add({ name: 'Local chicken', sortOrder: 5, webOrder: 1 });
ok('the same name: -2', b?.slug === 'local-chicken-2', b?.slug);
const c = await add({ name: 'Beef', slug: 'Local Chicken', sortOrder: 3, posStatus: 'inactive' });
ok('typed and taken: -3', c?.slug === 'local-chicken-3', c?.slug);
const d = await add({ name: 'Mutton', sortOrder: 2, webStatus: 'inactive', webOrder: 20 });
r = await call('PUT', `${P}/${cat.route}/${d?._id}`, { slug: 'beef' }, t);
r = await call('GET', `${P}/${cat.route}/${d?._id}`, null, t);
ok('an edit to a free one keeps it', (r.body?.slug || r.body?.doc?.slug) === 'beef', JSON.stringify(r.body).slice(0, 160));

r = await call('GET', `${C}/categories`, null, t);
ok('POS: inactive left out, highest order first', JSON.stringify((r.body?.doc || []).map(x => x.name)) === JSON.stringify(['Local chicken', 'Mutton', 'Local Chicken']), JSON.stringify(r.body?.doc?.map(x => x.name)));

r = await call('PUT', `${P}/builder/models/${cat.id}/public-api`, { enabled: true, actions: ['list', 'get'], auth: 'none' }, t);
ok('categories on the API', r.status === 200, r.body?.message);
r = await call('GET', `${P}/api-builder/endpoints`, null, t);
const ep = (r.body?.doc || r.body?.endpoints || []).find(e => e.model === cat.route && e.action === 'list');
ok('the list endpoint: hides inactive on the website, website order', ep?.list?.sort === '-webOrder,name' && ep?.list?.filters?.some(f => f.field === 'webStatus'), JSON.stringify(ep?.list));
r = await call('GET', `/public/api/${publicSlug}/${cat.route}`);
ok('website: inactive left out, highest order first', JSON.stringify((r.body?.doc || []).map(x => x.name)) === JSON.stringify(['Local Chicken', 'Local chicken', 'Beef']), `${r.status} ${JSON.stringify(r.body?.doc?.map(x => x.name) || r.body)}`);

// A store from before: its Categories as the first blueprint made them.
const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  upgrading an older store — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	const db = mc.db();
	const defs = db.collection('modeldefinitions');
	const configs = db.collection('routeconfigs');
	let page = await configs.findOne({ route: cat.route, project: new ObjectId(shopId) });
	ok(
		'a new store’s form: Category, POS configuration, Website configuration, Images — short fields side by side',
		JSON.stringify(page?.data?.form?.map(x => x.sectionTitle)) === JSON.stringify(['Category', 'POS configuration', 'Website configuration', 'Images']) &&
			JSON.stringify(page.data.form[1].fields) === JSON.stringify([['posStatus', 'sortOrder']]) &&
			JSON.stringify(page.data.form[2].fields) === JSON.stringify([['webStatus', 'webOrder'], 'slug']),
		JSON.stringify(page?.data?.form)
	);
	ok('…and its detail page the same', JSON.stringify(page?.data?.view?.map(x => x.title)) === JSON.stringify(['Category', 'POS configuration', 'Website configuration', 'Images']), JSON.stringify(page?.data?.view?.map(x => x.title)));
	const def = await defs.findOne({ _id: new ObjectId(cat.id) });
	const OLD = ['name', 'parent', 'image', 'sortOrder'];
	await defs.updateOne(
		{ _id: def._id },
		{
			$set: {
				fields: [...def.fields.filter(f => OLD.includes(f.key)).map(({ helper, ...f }) => (f.key === 'sortOrder' ? { ...f, label: 'Order on the POS' } : f)), { key: 'description', label: 'Description', kind: 'textarea' }],
				systemFields: OLD,
				description: 'How products are grouped — on the POS too',
				version: (def.version || 1) + 1,
			},
		}
	);
	// Its page as the generator made it then: one Details section.
	await configs.updateOne({ _id: page._id }, { $set: { 'data.form': [{ sectionTitle: 'Details', fields: ['name', ['parent', 'image'], 'sortOrder', 'description'] }], 'data.view': [{ title: 'Details', columns: 2, fields: ['name', 'parent', 'image', 'sortOrder', 'description'] }] } });
	const col = db.collection(def.collectionName);
	await col.updateMany({ _model: def.name }, { $unset: { slug: '', posStatus: '', webStatus: '', webOrder: '', images: '' } });
	for (const [id, n] of [[a._id, 1], [b._id, 3], [c._id, 2], [d._id, 0]]) await col.updateOne({ _id: new ObjectId(id) }, { $set: { sortOrder: n } });
	await db.collection('apiendpoints').updateMany({ model: cat.route, action: 'list' }, { $set: { 'list.filters': [], 'list.sort': 'sortOrder' } });

	const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
	const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: backend, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' });
	let out = run();
	ok('dry run: says what it would do, writes nothing', /Meat shop:/.test(out) && /adds slug, posStatus, webStatus, webOrder, images/.test(out) && (await col.countDocuments({ _model: def.name, slug: { $exists: true } })) === 0, out.split('\n').filter(l => /Meat shop|Categories/.test(l)).join(' | '));
	out = run('--apply');
	ok('applied', /Meat shop:/.test(out) && !/FAILED/.test(out), out.split('\n').filter(l => /Meat shop|FAILED|Categories/.test(l)).join(' | '));
	const after = await defs.findOne({ _id: def._id });
	const keys = after.fields.map(f => f.key);
	ok('the fields in the blueprint’s order, label renewed, locked', JSON.stringify(keys) === JSON.stringify(['name', 'slug', 'parent', 'posStatus', 'webStatus', 'sortOrder', 'webOrder', 'image', 'images', 'description']) && after.fields.find(f => f.key === 'sortOrder').label === 'Order on POS' && after.systemFields.includes('webStatus') && /POS and your website/.test(after.description), JSON.stringify(keys));
	const rows = await col.find({ _model: def.name }).sort({ sortOrder: -1 }).toArray();
	ok('records filled: addresses, shown, order kept (highest first now)', rows.every(x => x.slug && x.posStatus === 'active' && x.webStatus === 'active') && JSON.stringify(rows.map(x => x.name)) === JSON.stringify(['Mutton', 'Local Chicken', 'Beef', 'Local chicken']), JSON.stringify(rows.map(x => [x.name, x.sortOrder, x.webOrder, x.slug])));
	page = await configs.findOne({ _id: page._id });
	ok(
		'its page in sections, the field it added under More details',
		JSON.stringify(page.data.form.map(x => x.sectionTitle)) === JSON.stringify(['Category', 'POS configuration', 'Website configuration', 'Images', 'More details']) &&
			JSON.stringify(page.data.form[4].fields) === JSON.stringify(['description']) &&
			page.data.view.some(x => x.title === 'More details'),
		JSON.stringify(page.data.form)
	);
	const ep2 = await db.collection('apiendpoints').findOne({ model: cat.route, action: 'list' });
	ok('the list endpoint gets the website rule', ep2.list.sort === '-webOrder,name' && ep2.list.filters.some(f => f.field === 'webStatus'), JSON.stringify(ep2.list));
	out = run('--apply');
	ok('again: up to date', /Meat shop: up to date/.test(out), out.split('\n').filter(l => /Meat shop/.test(l)).join(' | '));
	await mc.close();
	await sleep(11000);
	r = await call('GET', `${C}/categories`, null, t);
	ok('POS after the upgrade', JSON.stringify((r.body?.doc || []).map(x => x.name)) === JSON.stringify(['Mutton', 'Local Chicken', 'Beef', 'Local chicken']), JSON.stringify(r.body?.doc?.map(x => x.name) || r.body));
	const e = await add({ name: 'Local Chicken' });
	ok('after the upgrade a new one gets the next address', e?.slug === 'local-chicken-3', e?.slug);
}

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
done();
