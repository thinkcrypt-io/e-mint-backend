import fs from 'fs';
import path from 'path';
import { docFor } from '../document';
import { memoryDriver } from '../drivers/memory';
import { clearSearchCache, searchWith, type SearchRequest } from '../engine';
import { fewerWords, nearestWord } from '../recover';
import { planQuery } from '../engine';
import { SEARCH_DEFAULTS, type SearchSettings } from '../settings';
import { dropVocab, makeVocab } from '../vocab';

// docs/search SI-11: no dead ends (SI12) — over the HINT demo catalogue, as engine.test.ts.

const catalogue: any[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/hint-catalogue.json'), 'utf8'));
const catId = (name: string) => `cat-${name}`;
const tree = new Map<string, any>([...new Set(catalogue.map(p => p.category))].map(n => [catId(n), { _id: catId(n), name: n }]));
tree.set(catId('Fashion'), { _id: catId('Fashion'), name: 'Fashion' });
tree.set(catId('Sarees'), { _id: catId('Sarees'), name: 'Sarees', parent: catId('Fashion') });
const ctx = { tree, brands: new Map<string, any>([['b-aarong', { _id: 'b-aarong', name: 'Aarong' }]]), collections: new Map<string, any>(), custom: [] as string[] };

let n = 0;
const product = (p: any) => ({ _id: `p${String(++n).padStart(4, '0')}`, status: 'active', trackStock: false, ...p, images: p.image ? [p.image] : [] });
const docs: any[] = [];
const add = (p: any, variants: any[] = []) => {
	const pr = product(p);
	docs.push({ ...docFor(pr, variants, ctx), status: 'active' });
	return pr;
};
for (const p of catalogue) add({ ...p, category: catId(p.category) });
// A few more: Bangla names, a SKU, a T-shirt, sizes, a brand.
add({ name: 'জামদানি শাড়ি', category: catId('Sarees'), price: 9500, brand: 'b-aarong' });
add({ name: 'Jamdani Saree', category: catId('Sarees'), price: 8800 });
add({ name: 'পাঞ্জাবি', category: catId('Fashion'), price: 3200 });
add({ name: 'Graphic T-Shirt', category: catId('Clothes'), price: 900, sku: 'HN-2041' });
add({ name: 'Cotton Polo', category: catId('Clothes'), price: 1500, trackStock: true, productType: 'variation' }, [
	{ sku: 'POLO-S', price: 1500, totalStock: 3, optionValues: [{ name: 'Size', value: 'S' }, { name: 'Colour', value: 'Navy' }] },
	{ sku: 'POLO-M', price: 1500, totalStock: 0, optionValues: [{ name: 'Size', value: 'M' }, { name: 'Colour', value: 'Navy' }] },
]);

const S = (o: Partial<SearchSettings> = {}): SearchSettings => ({ ...SEARCH_DEFAULTS, ...o, dials: { ...SEARCH_DEFAULTS.dials, ...(o.dials || {}) } });
const search = (q: string, more: SearchRequest = {}, s = S()) => searchWith(memoryDriver(docs, 'recover'), s, { q, limit: 24, ...more });
beforeEach(() => {
	clearSearchCache();
	dropVocab();
});

describe('every word found: nothing changes', () => {
	it.each(['leather tote', 'candle', 'jcaket'])('%s', async q => {
		const r = await search(q);
		expect(r.total).toBeGreaterThan(0);
		expect(r.showing).toBeUndefined();
		expect(r.fallback).toBeUndefined();
		expect(r.didYouMean).toBeUndefined();
	});
});

describe('fewer words', () => {
	it('a word no product has is left out, and said', async () => {
		const r = await search('blue linen shirt');
		expect(r.showing).toEqual({ q: 'linen shirt', reason: 'fewer words', dropped: ['blue'] });
		expect(r.doc.map(d => d.name)).toEqual(['Linen shirt']);
	});
	it('the words no single product has together: the rarer one stays', async () => {
		const r = await search('leather jacket');
		expect(r.showing).toMatchObject({ q: 'jacket', dropped: ['leather'] });
		expect(r.doc.every(d => /jacket/i.test(d.name))).toBe(true);
	});
	it('spelled as the store writes it', async () => {
		expect((await search('lether jaket')).showing?.q).toBe('jacket');
	});
	it('…ranked as if the left-out word was never typed', async () => {
		const r = await search('denim velvet jacket', { explain: true });
		expect(r.doc[0].name).toBe('Denim jacket');
		expect(r.doc[0].explain).not.toMatch(/coverage/);
	});
	it('at least half the words stay: one word of three is “some words”', async () => {
		const r = await search('red velvet saree');
		// No product has two of the words: products with “red” or “saree”, said.
		expect(r.showing).toEqual({ q: 'red saree', reason: 'some words', dropped: ['velvet'] });
		expect(r.doc.map(d => d.name)).toEqual(expect.arrayContaining(['Red berry candle', 'Jamdani Saree']));
		expect(r.fallback).toBeUndefined();
	});
	it('a list of things, no product has them all: each with one, best first', async () => {
		const r = await search('jacket candle watch');
		expect(r.showing).toMatchObject({ reason: 'some words', dropped: [] });
		expect(r.total).toBeGreaterThan(5);
	});
});

describe('filters read from the words are set aside first', () => {
	it('a price nothing is under: every price, and says so', async () => {
		const r = await search('candle under 10');
		expect(r.understood).toMatchObject({ price: { lte: 10 }, relaxed: true });
		expect(r.total).toBeGreaterThan(0);
		expect(r.showing).toBeUndefined();
	});
	it('the shopper’s own filters stay', async () => {
		const r = await search('candle', { filters: { price: { lte: 10 } } });
		expect(r.total).toBe(0);
		expect(r.understood?.relaxed).toBeFalsy();
	});
});

describe('looser typos', () => {
	it('when typos are “normal”, two typos in a long word are tried', async () => {
		const normal = await search('lethaer', {}, S({ typos: 'off' }));
		expect(normal.total).toBe(0);
		const r = await search('caemras');
		expect(r.total).toBeGreaterThan(0);
	});
	it('…never two typos in a short word (“kicks” is not “kit”)', async () => {
		const r = await search('kicks');
		expect(r.total).toBe(0);
		expect(r.showing).toBeUndefined();
	});
	it('a store with typos off gets none', async () => {
		expect((await search('jcaket', {}, S({ typos: 'off' }))).total).toBe(0);
	});
});

describe('nothing at all', () => {
	it('did you mean: the store’s nearest word, the first letter may differ', async () => {
		const r = await search('ackets');
		expect(r.total).toBe(0);
		expect(r.didYouMean).toBe('jacket');
	});
	it('no near word: no did you mean, still products to look at', async () => {
		const r = await search('zzzq');
		expect(r.didYouMean).toBeUndefined();
		expect(r.fallback).toMatchObject({ kind: 'popular' });
		expect(r.fallback!.doc.length).toBe(8);
	});
	it('a category the query named: its popular products', async () => {
		const r = await search('photography', { filters: { price: { lte: 1 } } });
		expect(r.total).toBe(0);
		expect(r.fallback?.kind).toBe('category');
		expect(r.fallback?.category?.name).toBe('Photography');
	});
});

describe('the helpers', () => {
	const vocab = makeVocab(3, [['jacket', 2], ['jackets', 1], ['saree', 1]], ['jacket', 'saree', 'denim'], []);
	it('nearestWord', () => {
		expect(nearestWord(vocab, 'jakcet')).toBe('jacket');
		expect(nearestWord(vocab, 'sree')).toBe('saree');
		expect(nearestWord(vocab, 'jacket')).toBeNull(); // the store has it
		expect(nearestWord(vocab, 'ab')).toBeNull(); // too short
		expect(nearestWord(vocab, 'zebra')).toBeNull();
	});
	it('fewerWords: none for one word, or when nothing matched', () => {
		const { plan } = planQuery('jacket', vocab, S());
		expect(fewerWords(plan, [])).toBeNull();
	});
});
