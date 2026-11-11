import { docFor } from '../document';
import { memoryDriver } from '../drivers/memory';
import { clearSearchCache, searchWith } from '../engine';
import { compileMerch, firedRules, merchOf, ruleLive, ruleSentence, strengthOf, withPins } from '../merch';
import { NO_RULES, type Rules } from '../rules';
import { SEARCH_DEFAULTS } from '../settings';
import { dropVocab } from '../vocab';

// docs/search SI-15: merchandising rules (SI13) — hide, show only, pin, boost / bury.

const tree = new Map<string, any>([
	['dresses', { _id: 'dresses', name: 'Dresses' }],
	['shoes', { _id: 'shoes', name: 'Shoes' }],
]);
const brands = new Map<string, any>([
	['aarong', { _id: 'aarong', name: 'Aarong' }],
	['yellow', { _id: 'yellow', name: 'Yellow' }],
]);
const collections = new Map<string, any>([['eid', { _id: 'eid', name: 'Eid' }]]);
const ctx = { tree, brands, collections, custom: [] as string[] };
const P = (id: string, name: string, more: any = {}) => docFor({ _id: id, name, price: 1000, status: 'active', trackStock: false, ...more }, [], ctx);
const docs = [
	P('d1', 'Red cotton dress', { category: 'dresses', brand: 'yellow', soldCount: 50 }),
	P('d2', 'Blue cotton dress', { category: 'dresses', brand: 'aarong' }),
	P('d3', 'Green silk dress', { category: 'dresses', brand: 'aarong', collections: ['eid'] }),
	P('d4', 'Black party dress', { category: 'dresses', brand: 'yellow', discountPercent: 10 }),
	P('d5', 'Old summer dress', { category: 'dresses' }),
	P('s1', 'Leather shoes', { category: 'shoes', brand: 'yellow' }),
	P('s2', 'Canvas shoes', { category: 'shoes' }),
];
const withRules = (rows: any[]): Rules => ({ ...NO_RULES, merch: compileMerch(rows.map((r, i) => ({ _id: `r${i}`, name: `rule ${i}`, ...r }))) });
const go = (q: string, rows: any[] = [], more: any = {}) => searchWith(memoryDriver(docs, `merch${Math.random()}`), SEARCH_DEFAULTS, { q, limit: 20, ...more }, undefined, withRules(rows));
const names = (r: any) => r.doc.map((d: any) => d.name);

beforeEach(() => {
	clearSearchCache();
	dropVocab();
});

describe('compiling rules', () => {
	const now = new Date('2026-11-11T10:00:00Z').getTime();
	it('keeps the rules on now, hide first, pins before boosts', () => {
		const c = compileMerch(
			[
				{ _id: 'a', when: 'exact', queries: ['dress'], action: 'boost', brands: ['aarong'] },
				{ _id: 'b', when: 'exact', queries: ['dress'], action: 'pin', products: ['d5'] },
				{ _id: 'c', when: 'always', action: 'hide', products: ['d5'] },
				{ _id: 'd', when: 'exact', queries: ['dress'], action: 'pin', products: ['d1'], active: false },
				{ _id: 'e', when: 'exact', queries: ['dress'], action: 'pin', products: ['d1'], startsAt: '2026-11-20' },
				{ _id: 'f', when: 'exact', queries: ['dress'], action: 'pin', products: ['d1'], endsAt: '2026-11-01' },
				{ _id: 'g', when: 'exact', queries: [], action: 'pin', products: ['d1'] }, // no searches
				{ _id: 'h', when: 'exact', queries: ['x'], action: 'boost' }, // nothing to boost
				{ _id: 'i', when: 'category', action: 'pin', products: ['d1'] }, // no category
				{ _id: 'j', when: 'nonsense', action: 'pin', products: ['d1'] },
			],
			now
		);
		expect(c.map(r => r.id)).toEqual(['c', 'b', 'a']);
	});
	it('a rule ends at the end of its last day', () => {
		expect(ruleLive({ endsAt: '2026-11-11' }, new Date('2026-11-11T20:00:00Z').getTime())).toBe(true);
		expect(ruleLive({ endsAt: '2026-11-10' }, new Date('2026-11-11T20:00:00Z').getTime())).toBe(false);
	});
	it('strength snaps to the allowed steps', () => {
		expect(strengthOf('boost', '3')).toBe(3);
		expect(strengthOf('boost', 10)).toBe(3);
		expect(strengthOf('boost', undefined)).toBe(2);
		expect(strengthOf('bury', '0.2')).toBe(0.2);
		expect(strengthOf('bury', 'x')).toBe(0.5);
	});
	it('pins take products only', () => {
		const [r] = compileMerch([{ when: 'always', action: 'pin', products: ['d1'], brands: ['aarong'], onSale: true }]);
		expect([r.products, r.brands, r.onSale]).toEqual([['d1'], [], false]);
	});
});

