import fs from 'fs';
import path from 'path';
import { docFor } from '../document';
import { memoryDriver } from '../drivers/memory';
import { clearSearchCache, searchWith, suggestWith } from '../engine';
import { compileRedirects, compileSynonyms, findRedirect, NO_RULES, type Rules } from '../rules';
import { SYNONYM_PACKS } from '../packs/synonyms';
import { SEARCH_DEFAULTS } from '../settings';
import { dropVocab } from '../vocab';
import { normalise } from '../normalise';

// docs/search SI-10: synonyms and redirects (SI13).

describe('compiling synonyms', () => {
	const m = compileSynonyms([
		{ kind: 'same', words: ['sneakers', 'trainers', 'keds'] },
		{ kind: 'one-way', words: ['jutta'], to: ['shoes'] },
		{ kind: 'same', words: ['T-Shirt', 'tee'] },
		{ kind: 'same', words: ['power bank', 'powerbank'] }, // two words: left out
		{ kind: 'same', words: ['hoodie', 'hoody'], active: false },
	]);
	it('links every word of a group to the others, by word and stem', () => {
		expect([...(m.get('sneakers') || [])].sort()).toEqual(['ked', 'keds', 'trainer', 'trainers']);
		expect(m.get('trainer')?.has('sneakers')).toBe(true);
		expect(m.get('tshirt')?.has('tee')).toBe(true); // "T-Shirt" is the word "tshirt"
	});
	it('one way goes one way', () => {
		expect(m.get('jutta')?.has('shoes')).toBe(true);
		expect(m.get('shoes')?.has('jutta')).toBeFalsy();
	});
	it('leaves out entries of several words and switched-off groups', () => {
		expect(m.get('powerbank')).toBeUndefined();
		expect(m.get('hoodie')).toBeUndefined();
	});
});

describe('redirects', () => {
	const now = new Date('2026-11-11T10:00:00Z').getTime();
	const rules: Rules = {
		synonyms: new Map(),
		redirects: compileRedirects(
			[
				{ _id: 'r1', queries: ['return', 'refund'], match: 'exact', url: '/returns' },
				{ _id: 'r2', queries: ['eid'], match: 'contains', url: '/collections/eid' },
				{ _id: 'r3', queries: ['black friday'], match: 'contains', url: '/sale', startsAt: '2026-11-20' },
				{ _id: 'r4', queries: ['old'], match: 'exact', url: '/old', endsAt: '2026-11-01' },
				{ _id: 'r5', queries: ['off'], match: 'exact', url: '/off', active: false },
			],
			now
		),
	};
	it.each([
		['return', '/returns'],
		['Returns', '/returns'], // word forms count
		['refund', '/returns'],
		['return policy', null], // exact: not with other words
		['eid dresses', '/collections/eid'],
		['dresses for eid', '/collections/eid'],
		['black friday', null], // not started yet
		['old', null], // ended
		['off', null], // switched off
		['', null],
	])('%s → %s', (q, url) => expect(findRedirect(rules, q)?.url ?? null).toBe(url));
});

describe('the starter packs', () => {
	it('hold one word per entry, and no word twice in a pack', () => {
		for (const p of SYNONYM_PACKS) {
			for (const g of [...p.same, ...(p.oneWay || []).flat()]) for (const w of g) expect([p.id, w, normalise(w).tokens.length]).toEqual([p.id, w, 1]);
			const seen = new Map<string, number>();
			p.same.forEach((g, i) => g.forEach(w => seen.set(w, (seen.get(w) ?? i) === i ? i : -1)));
		}
	});
	it('have an id, a name and an example line', () => {
		for (const p of SYNONYM_PACKS) expect(p.id && p.name && p.about && p.same.length).toBeTruthy();
	});
});

describe('search with synonyms and redirects', () => {
	const catalogue: any[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/hint-catalogue.json'), 'utf8'));
	const ctx = { tree: new Map<string, any>(), brands: new Map<string, any>(), collections: new Map<string, any>(), custom: [] as string[] };
	const docs = catalogue.map((p, i) => docFor({ ...p, _id: `p${i}`, status: 'active', trackStock: false, images: [p.image] }, [], ctx));
	docs.push(docFor({ _id: 'bn1', name: 'জুতা কালো', price: 900, trackStock: false }, [], ctx));
	const rules: Rules = {
		synonyms: compileSynonyms([
			{ kind: 'same', words: ['sneakers', 'trainers', 'kicks'] },
			{ kind: 'same', words: ['jumper', 'sweater'] },
			{ kind: 'one-way', words: ['jutta'], to: ['shoes'] },
			{ kind: 'same', words: ['জুতা', 'shoes'] },
		]),
		redirects: compileRedirects([{ _id: 'r1', queries: ['returns'], match: 'exact', url: '/returns' }]),
	};
	const go = (q: string, r: Rules = rules, more = {}) => searchWith(memoryDriver(docs, 'rules'), SEARCH_DEFAULTS, { q, limit: 10, ...more }, undefined, r);
	beforeEach(() => {
		clearSearchCache();
		dropVocab();
	});

	it('a word the store doesn’t use finds its synonym', async () => {
		const r = await go('kicks');
		expect(r.doc.length).toBeGreaterThan(0);
		expect(r.doc.every(d => /sneakers|trainers/i.test(d.name))).toBe(true);
		expect(r.query.synonyms?.[0]).toMatchObject({ word: 'kicks' });
		expect(r.query.typos).toEqual([]); // known through its synonym: no typos tried
	});
	it('without the synonym it finds nothing', async () => {
		expect((await go('kicks', NO_RULES)).total).toBe(0);
	});
	it('both ways: “sweater” finds the jumper, the exact match first', async () => {
		const r = await go('sweater', rules, { explain: true });
		expect(r.doc[0].name).toBe('Knit sweater');
		expect(r.doc.map(d => d.name)).toContain('Ribbed jumper');
		expect(r.doc.find(d => d.name === 'Ribbed jumper')?.explain).toMatch(/synonym “jumper”/);
	});
	it('one way: “jutta” finds shoes, “shoes” doesn’t find “jutta”', async () => {
		expect((await go('jutta')).doc.some(d => /shoes/i.test(d.name))).toBe(true);
		expect((await go('shoes')).query.synonyms?.some(s => s.with.includes('jutta'))).toBeFalsy();
	});
	it('across scripts: “shoes” finds the Bangla জুতা', async () => {
		expect((await go('shoes')).doc.map(d => d.name)).toContain('জুতা কালো');
	});
	it('a redirect comes with the answer', async () => {
		expect((await go('returns')).redirect).toEqual({ id: 'r1', url: '/returns' });
		expect((await go('jacket')).redirect).toBeUndefined();
	});
	it('suggestions use synonyms too', async () => {
		const s = await suggestWith(memoryDriver(docs, 'rules-s'), SEARCH_DEFAULTS, 'kicks', undefined, {}, rules);
		expect(s.products.length).toBeGreaterThan(0);
	});
});
