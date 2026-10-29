import mongoose from 'mongoose';
import { TenancyError } from '../tenancy.function.js';
import { Store, itemName } from './store.js';

/**
 * The store's catalogue (docs/ecommerce EC7): every product sells through a
 * variant. Without options a product has one hidden default variant, kept in
 * step with it (SKU, barcode, sold or not); with options its variants are the
 * matrix of their values — new combinations added, dropped ones switched off
 * (never deleted: orders and stock name them). Prices left empty on a
 * variant are the product's.
 */

const MAX_VARIANTS = 100;
const clean = (v: any) => String(v ?? '').trim();
export const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

/** A product's options as lists of values: [{ name: 'Size', values: ['S', 'M'] }]. */
export const optionsOf = (product: any) =>
	(Array.isArray(product?.options) ? product.options : [])
		.map((o: any) => ({ name: clean(o?.name), values: [...new Set(clean(o?.values).split(',').map(clean).filter(Boolean))] as string[] }))
		.filter((o: any) => o.name && o.values.length)
		.slice(0, 3);

/** Every combination of the options' values, as a variant title and its option values. */
export const combinations = (options: { name: string; values: string[] }[]) => {
	let out: { title: string; optionValues: { name: string; value: string }[] }[] = [{ title: '', optionValues: [] }];
	for (const o of options) {
		const next: typeof out = [];
		for (const c of out) for (const v of o.values) next.push({ title: c.title ? `${c.title} / ${v}` : v, optionValues: [...c.optionValues, { name: o.name, value: v }] });
		out = next;
		if (out.length > MAX_VARIANTS) throw new TenancyError(400, `That makes more than ${MAX_VARIANTS} variants — split the product, or use fewer option values`);
	}
	return options.length ? out : [];
};

const keyOf = (optionValues: any[]) =>
	(optionValues || [])
		.map((o: any) => `${clean(o?.name).toLowerCase()}=${clean(o?.value).toLowerCase()}`)
		.sort()
		.join('|');

/**
 * Brings a product's variants in step with it. Returns them (active first).
 * Called after every product save (hooks.ts) and from the product page.
 */
export const syncVariants = async (store: Store, productId: any) => {
	const Product = store.M('product');
	const Variant = store.M('variant');
	const product: any = await Product.findById(productId).lean();
	if (!product) return [];
	const sold = product.status !== 'archived' && product.status !== 'draft';
	// A product set to Simple is one item whatever options it still carries.
	const combos = store.answers.products.variations && product.productType !== 'simple' ? combinations(optionsOf(product)) : [];
	const existing: any[] = await Variant.find({ product: product._id }).lean();

	if (!combos.length) {
		// One item: its default variant mirrors the product.
		const own = existing.find(v => v.isDefault);
		const set = { title: product.name, sku: clean(product.sku), barcode: clean(product.barcode), active: sold };
		if (own) await Variant.updateOne({ _id: own._id }, { $set: set });
		else await Variant.create({ product: product._id, ...set, isDefault: true, totalStock: 0, optionValues: [] });
		await Variant.updateMany({ product: product._id, isDefault: { $ne: true }, active: true }, { $set: { active: false } });
	} else {
		const byKey = new Map(existing.filter(v => !v.isDefault).map(v => [keyOf(v.optionValues), v]));
		const wanted = new Set<string>();
		for (const c of combos) {
			const k = keyOf(c.optionValues);
			wanted.add(k);
			const have = byKey.get(k);
			if (!have) await Variant.create({ product: product._id, title: c.title, optionValues: c.optionValues, active: sold, isDefault: false, totalStock: 0 });
			else if (have.title !== c.title || (!sold && have.active)) await Variant.updateOne({ _id: have._id }, { $set: { title: c.title, ...(!sold && { active: false }) } });
		}
		// Combinations no longer offered, and the default variant, stop selling.
		for (const v of existing) if ((v.isDefault || !wanted.has(keyOf(v.optionValues))) && v.active) await Variant.updateOne({ _id: v._id }, { $set: { active: false } });
	}
	return Variant.find({ product: product._id }).sort({ active: -1, isDefault: -1, createdAt: 1 }).lean();
};

/** A SKU or barcode some other product or variant already has: the name of who has it, or null. */
export const codeTaken = async (store: Store, field: 'sku' | 'barcode', value: any, self: { product?: any; variant?: any }) => {
	const v = clean(value);
	if (!v) return null;
	const Product = store.M('product');
	const Variant = store.M('variant');
	const variant: any = await Variant.findOne({
		[field]: v,
		...(self.variant && { _id: { $ne: self.variant } }),
		// A product's own default variant carries its codes.
		...(self.product && { $nor: [{ product: self.product, isDefault: true }] }),
	}).lean();
	if (variant) {
		const p: any = await Product.findById(variant.product, { name: 1 }).lean();
		return itemName(p, variant);
	}
	const product: any = await Product.findOne({ [field]: v, ...(self.product && { _id: { $ne: self.product } }) }, { name: 1 }).lean();
	return product ? product.name : null;
};

