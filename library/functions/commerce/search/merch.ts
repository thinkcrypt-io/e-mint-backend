/**
 * Store search — merchandising rules (docs/search SI13, SI-15). Pure: the store's Search rules compiled, the ones a
 * search or a category page sets off, and what they do to its results.
 *
 *   when   a search is exactly … / contains … · a category page · every search
 *   do     hide · show only (filter) · pin (products, in order, at the top) · boost ×1.5 / 2 / 3 · bury ×0.5 / 0.2
 *   what   products · brands · categories · collections · on sale (any mix; pins take products only)
 *
 * They apply in this order: hide, filter, pin, boost / bury. Pins and boosts give way to a sort the shopper picked
 * (price, newest…); hide and filter always apply. A filter that would leave nothing is set aside (no dead ends, SI12).
 */
import { normalise } from './normalise.js';
import type { Boost } from './rank.js';

export type RuleWhen = 'exact' | 'contains' | 'category' | 'always';
export type RuleAction = 'hide' | 'filter' | 'pin' | 'boost' | 'bury';
export type CompiledRule = {
	id: string;
	name: string;
	when: RuleWhen;
	/** exact / contains: the searches, each as stems in order. */
	queries: string[][];
	/** category: the category page it's for. */
	category: string | null;
	action: RuleAction;
	products: string[];
	brands: string[];
	categories: string[];
	collections: string[];
	onSale: boolean;
	/** boost / bury: the multiplier. */
	x: number;
};

const WHEN: RuleWhen[] = ['exact', 'contains', 'category', 'always'];
const ACTIONS: RuleAction[] = ['hide', 'filter', 'pin', 'boost', 'bury'];
export const BOOSTS = [1.5, 2, 3];
export const BURIES = [0.5, 0.2];
const ORDER: Record<RuleAction, number> = { hide: 0, filter: 1, pin: 2, boost: 3, bury: 3 };
const DAY = 24 * 3600 * 1000;

const sid = (v: any) => (v == null ? '' : String(v?._id ?? v));
const ids = (v: any): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(sid).filter(Boolean);
const asList = (v: any): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map(x => String(x).trim()).filter(Boolean);
const phrase = (q: string) => normalise(q).tokens.map(t => t.stem);

/** The multiplier a boost or bury uses: one of the allowed steps, the nearest to what was saved. */
export const strengthOf = (action: RuleAction, v: any) => {
	const steps = action === 'bury' ? BURIES : BOOSTS;
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return action === 'bury' ? 0.5 : 2;
	return steps.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
};

/** Whether a rule is on at `now`: switched on, started, not past the end of its last day. */
export const ruleLive = (r: any, now = Date.now()) =>
	r?.active !== false && (!r.startsAt || new Date(r.startsAt).getTime() <= now) && (!r.endsAt || new Date(r.endsAt).getTime() + DAY > now);

/** Search rule records → the rules on now, hide first and pins before boosts (a pin's own order kept). */
export const compileMerch = (rows: any[], now = Date.now()): CompiledRule[] =>
	rows
		.filter(r => ruleLive(r, now) && WHEN.includes(r.when) && ACTIONS.includes(r.action))
		.map(r => {
			const action = r.action as RuleAction;
			const rule: CompiledRule = {
				id: sid(r._id),
				name: String(r.name || '').trim() || 'A search rule',
				when: r.when,
				queries: r.when === 'exact' || r.when === 'contains' ? asList(r.queries).map(phrase).filter(p => p.length) : [],
				category: r.when === 'category' ? sid(r.category) || null : null,
				action,
				products: ids(r.products),
				brands: action === 'pin' ? [] : ids(r.brands),
				categories: action === 'pin' ? [] : ids(r.categories),
				collections: action === 'pin' ? [] : ids(r.collections),
				onSale: action !== 'pin' && !!r.onSale,
				x: action === 'boost' || action === 'bury' ? strengthOf(action, r.strength) : 1,
			};
			return rule;
		})
		.filter(r => (r.when === 'exact' || r.when === 'contains' ? r.queries.length : r.when === 'category' ? !!r.category : true))
		.filter(r => r.products.length || r.brands.length || r.categories.length || r.collections.length || r.onSale)
		.sort((a, b) => ORDER[a.action] - ORDER[b.action]);

