import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import { currentScope, runInScope } from '../tenantScope.function.js';
import { storeOf } from './store.js';
import { syncVariants } from './catalogue.js';

/**
 * After a record of a store's model is saved from a page (recordHistory, beside
 * webhooks and automations): a product's variants are brought in step with it
 * (docs/ecommerce EC7). In the background; never throws.
 */
export const fireCommerce = ({ model, event, doc }: { model: string; event: string; doc: any }) => {
	const scope = currentScope();
	if (!scope?.project || !doc?._id || event === 'delete') return;
	setImmediate(() =>
		runInScope(scope, async () => {
			const s: any = await CommerceSettings.findOne({}, { status: 1 }).lean();
			if (s?.status !== 'ready') return;
			const store = await storeOf();
			if (store.is('product', model)) await syncVariants(store, doc._id);
		}).catch((e: any) => console.error('store hook:', e?.message))
	);
};
