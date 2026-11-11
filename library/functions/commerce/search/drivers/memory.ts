/**
 * Store search — an in-memory driver over a list of search documents: the same answers as the native driver, with
 * no database. For the relevance suite and other tests (test/), and for trying the engine on a catalogue file.
 */
import { passes } from '../facets.js';
import { makeVocab } from '../vocab.js';
import type { BrowseSpec, CandidateSpec, Cond, SearchDriver } from './types.js';

const SHOWN = ['name', 'brand', 'category', 'collection', 'option', 'keyword', 'custom'];

const hit = (d: any, c: Cond) =>
	c.terms.some(t => d.terms?.includes(t)) || (!!c.prefix && d.prefixes?.includes(c.prefix)) || (!!c.phon && d.phon?.includes(c.phon)) || (!!c.code && d.codes?.includes(c.code));

const num = (v: any, dflt: number) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

export const memoryDriver = (docs: any[], key = 'memory'): SearchDriver => {
	const live = () => docs.filter(d => (d.status ?? 'active') === 'active');
	const base = (hide: boolean) => live().filter(d => !hide || d.facets?.inStock);
	return {
		key,
		async vocabulary() {
			const df = new Map<string, number>();
			const shown: string[] = [];
			const phon: string[] = [];
			const labels = new Set<string>();
			const brands = new Map<string, any>();
			const categories = new Map<string, any>();
			const ds = live();
			for (const d of ds) {
				for (const t of new Set<string>(d.terms || [])) df.set(t, (df.get(t) || 0) + 1);
				for (const p of SHOWN) shown.push(...(d.fields?.[p]?.words || []), ...(d.fields?.[p]?.stems || []));
				phon.push(...(d.phon || []));
				for (const l of d.facets?.labels || []) labels.add(l);
				if (d.card?.brand?._id) brands.set(String(d.card.brand._id), d.card.brand);
				if (d.card?.category?._id) categories.set(String(d.card.category._id), d.card.category);
			}
			return makeVocab(ds.length, [...df], shown, phon, { labels: [...labels], brands: [...brands.values()], categories: [...categories.values()] });
		},
		async candidates(spec: CandidateSpec) {
			const pool = base(spec.hideOutOfStock);
			const all = spec.all.filter(c => c.terms.length || c.prefix || c.phon || c.code);
			const first = pool.filter(d => (all.length && all.every(c => hit(d, c))) || spec.codes.some(c => d.codes?.includes(c))).slice(0, spec.cap);
			if (first.length >= spec.partialBelow || all.length < 2) return first;
			const seen = new Set(first);
			return [...first, ...pool.filter(d => !seen.has(d) && all.some(c => hit(d, c))).slice(0, Math.min(spec.partialCap, spec.cap - first.length))];
		},
		async browse(spec: BrowseSpec) {
			const pool = base(spec.hideOutOfStock);
			const matching = pool.filter(d => passes(d, spec.filters));
			const by: Record<string, (a: any, b: any) => number> = {
				popular: (a, b) => num(b.signals?.sold30, 0) - num(a.signals?.sold30, 0) || num(b.signals?.views, 0) - num(a.signals?.views, 0) || num(b.signals?.wishes, 0) - num(a.signals?.wishes, 0),
				price: (a, b) => num(a.facets?.price, Infinity) - num(b.facets?.price, Infinity),
				'-price': (a, b) => num(b.facets?.price, -Infinity) - num(a.facets?.price, -Infinity),
				newest: (a, b) => new Date(b.signals?.createdAt || 0).getTime() - new Date(a.signals?.createdAt || 0).getTime(),
				name: (a, b) => String(a.card?.name || '').localeCompare(String(b.card?.name || '')),
			};
			const sorted = [...matching].sort(
				(a, b) => (spec.hideOutOfStock ? 0 : Number(!!b.facets?.inStock) - Number(!!a.facets?.inStock)) || by[spec.sort](a, b) || String(a._id ?? a.product).localeCompare(String(b._id ?? b.product))
			);
			const facetDocs = spec.facets ? pool.filter(d => passes(d, { categories: spec.filters.categories })) : undefined;
			return { docs: sorted.slice(spec.skip, spec.skip + spec.limit), total: matching.length, facetDocs };
		},
		async byProducts(products: string[], hideOutOfStock: boolean) {
			const want = new Set(products.map(String));
			return base(hideOutOfStock).filter(d => want.has(String(d.product)));
		},
	};
};
