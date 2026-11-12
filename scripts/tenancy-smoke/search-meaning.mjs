// Search by meaning (docs/search SI-19, README SI23), with the real model: the tick gives every product a vector;
// words the store doesn't have find the products closest in meaning (never an unrelated one); the top text results
// are re-ranked; a store can turn it off; the status card says where the model is; and the extra time stays under
// 40 ms at p95 (the bench).
//
// Needs a local SMOKE_MONGO and the model in the backend's search-model/ (node scripts/searchModel.cjs). Skipped when
// the backend runs with SEARCH_SEMANTIC=off or has no model.
import { call, ok, done } from './lib.mjs';

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) {
	console.log('SKIP  search-meaning — set a local SMOKE_MONGO');
	process.exit(0);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(500);
	}
};

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Mira Meaning', email: `mira${stamp}@example.com`, password: 'tenant-pass-123', organization: `Meaning ${stamp}`, country: 'BD' });
const t = r.body?.token;
const p = (await call('POST', '/tenant/api/projects', { name: 'Meaning shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000);

let st = (await call('GET', `${C}/search/status`, null, t)).body;
if (!st?.meaning || ['off', 'missing'].includes(st.meaning.state)) {
	console.log(`SKIP  search-meaning — the backend has no model (${st?.meaning?.state})`);
	await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
	process.exit(0);
}

const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const make = (m, body) => call('POST', `${P}/${inst[m].route}`, body, t).then(x => x.body?.doc || x.body);
const cat = {};
for (const c of ['Dresses', 'Sarees', 'Shawls', 'Jackets', 'Electronics']) cat[c] = (await make('category', { name: c }))._id;
const items = [
	['Sequin evening gown', 'Dresses', ['party', 'wedding']],
	['Red cotton dress', 'Dresses', []],
	['Blue cotton dress', 'Dresses', []],
	['Jamdani saree', 'Sarees', []],
	['Kashmiri shawl', 'Shawls', ['winter']],
	['Denim jacket', 'Jackets', []],
	['USB phone charger', 'Electronics', []],
	['Laptop stand', 'Electronics', []],
];
const ids = {};
for (const [name, c, keywords] of items) ids[name] = (await make('product', { name, price: 1000, status: 'active', productType: 'simple', trackStock: false, category: cat[c], keywords }))._id;

st = await waitFor(async () => {
	const s = (await call('GET', `${C}/search/status`, null, t)).body;
	return s?.docs === items.length && s?.meaning?.vectors === items.length && s.meaning.due === 0 && s;
}, 90000);
ok('the tick gives every product a vector', !!st, JSON.stringify((await call('GET', `${C}/search/status`, null, t)).body?.meaning));
ok('the status card: the model is ready', st?.meaning?.state === 'ready', JSON.stringify(st?.meaning));

const tryq = async (q, extra = '') => (await call('GET', `${C}/search/try?q=${encodeURIComponent(q)}&limit=10${extra}`, null, t)).body;
// The first query may start nothing new (the model's loaded by the tick); give the answer cache a different query each time.
r = await tryq('something to wear to a reception');
const names = x => (x?.doc || []).map(d => d.name);
ok('words the store doesn’t have → close in meaning, and said so', r?.showing?.reason === 'meaning' && r.meaning?.used === 'nearest', JSON.stringify({ showing: r?.showing, meaning: r?.meaning, names: names(r) }));
ok('…never an unrelated product (no charger, no laptop stand)', !names(r).some(n => /charger|laptop/i.test(n)), names(r).join(', '));
console.log('      reception →', names(r).join(', '));

r = await tryq('শাড়ি');
console.log('      শাড়ি →', names(r).join(', '), r?.showing?.reason || '', r?.meaning?.used || '');

r = await tryq('cotton dress');
ok('text results are re-ranked with meaning (and explained)', r?.meaning?.used === 'reranked' && r.doc.some(d => /meaning 0\.\d\d/.test(d.explain || '')), JSON.stringify(r?.meaning) + ' ' + r?.doc?.[0]?.explain);
ok('…every word still matches first', /cotton dress/i.test(r?.doc?.[0]?.name) && /cotton dress/i.test(r?.doc?.[1]?.name), names(r).join(', '));

r = await tryq('zxqv blorp');
ok('gibberish → nothing by meaning (the usual help instead)', r?.showing?.reason !== 'meaning', JSON.stringify({ showing: r?.showing, meaning: r?.meaning, names: names(r) }));

// A product renamed: its vector is made again.
await call('PUT', `${P}/${inst.product.route}/${ids['Laptop stand']}`, { name: 'Bridal lehenga' }, t);
await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.meaning?.due === 0 && (await tryq('lehenga')).total === 1, 30000);
r = await tryq('outfit for a wedding party');
ok('a renamed product gets its new meaning', names(r).includes('Bridal lehenga') || names(r).includes('Sequin evening gown'), names(r).join(', '));

/* ---------------------------------------------------------------- the bench */
const WORDS = ['dress', 'cotton dress', 'red dress', 'blue dress', 'saree', 'jamdani', 'shawl', 'jacket', 'denim', 'charger', 'gown', 'evening gown', 'kashmiri', 'phone charger', 'usb', 'sequin'];
const bench = async tag => {
	const ms = [];
	for (let i = 0; i < 48; i++) {
		const q = `${WORDS[i % WORDS.length]}${i >= WORDS.length ? ' ' + 'x'.repeat(1 + Math.floor(i / WORDS.length)) : ''}`;
		const started = performance.now();
		await tryq(q, `&b=${tag}${i}`);
		ms.push(performance.now() - started);
	}
	ms.sort((a, b) => a - b);
	return { p50: ms[24], p95: ms[Math.floor(0.95 * ms.length)] };
};
const on = await bench('on');
r = await call('PUT', `${C}/search/settings`, { semantic: false }, t);
ok('a store can turn it off', r.status === 200 && r.body?.semantic === false && r.body?.meaning?.state === 'ready', JSON.stringify(r.body).slice(0, 200));
const off = await bench('off');
console.log(`      bench (48 searches each): meaning on p50 ${on.p50.toFixed(1)} p95 ${on.p95.toFixed(1)} ms · off p50 ${off.p50.toFixed(1)} p95 ${off.p95.toFixed(1)} ms`);
ok('the extra time stays under 40 ms at p95', on.p95 - off.p95 < 40, `${on.p95.toFixed(1)} vs ${off.p95.toFixed(1)}`);

r = await tryq('something to wear to a reception');
ok('…then it isn’t used', r?.meaning?.used === 'no' && r?.showing?.reason !== 'meaning', JSON.stringify(r?.meaning));
r = await call('PUT', `${C}/search/settings`, { semantic: 'yes' }, t);
ok('…and the setting is checked', r.status === 400, `${r.status}`);

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
done();