/** The rules a search (`q`; empty on a category page) in the categories picked sets off. */
export const firedRules = (rules: CompiledRule[], q: string, categories: string[] = []) => {
	const words = phrase(q || '');
	const cats = new Set(categories.map(sid));
	return rules.filter(r => {
		if (r.when === 'always') return true;
		if (r.when === 'category') return !words.length && !!r.category && cats.has(r.category);
		if (!words.length) return false;
		return r.queries.some(p =>
			r.when === 'exact' ? p.length === words.length && p.every((w, i) => w === words[i]) : words.some((_, i) => i + p.length <= words.length && p.every((w, k) => w === words[i + k]))
		);
	});
};

/** Whether a search document is one of a rule's products, brands, categories, collections or on sale. */
export const targets = (r: CompiledRule, d: any) => {
	const f = d?.facets || {};
	if (r.products.length && r.products.includes(sid(d?.product))) return true;
	if (r.brands.length && r.brands.includes(sid(f.brand))) return true;
	if (r.categories.length && (f.categories || []).some((c: any) => r.categories.includes(sid(c)))) return true;
	if (r.collections.length && (f.collections || []).some((c: any) => r.collections.includes(sid(c)))) return true;
	return r.onSale && !!f.onSale;
};

export type Merch = {
	fired: CompiledRule[];
	hidden: (d: any) => boolean;
	/** Keeps the documents every filter rule allows — unless that leaves none. */
	filter: <T>(xs: T[], doc: (x: T) => any) => T[];
	/** Product ids to pin, in order (the first rule's first). */
	pins: string[];
	boosts: Boost[];
};

export const NO_MERCH: Merch = { fired: [], hidden: () => false, filter: xs => xs, pins: [], boosts: [] };

/** What the fired rules do. */
export const merchOf = (fired: CompiledRule[]): Merch => {
	if (!fired.length) return NO_MERCH;
	const hides = fired.filter(r => r.action === 'hide');
	const filters = fired.filter(r => r.action === 'filter');
	const hidden = (d: any) => hides.some(r => targets(r, d));
	const pins = [...new Set(fired.filter(r => r.action === 'pin').flatMap(r => r.products))];
	const boosts: Boost[] = fired
		.filter(r => r.action === 'boost' || r.action === 'bury')
		.map(r => ({ name: `rule “${r.name}”`, x: r.x, test: (d: any) => !hidden(d) && targets(r, d) }));
	return {
		fired,
		hidden,
		filter: (xs, doc) => {
			if (!filters.length) return xs;
			const kept = xs.filter(x => filters.every(r => targets(r, doc(x))));
			return kept.length ? kept : xs;
		},
		pins,
		boosts,
	};
};

/** Pinned documents first, in the pins' order (`extra`: pinned ones the search didn't find), then the rest. */
export const withPins = <T>(xs: T[], pins: string[], product: (x: T) => string, extra: T[] = []): { list: T[]; pinned: number } => {
	if (!pins.length) return { list: xs, pinned: 0 };
	const by = new Map<string, T>();
	for (const x of [...extra, ...xs]) by.set(product(x), x);
	const top = pins.map(id => by.get(id)).filter((x): x is T => x !== undefined);
	const set = new Set(top.map(product));
	return { list: [...top, ...xs.filter(x => !set.has(product(x)))], pinned: top.length };
};

/** A rule as a sentence, for its name and the panel: “Searches for “dress”: boost the Eid collection ×2”. */
export const ruleSentence = (r: any, names: { products?: string[]; brands?: string[]; categories?: string[]; collections?: string[]; category?: string } = {}) => {
	const qs = asList(r.queries).map(q => `“${q}”`);
	const when =
		r.when === 'exact'
			? `Searches for ${qs.join(' or ') || '…'}`
			: r.when === 'contains'
				? `Searches with ${qs.join(' or ') || '…'}`
				: r.when === 'category'
					? `The ${names.category || 'category'} page`
					: 'Every search';
	const what = [
		...(names.products?.length ? [names.products.join(', ')] : ids(r.products).length ? [`${ids(r.products).length} product${ids(r.products).length === 1 ? '' : 's'}`] : []),
		...(names.brands?.length ? [`brand ${names.brands.join(', ')}`] : []),
		...(names.categories?.length ? [`category ${names.categories.join(', ')}`] : []),
		...(names.collections?.length ? [`collection ${names.collections.join(', ')}`] : []),
		...(r.onSale ? ['products on sale'] : []),
	].join(' and ');
	const action = r.action as RuleAction;
	const verb = { hide: 'hide', filter: 'show only', pin: 'pin', boost: 'boost', bury: 'bury' }[action] || String(r.action || '');
	const x = action === 'boost' || action === 'bury' ? ` ×${strengthOf(action, r.strength)}` : '';
	return `${when}: ${verb} ${what || '…'}${x}`.slice(0, 160);
};
