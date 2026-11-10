import fs from 'fs';
import path from 'path';
import { docFor } from '../document';
import { memoryDriver } from '../drivers/memory';
import { clearSearchCache, searchWith, suggestWith, type SearchRequest } from '../engine';
import { SEARCH_DEFAULTS, type SearchSettings } from '../settings';
import { dropVocab, editDistance, makeVocab, nearWords, typosFor } from '../vocab';

// docs/search SI-04: the engine over the HINT demo catalogue (243 products, 13 categories) plus a few made-up ones —
// the relevance suite (each query's expected top results), typos, Banglish, codes, filters and their counts, browse,
// suggestions, out of stock and popularity. The database driver is covered by scripts/tenancy-smoke/search-engine.mjs.

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
const driver = () => memoryDriver(docs, 'hint');
const search = (q: string, more: SearchRequest = {}, s = S()) => searchWith(driver(), s, { q, limit: 24, ...more });
const names = async (q: string, k = 3, more: SearchRequest = {}) => (await search(q, more)).doc.slice(0, k).map(d => d.name);

beforeEach(() => {
	clearSearchCache();
	dropVocab();
});

/* ------------------------------------------------------------ the relevance suite */

// [query, the names expected in the top results (any order), how many top results to look at]
const SUITE: [string, string[], number?][] = [
	['coat', ['Wool blend coat', 'Double-breasted coat'], 2],
	['coats', ['Wool blend coat', 'Double-breasted coat'], 2],
	['jacket', ['Quilted jacket', 'Denim jacket'], 2],
	['jaket', ['Quilted jacket', 'Denim jacket'], 2],
	['denim jacket', ['Denim jacket'], 1],
	['jacket denim', ['Denim jacket'], 1],
	['shirt', ['Linen shirt', 'Oxford shirt'], 2],
	['shirts', ['Linen shirt', 'Oxford shirt'], 2],
	['oxford', ['Oxford shirt'], 1],
	['oxfrod', ['Oxford shirt'], 1],
	['sweater', ['Knit sweater'], 1],
	['jumper', ['Ribbed jumper'], 1],
	['jeans', ['Straight-leg jeans'], 1],
	['dress', ['Midi dress', 'Wrap dress'], 3],
	['vase', ['Ceramic vase', 'Stoneware vase', 'Glass vase'], 3],
	['vases', ['Ceramic vase', 'Stoneware vase', 'Glass vase'], 3],
	['bust', ['Marble bust', 'Plaster bust'], 2],
	['canvas', ['Abstract canvas print', 'Canvas backpack', 'Canvas sneakers'], 3],
	['leather tote', ['Leather tote bag'], 1],
	['backpack', ['Leather backpack', 'Canvas backpack'], 2],
	['bakpack', ['Leather backpack', 'Canvas backpack'], 2],
	['tote', ['Leather tote bag'], 1],
	['handbag', ['Mini handbag'], 1],
	['clutch', ['Clutch'], 1],
	['laptop bag', ['Laptop bag'], 1],
	['camera bag', ['Camera bag'], 1],
	['gold ring', ['Gold band ring'], 1],
	['silver ring', ['Silver band ring'], 1],
	['emerald', ['Emerald stone ring'], 1],
	['emrald', ['Emerald stone ring'], 1],
	['saphire', ['Sapphire ring'], 1],
	['stone ring', ['Emerald stone ring', 'Ruby stone ring'], 2],
	['signet', ['Onyx signet ring', 'Signet ring', 'Square signet'], 3],
	['tennis bracelet', ['Tennis bracelet'], 1],
	['braclet tennis', ['Tennis bracelet'], 1],
	['jhumka', ['Jhumka earrings'], 1],
	['hoop earrings', ['Gold hoop earrings'], 1],
	['huggie', ['Huggie earrings'], 1],
	['studs', ['Pearl studs', 'Crystal studs', 'Star studs'], 7],
	['mirrorless', ['Mirrorless camera'], 1],
	['camra', ['Film camera', 'Instant camera', 'Mirrorless camera', 'Compact camera', 'Action camera', 'Medium format camera'], 9], // 9 names hold "camera"
	['50mm', ['Prime lens 50mm'], 1],
	['85mm lens', ['Portrait lens 85mm'], 1],
	['zoom lens', ['Zoom lens'], 1],
	['tripod', ['Tripod'], 1],
	['vanilla', ['Vanilla candle'], 1],
	['vanila', ['Vanilla candle'], 1],
	['lavender candle', ['Lavender candle'], 1],
	['sandalwood', ['Sandalwood candle'], 1],
	['rose gold', ['Rose gold watch'], 1],
	['sneakers', ['White sneakers', 'Canvas sneakers', 'Slip-on sneakers'], 6],
	['snekers', ['White sneakers', 'Canvas sneakers'], 6],
	['chelsea', ['Chelsea boots'], 1],
	['chelsea boot', ['Chelsea boots'], 1],
	['running shoes', ['Running shoes'], 1],
	['diver watch', ['Diver watch'], 1],
	['smart watch', ['Smart fitness watch'], 1],
	['leather watch', ['Classic leather watch'], 1],
	['chronograph', ['Chronograph watch'], 1],
	['chronogarph', ['Chronograph watch'], 1],
	['WOOL BLEND COAT', ['Wool blend coat'], 1],
	['wool-blend coat', ['Wool blend coat'], 1],
	['oxf', ['Oxford shirt'], 1],
	['espadril', ['Espadrilles'], 1],
	['moccasin', ['Moccasins'], 1],
	['t shirt', ['Graphic T-Shirt'], 1],
	['tshirt', ['Graphic T-Shirt'], 1],
	['HN-2041', ['Graphic T-Shirt'], 1],
	['hn2041', ['Graphic T-Shirt'], 1],
	['polo-m', ['Cotton Polo'], 1],
	['শাড়ি', ['জামদানি শাড়ি', 'Jamdani Saree'], 2],
	['saree', ['Jamdani Saree', 'জামদানি শাড়ি'], 2],
	['shari', ['জামদানি শাড়ি', 'Jamdani Saree'], 2],
	['jamdani', ['Jamdani Saree', 'জামদানি শাড়ি'], 2],
	['punjabi', ['পাঞ্জাবি'], 1],
	['aarong', ['জামদানি শাড়ি'], 1],
	['navy polo', ['Cotton Polo'], 1],
];

