import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { Store } from './store.js';
import { formulasOfPage } from '../automations.function.js';
import { recalculateFormulas } from '../formula.function.js';
import { TAX_ADDED_FILL } from './blueprint.js';

/**
 * The tax an item carries, by the till's own rule (docs/ecommerce/TAX_AUTOMATIONS.md TX4): the variant's tax,
 * else its product's, else the store's default rate; none when the store charges no tax. Used by the till
 * (pricing.ts) and by `taxAdded` — the engine-owned field Price after tax is calculated from (price × (1 +
 * taxAdded / 100)): the rate when the store *adds* tax to the price, 0 when the price already holds it or there is none.
 */
export const effectiveRate = (taxMode: string, rates: any[], p: any, v?: any) => {
	if (taxMode === 'none') return 0;
	const find = (id: any) => (id ? rates.find(r => String(r._id) === String(id?._id ?? id)) : null);
	const own = find(v?.taxRate) || find(p?.taxRate);
	return Number((own || rates.find(r => r.isDefault) || { rate: 0 }).rate) || 0;
};

type Only = { product?: any[]; variant?: any[] };

/**
 * Works `taxAdded` out again — for everything, or for `only` some records — and then Price after tax with it.
 * Called when a product or variant is saved, a tax is changed, and the store's tax mode changes. Never throws.
 */
export const refreshTaxAdded = async (store: Store, only?: Only) => {
	try {
		const mode = store.answers?.pos?.tax?.mode || 'none';
		const rates: any[] = mode === 'none' ? [] : await store.M('taxRate').find({}).lean();
		const want = (p: any, v?: any) => (mode === 'added' ? effectiveRate(mode, rates, p, v) : 0);
		const Product = store.M('product');
		const Variant = store.M('variant');
		const pick = (ids?: any[]) => (ids ? { _id: { $in: ids } } : {});
		const sweep = async (key: 'product' | 'variant', filter: any, rateFor: (d: any) => number) => {
			const Model = key === 'product' ? Product : Variant;
			const def: any = await ModelDefinition.findOne({ route: store.installed[key].route }).lean();
			const formulas = def ? await formulasOfPage(def) : [];
			let ops: any[] = [];
			const flush = async () => {
				if (!ops.length) return;
				const ids = ops.map(o => o.updateOne.filter._id);
				await Model.bulkWrite(ops);
				ops = [];
				await recalculateFormulas(Model, { _id: { $in: ids } }, formulas);
			};
			for await (const d of Model.find(filter, { taxRate: 1, taxAdded: 1, product: 1 }).lean().cursor()) {
				const next = rateFor(d);
				if (d.taxAdded === next) continue;
				ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { taxAdded: next } } } });
				if (ops.length >= 500) await flush();
			}
			await flush();
		};
		const products = new Map<string, any>();
		for (const p of await Product.find({}, { taxRate: 1 }).lean()) products.set(String(p._id), p);
		if (!only || only.product) await sweep('product', pick(only?.product), p => want(p));
		if (!only || only.variant) await sweep('variant', pick(only?.variant), v => want(products.get(String(v.product)), v));
	} catch (e: any) {
		console.error('tax rates:', e?.message);
	}
};

/** A product's saved: its own `taxAdded`, and its variants'. */
export const refreshProductTax = async (store: Store, productId: any) => {
	const ids = (await store.M('variant').find({ product: productId }, { _id: 1 }).lean()).map((d: any) => d._id);
	await refreshTaxAdded(store, { product: [productId], variant: ids });
};

const PRICE_LABELS: Record<string, string> = { added: 'Price after tax', inclusive: 'Price incl. tax', none: 'Price (no tax)' };

/**
 * The Price after tax column says what it holds for the store's tax mode: “Price after tax” (tax added),
 * “Price incl. tax” (the price already holds it), “Price (no tax)”. Only a label the store itself gave is
 * renewed — one the owner renamed stays. Called after Store settings are saved, and by the upgrade.
 */
export const relabelPriceColumns = async (req: any, store: Store, { apply = true } = {}) => {
	const mode = store.answers?.pos?.tax?.mode || 'none';
	const want = PRICE_LABELS[mode];
	const known = Object.values(PRICE_LABELS);
	const done: string[] = [];
	for (const key of ['product', 'variant'] as const) {
		const id = store.installed[key]?.id;
		const def: any = id && (await ModelDefinition.findById(id).lean());
		const f = def?.fields?.find((x: any) => x.key === 'priceAfterTax');
		const relabel = !!f && f.label !== want && known.includes(f.label);
		// The form fills "Tax added" from the picked tax only where tax is added on top.
		const tax = def?.fields?.find((x: any) => x.key === 'taxAdded');
		const refill = !!tax && !!tax.fillFrom?.from !== (mode === 'added');
		if (!relabel && !refill) continue;
		if (relabel) done.push(`${def.title}: “${f.label}” → “${want}”`);
		if (refill) done.push(`${def.title}: Tax added ${mode === 'added' ? 'fills from' : 'no longer fills from'} the picked tax`);
		if (!apply) continue;
		const { updateModelCore } = await import('../../controllers/builder/models.controller.js');
		const fields = def.fields.map((x: any) => {
			if (relabel && x.key === 'priceAfterTax') return { ...x, label: want };
			if (refill && x.key === 'taxAdded') {
				const { fillFrom: _gone, ...rest } = x;
				return mode === 'added' ? { ...rest, fillFrom: TAX_ADDED_FILL } : rest;
			}
			return x;
		});
		await updateModelCore(req, def._id, { ...def, fields }, { note: 'The price column follows the tax mode' });
	}
	return done;
};
