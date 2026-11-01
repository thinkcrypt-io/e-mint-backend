import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import { currentScope, runInScope } from '../tenantScope.function.js';
import { storeOf } from './store.js';
import { syncVariants } from './catalogue.js';
import { applyCategoryTax } from './categoryTax.js';
import { hasCategoryTaxAutomation } from './taxAutomations.js';
import { syncTaxStatus } from './taxStatus.js';

/**
 * After a record of a store's model is saved from a page (recordHistory, beside
 * webhooks and automations): a product's variants are brought in step with it
 * (docs/ecommerce EC7). In the background; never throws.
 */
/** `changes` (the fields a panel save changed) is left out by callers that don't know them: then every field counts as changed. */
export const fireCommerce = ({ model, event, doc, changes }: { model: string; event: string; doc: any; changes?: { field: string }[] }) => {
	const scope = currentScope();
	if (!scope?.project || !doc?._id || event === 'delete') return;
	setImmediate(() =>
		runInScope(scope, async () => {
			const s: any = await CommerceSettings.findOne({}, { status: 1 }).lean();
			if (s?.status !== 'ready') return;
			const store = await storeOf();
			if (store.is('taxRate', model) && (!changes || changes.some(c => c.field === 'status'))) await syncTaxStatus(store, doc._id);
			if (store.is('product', model)) await syncVariants(store, doc._id);
			// A store with the tax automation hands the tax down through it (its switch is the owner's); an older one still does it here.
			if (store.is('category', model) && (!changes || changes.some(c => c.field === 'taxRate')) && !(await hasCategoryTaxAutomation())) await applyCategoryTax(store, doc._id);
		}).catch((e: any) => console.error('store hook:', e?.message))
	);
};
