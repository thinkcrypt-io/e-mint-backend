import { docFor } from '../document';
import { memoryDriver } from '../drivers/memory';
import { clearSearchCache, searchWith, type Meaning } from '../engine';
import { SEARCH_DEFAULTS, searchSettingsOf } from '../settings';
import { dropVocab } from '../vocab';
import { DIMS, meaningText, nearest, pack, rerank, similarity, textKey, unpack } from '../semantic/vector';

// docs/search SI-19: search by meaning, with a fake embedder (the real model is checked by
// scripts/tenancy-smoke/search-meaning.mjs). Each "concept" is one axis; a text's vector is the sum of its concepts.

const CONCEPTS: Record<string, string[]> = {
	party: ['party', 'gown', 'sequin', 'evening', 'wear'],
	mother: ['mother', 'saree', 'shawl', 'gift'],
	cotton: ['cotton'],
	dress: ['dress'],
	charger: ['charger', 'usb', 'cable'],
};
const AXES = Object.keys(CONCEPTS);
const embed = (text: string) => {
	const v = new Float32Array(DIMS);
	const words = text.toLowerCase().split(/[^a-z]+/);
	AXES.forEach((a, i) => (v[i] = words.filter(w => CONCEPTS[a].includes(w)).length));
	v[DIMS - 1] = 0.3; // every text a little alike
	const len = Math.hypot(...v) || 1;
	return v.map(x => x / len);
};

const tree = new Map<string, any>([['c1', { _id: 'c1', name: 'Dresses' }], ['c2', { _id: 'c2', name: 'Electronics' }]]);
const ctx = { tree, brands: new Map(), collections: new Map(), custom: [] as string[] };
const docs: any[] = [];
const vecs = new Map<string, Int8Array>();
const add = (id: string, name: string, category: string, keywords: string[] = []) => {
	const d = { ...docFor({ _id: id, name, category, keywords, status: 'active', trackStock: false, price: 1000 }, [], ctx), status: 'active' };
	docs.push(d);
	vecs.set(id, unpack(pack(embed(d.vecText)))!);
};
add('p1', 'Sequin evening gown', 'c1');
add('p2', 'Red cotton dress', 'c1');
add('p3', 'Blue cotton dress', 'c1', ['gown']);
add('p4', 'Kashmiri shawl', 'c1', ['gift', 'mother']);
add('p5', 'USB charger', 'c2');

const meaning = (opts: { slow?: boolean } = {}): Meaning & { asked: string[] } => {
	const asked: string[] = [];
	return {
		asked,
		async vector(q) {
			asked.push(q);
			return opts.slow ? null : embed(q);
		},
		async similar(qv, products) {
			return new Map(products.filter(p => vecs.has(p)).map(p => [p, similarity(qv, vecs.get(p)!)]));
		},
		async nearest(qv, k) {
			return nearest(qv, [...vecs].map(([id, vec]) => ({ id, vec })), k);
		},
	};
};
const S = (semantic = true) => ({ ...SEARCH_DEFAULTS, semantic });
const search = (q: string, mean?: Meaning, more: any = {}, s = S()) => searchWith(memoryDriver(docs, 'shop'), s, { q, limit: 24, explain: true, ...more }, undefined, undefined, mean);

beforeEach(() => {
	clearSearchCache();
	dropVocab();
});

