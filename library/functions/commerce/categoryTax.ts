import mongoose from 'mongoose';
import { Store } from './store.js';
import { isId } from './catalogue.js';

/**
 * A category's tax flows down to its products (docs/ecommerce): when a category
 * gets a tax, every product in it takes that tax. A variant that carried the
 * product's old tax moves with it; one with a tax of its own is left alone. Each
 * is saved like any edit, so "Price after tax" is worked out again.
 */

const same = (a: any, b: any) => String(a?._id ?? a ?? '') === String(b?._id ?? b ?? '');

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
	let n = 0;
	const products: any[] = await Product.find({ category: new mongoose.Types.ObjectId(String(categoryId)) });
	for (const p of products) {
		if (same(p.taxRate, tax._id)) continue;
		if (!apply) {
			n++;
			continue;
		}
		const before = p.taxRate;
		p.taxRate = tax._id;
		await p.save();
		n++;
		for (const v of await Variant.find({ product: p._id })) {
			if (!v.taxRate || !same(v.taxRate, before)) continue;
			v.taxRate = tax._id;
			await v.save();
		}
	}
	return n;
};

/** Every category that has a tax hands it down — for a store whose categories had their tax before this existed. Returns the products changed. */
export const applyAllCategoryTaxes = async (store: Store, opts = {}) => {
	if (!store.installed.category) return 0;
	let n = 0;
	for (const c of await store.M('category').find({ taxRate: { $ne: null } }, { _id: 1 }).lean()) n += await applyCategoryTax(store, c._id, opts);
	return n;
};
