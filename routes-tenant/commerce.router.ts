import express from 'express';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { commerceView, saveCommerce } from '../library/functions/commerce/settings.js';
import { afterSettingsSaved, settingsGuard, startSetup } from '../library/functions/commerce/install.js';
import { actorName, storeOf } from '../library/functions/commerce/store.js';
import { catalogue, lookup, syncVariants } from '../library/functions/commerce/catalogue.js';
import { applyAdjustment, productStock, setStock, transferAction } from '../library/functions/commerce/stock.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/commerce — an e-commerce project's store
 * (docs/ecommerce). Only e-commerce projects have one.
 *
 *   GET  /settings      the wizard's answers, status, what the country offers, what each step still needs   any member
 *   PUT  /settings      { answers: { <section>: … }, step? } — each section checked; 400 with problems by section;
 *                       409 commerce_in_use when a built store can't take it   manage-projects
 *   POST /setup         builds the store from the answers in the background (status building → ready | failed)   manage-projects
 *
 * Catalogue and stock (EC-05):
 *   GET  /catalogue?outlet=&q=&category=&page=&all=   products with their variants (stock at the outlet)   records:view
 *   GET  /lookup?code=&outlet=                          a scanned barcode / SKU → the variant it sells   records:view
 *   POST /products/:id/variants                         brings its variants in step with its options   records:edit
 *   GET  /products/:id/stock                            each variant at each outlet   records:view
 *   POST /stock/set     { variant, outlet, onHand | change, reason?, note? }   a count or a correction   records:edit
 *   POST /adjustments/:id/apply                         a draft adjustment's lines as movements   records:edit
 *   POST /transfers/:id/(send|receive|cancel)           a transfer's stock out of / into its outlets   records:edit
 */
const router = express.Router({ mergeParams: true });
const manage = tenantPermissions(['manage-projects']);

router.use((req: any, res: any, next: any) =>
	req.project?.type === 'ecommerce' ? next() : res.status(404).json({ message: 'Only e-commerce projects have a store' })
);

router.get(
	'/settings',
	handle(async (req: any) => commerceView(req.project))
);

router.put(
	'/settings',
	manage,
	handle(async (req: any) => {
		await saveCommerce(req.project, req.body || {}, settingsGuard);
		await afterSettingsSaved(req.project);
		const view = await commerceView(req.project);
		const sections = Object.keys(req.body?.answers || {});
		if (sections.length)
			recordProjectEvent({
				req,
				model: 'Store',
				modelPath: 'store',
				document: req.project._id,
				name: 'Store settings',
				text: `changed the store settings (${sections.join(', ')})`,
			});
		return view;
	})
);

router.post(
	'/setup',
	manage,
	handle(async (req: any, res: any) => {
		const view = await startSetup(req, req.project);
		res.status(202);
		return view;
	})
);

const view = tenantPermissions(['records:view']);
const edit = tenantPermissions(['records:edit']);

router.get(
	'/catalogue',
	view,
	handle(async (req: any) =>
		catalogue(await storeOf(), { outlet: req.query.outlet, q: req.query.q, category: req.query.category, page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 60, all: req.query.all === '1' })
	)
);
router.get(
	'/lookup',
	view,
	handle(async (req: any) => lookup(await storeOf(), req.query.code, req.query.outlet))
);
router.post(
	'/products/:id/variants',
	edit,
	handle(async (req: any) => ({ doc: await syncVariants(await storeOf(), req.params.id) }))
);
router.get(
	'/products/:id/stock',
	view,
	handle(async (req: any) => productStock(await storeOf(), req.params.id))
);
router.post(
	'/stock/set',
	edit,
	handle(async (req: any) => setStock(await storeOf(), req.body, actorName(req)))
);
router.post(
	'/adjustments/:id/apply',
	edit,
	handle(async (req: any) => applyAdjustment(await storeOf(), req.params.id, actorName(req)))
);
router.post(
	'/transfers/:id/:action(send|receive|cancel)',
	edit,
	handle(async (req: any) => transferAction(await storeOf(), req.params.id, req.params.action, actorName(req)))
);

export default router;
