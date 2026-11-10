/**
 * Store search — a product → its search document (docs/search SI4).
 *
 * `buildDocs(store, ids)` loads the products and everything a shopper might type to find them (variants' SKUs and
 * option values, the category and every category above it, the brand, the collections, the owner's own searchable
 * fields), runs each part through the normaliser, and writes one SearchDoc per product. Products that are gone,
 * archived or not active lose theirs. Called by the indexer only (indexer.ts), in the store's scope.
 */
import SearchDoc from '../../../models/tenancy/searchDoc.model.js';
import ModelDefinition from '../../../models/builder/modelDefinition.model.js';
import { currentScope } from '../../tenantScope.function.js';
import type { Store } from '../store.js';
import { codeKey, normalise, type Normalised } from './normalise.js';
import { optKey } from './facets.js';

/** The parts of a product, and which go into suggestions / typos (all but the description). */
export const PARTS = ['name', 'brand', 'category', 'collection', 'option', 'keyword', 'description', 'custom'] as const;
export type Part = (typeof PARTS)[number];
const SUGGESTED: Part[] = ['name', 'brand', 'category', 'collection', 'option', 'keyword', 'custom'];

const DESCRIPTION_MAX = 2000;
const PREFIX_MAX = 15;
/** Kinds of the owner's own fields that can be searched, when marked searchable. */
const CUSTOM_KINDS = new Set(['text', 'textarea', 'tags', 'select', 'uid']);
/** Core product fields: never read again as the owner's own. */
const CORE = new Set(['name', 'keywords', 'description', 'sku', 'barcode', 'status', 'slug', 'productType', 'seo']);

const id = (v: any) => (v == null ? '' : String(v?._id ?? v));
const num = (v: any) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const text = (v: any): string => (v == null ? '' : Array.isArray(v) ? v.map(text).join(' ') : typeof v === 'object' ? text(v.label ?? v.name ?? v.value ?? '') : String(v));
const stripTags = (html: string) =>
	html
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&[a-z]+;|&#\d+;/gi, ' ');

/** Every prefix (1–15 letters) of a word, by code point so Bangla isn't cut mid-letter. */
export const prefixesOf = (w: string) => {
	const cp = [...w];
	const out: string[] = [];
	for (let i = 1; i <= Math.min(cp.length, PREFIX_MAX); i++) out.push(cp.slice(0, i).join(''));
	return out;
};

/** A word's trigrams, with `_` marking its edges: "shirt" → _sh shi hir irt rt_. */
export const gramsOf = (w: string) => {
	const cp = ['_', ...w, '_'];
	if (cp.length < 4) return [cp.join('')];
	const out: string[] = [];
	for (let i = 0; i + 3 <= cp.length; i++) out.push(cp.slice(i, i + 3).join(''));
	return out;
};

const pick = (n: Normalised) => ({ words: n.words, stems: n.stems, phon: n.phon });

/** The category and its parents, by id → { name, parent }. */
const categoryTree = async (store: Store) => {
	if (!store.installed.category) return new Map<string, any>();
	const all: any[] = await store.M('category').find({}, { name: 1, parent: 1 }).lean();
	return new Map(all.map(c => [id(c._id), c]));
};
const ancestors = (tree: Map<string, any>, start: any) => {
	const out: any[] = [];
	const seen = new Set<string>();
	let cur = tree.get(id(start));
	while (cur && !seen.has(id(cur._id)) && out.length < 10) {
		seen.add(id(cur._id));
		out.push(cur);
		cur = cur.parent ? tree.get(id(cur.parent)) : null;
	}
	return out;
};

/** The owner's own product fields marked searchable. */
const customFields = async (store: Store): Promise<string[]> => {
	const def: any = await ModelDefinition.findById(store.installed.product?.id, { fields: 1 }).lean();
	return (def?.fields || []).filter((f: any) => f.searchable === true && CUSTOM_KINDS.has(f.kind) && !CORE.has(f.key)).map((f: any) => f.key);
};

const firstImage = (p: any) => (Array.isArray(p.images) && (p.images[0]?.url || p.images[0])) || p.image?.url || p.image || null;

