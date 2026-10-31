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
import { returnItems } from '../library/functions/commerce/returns.js';
import { disconnect, listConnections, optionsFor, renewWebhookSecret, saveConnection, testConnection } from '../library/functions/commerce/connections.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';
import { cancelDelivery, deliveryDetail, listDeliveries, refresh, send, sendPrefill } from '../library/functions/commerce/deliveries.js';
import { webhooksOf } from '../library/functions/commerce/courierWebhooks.js';

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
 *
 * Couriers (docs/couriers CR-03) — each store connects its own courier accounts; keys are never sent back:
 *   GET    /couriers                        the couriers the country offers: on / off, keys set, last test,
 *                                           webhook address + secret, warnings   manage-projects
 *   PUT    /couriers/:id   { mode?, keys?, settings?, webhookSecret?, sandbox? }   saves (blank key = keep) and tests   manage-projects
 *   POST   /couriers/:id/test               tests again   manage-projects
 *   POST   /couriers/:id/webhook-secret     a new webhook secret (the old address stops working)   manage-projects
 *   DELETE /couriers/:id                    forgets the keys; 409 courier_in_use while deliveries are on their way   manage-projects
 *   GET    /couriers/:id/options/:what?parent=&fresh=1   stores, cities, zones, areas from the courier (kept a day)   records:edit
 *
 * Deliveries (CR-05) — made only here; the courier's updates move them and their order:
 *   GET  /orders/:id/send                 the Send to courier dialog: connected couriers, the parcel prefilled, an open delivery   records:view
 *   POST /orders/:id/deliveries   { courier, recipient?, cod?, weight?, items?, note?, options?, confirmNotBooked? }
 *                                         books it (400 delivery_input / courier_refused, 409 delivery_open, 502 courier_no_answer)   records:edit
 *   GET  /deliveries?view=&courier=&settled=&q=&page=&limit=   the Deliveries page: views' counts, cash with couriers   records:view
 *   GET  /deliveries/:id                  one delivery with its timeline   records:view
 *   POST /deliveries/:id/refresh          asks the courier where it is   records:edit
 *   POST /deliveries/:id/cancel  { reason? }   stops it (Steadfast: a return request)   records:edit
 *   GET  /deliveries/:id/webhooks          what the courier's webhooks sent about it, raw   manage-projects
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
router.post(
	'/orders/:id/return',
	edit,
	handle(async (req: any) => returnItems(await storeOf(), req.params.id, req.body || {}, { by: ctx(req).by }))
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

router.get(
	'/couriers',
	manage,
	handle(async (req: any) => listConnections(req.project, apiOrigin(req)))
);
router.put(
	'/couriers/:id',
	manage,
	handle(async (req: any) => {
		const out = await saveConnection(req.project, req.params.id, req.body || {}, actorName(req), apiOrigin(req));
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Couriers', text: `connected ${out.name}${out.connection?.tested ? '' : ' (not tested)'}` });
		return out;
	})
);
router.post(
	'/couriers/:id/test',
	manage,
	handle(async (req: any) => testConnection(req.project, req.params.id, apiOrigin(req)))
);
router.post(
	'/couriers/:id/webhook-secret',
	manage,
	handle(async (req: any) => renewWebhookSecret(req.project, req.params.id, apiOrigin(req)))
);
router.delete(
	'/couriers/:id',
	manage,
	handle(async (req: any) => {
		const out = await disconnect(req.params.id);
		if (out.removed) recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Couriers', text: `disconnected ${req.params.id}` });
		return out;
	})
);
router.get(
	'/couriers/:id/options/:what',
	edit,
	handle(async (req: any) => optionsFor(req.params.id, req.params.what, req.query.parent, req.query.fresh === '1'))
);

router.get(
	'/orders/:id/send',
	view,
	handle(async (req: any) => sendPrefill(await storeOf(), req.project, req.params.id))
);
router.post(
	'/orders/:id/deliveries',
	edit,
	handle(async (req: any, res: any) => {
		const out = await send(await storeOf(), req.project, req.params.id, req.body || {}, actorName(req));
		res.status(201);
		return out;
	})
);
router.get(
	'/deliveries',
	view,
	handle(async (req: any) => listDeliveries(await storeOf(), req.query || {}))
);
router.get(
	'/deliveries/:id',
	view,
	handle(async (req: any) => deliveryDetail(await storeOf(), req.params.id))
);
router.get(
	'/deliveries/:id/webhooks',
	manage,
	handle(async (req: any) => ({ doc: await webhooksOf(req.params.id) }))
);
router.post(
	'/deliveries/:id/refresh',
	edit,
	handle(async (req: any) => refresh(await storeOf(), req.project, req.params.id))
);
router.post(
	'/deliveries/:id/cancel',
	edit,
	handle(async (req: any) => cancelDelivery(await storeOf(), req.project, req.params.id, req.body?.reason, actorName(req)))
);

export default router;
