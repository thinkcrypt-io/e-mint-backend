import { docFor, gramsOf, prefixesOf } from '../document';

// docs/search SI-03: what a product's search document holds (SI4). The database side is in
// scripts/tenancy-smoke/search-index.mjs.

const oid = (n: number) => ({ _id: `00000000000000000000000${n}`, toString: () => `00000000000000000000000${n}` });
const men = { _id: 'c1', name: 'Men' };
const shirts = { _id: 'c2', name: 'Shirts', parent: 'c1' };
const ctx = {
	tree: new Map<string, any>([
		['c1', men],
		['c2', shirts],
	]),
	brands: new Map<string, any>([['b1', { _id: 'b1', name: 'Aarong' }]]),
	collections: new Map<string, any>([['k1', { _id: 'k1', name: 'Eid Edit' }]]),
	custom: ['fabric'],
};
const product = {
	_id: oid(1)._id,
	name: "Men's Oxford Shirt",
	category: 'c2',
	brand: 'b1',
	collections: ['k1'],
	keywords: ['formal', 'office'],
	description: '<p>Pure <b>cotton</b> &amp; easy-iron.</p>',
	fabric: 'Egyptian cotton',
	sku: 'OX-100',
	price: 2400,
	salePrice: 2160,
	compareAtPrice: 3000,
	discountPercent: 10,
	options: [{ name: 'Size', values: 'S, M, L' }],
	images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
	views: 12,
	wishlistCount: 3,
	trackStock: true,
	totalStock: 0,
	updatedAt: new Date('2026-11-01'),
};
const variants = [
	{ product: product._id, title: 'S / White', sku: 'OX-100-S', barcode: '8901234567890', price: 2400, salePrice: 2160, totalStock: 0, optionValues: [{ name: 'Size', value: 'S' }, { name: 'Colour', value: 'White' }] },
	{ product: product._id, title: 'M / Blue', sku: 'OX-100-M', price: 2600, salePrice: 2340, totalStock: 4, optionValues: [{ name: 'Size', value: 'M' }, { name: 'Colour', value: 'Blue' }] },
	{ product: product._id, title: 'XL / Red', sku: 'OX-100-XL', price: 1800, salePrice: 1620, totalStock: 9, active: false, optionValues: [{ name: 'Size', value: 'XL' }, { name: 'Colour', value: 'Red' }] },
];

