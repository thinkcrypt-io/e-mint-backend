// Store search's rules (docs/search SI-15): a new store has Search rules; a rule saved in the panel works at once and
// is named by its sentence; pin (in order, a product the words don't find too), boost, bury, hide, show only; a
// category page's own rules; a shopper's sort beats pins; schedules; uses counted; the editor's before / after
// preview; the rules that touch a search or a product; the sidebar; an older store gets the model from upgradeStores.js.
//
// Needs a local SMOKE_MONGO, SMOKE_BACKEND (a folder with a fresh `dist`, for upgradeStores.js) and the backend started
// with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000.
import { execFileSync } from 'child_process';
import { call, ok, done } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
const backend = process.env.SMOKE_BACKEND;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri) || !backend) {
	console.log('SKIP  search-merch — set a local SMOKE_MONGO and SMOKE_BACKEND');
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
const stamp = Date.now();

let r = await call('POST', '/tenant/api/auth/register', { name: 'Mira Merch', email: `mira${stamp}@example.com`, password: 'tenant-pass-123', organization: `Merch ${stamp}`, country: 'BD' });
const t = r.body?.token;
const makeStore = async name => {
	const p = (await call('POST', '/tenant/api/projects', { name, type: 'ecommerce' }, t)).body;
	const C = `/tenant/api/p/${p._id}/commerce`;
	await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
	await call('POST', `${C}/setup`, {}, t);
	await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);
	return { ...p, P: `/tenant/api/p/${p._id}`, C, inst: (await call('GET', `${C}/settings`, null, t)).body?.installed || {} };
};
const shop = await makeStore('Merch shop');
const { P, C, inst, publicSlug } = shop;
ok('a new store has Search rules', inst.searchRule?.route === 'search-rules', JSON.stringify(inst.searchRule));
const make = (m, body) => call('POST', `${P}/${inst[m].route}`, body, t).then(x => x.body?.doc || x.body);
const get = async (m, id) => {
	const x = (await call('GET', `${P}/${inst[m].route}/${id}`, null, t)).body;
	return x?.doc || x;
};
const put = (m, id, body) => call('PUT', `${P}/${inst[m].route}/${id}`, body, t);

const dresses = await make('category', { name: 'Dresses' });
const shoes = await make('category', { name: 'Shoes' });
const aarong = await make('brand', { name: 'Aarong' });
const yellow = await make('brand', { name: 'Yellow' });
const eid = await make('collection', { name: 'Eid' });
const prod = {};
for (const [k, name, more] of [
	['red', 'Red cotton dress', { category: dresses._id, brand: yellow._id }],
	['blue', 'Blue cotton dress', { category: dresses._id, brand: aarong._id }],
	['green', 'Green silk dress', { category: dresses._id, brand: aarong._id, collections: [eid._id] }],
	['black', 'Black party dress', { category: dresses._id, brand: yellow._id }],
	['old', 'Old summer dress', { category: dresses._id }],
	['leather', 'Leather shoes', { category: shoes._id, brand: yellow._id }],
	['canvas', 'Canvas shoes', { category: shoes._id }],
])
	prod[k] = await make('product', { name, price: 1000, status: 'active', productType: 'simple', trackStock: false, ...more });
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 7, 30000));
const S = (q, more = '') => call('GET', `/public/api/${publicSlug}/store/search?q=${encodeURIComponent(q)}${more}`);
const names = x => (x.body?.doc || []).map(d => d.name);
const top = async (q, more) => names(await S(q, more));

/* ---- pin */
r = await S('dress');
ok('before: five dresses', r.body?.total === 5, JSON.stringify(r.body).slice(0, 200));
const pin = await make('searchRule', { when: 'exact', queries: ['dress', 'frock'], action: 'pin', products: [prod.old._id, prod.green._id] });
ok('a pin rule saved', pin?._id, JSON.stringify(pin).slice(0, 200));
ok('…and named by its sentence', await waitFor(async () => /^Searches for “dress” or “frock”: pin Old summer dress, Green silk dress$/.test((await get('searchRule', pin._id))?.name || ''), 5000), (await get('searchRule', pin._id))?.name);
ok('“dress”: the pinned two first, in order, at once', await waitFor(async () => (await top('dress')).slice(0, 2).join() === 'Old summer dress,Green silk dress', 5000), (await top('dress')).join(', '));
ok('…“dresses” too (word forms)', (await top('dresses'))[0] === 'Old summer dress');
ok('…“red dress” isn’t “dress” (exact)', (await top('red dress'))[0] === 'Red cotton dress');
ok('…a sort the shopper picked comes first', (await top('dress', '&sort=name'))[0] === 'Black party dress', (await top('dress', '&sort=name')).join(', '));
await put('searchRule', pin._id, { products: [prod.leather._id] });
ok('a pinned product the words don’t find is shown too', await waitFor(async () => (await top('dress'))[0] === 'Leather shoes', 5000), (await top('dress')).join(', '));
r = await S('dress');
ok('…and counted', r.body.total === 6, String(r.body.total));
ok('…the rule’s uses counted', await waitFor(async () => (await get('searchRule', pin._id))?.hits >= 1, 5000), String((await get('searchRule', pin._id))?.hits));
ok('…explain only for the panel: no rule names in the public answer', !r.body.rules && !r.body.doc[0].pinned, JSON.stringify(r.body.doc[0]).slice(0, 200));
await put('searchRule', pin._id, { active: false });
ok('switched off: back to the best match', await waitFor(async () => (await top('dress'))[0] !== 'Leather shoes', 5000));

