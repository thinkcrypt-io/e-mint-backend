// Store search: no dead ends (docs/search SI-11), on the real database. A search with a word no product has drops
// it and says so; a far-off spelling is tried; a price nothing is under is set aside; nothing at all gives "did you
// mean" and popular products; the panel's try route shows the same.
//
// Needs the backend started with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000 (a local SMOKE_MONGO is not needed).
import { call, ok, done } from './lib.mjs';

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

let r = await call('POST', '/tenant/api/auth/register', { name: 'Rafi Recover', email: `rafi${stamp}@example.com`, password: 'tenant-pass-123', organization: `Recover ${stamp}`, country: 'BD' });
const t = r.body?.token;
const p = (await call('POST', '/tenant/api/projects', { name: 'Recover shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
ok('store ready', await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000));
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const items = [
	['Linen shirt', 2200],
	['Denim jacket', 5400],
	['Quilted jacket', 6100],
	['Leather tote bag', 4800],
	['Leather wallet', 1900],
	['Leather belt', 1200],
	['Oud candle', 900],
	['Fig candle', 850],
	['Cotton socks', 300],
];
for (const [name, price] of items) await call('POST', `${P}/${inst.product.route}`, { name, price, status: 'active', productType: 'simple', trackStock: false }, t);
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === items.length, 30000));
const S = q => call('GET', `/public/api/${p.publicSlug}/store/search?q=${encodeURIComponent(q)}`).then(x => x.body);
const names = b => (b?.doc || []).map(d => d.name);

let b = await S('leather tote');
ok('every word found: as before, nothing said', b.doc?.[0]?.name === 'Leather tote bag' && !b.showing && !b.fallback && !b.didYouMean, JSON.stringify(b).slice(0, 200));

b = await S('blue linen shirt');
ok('a word no product has is left out', names(b).join() === 'Linen shirt', JSON.stringify(names(b)));
ok('…and said: showing results for “linen shirt”', b.showing?.q === 'linen shirt' && b.showing.reason === 'fewer words' && b.showing.dropped?.[0] === 'blue', JSON.stringify(b.showing));

b = await S('leather jacket');
ok('words no product has together: the rarer one stays', b.showing?.q === 'jacket' && names(b).every(n => /jacket/i.test(n)) && b.total === 2, JSON.stringify([b.showing, names(b)]));

b = await S('red velvet sock');
ok('one word of three isn’t a smaller query: products with some of the words, said', names(b).join() === 'Cotton socks' && b.showing?.reason === 'some words' && b.showing.q === 'sock' && !b.fallback, JSON.stringify([names(b), b.showing]));

b = await S('xqzv blorp');
ok('nothing at all: popular products', b.total === 0 && !b.showing && b.fallback?.kind === 'popular' && b.fallback.doc.length === 8, JSON.stringify([b.total, b.fallback?.kind, b.fallback?.doc?.length]));

b = await S('walrett');
ok('a far-off spelling of a long word is tried', b.total === 1 && b.showing?.reason === 'typos' && b.showing.q === 'wallet', JSON.stringify([b.total, b.showing]));

b = await S('kicks');
ok('…never two typos in a short word', b.total === 0, JSON.stringify(names(b)));

b = await S('candle under 100');
ok('a price nothing is under: every price, and says so', b.total === 2 && b.understood?.relaxed === true && b.understood.price?.lte === 100, JSON.stringify([b.total, b.understood]));

b = await S('ackets');
// Search by meaning (SI-19) may also show the closest products; "Did you mean" is said either way.
ok('nothing at all: did you mean the store’s word', (b.total === 0 || b.showing?.reason === 'meaning') && b.didYouMean === 'jacket', JSON.stringify([b.total, b.didYouMean, b.showing]));
ok('…with products to look at', (b.fallback?.doc?.length > 0 && b.fallback.doc[0].name) || (b.showing?.reason === 'meaning' && b.doc.length > 0), JSON.stringify(b.fallback || b.showing || null).slice(0, 200));

r = await call('GET', `${C}/search/try?q=${encodeURIComponent('blue linen shirt')}`, null, t);
ok('the panel’s try box shows it too', r.status === 200 && r.body.showing?.q === 'linen shirt' && /name/.test(r.body.doc?.[0]?.explain || ''), JSON.stringify(r.body).slice(0, 200));

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
done();