describe('a product’s search document (SI4)', () => {
	const d = docFor(product, variants, ctx);

	it('reads each part, normalised', () => {
		expect(d.fields.name.words).toEqual(['mens', 'oxford', 'shirt']);
		expect(d.fields.name.stems).toEqual(['men', 'oxford', 'shirt']);
		expect(d.fields.brand.words).toEqual(['aarong']);
		expect(d.fields.category.words).toEqual(['shirts', 'men']); // its category, then the ones above
		expect(d.fields.collection.words).toEqual(['eid', 'edit']);
		expect(d.fields.keyword.words).toEqual(['formal', 'office']);
		expect(d.fields.custom.words).toEqual(['egyptian', 'cotton']);
		expect(d.fields.description.words).toEqual(['pure', 'cotton', 'easy', 'iron']); // tags and entities gone
	});

	it('takes option values from the product and its active variants only', () => {
		expect(d.fields.option.words.sort()).toEqual(['blue', 'l', 'm', 's', 'white'].sort());
		expect(d.facets.opts.sort()).toEqual(['colour=blue', 'colour=white', 'size=l', 'size=m', 'size=s'].sort());
		expect(d.facets.labels.sort()).toEqual(['Colour=Blue', 'Colour=White', 'Size=L', 'Size=M', 'Size=S'].sort());
		expect(d.facets.labels.map((l: string) => l.toLowerCase())).toEqual(d.facets.opts); // same order
	});

	it('puts every word and stem in terms, the description too', () => {
		for (const w of ['mens', 'men', 'oxford', 'shirt', 'shirts', 'aarong', 'eid', 'formal', 'pure', 'iron']) expect(d.terms).toContain(w);
	});

	it('keeps the description out of suggestions and typo grams', () => {
		expect(d.prefixes).toContain('ox');
		expect(d.prefixes).toContain('aaro');
		expect(d.prefixes).not.toContain('pur');
		expect(d.grams).toContain('_ox');
		expect(d.grams).not.toContain('_pu');
	});

	it('keeps SKUs and barcodes as codes, without punctuation', () => {
		expect(d.codes.sort()).toEqual(['8901234567890', 'ox100', 'ox100m', 'ox100s'].sort()); // the inactive XL isn't sold
	});

	it('has the Banglish keys of the words shown', () => {
		expect(d.phon).toContain('srt'); // shirt
	});

	it('works out the filters', () => {
		expect(d.facets.categories).toEqual(['c2', 'c1']);
		expect(d.facets.brand).toBe('b1');
		expect(d.facets.price).toBe(2160); // the cheapest active variant, discount off — not the inactive one's 1620
		expect(d.facets.onSale).toBe(true);
		expect(d.facets.inStock).toBe(true); // the M has 4
	});

	it('makes the card a result shows', () => {
		expect(d.card).toMatchObject({ name: "Men's Oxford Shirt", image: 'https://cdn.example.com/a.jpg', price: 2400, salePrice: 2160, compareAtPrice: 3000, discountPercent: 10, inStock: true });
		expect(d.card.category).toEqual({ _id: 'c2', name: 'Shirts' });
		expect(d.card.brand).toEqual({ _id: 'b1', name: 'Aarong' });
	});

	it('carries the signals and when the product changed', () => {
		expect(d.signals).toMatchObject({ views: 12, wishes: 3 });
		expect(d.sourceAt).toEqual(new Date('2026-11-01'));
	});

	it('is out of stock when no active variant has any', () => {
		const out = docFor(product, variants.map(v => ({ ...v, totalStock: 0 })), ctx);
		expect(out.facets.inStock).toBe(false);
		expect(docFor({ ...product, trackStock: false }, variants.map(v => ({ ...v, totalStock: 0 })), ctx).facets.inStock).toBe(true);
	});

	it('prices a variant with no price of its own at the product’s', () => {
		const own = docFor(product, [{ ...variants[1], price: undefined, salePrice: 0 }], ctx);
		expect(own.facets.price).toBe(2160);
	});

	it('handles a bare product', () => {
		const bare = docFor({ _id: 'p2', name: 'Candle', price: 500, totalStock: 2 }, [], { ...ctx, custom: [] });
		expect(bare.fields.name.words).toEqual(['candle']);
		expect(bare.facets).toMatchObject({ categories: [], brand: null, price: 500, onSale: false, inStock: true, opts: [], labels: [] });
		expect(bare.codes).toEqual([]);
	});

	it('survives a category loop', () => {
		const loop = { ...ctx, tree: new Map<string, any>([['a', { _id: 'a', name: 'A', parent: 'b' }], ['b', { _id: 'b', name: 'B', parent: 'a' }]]) };
		expect(docFor({ ...product, category: 'a' }, [], loop).facets.categories).toEqual(['a', 'b']);
	});

	it('reads Bangla names', () => {
		const bn = docFor({ _id: 'p3', name: 'জামদানি শাড়ি', price: 9000 }, [], { ...ctx, custom: [] });
		expect(bn.fields.name.words).toEqual(['জামদানি', 'শাড়ি']);
		expect(bn.phon).toEqual(expect.arrayContaining(['jmdn', 'sr']));
		expect(bn.prefixes).toContain('জাম');
	});
});

describe('prefixes and grams', () => {
	it('gives prefixes up to 15 letters', () => {
		expect(prefixesOf('shirt')).toEqual(['s', 'sh', 'shi', 'shir', 'shirt']);
		expect(prefixesOf('a'.repeat(30))).toHaveLength(15);
	});
	it('gives edge-marked trigrams', () => {
		expect(gramsOf('shirt')).toEqual(['_sh', 'shi', 'hir', 'irt', 'rt_']);
		expect(gramsOf('ab')).toEqual(['_ab', 'ab_']);
		expect(gramsOf('a')).toEqual(['_a_']);
	});
});