/** What one product's search document says. Exported for tests; `ctx` is loaded once per batch. */
export const docFor = (p: any, variants: any[], ctx: { tree: Map<string, any>; brands: Map<string, any>; collections: Map<string, any>; custom: string[] }) => {
	const cats = p.category ? ancestors(ctx.tree, p.category) : [];
	const brand = p.brand ? ctx.brands.get(id(p.brand)) : null;
	const cols = (Array.isArray(p.collections) ? p.collections : []).map((c: any) => ctx.collections.get(id(c))).filter(Boolean);
	const live = variants.filter(v => v.active !== false);

	// Option values: the product's own list ("Size: S, M, L") and each variant's.
	const opts = new Map<string, Set<string>>();
	const addOpt = (name: any, value: any) => {
		const n = String(name ?? '').trim();
		const v = String(value ?? '').trim();
		if (!n || !v) return;
		if (!opts.has(n)) opts.set(n, new Set());
		opts.get(n)!.add(v);
	};
	for (const o of Array.isArray(p.options) ? p.options : []) for (const v of String(o?.values ?? '').split(',')) addOpt(o?.name, v);
	for (const v of live) for (const ov of Array.isArray(v.optionValues) ? v.optionValues : []) addOpt(ov?.name, ov?.value);

	const parts: Record<Part, Normalised> = {
		name: normalise(p.name),
		brand: normalise(brand?.name),
		category: normalise(cats.map(c => c.name).join(' ')),
		collection: normalise(cols.map((c: any) => c.name).join(' ')),
		option: normalise([...opts.values()].flatMap(s => [...s]).join(' ')),
		keyword: normalise(text(p.keywords)),
		description: normalise(stripTags(text(p.description)).slice(0, DESCRIPTION_MAX)),
		custom: normalise(ctx.custom.map(k => text(p[k])).join(' ')),
	};

	const terms = new Set<string>();
	const prefixes = new Set<string>();
	const grams = new Set<string>();
	const phon = new Set<string>();
	for (const part of PARTS) {
		for (const t of parts[part].tokens) {
			terms.add(t.word);
			terms.add(t.stem);
			if (!SUGGESTED.includes(part)) continue;
			for (const w of new Set([t.word, t.stem])) {
				for (const x of prefixesOf(w)) prefixes.add(x);
				if (t.kind === 'word' || t.kind === 'bn') for (const g of gramsOf(w)) grams.add(g);
			}
			if (t.phon) phon.add(t.phon);
		}
	}

	const codes = new Set<string>();
	for (const x of [p.sku, p.barcode, ...live.flatMap(v => [v.sku, v.barcode])]) {
		const k = x == null ? '' : codeKey(String(x));
		if (k) codes.add(k);
	}

	// The price a shopper pays now: the lowest of the active variants', discount off; else the product's.
	// A variant with no price of its own sells at the product's (its Sale price is then worked out from nothing: 0).
	const sell = (x: any) => {
		const price = num(x?.price);
		if (price == null) return null;
		const sale = num(x?.salePrice);
		return sale != null && (sale > 0 || price === 0) ? sale : price;
	};
	const prices = live.map(v => sell(v) ?? sell(p)).filter((n): n is number => n != null);
	const price = prices.length ? Math.min(...prices) : sell(p);
	const compareAt = num(p.compareAtPrice);
	const onSale = (Number(p.discountPercent) || 0) > 0 || (compareAt != null && price != null && compareAt > price);
	const inStock = p.trackStock === false || (live.length ? live.some(v => (Number(v.totalStock) || 0) > 0) : (Number(p.totalStock) || 0) > 0);

	return {
		kind: 'product',
		product: p._id,
		status: 'active',
		terms: [...terms].filter(Boolean),
		prefixes: [...prefixes],
		grams: [...grams],
		phon: [...phon],
		codes: [...codes],
		fields: Object.fromEntries(PARTS.map(k => [k, pick(parts[k])])),
		facets: {
			categories: cats.map(c => c._id),
			brand: brand?._id ?? null,
			collections: cols.map((c: any) => c._id),
			price,
			onSale,
			inStock,
			...optionFacets(opts),
		},
		signals: { views: Number(p.views) || 0, wishes: Number(p.wishlistCount) || 0, createdAt: p.createdAt ?? null },
		card: {
			name: p.name ?? '',
			slug: p.slug ?? null,
			image: firstImage(p),
			price: num(p.price),
			salePrice: num(p.salePrice),
			compareAtPrice: compareAt,
			discountPercent: Number(p.discountPercent) || 0,
			priceAfterTax: num(p.priceAfterTax),
			category: cats[0] ? { _id: cats[0]._id, name: cats[0].name } : null,
			brand: brand ? { _id: brand._id, name: brand.name } : null,
			inStock,
		},
		sourceAt: p.updatedAt ?? null,
	};
};

