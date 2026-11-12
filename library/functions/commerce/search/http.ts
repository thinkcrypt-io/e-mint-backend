/**
 * Store search over HTTP (docs/search SI-05): the public routes' query string → an engine request, the engine's
 * answer → what a storefront shows (category and brand names, option values as the store wrote them), and the store's
 * search settings as the panel reads and saves them.
 *
 *   GET /public/api/store/search?q=&page=&limit=&sort=&category=&collection=&brand=&price[gte]=&price[lte]=
 *                               &option.Size=M&inStock=1&onSale=1&facets=1&explain=1
 *   GET /public/api/store/search/suggest?q=
 */
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import { TenancyError } from '../../tenancy.function.js';
import type { Store } from '../store.js';
import type { FacetCounts, Filters } from './facets.js';
import type { SearchRequest, SearchResult, SearchSort } from './engine.js';
import { SEARCH_DEFAULTS, searchSettingsOf, type SearchSettings } from './settings.js';
import { meaningState } from './semantic/model.js';

const SORTS: SearchSort[] = ['relevance', 'popular', 'price', '-price', 'newest', 'name'];
const list = (v: any): string[] =>
	(Array.isArray(v) ? v : v == null ? [] : [v])
		.flatMap(x => String(x).split(','))
		.map(s => s.trim())
		.filter(Boolean)
		.slice(0, 50);
const yes = (v: any) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());
const isId = (s: string) => /^[a-f0-9]{24}$/i.test(s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const money = (v: any, name: string) => {
	if (v == null || v === '') return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) throw new TenancyError(400, `${name} must be a number of 0 or more`, 'search_invalid');
	return n;
};

/** Ids or web addresses (slugs) of a store model's records → ids. Unknown ones are dropped. */
const idsOf = async (store: Store, key: 'category' | 'collection', refs: string[]) => {
	if (!refs.length || !store.installed[key]) return [];
	const ids = refs.filter(isId);
	const slugs = refs.filter(r => !isId(r)).map(r => r.toLowerCase());
	const docs: any[] = await store.M(key).find({ $or: [{ _id: { $in: ids } }, ...(slugs.length ? [{ slug: { $in: slugs } }] : [])] }, { _id: 1 }).lean();
	return docs.map(d => String(d._id));
};
/** Brands by id or name (any case). */
const brandIds = async (store: Store, refs: string[]) => {
	if (!refs.length || !store.installed.brand) return [];
	const ids = refs.filter(isId);
	const names = refs.filter(r => !isId(r));
	const docs: any[] = await store.M('brand').find({ $or: [{ _id: { $in: ids } }, ...names.map(n => ({ name: new RegExp(`^${esc(n)}$`, 'i') }))] }, { _id: 1 }).lean();
	return docs.map(d => String(d._id));
};

/** `option.Size=M`, `option[Size]=M`, `options[Size]=M,L` → { Size: ['M'] }. */
const optionsOf = (query: any) => {
	const out: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(query || {})) {
		const dotted = k.match(/^options?\.(.+)$/);
		if (dotted) out[dotted[1]] = [...(out[dotted[1]] || []), ...list(v)];
		if ((k === 'option' || k === 'options') && v && typeof v === 'object' && !Array.isArray(v))
			for (const [n, vs] of Object.entries(v as any)) out[n] = [...(out[n] || []), ...list(vs)];
	}
	return out;
};

/**
 * The query string as an engine request. A category / collection / brand that names nothing filters to nothing
 * (a page for a category that's gone shows no products, not every product).
 */
export const searchRequestOf = async (store: Store, query: any, { canExplain = false } = {}): Promise<SearchRequest> => {
	const q = String(query.q ?? query.search ?? '').slice(0, 100);
	const sort = String(query.sort ?? 'relevance');
	if (!SORTS.includes(sort as SearchSort)) throw new TenancyError(400, `sort must be one of ${SORTS.join(', ')}`, 'search_invalid');
	const price = query.price && typeof query.price === 'object' ? query.price : {};
	const gte = money(price.gte ?? query.minPrice, 'price[gte]');
	const lte = money(price.lte ?? query.maxPrice, 'price[lte]');
	if (gte != null && lte != null && gte > lte) throw new TenancyError(400, 'price[gte] is more than price[lte]', 'search_invalid');
	const asked = { categories: list(query.category ?? query.categories), collections: list(query.collection ?? query.collections), brands: list(query.brand ?? query.brands) };
	const [categories, collections, brands] = await Promise.all([idsOf(store, 'category', asked.categories), idsOf(store, 'collection', asked.collections), brandIds(store, asked.brands)]);
	const none = ['000000000000000000000000'];
	const filters: Filters = {
		...(asked.categories.length && { categories: categories.length ? categories : none }),
		...(asked.collections.length && { collections: collections.length ? collections : none }),
		...(asked.brands.length && { brands: brands.length ? brands : none }),
		...((gte != null || lte != null) && { price: { gte, lte } }),
		...(yes(query.inStock) && { inStock: true }),
		...(yes(query.onSale) && { onSale: true }),
		opts: optionsOf(query),
	};
	return {
		q,
		page: Number(query.page) || 1,
		limit: Number(query.limit) || 24,
		sort: sort as SearchSort,
		filters,
		facets: yes(query.facets),
		explain: canExplain && yes(query.explain),
	};
};