describe('which rules a search sets off', () => {
	const rules = compileMerch([
		{ _id: 'ex', when: 'exact', queries: ['dress', 'frock'], action: 'pin', products: ['d1'] },
		{ _id: 'co', when: 'contains', queries: ['cotton dress'], action: 'pin', products: ['d2'] },
		{ _id: 'ca', when: 'category', category: 'shoes', action: 'pin', products: ['s2'] },
		{ _id: 'al', when: 'always', action: 'hide', products: ['d5'] },
	]);
	it.each([
		['dress', [], ['al', 'ex']],
		['Dresses', [], ['al', 'ex']], // word forms count
		['red dress', [], ['al']], // exact: not with other words
		['red cotton dresses', [], ['al', 'co']], // contains: the phrase, in order
		['dress cotton', [], ['al']],
		['', ['shoes'], ['al', 'ca']], // the Shoes page
		['canvas', ['shoes'], ['al']], // a search inside the category isn't the category page
		['', ['dresses'], ['al']],
	])('“%s” in %j → %j', (q, cats, ids) => expect(firedRules(rules, q as string, cats as string[]).map(r => r.id).sort()).toEqual((ids as string[]).sort()));
});

describe('pins', () => {
	it('come first, in order, and the rest keeps its order', () => {
		const xs = ['a', 'b', 'c', 'd'];
		expect(withPins(xs, ['c', 'x', 'a'], x => x)).toEqual({ list: ['c', 'a', 'b', 'd'], pinned: 2 });
		expect(withPins(xs, ['z'], x => x, ['z'])).toEqual({ list: ['z', 'a', 'b', 'c', 'd'], pinned: 1 });
	});
});

