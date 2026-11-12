import { boostOf, BOOST_MAX, BOOST_MIN, decay, positionRates, priorRate, reformulations, synonymOf } from '../learn';
import { learnedBoost, rank } from '../rank';
import { SEARCH_DEFAULTS } from '../settings';

const DAY = 24 * 60 * 60 * 1000;
const pair = (o: Partial<Parameters<typeof boostOf>[0]>) => ({ impressions: 40, visitors: 10, clicks: 0, carts: 0, orders: 0, expected: 4, ...o });

describe('decay (half-life 30 days)', () => {
	const now = Date.UTC(2026, 10, 12);
	test('now counts 1, 30 days ago ½, 60 days ago ¼', () => {
		expect(decay(now, now)).toBe(1);
		expect(decay(now - 30 * DAY, now)).toBeCloseTo(0.5, 6);
		expect(decay(now - 60 * DAY, now)).toBeCloseTo(0.25, 6);
	});
	test('a clock a little ahead never counts more than 1', () => expect(decay(now + 5000, now)).toBe(1));
});

describe('click rates by position', () => {
	test('the prior falls with the position', () => {
		expect(priorRate(1)).toBeGreaterThan(priorRate(2));
		expect(priorRate(2)).toBeGreaterThan(priorRate(10));
	});
	test('no data: the prior', () => {
		const r = positionRates([], []);
		expect(r).toHaveLength(60);
		expect(r[0]).toBeCloseTo(priorRate(1), 6);
	});
	test('lots of data: the store’s own rate', () => {
		const r = positionRates(Array(60).fill(10000), Array(60).fill(1000));
		expect(r[0]).toBeCloseTo(0.1, 2);
	});
	test('never higher further down: clicks piled up at position 3 lift positions 1 and 2 too', () => {
		const r = positionRates([1000, 1000, 1000], [0, 0, 600]);
		expect(r[0]).toBeGreaterThanOrEqual(r[1]);
		expect(r[1]).toBeGreaterThanOrEqual(r[2]);
		expect(r[0]).toBeCloseTo(r[2], 6);
	});
	test('more clicks than impressions can’t give a rate over 1', () => {
		expect(positionRates([2], [50])[0]).toBeLessThanOrEqual(1);
	});
});

describe('the learned multiplier', () => {
	test('below 20 impressions or 5 visitors: nothing learned', () => {
		expect(boostOf(pair({ impressions: 19, clicks: 19 }))).toBe(1);
		expect(boostOf(pair({ visitors: 4, clicks: 30 }))).toBe(1);
	});
	test('clicked as often as an average result there: about 1', () => {
		expect(boostOf(pair({ clicks: 4, expected: 4 }))).toBe(1);
	});
	test('clicked far more than expected: up, never past × 1.25', () => {
		const x = boostOf(pair({ clicks: 30, expected: 2 }));
		expect(x).toBeGreaterThan(1.2);
		expect(x).toBeLessThanOrEqual(BOOST_MAX);
	});
	test('never clicked where clicks were expected: down, never below × 0.85', () => {
		const x = boostOf(pair({ clicks: 0, expected: 30 }));
		expect(x).toBeLessThan(0.9);
		expect(x).toBeGreaterThanOrEqual(BOOST_MIN);
	});
	test('position counts: 3 clicks at position 1 (where 12 were expected) is worse than 3 at position 20 (where 1 was)', () => {
		expect(boostOf(pair({ clicks: 3, expected: 12 }))).toBeLessThan(1);
		expect(boostOf(pair({ clicks: 3, expected: 1 }))).toBeGreaterThan(1);
	});
	test('adds to the bag and orders count, weighed by how the store converts', () => {
		const plain = boostOf(pair({ clicks: 4, expected: 4 }), 1.5);
		const buys = boostOf(pair({ clicks: 4, carts: 2, orders: 2, expected: 4 }), 1.5);
		expect(buys).toBeGreaterThan(plain);
	});
});