/* ---- boost, bury, hide, show only */
ok('before: red first for “cotton dress”', (await top('cotton dress'))[0] === 'Red cotton dress', (await top('cotton dress')).join(', '));
const boost = await make('searchRule', { when: 'contains', queries: ['cotton'], action: 'boost', brands: [aarong._id], strength: '3' });
ok('boost brand Aarong ×3: blue comes first', await waitFor(async () => (await top('cotton dress'))[0] === 'Blue cotton dress', 5000), (await top('cotton dress')).join(', '));
await put('searchRule', boost._id, { action: 'bury', brands: [yellow._id], strength: '0.2' });
ok('bury brand Yellow: red goes below blue', await waitFor(async () => (await top('cotton dress'))[0] === 'Blue cotton dress' && (await top('cotton dress'))[1] === 'Red cotton dress', 5000));
ok('its written name follows the change', (await get('searchRule', boost._id))?.name === 'Searches with “cotton”: bury brand Yellow ×0.2', (await get('searchRule', boost._id))?.name);
await put('searchRule', boost._id, { active: false });
const hide = await make('searchRule', { when: 'always', action: 'hide', products: [prod.old._id] });
ok('hide on every search: the old dress is gone', await waitFor(async () => !(await top('dress')).includes('Old summer dress'), 5000), (await top('dress')).join(', '));
ok('…from the category page too', !(await top('', `&category=${dresses._id}`)).includes('Old summer dress'));
const only = await make('searchRule', { when: 'exact', queries: ['eid'], action: 'filter', collections: [eid._id] });
await make('product', { name: 'Eid lantern', price: 500, status: 'active', productType: 'simple', trackStock: false });
ok('show only the Eid collection for “eid”', await waitFor(async () => (await top('eid')).join() === 'Green silk dress', 8000), (await top('eid')).join(', '));
await put('searchRule', only._id, { collections: [], products: [prod.canvas._id] });
ok('show only, when it would leave nothing, is set aside', await waitFor(async () => (await top('eid')).sort().join() === 'Eid lantern,Green silk dress', 8000), (await top('eid')).join(', '));
await put('searchRule', hide._id, { active: false });

/* ---- a category page */
const catPin = await make('searchRule', { when: 'category', category: shoes._id, action: 'pin', products: [prod.canvas._id] });
ok('the Shoes page: canvas first', await waitFor(async () => (await top('', `&category=${shoes._id}`))[0] === 'Canvas shoes', 5000), (await top('', `&category=${shoes._id}`)).join(', '));
ok('…a search for “shoes” isn’t the Shoes page', (await top('shoes')).length === 2);
ok('…named for its page', /^The Shoes page: pin Canvas shoes$/.test((await get('searchRule', catPin._id))?.name || ''), (await get('searchRule', catPin._id))?.name);

/* ---- schedules */
const later = await make('searchRule', { when: 'exact', queries: ['silk'], action: 'hide', products: [prod.green._id], startsAt: new Date(Date.now() + 7 * 86400000).toISOString() });
await sleep(800);
ok('a rule that starts next week does nothing yet', (await top('silk')).includes('Green silk dress'));
await put('searchRule', later._id, { startsAt: new Date(Date.now() - 86400000).toISOString() });
ok('…started: it hides', await waitFor(async () => !(await top('silk')).includes('Green silk dress'), 5000));
await put('searchRule', later._id, { endsAt: new Date(Date.now() - 3 * 86400000).toISOString() });
ok('…ended: it stops', await waitFor(async () => (await top('silk')).includes('Green silk dress'), 5000));

