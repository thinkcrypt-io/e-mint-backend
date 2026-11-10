/**
 * Store search — filters and their counts (docs/search SI15). Pure, over search documents.
 *
 * Counts follow the usual rule: a group's counts ignore that group's own selection, so a shopper who picked Size M
 * still sees how many come in S and L. Category counts include the categories under each (a document lists its
 * category and every one above it).
 */
import { normalise } from './normalise.js';

export type Filters = {
	categories?: string[];
	brands?: string[];
	price?: { gte?: number | null; lte?: number | null };
	inStock?: boolean;
	onSale?: boolean;
	/** Option name → values (as typed: "Size" → ["M", "L"]). */
	opts?: Record<string, string[]>;
};
export type Group = 'categories' | 'brands' | 'price' | 'inStock' | 'onSale' | `opt:${string}`;

/** An option name or value as documents keep it ("Size" → "size", "Off White" → "offwhite"). */
export const optPart = (s: any) => normalise(String(s ?? '')).words.join('');
export const optKey = (name: any, value: any) => `${optPart(name)}=${optPart(value)}`;

const sid = (v: any) => (v == null ? '' : String(v?._id ?? v));

/** Filters with option names and values normalised and empty parts dropped. */
export const cleanFilters = (f: Filters = {}): Filters => {
	const out: Filters = {};
	if (f.categories?.length) out.categories = f.categories.map(sid).filter(Boolean);
	if (f.brands?.length) out.brands = f.brands.map(sid).filter(Boolean);
	const gte = f.price?.gte != null && Number.isFinite(Number(f.price.gte)) ? Number(f.price.gte) : null;
	const lte = f.price?.lte != null && Number.isFinite(Number(f.price.lte)) ? Number(f.price.lte) : null;
	if (gte != null || lte != null) out.price = { gte, lte };
	if (f.inStock) out.inStock = true;
	if (f.onSale) out.onSale = true;
	const opts: Record<string, string[]> = {};
	for (const [n, vs] of Object.entries(f.opts || {})) {
		const name = optPart(n);
		const values = (Array.isArray(vs) ? vs : [vs]).map(optPart).filter(Boolean);
		if (name && values.length) opts[name] = [...new Set(values)];
	}
	if (Object.keys(opts).length) out.opts = opts;
	return out;
};

/** Whether a document passes the filters, leaving out one group (for that group's counts). */
export const passes = (doc: any, f: Filters, except?: Group) => {
	const fc = doc.facets || {};
	if (f.categories && except !== 'categories' && !(fc.categories || []).some((c: any) => f.categories!.includes(sid(c)))) return false;
	if (f.brands && except !== 'brands' && !f.brands.includes(sid(fc.brand))) return false;
	if (f.price && except !== 'price') {
		const p = Number(fc.price);
		if (!Number.isFinite(p)) return false;
		if (f.price.gte != null && p < f.price.gte) return false;
		if (f.price.lte != null && p > f.price.lte) return false;
	}
	if (f.inStock && except !== 'inStock' && !fc.inStock) return false;
	if (f.onSale && except !== 'onSale' && !fc.onSale) return false;
	for (const [name, values] of Object.entries(f.opts || {})) {
		if (except === `opt:${name}`) continue;
		if (!values.some(v => (fc.opts || []).includes(`${name}=${v}`))) return false;
	}
	return true;
};

const NICE = [1, 2, 2.5, 5];
/** A friendly step for about `n` price ranges between min and max (50, 100, 250, 500, 1,000…). */
export const niceStep = (min: number, max: number, n = 5) => {
	const raw = Math.max(1, (max - min) / n);
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	for (const k of NICE) if (k * mag >= raw) return k * mag;
	return 10 * mag;
};

/** Up to 6 price ranges on friendly numbers, with counts. */
export const priceBuckets = (prices: number[]) => {
	const ps = prices.filter(p => Number.isFinite(p));
	if (!ps.length) return { min: null, max: null, buckets: [] as { from: number; to: number; count: number }[] };
	const min = Math.min(...ps);
	const max = Math.max(...ps);
	if (min === max) return { min, max, buckets: [{ from: min, to: max, count: ps.length }] };
	const step = niceStep(min, max);
	const start = Math.floor(min / step) * step;
	const buckets: { from: number; to: number; count: number }[] = [];
	for (let from = start; from <= max && buckets.length < 12; from += step) buckets.push({ from, to: from + step, count: 0 });
	for (const p of ps) {
		const i = Math.min(buckets.length - 1, Math.floor((p - start) / step));
		buckets[i].count++;
	}
	// More than six: the top ones fold into "from … up".
	while (buckets.length > 6) {
		const last = buckets.pop()!;
		buckets[buckets.length - 1].to = last.to;
		buckets[buckets.length - 1].count += last.count;
	}
	return { min, max, buckets: buckets.filter(b => b.count > 0) };
};

export type FacetCounts = {
	categories: { _id: string; count: number }[];
	brands: { _id: string; count: number }[];
	price: { min: number | null; max: number | null; buckets: { from: number; to: number; count: number }[] };
	opts: Record<string, { value: string; count: number }[]>;
	inStock: number;
	onSale: number;
};

const tally = (m: Map<string, number>, k: string) => k && m.set(k, (m.get(k) || 0) + 1);
const sorted = (m: Map<string, number>) => [...m].map(([_id, count]) => ({ _id, count })).sort((a, b) => b.count - a.count || a._id.localeCompare(b._id));

/** Every group's counts over these documents, each ignoring its own selection. */
export const facetCounts = (docs: any[], f: Filters): FacetCounts => {
	const cats = new Map<string, number>();
	const brands = new Map<string, number>();
	const prices: number[] = [];
	const opts = new Map<string, Map<string, number>>();
	let inStock = 0;
	let onSale = 0;
	for (const d of docs) {
		const fc = d.facets || {};
		if (passes(d, f, 'categories')) for (const c of fc.categories || []) tally(cats, sid(c));
		if (passes(d, f, 'brands') && fc.brand) tally(brands, sid(fc.brand));
		if (passes(d, f, 'price') && Number.isFinite(Number(fc.price))) prices.push(Number(fc.price));
		if (passes(d, f, 'inStock') && fc.inStock) inStock++;
		if (passes(d, f, 'onSale') && fc.onSale) onSale++;
		for (const o of fc.opts || []) {
			const [name, value] = String(o).split('=');
			if (!name || !value || !passes(d, f, `opt:${name}`)) continue;
			if (!opts.has(name)) opts.set(name, new Map());
			tally(opts.get(name)!, value);
		}
	}
	return {
		categories: sorted(cats),
		brands: sorted(brands),
		price: priceBuckets(prices),
		opts: Object.fromEntries([...opts].map(([n, m]) => [n, sorted(m).map(x => ({ value: x._id, count: x.count }))])),
		inStock,
		onSale,
	};
};