describe('reformulations', () => {
	const t0 = Date.UTC(2026, 10, 12, 10);
	const s = (sec: number, nq: string, clicked: boolean, q = nq) => ({ at: t0 + sec * 1000, nq, q, clicked });
	test('A with nothing opened, B within a minute opened → A → B', () => {
		expect(reformulations([s(0, 'frock', false), s(20, 'dress', true)])).toEqual([{ from: 'frock', to: 'dress', fromQ: 'frock', toQ: 'dress' }]);
	});
	test('more than 60 s later: not one', () => expect(reformulations([s(0, 'frock', false), s(61, 'dress', true)])).toEqual([]));
	test('A was clicked: not one', () => expect(reformulations([s(0, 'frock', true), s(10, 'dress', true)])).toEqual([]));
	test('B found nothing they opened: not one', () => expect(reformulations([s(0, 'frock', false), s(10, 'dress', false)])).toEqual([]));
	test('typing on (“dre” → “dress”) or the same again: not one', () => {
		expect(reformulations([s(0, 'dre', false), s(2, 'dress', true)])).toEqual([]);
		expect(reformulations([s(0, 'dress', false), s(5, 'dress', true)])).toEqual([]);
	});
	test('an email or phone in either: not one', () => expect(reformulations([s(0, '[phone]', false, '[phone]'), s(5, 'dress', true)])).toEqual([]));
	test('a chain: each step on its own', () => {
		expect(reformulations([s(0, 'frok', false), s(10, 'frock', false), s(20, 'dress', true)]).map(r => `${r.from}>${r.to}`)).toEqual(['frock>dress']);
	});
});

describe('a reformulation as a synonym', () => {
	test('one word for one word, as typed', () => expect(synonymOf('Frock', 'dress', 'frock', 'dress')).toEqual({ from: 'frock', to: 'dress', fromStem: 'frock', toStem: 'dress' }));
	test('the same search but for one word', () => expect(synonymOf('red frocks', 'red dresses', 'red frock', 'red dress')).toMatchObject({ from: 'frocks', to: 'dresses', fromStem: 'frock', toStem: 'dress' }));
	test('more than one word different: none', () => expect(synonymOf('red frock', 'blue dress', 'red frock', 'blue dress')).toBeNull());
	test('a different number of words: none', () => expect(synonymOf('frock', 'red dress', 'frock', 'red dress')).toBeNull());
	test('numbers (sizes, models): none', () => expect(synonymOf('iphone 13', 'iphone 14', 'iphone 13', 'iphone 14')).toBeNull());
});

describe('the learned lift in the ranking', () => {
	const doc = (id: string) => ({ product: id, fields: { name: { words: ['red', 'dress'], stems: ['red', 'dress'] } }, facets: { inStock: true }, signals: {} });
	const plan: any = [{ word: 'dress', stem: 'dress', kind: 'word', phon: '', last: false, minPrefix: 2, known: true, near: [], syn: [], phonMode: 'none', code: null, idf: 1 }];
	const learned = new Map([['a', 1.2], ['b', 0.9]]);
	test('a product shoppers chose goes up, one they skip goes down', () => {
		const b = learnedBoost(learned, SEARCH_DEFAULTS);
		const ra = rank(plan, doc('a'), SEARCH_DEFAULTS, Date.now(), b)!;
		const rb = rank(plan, doc('b'), SEARCH_DEFAULTS, Date.now(), b)!;
		const rc = rank(plan, doc('c'), SEARCH_DEFAULTS, Date.now(), b)!;
		expect(ra.score).toBeGreaterThan(rc.score);
		expect(rb.score).toBeLessThan(rc.score);
		expect(ra.multipliers.find(m => m.name === 'learned')?.x).toBeCloseTo(1.2, 6);
	});
	test('the dial: high raises it, off leaves it out; learning off leaves it out', () => {
		expect(learnedBoost(learned, { ...SEARCH_DEFAULTS, dials: { ...SEARCH_DEFAULTS.dials, learned: 'off' } })).toEqual([]);
		expect(learnedBoost(learned, { ...SEARCH_DEFAULTS, learning: false })).toEqual([]);
		const hi = learnedBoost(learned, { ...SEARCH_DEFAULTS, dials: { ...SEARCH_DEFAULTS.dials, learned: 'high' } });
		expect(hi[0].xOf!(doc('a'))).toBeCloseTo(Math.pow(1.2, 1.5), 6);
	});
	test('never brings in a product the words don’t find', () => {
		const other = { product: 'a', fields: { name: { words: ['blue', 'shirt'], stems: ['blue', 'shirt'] } }, facets: {}, signals: {} };
		expect(rank(plan, other, SEARCH_DEFAULTS, Date.now(), learnedBoost(learned, SEARCH_DEFAULTS))).toBeNull();
	});
});