/* ---- the editor's preview */
r = await call('POST', `${C}/search/rules/preview`, { rule: { when: 'exact', queries: ['dress'], action: 'pin', products: [prod.canvas._id], startsAt: new Date(Date.now() + 7 * 86400000).toISOString() } }, t);
ok('preview: before and after, explained, its dates ignored', r.status === 200 && r.body.ready && r.body.fires && r.body.after.doc[0].name === 'Canvas shoes' && r.body.after.doc[0].pinned === 1 && r.body.before.doc[0].name !== 'Canvas shoes', JSON.stringify(r.body).slice(0, 300));
r = await call('POST', `${C}/search/rules/preview`, { rule: { _id: catPin._id, when: 'category', category: shoes._id, action: 'pin', products: [prod.leather._id] } }, t);
ok('preview of a saved rule: “before” leaves the saved one out', r.status === 200 && r.body.before.doc[0].name !== 'Canvas shoes' || r.body.before.doc.length === 2, JSON.stringify(r.body.before).slice(0, 200));
ok('…“after” has the edit', r.body.after.doc[0].name === 'Leather shoes', JSON.stringify(r.body.after).slice(0, 200));
r = await call('POST', `${C}/search/rules/preview`, { rule: { when: 'exact', queries: [], action: 'pin' } }, t);
ok('preview of a half-made rule says what’s missing', r.status === 200 && !r.body.ready && /search/i.test(r.body.missing), JSON.stringify(r.body).slice(0, 200));
r = await call('POST', `${C}/search/rules/preview`, { rule: {} }, undefined);
ok('…signed in only', r.status === 401 || r.status === 403, String(r.status));

/* ---- what touches a search or a product */
await put('searchRule', pin._id, { active: true, products: [prod.old._id] });
r = await call('GET', `${C}/search/rules/touching?q=dress`, null, t);
ok('rules a search sets off', r.status === 200 && r.body.some(x => String(x._id) === String(pin._id) && x.live), JSON.stringify(r.body).slice(0, 300));
r = await call('GET', `${C}/search/rules/touching?product=${prod.old._id}`, null, t);
ok('rules that name a product (switched off ones too)', r.status === 200 && r.body.some(x => String(x._id) === String(pin._id)) && r.body.some(x => String(x._id) === String(hide._id) && !x.active), JSON.stringify(r.body).slice(0, 300));
r = await call('GET', `${C}/search/rules/touching?product=${prod.red._id}`, null, t);
ok('…by its brand too', r.body.some(x => String(x._id) === String(boost._id)), JSON.stringify(r.body).slice(0, 300));

/* ---- sidebar */
r = await call('GET', `${P}/sidebar/web/server`, null, t);
const flat = JSON.stringify(r.body || '');
ok('the sidebar has Search rules, not its plain table', flat.includes('/store/search/rules"') && !/"href":"\/search-rules"/.test(flat), flat.slice(0, 200));

/* ---- a store from before */
const old = await makeStore('Older merch shop');
{
	const pid = new ObjectId(old._id);
	const defs = await db.collection('modeldefinitions').find({ project: pid, name: 'SearchRule' }).toArray();
	for (const d of defs) {
		await db.collection('sidebaritems').deleteOne({ _id: d.sidebarItem });
		await db.collection('routeconfigs').deleteMany({ project: pid, route: d.route });
		await db.collection('apiendpoints').deleteMany({ project: pid, model: d.route });
	}
	await db.collection('modeldefinitions').deleteMany({ project: pid, name: 'SearchRule' });
	await db.collection('commercesettings').updateOne({ project: pid }, { $unset: { 'installed.searchRule': '' } });
}
r = await call('GET', `${old.C}/search/rules/touching?q=dress`, null, t);
ok('an older store: no rules, no error', r.status === 200 && Array.isArray(r.body) && !r.body.length, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: backend, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' });
let out = run();
ok('upgradeStores dry run: the older store would get Search rules', /Older merch shop:[\s\S]*?Search rules —/.test(out), out.split('\n').filter(l => /Older merch|Search rules/.test(l)).slice(0, 3).join(' | '));
run('--apply');
const after = (await db.collection('commercesettings').findOne({ project: new ObjectId(old._id) }))?.installed || {};
ok('…applied: it has them', after.searchRule?.route === 'search-rules', JSON.stringify(after.searchRule));

await call('DELETE', `/tenant/api/projects/${shop._id}?force=1`, null, t);
await call('DELETE', `/tenant/api/projects/${old._id}?force=1`, null, t);
await mc.close();
done();