describe('the relevance suite', () => {
	it(`has at least 60 queries (${SUITE.length})`, () => expect(SUITE.length).toBeGreaterThanOrEqual(60));
	it.each(SUITE)('%s', async (q, want, k = want.length) => {
		const got = await names(q, k);
		for (const w of want) expect(got).toContain(w);
	});
});

describe('ranking', () => {
	it('puts name matches ahead of category and description matches', async () => {
		const r = await search('ring');
		expect(r.doc.slice(0, 10).every(d => /ring/i.test(d.name))).toBe(true);
	});

	it('finds whole matches before partial ones, the words together first', async () => {
		const r = await search('gold watch');
		expect(r.doc.slice(0, 2).map(d => d.name)).toEqual(['Rose gold watch', 'Gold-tone watch']);
		const firstPartial = r.doc.findIndex(d => !/gold/i.test(d.name) || !/watch/i.test(d.name));
		expect(firstPartial).toBe(2);
		expect(r.total).toBeGreaterThan(2);
	});

	it('still answers when no product has every word', async () => {
		const r = await search('velvet candle');
		expect(r.total).toBeGreaterThan(0);
		expect(r.doc[0].name).toMatch(/candle/i);
	});

	it('finds nothing for nonsense', async () => {
		expect((await search('xyzzyq')).total).toBe(0);
	});

	it('tells what it read and which spellings it tried', async () => {
		const r = await search('Emrald Ring');
		expect(r.query.words).toEqual(['emrald', 'ring']);
		expect(r.query.typos).toEqual([{ word: 'emrald', tried: ['emerald'] }]);
	});

	it('explains a score', async () => {
		const r = await search('denim jacket', { explain: true });
		expect(r.doc[0].explain).toMatch(/name exact “denim” 10/);
		expect(r.doc[0].explain).toMatch(/phrase in the name ×1.2/);
		expect(r.doc[0].score).toBeGreaterThan(r.doc[1].score);
		expect((await search('denim jacket')).doc[0].explain).toBeUndefined();
	});

	it('never lets a Banglish key stand in for a near spelling', async () => {
		expect(await names('vanila', 1)).toEqual(['Vanilla candle']); // not "bangle", which shares its key
		expect(await names('camra', 1)).toEqual([expect.stringMatching(/camera/i)]);
	});

	it('lets typos be switched off', async () => {
		expect((await search('emrald', {}, S({ typos: 'off' }))).total).toBe(0);
		expect((await search('emerald', {}, S({ typos: 'off' }))).total).toBe(1);
	});

	it('lets Banglish be switched off', async () => {
		const r = await search('shari', {}, S({ banglish: false }));
		expect(r.doc.map(d => d.name)).not.toContain('জামদানি শাড়ি');
	});
});

