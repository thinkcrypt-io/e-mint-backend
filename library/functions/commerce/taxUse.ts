import mongoose from 'mongoose';
import { Store } from './store.js';
import { move } from './taxStatus.js';
import { refreshTaxAdded } from './taxRates.js';
import { TenancyError } from '../tenancy.function.js';

/**
 * A tax in use (docs/ecommerce/TAX_AUTOMATIONS.md TX5): it can't be deleted while categories, products or
 * variants hold it — they would silently fall to the default rate. `taxUsage` counts them (and an inactive
 * tax still on something is told so); `replaceTax` moves them all to another, active tax, so prices follow.
 */
const KEYS = ['category', 'product', 'variant'] as const;

export type TaxUsage = { categories: number; products: number; variants: number; total: number };

export const taxUsage = async (store: Store, taxId: any): Promise<TaxUsage> => {
	const out: any = { categories: 0, products: 0, variants: 0 };
	if (mongoose.isValidObjectId(taxId))
		for (const key of KEYS) if (store.installed[key]) out[`${key === 'category' ? 'categories' : key + 's'}`] = await store.M(key).countDocuments({ taxRate: taxId });
	return { ...out, total: out.categories + out.products + out.variants };
};

/** "Used by 42 products, 3 categories and 5 variants" */
export const usageText = (u: TaxUsage) => {
	const parts = [
		u.products && `${u.products} product${u.products === 1 ? '' : 's'}`,
		u.categories && `${u.categories} categor${u.categories === 1 ? 'y' : 'ies'}`,
		u.variants && `${u.variants} variant${u.variants === 1 ? '' : 's'}`,
	].filter(Boolean) as string[];
	return `Used by ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || 'nothing'}`;
};

/** Everything holding `from` takes `to` (an active tax); returns how many records moved. */
export const replaceTax = async (store: Store, from: any, to: any) => {
	if (!mongoose.isValidObjectId(from) || !mongoose.isValidObjectId(to) || String(from) === String(to)) throw new TenancyError(400, 'Pick another tax to move them to');
	const target: any = await store.M('taxRate').findById(to).lean();
	if (!target || target.status === 'inactive') throw new TenancyError(400, 'Pick an active tax to move them to');
	let n = 0;
	for (const key of KEYS) {
		if (!store.installed[key]) continue;
		const ids = (await store.M(key).find({ taxRate: from }, { _id: 1 }).lean()).map((d: any) => d._id);
		n += (await move(store, key, ids, from, target._id, 'Store: tax replaced')).length;
	}
	await refreshTaxAdded(store);
	return n;
};
