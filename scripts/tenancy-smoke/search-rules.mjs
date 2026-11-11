// Store search's synonyms and redirects (docs/search SI-10): a new store has Search synonyms and Search redirects; a
// synonym saved in the panel works at once (and is named for you); one-way goes one way; the starter packs switch on
// and off; a redirect comes with the answer and counts its uses; the panel's try route explains; a store from before
// gets both models from upgradeStores.js.
//
// Needs a local SMOKE_MONGO, SMOKE_BACKEND (a folder with a fresh `dist`, for upgradeStores.js) and the backend started
// with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000.
import { execFileSync } from 'child_process';
import { call, ok, done } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
const backend = process.env.SMOKE_BACKEND;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri) || !backend) {
	console.log('SKIP  search-rules — set a local SMOKE_MONGO and SMOKE_BACKEND');
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

let r = await call('POST', '/tenant/api/auth/register', { name: 'Rui Rules', email: `rui${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rules ${stamp}`, country: 'BD' });
const t = r.body?.token;
const makeStore = async name => {
	const p = (await call('POST', '/tenant/api/projects', { name, type: 'ecommerce' }, t)).body;
	const C = `/tenant/api/p/${p._id}/commerce`;
	await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
	await call('POST', `${C}/setup`, {}, t);
	await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);
	return { ...p, P: `/tenant/api/p/${p._id}`, C, inst: (await call('GET', `${C}/settings`, null, t)).body?.installed || {} };
};
const shop = await makeStore('Rules shop');
const { P, C, inst, publicSlug } = shop;
ok('a new store has Search synonyms and Search redirects', inst.searchSynonym?.route === 'search-synonyms' && inst.searchRedirect?.route === 'search-redirects', JSON.stringify([inst.searchSynonym, inst.searchRedirect]));
const make = (m, body) => call('POST', `${P}/${inst[m].route}`, body, t).then(x => x.body?.doc || x.body);
for (const [name, price] of [['White sneakers', 3900], ['Canvas sneakers', 3300], ['Knit sweater', 2800], ['Ribbed jumper', 2600], ['Chelsea boots', 7400]])
	await make('product', { name, price, status: 'active', productType: 'simple', trackStock: false });
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 5, 30000));
const S = q => call('GET', `/public/api/${publicSlug}/store/search?q=${encodeURIComponent(q)}`);

/* ---- synonyms from the panel */
r = await S('kicks');
ok('before: “kicks” finds nothing', r.body?.total === 0, JSON.stringify(r.body).slice(0, 200));
const syn = await make('searchSynonym', { kind: 'same', words: ['sneakers', 'kicks', 'trainers'] });
ok('a synonym saved', syn?._id, JSON.stringify(syn).slice(0, 200));
ok('…and named for you from its words', await waitFor(async () => (await call('GET', `${P}/${inst.searchSynonym.route}/${syn._id}`, null, t)).body?.doc?.name === 'sneakers, kicks, trainers' || (await call('GET', `${P}/${inst.searchSynonym.route}/${syn._id}`, null, t)).body?.name === 'sneakers, kicks, trainers', 5000));
ok('“kicks” now finds both sneakers, at once', await waitFor(async () => (await S('kicks')).body?.total === 2, 5000), JSON.stringify((await S('kicks')).body).slice(0, 300));
r = await S('kicks');
ok('…and says which synonym it used', r.body.query?.synonyms?.[0]?.word === 'kicks' && r.body.query.synonyms[0].with.includes('sneakers'), JSON.stringify(r.body.query));
const oneWay = await make('searchSynonym', { kind: 'one-way', words: ['jutta'], to: ['boots'] });
ok('one way: “jutta” finds the boots', await waitFor(async () => (await S('jutta')).body?.doc?.[0]?.name === 'Chelsea boots', 5000));
r = await S('boots');
ok('…“boots” doesn’t reach “jutta”', !r.body.query?.synonyms, JSON.stringify(r.body.query));
await call('PUT', `${P}/${inst.searchSynonym.route}/${syn._id}`, { active: false }, t);
ok('switched off: “kicks” finds nothing again', await waitFor(async () => (await S('kicks')).body?.total === 0, 5000));