describe('a search with rules', () => {
	it('without rules: the best match first', async () => {
		const r = await go('dress');
		expect(r.total).toBe(5);
		expect(r.rules).toBeUndefined();
	});
	it('pin: the products at the top, in the rule’s order', async () => {
		const r = await go('dress', [{ when: 'exact', queries: ['dress'], action: 'pin', products: ['d5', 'd3'] }], { explain: true });
		expect(names(r).slice(0, 2)).toEqual(['Old summer dress', 'Green silk dress']);
		expect(r.doc[0].pinned).toBe(1);
		expect(r.pinned).toBe(2);
		expect(r.rules?.[0]).toMatchObject({ _id: 'r0', action: 'pin' });
	});
	it('pin: a product the words don’t find is shown too', async () => {
		const r = await go('dress', [{ when: 'exact', queries: ['dress'], action: 'pin', products: ['s1'] }], { explain: true });
		expect(names(r)[0]).toBe('Leather shoes');
		expect(r.doc[0].explain).toMatch(/pinned #1/);
		expect(r.total).toBe(6);
	});
	it('pin: gives way to a sort the shopper picked', async () => {
		const r = await go('dress', [{ when: 'exact', queries: ['dress'], action: 'pin', products: ['d5'] }], { sort: 'name' });
		expect(names(r)[0]).toBe('Black party dress');
	});
	it('pin: still passes the shopper’s filters', async () => {
		const r = await go('dress', [{ when: 'exact', queries: ['dress'], action: 'pin', products: ['d5'] }], { filters: { brands: ['aarong'] } });
		expect(names(r)).not.toContain('Old summer dress');
	});
	it('hide: never shown, pinned or not', async () => {
		const r = await go('dress', [
			{ when: 'always', action: 'hide', products: ['d5'] },
			{ when: 'exact', queries: ['dress'], action: 'pin', products: ['d5'] },
		]);
		expect(names(r)).not.toContain('Old summer dress');
		expect(r.total).toBe(4);
	});
	it('hide by brand', async () => {
		const r = await go('dress', [{ when: 'contains', queries: ['dress'], action: 'hide', brands: ['yellow'] }]);
		expect(names(r).sort()).toEqual(['Blue cotton dress', 'Green silk dress', 'Old summer dress']);
	});
	it('show only: a collection', async () => {
		const r = await go('dress', [{ when: 'exact', queries: ['dress'], action: 'filter', collections: ['eid'] }]);
		expect(names(r)).toEqual(['Green silk dress']);
	});
	it('show only: set aside when it would leave nothing', async () => {
		const r = await go('shoes', [{ when: 'exact', queries: ['shoes'], action: 'filter', collections: ['eid'] }]);
		expect(r.total).toBe(2);
	});
	it('boost: a brand comes up, and the explain says why', async () => {
		const before = names(await go('cotton dress'));
		expect(before[0]).toBe('Red cotton dress');
		const r = await go('cotton dress', [{ when: 'contains', queries: ['cotton'], action: 'boost', brands: ['aarong'], strength: '3' }], { explain: true });
		expect(names(r)[0]).toBe('Blue cotton dress');
		expect(r.doc[0].explain).toMatch(/rule “rule 0” ×3/);
	});
	it('bury: on sale goes down', async () => {
		const r = await go('party dress', [{ when: 'always', action: 'bury', onSale: true, strength: '0.2' }], { explain: true });
		expect(r.doc[0].explain).toMatch(/×0\.2/);
	});
	it('a category page: pin and boost', async () => {
		const plain = await go('', [], { filters: { categories: ['dresses'] } });
		expect(plain.total).toBe(5);
		const r = await go(
			'',
			[
				{ when: 'category', category: 'dresses', action: 'pin', products: ['d3'] },
				{ when: 'category', category: 'dresses', action: 'hide', products: ['d5'] },
				{ when: 'category', category: 'dresses', action: 'boost', brands: ['aarong'], strength: '3' },
			],
			{ filters: { categories: ['dresses'] }, explain: true, facets: true }
		);
		expect(r.total).toBe(4);
		expect(names(r)[0]).toBe('Green silk dress');
		expect(names(r)[1]).toBe('Blue cotton dress'); // boosted above the best seller
		expect(r.pinned).toBe(1);
		expect(r.rules?.length).toBe(3);
		expect(r.facets).toBeTruthy();
	});
	it('a category page pages through the rule’s order', async () => {
		const rows = [{ when: 'category', category: 'dresses', action: 'pin', products: ['d5', 'd4'] }];
		const p1 = await go('', rows, { filters: { categories: ['dresses'] }, limit: 2 });
		const p2 = await go('', rows, { filters: { categories: ['dresses'] }, limit: 2, page: 2 });
		expect(names(p1)).toEqual(['Old summer dress', 'Black party dress']);
		expect(p1.totalPages).toBe(3);
		expect(names(p2)).not.toContain('Old summer dress');
	});
	it('a pin answers a search that found nothing', async () => {
		const r = await go('zzzq', [{ when: 'exact', queries: ['zzzq'], action: 'pin', products: ['d1'] }]);
		expect(names(r)).toEqual(['Red cotton dress']);
		expect(r.fallback).toBeUndefined();
	});
});

describe('a rule as a sentence', () => {
	it.each([
		[{ when: 'exact', queries: ['dress', 'frock'], action: 'pin', products: ['a', 'b'] }, {}, 'Searches for “dress” or “frock”: pin 2 products'],
		[{ when: 'contains', queries: ['eid'], action: 'boost', strength: '3' }, { collections: ['Eid'] }, 'Searches with “eid”: boost collection Eid ×3'],
		[{ when: 'category', action: 'hide', onSale: true }, { category: 'Shoes' }, 'The Shoes page: hide products on sale'],
		[{ when: 'always', action: 'bury', strength: '0.2' }, { brands: ['Yellow'] }, 'Every search: bury brand Yellow ×0.2'],
	])('%j', (r, n, s) => expect(ruleSentence(r, n as any)).toBe(s));
});

describe('merchOf', () => {
	it('nothing fired: nothing changes', () => {
		const m = merchOf([]);
		expect(m.hidden({})).toBe(false);
		expect(m.filter([1, 2], x => x)).toEqual([1, 2]);
	});
});