/** What the POS and pickers show for one variant. */
export const itemView = (product: any, variant: any, onHand: number | null = null) => ({
	variant: String(variant._id),
	product: String(product._id),
	name: itemName(product, variant),
	productName: product.name,
	title: variant.isDefault ? '' : variant.title,
	sku: variant.sku || '',
	barcode: variant.barcode || '',
	price: variant.price !== undefined && variant.price !== null ? Number(variant.price) : Number(product.price) || 0,
	compareAtPrice: variant.compareAtPrice ?? product.compareAtPrice ?? null,
	taxRate: product.taxRate ? String(product.taxRate) : null,
	category: product.category ? String(product.category) : null,
	trackStock: product.trackStock !== false,
	image: (Array.isArray(product.images) && (product.images[0]?.url || product.images[0])) || null,
	active: variant.active !== false,
	onHand,
	totalStock: variant.totalStock ?? 0,
});

/** On hand at an outlet for each of these variants. */
export const stockAt = async (store: Store, outlet: any, variants: any[]) => {
	if (!isId(outlet) || !variants.length) return new Map<string, number>();
	const rows: any[] = await store.M('stock').find({ outlet, variant: { $in: variants } }, { variant: 1, onHand: 1 }).lean();
	return new Map(rows.map(r => [String(r.variant), Number(r.onHand) || 0]));
};

/** A barcode or SKU, scanned or typed: the sellable variant it names. */
export const lookup = async (store: Store, code: any, outlet?: any) => {
	const c = clean(code);
	if (!c) throw new TenancyError(400, 'Scan or type a barcode or SKU');
	const Product = store.M('product');
	const Variant = store.M('variant');
	let variant: any = await Variant.findOne({ $or: [{ barcode: c }, { sku: c }], active: true }).lean();
	let product: any = variant ? await Product.findById(variant.product).lean() : null;
	if (!variant) {
		product = await Product.findOne({ $or: [{ barcode: c }, { sku: c }] }).lean();
		if (product) variant = await Variant.findOne({ product: product._id, isDefault: true, active: true }).lean();
	}
	if (!variant || !product || product.status === 'archived' || product.status === 'draft') throw new TenancyError(404, `Nothing for sale has the code ${c}`, 'not_found');
	const stock = await stockAt(store, outlet, [variant._id]);
	return itemView(product, variant, outlet ? stock.get(String(variant._id)) ?? 0 : null);
};

/**
 * The POS's category bar: the ones active on the POS (a store from before the
 * status had none — they're all shown), the highest Order on POS first.
 */
export const posCategories = async (store: Store) => {
	const rows: any[] = await store
		.M('category')
		.find({ posStatus: { $ne: 'inactive' } }, { name: 1, parent: 1, image: 1, sortOrder: 1 })
		.sort({ sortOrder: -1, name: 1 })
		.limit(200)
		.lean();
	return { doc: rows.map(c => ({ _id: String(c._id), name: c.name, parent: c.parent ? String(c.parent) : null, image: c.image || null })) };
};

/** What's for sale, by product: the POS's grid and the store's item pickers. */
export const catalogue = async (store: Store, { outlet, q, category, page = 1, limit = 60, all = false }: { outlet?: any; q?: string; category?: string; page?: number; limit?: number; all?: boolean }) => {
	const Product = store.M('product');
	const Variant = store.M('variant');
	const filter: any = all ? {} : { status: { $nin: ['archived', 'draft'] } };
	if (isId(category)) filter.category = category;
	const term = clean(q);
	if (term) {
		const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		// A product matches by its name or codes, or by any of its variants' codes or titles.
		const hits: any[] = await Variant.find({ $or: [{ sku: rx }, { barcode: rx }, { title: rx }] }, { product: 1 }).limit(500).lean();
		filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { _id: { $in: hits.map(h => h.product) } }];
	}
	const size = Math.min(Math.max(Number(limit) || 60, 1), 200);
	const skip = (Math.max(Number(page) || 1, 1) - 1) * size;
	const [products, total]: [any[], number] = await Promise.all([Product.find(filter).sort({ name: 1 }).skip(skip).limit(size).lean(), Product.countDocuments(filter)]);
	const variants: any[] = await Variant.find({ product: { $in: products.map(p => p._id) }, ...(!all && { active: true }) }).sort({ isDefault: -1, createdAt: 1 }).lean();
	const stock = await stockAt(store, outlet, variants.map(v => v._id));
	const byProduct = new Map<string, any[]>();
	for (const v of variants) byProduct.set(String(v.product), [...(byProduct.get(String(v.product)) || []), v]);
	return {
		total,
		page: Math.max(Number(page) || 1, 1),
		doc: products.map(p => ({
			_id: String(p._id),
			name: p.name,
			category: p.category ? String(p.category) : null,
			image: (Array.isArray(p.images) && (p.images[0]?.url || p.images[0])) || null,
			price: Number(p.price) || 0,
			trackStock: p.trackStock !== false,
			status: p.status,
			variants: (byProduct.get(String(p._id)) || []).map(v => itemView(p, v, outlet ? stock.get(String(v._id)) ?? 0 : null)),
		})),
	};
};