/* ---- starter packs */
r = await call('GET', `${C}/search/packs`, null, t);
ok('the starter packs, all off', r.status === 200 && r.body.length >= 4 && r.body.every(p => !p.on && p.installed === 0 && p.size > 0), JSON.stringify(r.body).slice(0, 300));
const fashion = r.body.find(p => p.id === 'fashion-en');
r = await call('POST', `${C}/search/packs/fashion-en`, { on: true }, t);
ok('fashion switched on: its synonyms are the store’s', r.status === 200 && r.body.find(p => p.id === 'fashion-en')?.installed === fashion.size, JSON.stringify(r.body.find(p => p.id === 'fashion-en')));
r = await call('GET', `${P}/${inst.searchSynonym.route}?source=pack&limit=100`, null, t);
ok('…as rows in Search synonyms, from the pack', (r.body?.doc || []).length === fashion.size && r.body.doc.every(x => x.pack === 'fashion-en'), String(r.body?.doc?.length));
ok('“pullover” finds the sweater and the jumper', await waitFor(async () => (await S('pullover')).body?.total === 2, 5000), JSON.stringify((await S('pullover')).body?.doc?.map(d => d.name)));
r = await call('POST', `${C}/search/packs/fashion-en`, { on: true }, t);
ok('switching it on twice doesn’t double', r.body.find(p => p.id === 'fashion-en')?.installed === fashion.size);
r = await call('POST', `${C}/search/packs/fashion-en`, { on: false }, t);
ok('switched off: its rows go', r.body.find(p => p.id === 'fashion-en')?.installed === 0);
ok('…and “pullover” finds nothing', await waitFor(async () => (await S('pullover')).body?.total === 0, 5000));
r = await call('POST', `${C}/search/packs/no-such-pack`, { on: true }, t);
ok('an unknown pack: 404', r.status === 404, String(r.status));

/* ---- redirects */
const red = await make('searchRedirect', { queries: ['return', 'refund'], match: 'exact', url: '/returns' });
ok('a redirect saved', red?._id, JSON.stringify(red).slice(0, 200));
ok('“returns” comes with the page to open', await waitFor(async () => (await S('returns')).body?.redirect?.url === '/returns', 5000), JSON.stringify((await S('returns')).body).slice(0, 200));
r = await S('return policy');
ok('…exact: not with other words', !r.body.redirect);
const hits = async () => {
	const x = (await call('GET', `${P}/${inst.searchRedirect.route}/${red._id}`, null, t)).body;
	return (x?.doc || x)?.hits;
};
ok('…and counts its uses', await waitFor(async () => (await hits()) >= 1, 5000), String(await hits()));

/* ---- try */
await call('PUT', `${P}/${inst.searchSynonym.route}/${syn._id}`, { active: true }, t);
await sleep(300);
r = await call('GET', `${C}/search/try?q=kicks`, null, t);
ok('try: explained results, synonyms used', r.status === 200 && /synonym “sneakers”/.test(r.body.doc?.[0]?.explain || '') && r.body.query?.synonyms?.length === 1, JSON.stringify(r.body).slice(0, 300));
r = await call('GET', `${C}/search/try?q=kicks`, null, undefined);
ok('…signed in only', r.status === 401 || r.status === 403, String(r.status));

/* ---- a store from before */
const old = await makeStore('Older shop');
// As a store set up before SI-10: no Search synonyms / redirects models at all.
{
	const pid = new ObjectId(old._id);
	const defs = await db.collection('modeldefinitions').find({ project: pid, name: { $in: ['SearchSynonym', 'SearchRedirect'] } }).toArray();
	for (const d of defs) {
		await db.collection('sidebaritems').deleteOne({ _id: d.sidebarItem });
		await db.collection('routeconfigs').deleteMany({ project: pid, route: d.route });
		await db.collection('apiendpoints').deleteMany({ project: pid, model: d.route });
	}
	await db.collection('modeldefinitions').deleteMany({ project: pid, name: { $in: ['SearchSynonym', 'SearchRedirect'] } });
	await db.collection('commercesettings').updateOne({ project: pid }, { $unset: { 'installed.searchSynonym': '', 'installed.searchRedirect': '' } });
}
const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: backend, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' });
let out = run();
ok('upgradeStores dry run: the older store would get both', /Older shop:[\s\S]*?Search synonyms — [\s\S]*?Search redirects —/.test(out), out.split('\n').filter(l => /Older shop|Search/.test(l)).slice(0, 4).join(' | '));
out = run('--apply');
const after = (await db.collection('commercesettings').findOne({ project: new ObjectId(old._id) }))?.installed || {};
ok('…applied: it has them', after.searchSynonym?.route && after.searchRedirect?.route, JSON.stringify([after.searchSynonym, after.searchRedirect]));
r = await call('POST', `${old.C}/search/packs/grocery-en`, { on: true }, t);
ok('…and its packs work', r.status === 200 && r.body.find(p => p.id === 'grocery-en')?.on, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

await call('DELETE', `/tenant/api/projects/${shop._id}?force=1`, null, t);
await call('DELETE', `/tenant/api/projects/${old._id}?force=1`, null, t);
await mc.close();
done();
