import mongoose from 'mongoose';
import { Store } from './store.js';
import { isId } from './catalogue.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { formulasOfPage } from '../automations.function.js';
import { recalculateFormulas } from '../formula.function.js';
import { diffFields, recordHistory } from '../recordHistory.function.js';

/**
 * A category's tax flows down to its products (docs/ecommerce): when a category
 * gets a tax, every product in it takes that tax. A variant that carried the
 * product's old tax moves with it; one with a tax of its own is left alone. Each
 * is saved and then has its formulas worked out again (a bare doc.save() runs none), and
 * writes a History entry, "Store: category tax".
 */

const same = (a: any, b: any) => String(a?._id ?? a ?? '') === String(b?._id ?? b ?? '');

/** The formula fields of a store model, from its published settings (what its form and API apply). */
const formulasFor = async (store: Store, key: 'product' | 'variant') => {
	const def: any = await ModelDefinition.findOne({ route: store.installed[key]?.route }).lean();
	return def ? formulasOfPage(def) : [];
};

const ACTOR = { user: { name: 'Store: category tax' } };

/** Gives `categoryId`'s tax to its products (and their variants). Returns how many products changed (or would, with `apply: false`). */
export const applyCategoryTax = async (store: Store, categoryId: any, { apply = true } = {}) => {
	if (!isId(categoryId) || !store.installed.category || !store.installed.taxRate) return 0;
	const category: any = await store.M('category').findById(categoryId).lean();
	if (!category?.taxRate) return 0;
	const tax: any = await store.M('taxRate').findById(category.taxRate?._id ?? category.taxRate).lean();
	// A tax switched off isn't handed down.
	if (!tax || tax.status === 'inactive') return 0;
	const Product = store.M('product');
	const Variant = store.M('variant');
	const products: any[] = await Product.find({ category: new mongoose.Types.ObjectId(String(categoryId)) });
	const fresh = (Model: any, docs: any[]) => Model.find({ _id: { $in: docs.map(d => d._id) } }).lean();
	const toTax = { _id: tax._id, name: tax.name };
	const before = new Map<string, any>();
	const changedProducts: any[] = [];
	const changedVariants: any[] = [];
	for (const p of products) {
		if (same(p.taxRate, tax._id)) continue;
		if (!apply) {
			changedProducts.push(p);
			continue;
		}
		const was = p.taxRate;
		before.set(String(p._id), { taxRate: was, priceAfterTax: p.priceAfterTax });
		p.taxRate = tax._id;
		await p.save();
		changedProducts.push(p);
		for (const v of await Variant.find({ product: p._id })) {
			if (!v.taxRate || !same(v.taxRate, was)) continue;
			before.set(String(v._id), { taxRate: v.taxRate, priceAfterTax: v.priceAfterTax });
			v.taxRate = tax._id;
			await v.save();
			changedVariants.push(v);
		}
	}
	if (!apply || !changedProducts.length) return changedProducts.length;
	// doc.save() runs no formulas: work Price after tax out again, then log what moved.
	const names = new Map<string, string>();
	for (const t of await store.M('taxRate').find({}, { name: 1 }).lean()) names.set(String(t._id), t.name);
	const named = (v: any) => (v ? { _id: v, name: names.get(String(v?._id ?? v)) || '' } : v);
	for (const [key, Model, docs] of [['product', Product, changedProducts], ['variant', Variant, changedVariants]] as const) {
		if (!docs.length) continue;
		await recalculateFormulas(Model, { _id: { $in: docs.map(d => d._id) } }, await formulasFor(store, key));
		for (const after of await fresh(Model, docs)) {
			const was = before.get(String(after._id));
			if (!was) continue;
			const changes = diffFields({
				before: { taxRate: named(was.taxRate), priceAfterTax: was.priceAfterTax },
				after: { taxRate: named(after.taxRate ?? toTax), priceAfterTax: after.priceAfterTax },
				fields: ['taxRate', 'priceAfterTax'],
				settings: { taxRate: { title: 'Tax / VAT' }, priceAfterTax: { title: 'Price after tax' } },
			});
			recordHistory({ req: ACTOR, action: 'update', model: Model.modelName, doc: after, changes, modelPath: store.installed[key]?.route });
		}
	}
	return changedProducts.length;
};

/** Every category that has a tax hands it down — for a store whose categories had their tax before this existed. Returns the products changed. */
export const applyAllCategoryTaxes = async (store: Store, opts = {}) => {
	if (!store.installed.category) return 0;
	let n = 0;
	for (const c of await store.M('category').find({ taxRate: { $ne: null } }, { _id: 1 }).lean()) n += await applyCategoryTax(store, c._id, opts);
	return n;
};