const named = async (store: Store, key: 'category' | 'collection' | 'brand', counts: { _id: string; count: number }[], fields: string) => {
	if (!counts.length || !store.installed[key]) return [];
	const ids = counts.map(c => c._id).filter(isId);
	const docs = new Map<string, any>(((await store.M(key).find({ _id: { $in: ids } }, fields).lean()) as any[]).map(d => [String(d._id), d]));
	return counts.filter(c => docs.has(c._id)).map(c => {
		const { _id, ...rest } = docs.get(c._id);
		return { _id: c._id, ...rest, count: c.count };
	});
};

/** The engine's filter counts with names, ready to show. */
export const namedFacets = async (store: Store, f: FacetCounts) => {
	const [categories, collections, brands] = await Promise.all([
		named(store, 'category', f.categories, 'name slug parent'),
		named(store, 'collection', f.collections, 'name slug'),
		named(store, 'brand', f.brands, 'name'),
	]);
	return {
		categories,
		collections,
		brands,
		price: f.price,
		options: Object.entries(f.opts).map(([key, o]) => ({ key, name: o.name, values: o.values.map(v => ({ key: v.value, value: v.label, count: v.count })) })),
		inStock: f.inStock,
		onSale: f.onSale,
	};
};

/** A search answer as the public route gives it. */
export const publicAnswer = async (store: Store, r: SearchResult) => {
	const { facets, ...rest } = r;
	return { ...rest, ...(facets && { facets: await namedFacets(store, facets) }) };
};

/* ------------------------------------------------------------------ settings */

const raw = async () => ((await CommerceSettings.findOne({}, { search: 1 }).lean()) as any)?.search || {};

/** Whether the public search routes answer (they do unless the store switched search off). */
export const searchIsOn = async () => (await raw()).enabled !== false;
/**
 * Whether the generic `search=` of the Products list goes to the engine too. Only for a store switched on by name
 * (new stores; existing ones once they've been checked: README §8.5) — a storefront built on the old answers keeps
 * them until then.
 */
export const listSearchUsesEngine = async () => (await raw()).enabled === true;

/** The settings as the panel shows them (SI-06). */
export const searchSettingsView = async () => {
	const r = await raw();
	return { ...searchSettingsOf(r), enabled: r.enabled === true ? true : r.enabled === false ? false : null, defaults: SEARCH_DEFAULTS, meaning: meaningState() };
};

/** Saves the settings sent (each checked; unknown keys refused). */
export const saveSearchSettings = async (body: any) => {
	const allowed = ['enabled', 'typos', 'outOfStock', 'dials', 'learning', 'banglish', 'semantic'];
	const extra = Object.keys(body || {}).filter(k => !allowed.includes(k));
	if (extra.length) throw new TenancyError(400, `Unknown search settings: ${extra.join(', ')}`, 'search_invalid');
	const problems: string[] = [];
	const check = (ok: boolean, msg: string) => ok || problems.push(msg);
	if ('enabled' in body) check(typeof body.enabled === 'boolean', 'enabled must be true or false');
	if ('typos' in body) check(['off', 'normal', 'loose'].includes(body.typos), 'typos must be off, normal or loose');
	if ('outOfStock' in body) check(['show', 'hide'].includes(body.outOfStock), 'outOfStock must be show or hide');
	if ('learning' in body) check(typeof body.learning === 'boolean', 'learning must be true or false');
	if ('banglish' in body) check(typeof body.banglish === 'boolean', 'banglish must be true or false');
	if ('semantic' in body) check(typeof body.semantic === 'boolean', 'semantic must be true or false');
	if ('dials' in body) {
		const d = body.dials;
		if (!d || typeof d !== 'object') problems.push('dials must be an object');
		else
			for (const [k, v] of Object.entries(d)) {
				if (!['popularity', 'freshness', 'sale', 'learned'].includes(k)) problems.push(`Unknown dial: ${k}`);
				else if (!['off', 'low', 'normal', 'high'].includes(v as any)) problems.push(`${k} must be off, low, normal or high`);
			}
	}
	if (problems.length) throw Object.assign(new TenancyError(400, problems[0], 'search_invalid'), { problems });
	const $set: Record<string, any> = {};
	for (const k of ['enabled', 'typos', 'outOfStock', 'learning', 'banglish', 'semantic']) if (k in body) $set[`search.${k}`] = body[k];
	for (const [k, v] of Object.entries(body.dials || {})) $set[`search.dials.${k}`] = v;
	if (Object.keys($set).length) await CommerceSettings.updateOne({}, { $set });
	return searchSettingsView();
};

/** The engine's settings for this store. */
export const currentSearchSettings = async (): Promise<SearchSettings> => searchSettingsOf(await raw());

