import mongoose from 'mongoose';
import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { Store } from './store.js';
import { formulasOfPage } from '../automations.function.js';
import { recalculateFormulas } from '../formula.function.js';
import { diffFields, recordHistory } from '../recordHistory.function.js';

/**
 * A tax switched to inactive is taken off everything that has it (categories, products, variants — their Price
 * after tax goes back to the bare price); switched to active again, it is given back to exactly those, unless
 * someone has since picked another tax for them. Who had it is kept on the store (`taxHeld`).
 */
const KEYS = ['category', 'product', 'variant'] as const;
const same = (a: any, b: any) => String(a?._id ?? a ?? '') === String(b?._id ?? b ?? '');

/** Sets `taxRate` on records (only those still holding `from`), works their formulas out, logs it. Returns the ids changed. */
const move = async (store: Store, key: (typeof KEYS)[number], ids: any[], from: any, to: any, actor: string) => {
	if (!store.installed[key] || !ids.length) return [];
	const Model = store.M(key);
	const docs: any[] = await Model.find({ _id: { $in: ids } });
	const changed: any[] = [];
	const names = new Map<string, string>();
	for (const t of await store.M('taxRate').find({}, { name: 1 }).lean()) names.set(String(t._id), t.name);
	const named = (v: any) => (v ? { _id: v, name: names.get(String(v)) || '' } : v);
	const before = new Map<string, any>();
	for (const d of docs) {
		if (!same(d.taxRate, from)) continue;
		before.set(String(d._id), d.priceAfterTax);
		d.taxRate = to;
		await d.save();
		changed.push(d._id);
	}
	if (!changed.length) return [];
	const def: any = await ModelDefinition.findOne({ route: store.installed[key].route }).lean();
	const formulas = def ? await formulasOfPage(def) : [];
	if (formulas.length) await recalculateFormulas(Model, { _id: { $in: changed } }, formulas);
	for (const after of await Model.find({ _id: { $in: changed } }).lean()) {
		const changes = diffFields({
			before: { taxRate: named(from), priceAfterTax: before.get(String(after._id)) },
			after: { taxRate: named(to), priceAfterTax: after.priceAfterTax },
			fields: key === 'category' ? ['taxRate'] : ['taxRate', 'priceAfterTax'],
			settings: { taxRate: { title: 'Tax / VAT' }, priceAfterTax: { title: 'Price after tax' } },
		});
		recordHistory({ req: { user: { name: actor } }, action: 'update', model: Model.modelName, doc: after, changes, modelPath: store.installed[key].route });
	}
	return changed;
};

/** Called after a tax rate was saved with its status possibly changed. Safe to run again. */
export const syncTaxStatus = async (store: Store, taxId: any) => {
	if (!store.installed.taxRate || !mongoose.isValidObjectId(taxId)) return;
	const tax: any = await store.M('taxRate').findById(taxId).lean();
	if (!tax) return;
	const settings: any = await CommerceSettings.findOne({}, { taxHeld: 1 }).lean();
	const held = settings?.taxHeld?.[String(taxId)];
	if (tax.status === 'inactive') {
		const out: Record<string, string[]> = {};
		for (const key of KEYS) {
			if (!store.installed[key]) continue;
			const ids = (await store.M(key).find({ taxRate: tax._id }, { _id: 1 }).lean()).map((d: any) => d._id);
			out[key] = (await move(store, key, ids, tax._id, null, 'Store: tax switched off')).map(String);
		}
		const n = Object.values(out).reduce((a, l) => a + l.length, 0);
		if (n) await CommerceSettings.updateOne({}, { $set: { [`taxHeld.${taxId}`]: { ...(held || {}), ...Object.fromEntries(Object.entries(out).map(([k, l]) => [k, [...new Set([...(held?.[k] || []), ...l])]])) } } });
	} else if (held) {
		for (const key of KEYS) await move(store, key, held[key] || [], null, tax._id, 'Store: tax switched on');
		await CommerceSettings.updateOne({}, { $unset: { [`taxHeld.${taxId}`]: '' } });
	}
};