describe('stock and popularity', () => {
	const pair = () => {
		const a = docFor(product({ name: 'Linen kurta', price: 1000, trackStock: true, totalStock: 0 }), [], ctx);
		const b = docFor(product({ name: 'Linen kurta', price: 1000, trackStock: true, totalStock: 5 }), [], ctx);
		return [a, b];
	};
	it('lists out-of-stock products after in-stock ones', async () => {
		const [out, inn] = pair();
		const r = await searchWith(memoryDriver([out, inn], 'k1'), S(), { q: 'kurta' });
		expect(r.doc.map(d => d.inStock)).toEqual([true, false]);
	});
	it('hides them when the store says so', async () => {
		const [out, inn] = pair();
		const r = await searchWith(memoryDriver([out, inn], 'k2'), S({ outOfStock: 'hide' }), { q: 'kurta' });
		expect(r.doc.map(d => d.inStock)).toEqual([true]);
	});
	it('puts the best seller first among equals, and the dial can switch it off', async () => {
		const a = docFor(product({ name: 'Silk scarf', price: 900 }), [], ctx);
		const b = { ...docFor(product({ name: 'Silk scarf', price: 900 }), [], ctx), signals: { sold30: 40, views: 500, wishes: 9 } };
		expect((await searchWith(memoryDriver([a, b], 'k3'), S(), { q: 'scarf' })).doc[0]._id).toBe(b.product);
		const off = await searchWith(memoryDriver([b, a], 'k4'), S({ dials: { popularity: 'off' } as any }), { q: 'scarf', explain: true });
		expect(off.doc[0].explain).not.toMatch(/popular/);
	});
	it('never lets popularity beat a better text match', async () => {
		const exact = docFor(product({ name: 'Rope bracelet' }), [], ctx);
		const pop = { ...docFor(product({ name: 'Rope', description: 'bracelet' }), [], ctx), signals: { sold30: 10000, views: 1e6, wishes: 1e4 } };
		expect((await searchWith(memoryDriver([pop, exact], 'k5'), S(), { q: 'rope bracelet' })).doc[0].name).toBe('Rope bracelet');
	});
});

describe('filters and their counts', () => {
	it('filters by price', async () => {
		const all = await search('bag');
		const r = await search('bag', { filters: { price: { lte: 8000 } } });
		expect(r.total).toBeGreaterThan(0);
		expect(r.total).toBeLessThan(all.total);
		expect(r.doc.every(d => (d.salePrice ?? d.price) <= 8000)).toBe(true);
	});

	it('counts each filter ignoring its own choice', async () => {
		const all = await search('ring', { facets: true });
		const ear = all.facets!.categories.find(c => c._id === catId('Ring'))!;
		expect(ear.count).toBeGreaterThan(0);
		const picked = await search('ring', { facets: true, filters: { categories: [catId('Ring')] } });
		expect(picked.total).toBe(ear.count);
		// Categories still show the others' counts.
		expect(picked.facets!.categories.length).toBe(all.facets!.categories.length);
	});

	it('filters by option values, any case', async () => {
		const r = await search('polo', { facets: true, filters: { opts: { size: ['m'] } } });
		expect(r.doc.map(d => d.name)).toEqual(['Cotton Polo']);
		expect(r.facets!.opts.size.name).toBe('Size');
		expect(r.facets!.opts.size.values.map(o => o.label).sort()).toEqual(['M', 'S']);
		expect(r.facets!.opts.colour.values).toEqual([{ value: 'navy', label: 'Navy', count: 1 }]);
		expect((await search('polo', { filters: { opts: { Size: ['XL'] } } })).total).toBe(0);
	});

	it('gives price ranges on friendly numbers', async () => {
		const r = await search('candle', { facets: true });
		const b = r.facets!.price.buckets;
		expect(b.length).toBeGreaterThan(0);
		expect(b.length).toBeLessThanOrEqual(6);
		for (const x of b) expect(x.from % 50).toBe(0);
		expect(b.reduce((s, x) => s + x.count, 0)).toBe(r.total);
	});

	it('sorts by price', async () => {
		const r = await search('watch', { sort: 'price' });
		const ps = r.doc.map(d => d.salePrice ?? d.price);
		expect([...ps].sort((a, b) => a - b)).toEqual(ps);
	});

	it('pages', async () => {
		const p1 = await search('ring', { limit: 5 });
		const p2 = await search('ring', { limit: 5, page: 2 });
		expect(p1.doc).toHaveLength(5);
		expect(p2.doc[0]._id).not.toBe(p1.doc[0]._id);
		expect(p1.totalPages).toBe(Math.ceil(p1.total / 5));
	});
});