/** Option values as filter keys ("size=m") and, in the same order, as the store wrote them ("Size=M"). */
const optionFacets = (opts: Map<string, Set<string>>) => {
	const keys: string[] = [];
	const labels: string[] = [];
	for (const [n, vs] of opts)
		for (const v of vs) {
			const k = optKey(n, v);
			if (k.startsWith('=') || k.endsWith('=') || keys.includes(k)) continue;
			keys.push(k);
			labels.push(`${n}=${v}`);
		}
	return { opts: keys, labels };
};

/** Whether a product is one shoppers can find. */
const findable = (p: any) => p && (p.status ?? 'active') === 'active' && !p.archivedAt;

const scopeIds = () => {
	const s = currentScope();
	if (!s?.project) throw new Error('Search documents are built in a store’s scope');
	return { organization: s.organization, project: s.project };
};

/**
 * Builds (or removes) the search documents of these products. Returns how many were written and removed.
 * `builtAt` is stamped on every write, so a full rebuild can drop the documents it didn't write (indexer.ts).
 */
export const buildDocs = async (store: Store, productIds: any[], builtAt = new Date()) => {
	const ids = [...new Set(productIds.map(id).filter(Boolean))];
	if (!ids.length || !store.installed.product) return { written: 0, removed: 0 };
	const products: any[] = await store.M('product').find({ _id: { $in: ids } }).lean();
	const keep = products.filter(findable);
	const keepIds = new Set(keep.map(p => id(p._id)));
	const gone = ids.filter(x => !keepIds.has(x));

	let written = 0;
	if (keep.length) {
		const [tree, variants, custom] = await Promise.all([
			categoryTree(store),
			store.installed.variant ? store.M('variant').find({ product: { $in: keep.map(p => p._id) } }).lean() : Promise.resolve([] as any[]),
			customFields(store),
		]);
		const brandIds = [...new Set(keep.map(p => id(p.brand)).filter(Boolean))];
		const colIds = [...new Set(keep.flatMap(p => (Array.isArray(p.collections) ? p.collections : []).map(id)).filter(Boolean))];
		const [brands, cols] = await Promise.all([
			brandIds.length && store.installed.brand ? store.M('brand').find({ _id: { $in: brandIds } }, { name: 1 }).lean() : Promise.resolve([] as any[]),
			colIds.length && store.installed.collection ? store.M('collection').find({ _id: { $in: colIds } }, { name: 1 }).lean() : Promise.resolve([] as any[]),
		]);
		const ctx = {
			tree,
			brands: new Map<string, any>((brands as any[]).map(b => [id(b._id), b])),
			collections: new Map<string, any>((cols as any[]).map(c => [id(c._id), c])),
			custom,
		};
		const byProduct = new Map<string, any[]>();
		for (const v of variants as any[]) {
			const k = id(v.product);
			if (!byProduct.has(k)) byProduct.set(k, []);
			byProduct.get(k)!.push(v);
		}
		// bulkWrite isn't confined by the tenant plugin: the scope goes in by hand.
		const scope = scopeIds();
		// The nightly numbers (units sold in 30 days, the learned boost) are the rollups' (SI-13, SI-16): a rebuild
		// leaves them as they are.
		const ops = keep.map(p => {
			const { signals, ...doc } = docFor(p, byProduct.get(id(p._id)) || [], ctx);
			return {
				updateOne: {
					filter: { ...scope, product: p._id },
					update: {
						$set: { ...doc, ...scope, builtAt, 'signals.views': signals.views, 'signals.wishes': signals.wishes, 'signals.createdAt': signals.createdAt },
						$setOnInsert: { 'signals.sold30': 0, 'signals.learned': 1 },
					},
					upsert: true,
				},
			};
		});
		if (ops.length) {
			await SearchDoc.bulkWrite(ops, { ordered: false });
			written = ops.length;
		}
	}
	let removed = 0;
	if (gone.length) removed = (await SearchDoc.deleteMany({ product: { $in: gone } })).deletedCount || 0;
	return { written, removed };
};
