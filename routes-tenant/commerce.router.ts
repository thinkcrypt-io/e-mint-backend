import express from 'express';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { commerceView, saveCommerce } from '../library/functions/commerce/settings.js';
import { afterSettingsSaved, settingsGuard, startSetup } from '../library/functions/commerce/install.js';
import { actorName, storeOf } from '../library/functions/commerce/store.js';
import { catalogue, lookup, posCategories, syncVariants } from '../library/functions/commerce/catalogue.js';
import { applyAdjustment, productStock, setStock, transferAction } from '../library/functions/commerce/stock.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { quote } from '../library/functions/commerce/pricing.js';
import { cancel, createManual, discardHeld, fulfil, hold, listHeld, orderDetail, pay, posSetup, sale } from '../library/functions/commerce/orders.js';
import { cashMove, closeShift, currentShift, openShift, summary } from '../library/functions/commerce/shifts.js';
import { listOrders, listReturns, moveReturn, returnDetail } from '../library/functions/commerce/lists.js';

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
 *   GET  /categories                                    the POS's category bar: active on the POS, highest Order on POS first   records:view
 *   GET  /lookup?code=&outlet=                          a scanned barcode / SKU → the variant it sells   records:view
 *   POST /products/:id/variants                         brings its variants in step with its options   records:edit
 *   GET  /products/:id/stock                            each variant at each outlet   records:view
 *   POST /stock/set     { variant, outlet, onHand | change, reason?, note? }   a count or a correction   records:edit
 *   POST /adjustments/:id/apply                         a draft adjustment's lines as movements   records:edit
 *   POST /transfers/:id/(send|receive|cancel)           a transfer's stock out of / into its outlets   records:edit
 *
 * Orders, payments, shifts (EC-06) — prices and totals are always worked out here:
 *   GET  /pos/setup?register=          outlets, registers, ways to pay, switches, the register's open shift   records:view
 *   POST /quote        { outlet, customer, lines[{ variant, quantity, discount }], orderDiscount, couponCode, shipping }   records:view
 *   POST /sales        a POS sale, paid in full: + register, payments[{ method, amount, tendered, reference }], heldId   records:create
 *   POST /orders       an order by phone / by hand: + payments (any part), delivery { name, phone, address, area, rate }   records:create
 *   GET  /held?outlet=&register=  ·  POST /held  ·  DELETE /held/:id          parked baskets   records:create
 *   GET  /orders?view=&q=&channel=&outlet=&paymentStatus=&fulfilment=&page=&limit=   the Orders page (EC-09): a page of
 *                       orders with customer / outlet names and each quick filter's count (views)   records:view
 *   GET  /orders/:id                    the order with its payments, stock moves, returns, credit, More details   records:view
 *   POST /orders/:id/pay      { payments, register? }   towards what it owes   records:edit
 *   POST /orders/:id/fulfil   { to: fulfilled | shipped | delivered }   records:edit
 *   POST /orders/:id/cancel   { reason?, register? }   stock back, money back, coupon back   records:edit
 *   POST /shifts { register, openingFloat }  ·  GET /shifts/current?register=  ·  GET /shifts/:id
 *   POST /shifts/:id/cash { type: in | out, amount, reason }  ·  POST /shifts/:id/close { countedCash, note }   records:create
 *
 * Returns (EC-09; made and refunded by the returns engine, EC-08):
 *   GET  /returns?view=&q=&outlet=&page=&limit=   the Returns page   records:view
 *   GET  /returns/:id                             the return with its order, refunds, stock moves   records:view
 *   POST /returns/:id/status  { to, note? }       requested → approved | rejected → received …   records:edit
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
	'/categories',
	view,
	handle(async () => posCategories(await storeOf()))
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

const create = tenantPermissions(['records:create']);
const ctx = (req: any) => ({ project: req.project, by: actorName(req) });

router.get(
	'/pos/setup',
	view,
	handle(async (req: any) => posSetup(await storeOf(), req.project, req.query.register))
);
router.post(
	'/quote',
	view,
	handle(async (req: any) => quote(await storeOf(), req.body || {}))
);
router.post(
	'/sales',
	create,
	handle(async (req: any, res: any) => {
		const out = await sale(await storeOf(), req.body || {}, ctx(req));
		res.status(201);
		return out;
	})
);
router.post(
	'/orders',
	create,
	handle(async (req: any, res: any) => {
		const out = await createManual(await storeOf(), req.body || {}, ctx(req));
		res.status(201);
		return out;
	})
);
router.get(
	'/held',
	view,
	handle(async (req: any) => ({ docs: await listHeld(await storeOf(), { outlet: req.query.outlet, register: req.query.register }) }))
);
router.post(
	'/held',
	create,
	handle(async (req: any, res: any) => {
		const doc = await hold(await storeOf(), req.body || {}, ctx(req));
		res.status(201);
		return { doc };
	})
);
router.delete(
	'/held/:id',
	create,
	handle(async (req: any) => discardHeld(await storeOf(), req.params.id))
);
router.get(
	'/orders',
	view,
	handle(async (req: any) => listOrders(await storeOf(), req.query || {}))
);
router.get(
	'/orders/:id',
	view,
	handle(async (req: any) => orderDetail(await storeOf(), req.params.id))
);
router.post(
	'/orders/:id/pay',
	edit,
	handle(async (req: any) => pay(await storeOf(), req.params.id, req.body || {}, ctx(req)))
);
router.post(
	'/orders/:id/fulfil',
	edit,
	handle(async (req: any) => fulfil(await storeOf(), req.params.id, String(req.body?.to || '')))
);
router.post(
	'/orders/:id/cancel',
	edit,
	handle(async (req: any) => cancel(await storeOf(), req.params.id, req.body || {}, ctx(req)))
);
router.get(
	'/returns',
	view,
	handle(async (req: any) => listReturns(await storeOf(), req.query || {}))
);
router.get(
	'/returns/:id',
	view,
	handle(async (req: any) => returnDetail(await storeOf(), req.params.id))
);
router.post(
	'/returns/:id/status',
	edit,
	handle(async (req: any) => moveReturn(await storeOf(), req.params.id, String(req.body?.to || ''), actorName(req), req.body?.note))
);
router.post(
	'/shifts',
	create,
	handle(async (req: any, res: any) => {
		const doc = await openShift(await storeOf(), req.body || {}, actorName(req));
		res.status(201);
		return { doc: doc.toObject ? doc.toObject() : doc };
	})
);
router.get(
	'/shifts/current',
	view,
	handle(async (req: any) => {
		const s = await currentShift(await storeOf(), req.query.register);
		return s ? summary(await storeOf(), (s as any)._id) : { shift: null };
	})
);
router.get(
	'/shifts/:id',
	view,
	handle(async (req: any) => summary(await storeOf(), req.params.id))
);
router.post(
	'/shifts/:id/cash',
	create,
	handle(async (req: any) => cashMove(await storeOf(), req.params.id, req.body || {}, actorName(req)))
);
router.post(
	'/shifts/:id/close',
	create,
	handle(async (req: any) => closeShift(await storeOf(), req.params.id, req.body || {}, actorName(req)))
);

export default router;