describe('the pure part', () => {
	test('packing keeps the cosine within 0.01', () => {
		const a = embed('party gown'),
			b = embed('evening wear');
		let exact = 0;
		for (let i = 0; i < DIMS; i++) exact += a[i] * b[i];
		expect(Math.abs(similarity(a, unpack(pack(b))!) - exact)).toBeLessThan(0.01);
		expect(pack(a).length).toBe(DIMS);
		expect(unpack(Buffer.alloc(10))).toBeNull();
	});

	test('a product’s meaning text: name, category path, brand, options, keywords — no description', () => {
		expect(meaningText({ name: 'Polo', categories: ['Men', 'Shirts'], brand: 'Aarong', options: ['S', 'Navy'], keywords: ['summer'] })).toBe('Polo · Men > Shirts · Aarong · S, Navy · summer');
		expect(textKey('a')).not.toBe(textKey('b'));
		expect(docs[0].vecText).toBe('Sequin evening gown · Dresses');
	});

	test('re-rank: only the top ones move, and a text match a lot better stays first', () => {
		const items = [
			{ id: 'a', s: 10, m: 0 },
			{ id: 'b', s: 9, m: 0.9 },
			{ id: 'c', s: 2, m: 1 },
			{ id: 'd', s: 1, m: 1 },
		];
		const r = rerank(items, x => x.s, x => x.m, { top: 3 });
		expect(r.items.map(x => x.id)).toEqual(['b', 'a', 'c', 'd']);
		expect(r.items[3].id).toBe('d'); // beyond the top: where it was
	});

	test('nearest: most alike first, never under the floor', () => {
		const q = embed('party wear');
		const n = nearest(q, [...vecs].map(([id, vec]) => ({ id, vec })), 5);
		expect(n[0].id).toBe('p1');
		expect(n.every(x => x.sim >= 0.45)).toBe(true);
		expect(n.some(x => x.id === 'p5')).toBe(false);
	});

	test('the store setting is on by default', () => {
		expect(searchSettingsOf({}).semantic).toBe(true);
		expect(searchSettingsOf({ semantic: false }).semantic).toBe(false);
	});
});

describe('in the engine', () => {
	test('words that match nothing → the products closest in meaning, said so', async () => {
		const r = await search('party wear', meaning());
		expect(r.showing?.reason).toBe('meaning');
		expect(r.doc[0].name).toBe('Sequin evening gown');
		expect(r.doc.map(d => d.name)).not.toContain('USB charger');
		expect(r.meaning?.used).toBe('nearest');
		expect(r.doc[0].explain).toMatch(/close in meaning/);
		expect(r.fallback).toBeUndefined();
	});

	test('something for my mother → the shawl', async () => {
		const r = await search('something for my mother', meaning());
		expect(r.doc[0]?.name).toBe('Kashmiri shawl');
	});

	test('meaning re-ranks the text results: the dress that is also a gown moves up', async () => {
		// "party" isn't a word of the store: the dresses are found by "dress" (fewer words), then meaning orders them.
		const without = await search('dress for a party', undefined);
		const withM = await search('dress for a party', meaning());
		expect(without.doc[0].name).toBe('Red cotton dress');
		expect(withM.meaning?.used).toBe('reranked');
		expect(withM.doc[0].name).toBe('Blue cotton dress');
		expect(withM.doc[0].explain).toMatch(/meaning 0\.\d\d ×/);
		expect(withM.doc.map(d => d.name).sort()).toEqual(without.doc.map(d => d.name).sort());
	});

	test('a text match is never lost: the same products, only the order', async () => {
		const a = await search('cotton dress', undefined);
		const b = await search('cotton dress', meaning());
		expect(b.total).toBe(a.total);
	});

	test('too slow (no vector in time) → search by words, and the old dead-end help', async () => {
		const r = await search('party wear', meaning({ slow: true }));
		expect(r.showing?.reason).not.toBe('meaning');
		expect(r.meaning).toEqual({ used: 'no', why: 'the query wasn’t ready in time' });
	});

	test('the store turned it off → not asked at all', async () => {
		const m = meaning();
		const r = await search('party wear', m, {}, S(false));
		expect(m.asked).toEqual([]);
		expect(r.meaning?.used).toBe('no');
	});

	test('a price sort: no re-rank', async () => {
		const r = await search('cotton dress', meaning(), { sort: 'price' });
		expect(r.meaning).toBeUndefined();
	});

	test('nothing close enough → the usual fallback', async () => {
		const r = await search('zzzz qqqq', meaning());
		expect(r.showing?.reason).not.toBe('meaning');
		expect(r.meaning?.used).toBe('no');
	});
});