describe('browse (no words: a category page)', () => {
	it('lists a category with the ones under it, with counts', async () => {
		const r = await searchWith(driver(), S(), { filters: { categories: [catId('Fashion')] }, facets: true });
		expect(r.doc.map(d => d.name).sort()).toEqual(['Jamdani Saree', 'জামদানি শাড়ি', 'পাঞ্জাবি'].sort());
		expect(r.facets!.categories.find(c => c._id === catId('Sarees'))?.count).toBe(2);
	});
	it('sorts and pages', async () => {
		const r = await searchWith(driver(), S(), { filters: { categories: [catId('Watch')] }, sort: '-price', limit: 4 });
		expect(r.doc).toHaveLength(4);
		const ps = r.doc.map(d => d.price);
		expect([...ps].sort((a, b) => b - a)).toEqual(ps);
		expect(r.total).toBe(catalogue.filter(p => p.category === 'Watch').length);
	});
});

describe('suggestions', () => {
	it('completes the last word with the store’s own words', async () => {
		const s = await suggestWith(driver(), S(), 'snea');
		expect(s.queries).toContain('sneakers');
		expect(s.products[0].name).toMatch(/sneakers/i);
	});
	it('keeps the words before', async () => {
		const s = await suggestWith(driver(), S(), 'leather b');
		expect(s.queries.some(q => q.startsWith('leather b'))).toBe(true);
		expect(s.products.every(p => /leather/i.test(p.name) || /leather/i.test(p.description || 'leather'))).toBe(true);
	});
	it('names categories and brands among the products', async () => {
		const s = await suggestWith(driver(), S(), 'cam');
		expect(s.categories[0].name).toBe('Photography');
		const b = await suggestWith(driver(), S(), 'aaro');
		expect(b.brands[0]?.name).toBe('Aarong');
	});
	it('works from one letter, and is empty for nothing', async () => {
		expect((await suggestWith(driver(), S(), 'v')).products.length).toBeGreaterThan(0);
		expect(await suggestWith(driver(), S(), '   ')).toMatchObject({ queries: [], products: [] });
	});
});

describe('typos and the vocabulary', () => {
	it('measures edits with swaps', () => {
		expect(editDistance('shirt', 'shirt')).toBe(0);
		expect(editDistance('shirt', 'shrit')).toBe(1);
		expect(editDistance('emrald', 'emerald')).toBe(1);
		expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3);
	});
	it('allows typos by length', () => {
		expect(['bag', 'ring', 'jacket', 'bracelet', 'chronograph'].map(w => typosFor(w, 'normal'))).toEqual([0, 1, 1, 2, 2]);
		expect(typosFor('bag', 'loose')).toBe(1);
		expect(typosFor('bracelet', 'off')).toBe(0);
	});
	it('needs the first letter (or a swap of the first two)', () => {
		const v = makeVocab(3, [['shirt', 3], ['skirt', 1], ['hsirt', 0]], ['shirt', 'skirt'], []);
		expect(nearWords(v, 'shrit', 1).map(n => n.word)).toEqual(['shirt']);
		expect(nearWords(v, 'hsirt', 1).map(n => n.word)).toContain('shirt');
		expect(nearWords(v, 'xhirt', 1)).toEqual([]);
	});
});

describe('speed (in memory)', () => {
	it('answers a search over the catalogue in well under 50 ms', async () => {
		await search('warmup');
		const t = Date.now();
		for (const q of ['ring', 'leather bag', 'snekers', 'gold watch', 'শাড়ি']) {
			clearSearchCache();
			await search(q, { facets: true });
		}
		expect((Date.now() - t) / 5).toBeLessThan(50);
	});
});
