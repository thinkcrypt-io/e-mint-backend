import express from 'express';
import Automation from '../library/models/tenancy/automation.model.js';
import mongoose from 'mongoose';
import { handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { commerceView, saveCommerce } from '../library/functions/commerce/settings.js';
import { afterSettingsSaved, settingsGuard, startSetup } from '../library/functions/commerce/install.js';
import { actorName, storeOf } from '../library/functions/commerce/store.js';
import { catalogue, lookup, posCategories, syncVariants } from '../library/functions/commerce/catalogue.js';
import { applyAdjustment, productStock, receiveStock, setStock, transferAction } from '../library/functions/commerce/stock.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { quote } from '../library/functions/commerce/pricing.js';
import { cancel, createManual, discardHeld, fulfil, hold, listHeld, orderDetail, pay, posSetup, sale } from '../library/functions/commerce/orders.js';
import { cashMove, closeShift, currentShift, openShift, summary } from '../library/functions/commerce/shifts.js';
import { listOrders, listReturns, moveReturn, returnDetail } from '../library/functions/commerce/lists.js';
import { returnItems } from '../library/functions/commerce/returns.js';
import { disconnect, listConnections, optionsFor, renewWebhookSecret, saveConnection, testConnection, removePanelChecks, savePanelChecks } from '../library/functions/commerce/connections.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';
import { cancelDelivery, deliveryDetail, deliveryRisk, listDeliveries, markSettled, moveManual, receiveReturn, refresh, send, sendMany, sendPrefill } from '../library/functions/commerce/deliveries.js';
import { webhooksOf } from '../library/functions/commerce/courierWebhooks.js';
import { rebuildSearch, searchIndexStatus } from '../library/functions/commerce/search/indexer.js';
import { saveSearchSettings, searchSettingsView } from '../library/functions/commerce/search/http.js';
import { packList, setPack } from '../library/functions/commerce/search/rules.js';
import { previewRule, rulesTouching, storeSearch } from '../library/functions/commerce/search/engine.js';
import { productSearchInsight, searchInsights, searchQueryInsight, searchWeek } from '../library/functions/commerce/search/insights.js';
import { acceptSuggestion, dismissSuggestion, learnStore, listSuggestions } from '../library/functions/commerce/search/learn.js';
import { currentScope, runInScope } from '../library/functions/tenantScope.function.js';

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
 *   POST /stock/receive { outlet, date?, note?, lines: [{ product?, variant?, quantity }] }   stock in, several items on a day   records:edit
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
 *   PUT    /couriers/:id/checks  { keys }   buyer checks with the store's merchant-panel login (RedX, Pathao; CR-20): kept sealed, signs in once   manage-projects
 *   DELETE /couriers/:id/checks             forgets the panel login (the API connection stays)   manage-projects
 *   GET    /couriers/:id/options/:what?parent=&fresh=1   stores, cities, zones, areas from the courier (kept a day)   records:edit
 *
 * Deliveries (CR-05) — made only here; the courier's updates move them and their order:
 *   GET  /orders/:id/send                 the Send to courier dialog: connected couriers, the parcel prefilled, an open delivery   records:view
 *   POST /orders/:id/deliveries   { courier, recipient?, cod?, weight?, items?, note?, options?, confirmNotBooked? }
 *                                         books it (400 delivery_input / courier_refused, 409 delivery_open, 502 courier_no_answer)   records:edit
 *   POST /deliveries/bulk  { orders: [≤ 100 ids], courier, weight?, note? }   each order's result (CR-12)   records:edit
 *   GET  /deliveries?view=&courier=&settled=&q=&page=&limit=   the Deliveries page: views' counts, cash with couriers   records:view
 *   GET  /deliveries/:id                  one delivery with its timeline   records:view
 *   POST /deliveries/:id/refresh          asks the courier where it is   records:edit
 *   POST /deliveries/:id/cancel  { reason? }   stops it (Steadfast: a return request)   records:edit
 *   POST /deliveries/:id/status  { to, collected?, note? }   a manual courier's parcel moved by hand (CR-15)   records:edit
 *   GET  /orders/:id/risk?fresh=1          the buyer's phone with couriers + the store's orders, kept a day (CR-18, on CR-19)   records:view
 *   GET  /buyer-check?phone=&fresh=1      any phone looked up: courier rates, own orders, level; logged (BUYER_CHECK.md CR-19)   records:view
 *   GET  /buyer-check/recent?limit=       the last phones looked up on this store (CR-19)   records:view
 *   POST /deliveries/:id/receive  { lines: [{ line, quantity, condition?, restock? }], note? }   a returned parcel back in (CR-13)   records:edit
 *   POST /deliveries/settle  { deliveries: [ids], ref? }   marked paid out by the courier (RedX, manual)   records:edit
 *   GET  /deliveries/:id/webhooks          what the courier's webhooks sent about it, raw   manage-projects
 *   POST /discount-preview  { id?, discount }   what saving a discount would do, for its form's note (DISCOUNTS.md DS11)   records:view
 */
import { relabelPriceColumns } from '../library/functions/commerce/taxRates.js';
import { checkPhone, recentLookups } from '../library/functions/commerce/buyerCheck.js';
import { replaceTax, taxUsage, usageText } from '../library/functions/commerce/taxUse.js';
import { previewDiscount } from '../library/functions/commerce/discounts.js';
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
		// A built store's price column names what it holds for the tax mode (a store not built yet has none).
		try {
			await relabelPriceColumns(req, await storeOf(), {});
		} catch (e: any) {
			if (e?.code !== 'store_not_ready') console.error('price label:', e?.message);
		}
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
	'/stock/receive',
	edit,
	handle(async (req: any) => receiveStock(await storeOf(), req.body, actorName(req)))
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

/**
 * A discount form's note (docs/ecommerce DISCOUNTS.md DS11): what saving it would do — products it would give the
 * discount to, those keeping a bigger one — and why it can't be saved, if so. Nothing is written.
 *   POST /discount-preview  { id?, discount: { percent, status, startsAt, endsAt, products, categories, subCategories, collections } }
 */
router.post(
	'/discount-preview',
	view,
	handle(async (req: any) => {
		const store = await storeOf();
		if (!store.installed.discount) return { text: '', reach: 0 };
		const id = req.body?.id;
		const before = mongoose.isValidObjectId(id) ? await store.M('discount').findById(id).lean() : null;
		return previewDiscount(store, before, req.body?.discount || {});
	})
);

/** A tax in use (TX5): who holds it, and moving them all to another tax. */
/** A category form's note: how many of its products saving a tax would change (when the store's automation hands it down). */
router.get(
	'/tax-preview',
	view,
	handle(async (req: any) => {
		const store = await storeOf();
		const { category, tax } = req.query;
		const on = !!(await Automation.exists({ key: 'tax.category-to-products', enabled: true }));
		if (!on || !mongoose.isValidObjectId(category) || !mongoose.isValidObjectId(tax)) return { products: 0, on };
		const products = await store.M('product').countDocuments({ category, taxRate: { $ne: new mongoose.Types.ObjectId(String(tax)) } });
		return { products, on };
	})
);
router.get(
	'/taxes/:id/usage',
	view,
	handle(async (req: any) => {
		const store = await storeOf();
		const usage = await taxUsage(store, req.params.id);
		const tax: any = await store.M('taxRate').findById(req.params.id, { name: 1, status: 1 }).lean();
		return { usage, text: usage.total ? usageText(usage) : '', inactive: tax?.status === 'inactive' };
	})
);
router.post(
	'/taxes/:id/replace',
	edit,
	handle(async (req: any) => {
		const moved = await replaceTax(await storeOf(), req.params.id, req.body?.to);
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Tax rates', text: `moved ${moved} record${moved === 1 ? '' : 's'} to another tax` });
		return { moved };
	})
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
router.put(
	'/couriers/:id/checks',
	manage,
	handle(async (req: any) => {
		const out = await savePanelChecks(req.project, req.params.id, req.body || {}, actorName(req), apiOrigin(req));
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Couriers', text: `set ${out.name}’s buyer-check login (${out.checks?.status === 'on' ? 'signed in' : 'not signed in'})` });
		return out;
	})
);
router.delete(
	'/couriers/:id/checks',
	manage,
	handle(async (req: any) => {
		const out = await removePanelChecks(req.project, req.params.id, apiOrigin(req));
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Couriers', text: `removed ${out.name}’s buyer-check login` });
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
router.post(
	'/deliveries/bulk',
	edit,
	handle(async (req: any) => sendMany(await storeOf(), req.project, req.body || {}, actorName(req)))
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
	'/deliveries/settle',
	edit,
	handle(async (req: any) => markSettled(await storeOf(), req.body || {}, actorName(req)))
);
router.post(
	'/deliveries/:id/receive',
	edit,
	handle(async (req: any) => receiveReturn(await storeOf(), req.params.id, req.body || {}, actorName(req)))
);
router.post(
	'/deliveries/:id/status',
	edit,
	handle(async (req: any) => moveManual(await storeOf(), req.params.id, req.body || {}, actorName(req)))
);
router.get(
	'/orders/:id/risk',
	view,
	handle(async (req: any) => deliveryRisk(await storeOf(), req.project, req.params.id, req.query.fresh === '1', actorName(req)))
);
router.get(
	'/buyer-check/recent',
	view,
	handle(async (req: any) => {
		await storeOf();
		return { lookups: await recentLookups(Number(req.query.limit) || 20) };
	})
);
router.get(
	'/buyer-check',
	view,
	handle(async (req: any) => checkPhone(await storeOf(), req.project, req.query.phone, { fresh: req.query.fresh === '1', via: 'lookup', by: actorName(req) }))
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

/**
 * Store search's index (docs/search SI5):
 *   GET  /search/status    documents against findable products, queued, version, the last rebuild and drift check   records:view
 *   POST /search/rebuild   builds every product's search document again, in the background (202)   manage-projects
 *   GET  /search/settings  on (true / false / null = not switched on by name yet), typos, out of stock, dials, learning, Banglish, defaults   records:view
 *   PUT  /search/settings  { enabled?, typos?, outOfStock?, dials?: { popularity|freshness|sale|learned }, learning?, banglish? }   manage-projects
 *   GET  /search/packs     the starter synonym packs, each with how many of its synonyms the store has   records:view
 *   POST /search/packs/:id { on } switches a pack on (its synonyms become the store's own) or off (they go)   records:edit
 *   GET  /search/try?q=&page=&limit=&sort=   the store's search as shoppers get it, every result explained, with what was understood,
 *                          the synonyms used and any redirect (SI-10; the panel's Try search)   records:view
 *   GET  /search/insights?days=7|30|90         Insights (SI-14): totals against the period before, by day, Top / No
 *                                              results / Low click rate / Trending   records:view
 *   GET  /search/insights/query?q=&days=       one search: its days, clicks by position, what came next   records:view
 *   GET  /search/insights/product/:id          a product's Search card (30 days)   records:view
 *   GET  /search/insights/week                 the dashboard widget: this week, and the top search with no results   records:view
 *   POST /search/rules/preview { rule, q? }    a Search rule tried before it's saved: the search without it and with it,
 *                                              explained (SI-15; the rule editor's before / after)   records:view
 *   GET  /search/rules/touching?q= | ?product= the store's rules a search sets off, or that name a product (its brand,
 *                                              category, collection…)   records:view
 *   GET  /search/suggestions?status=open|accepted|dismissed|all   Suggested fixes (SI-16 learned, SI-18 your AI)   records:view
 *   POST /search/suggestions/:id/accept { edits? }  makes the synonym / redirect / rule   records:edit
 *   POST /search/suggestions/:id/dismiss            it goes, and isn't suggested again   records:edit
 *   POST /search/learn                             learning now instead of tonight (SI-16)   manage-projects
 */
router.get(
	'/search/status',
	view,
	handle(async () => searchIndexStatus(await storeOf()))
);
router.get(
	'/search/settings',
	view,
	handle(async () => (await storeOf(), searchSettingsView()))
);
router.put(
	'/search/settings',
	manage,
	handle(async (req: any) => {
		await storeOf();
		const view = await saveSearchSettings(req.body || {});
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Search', text: `changed the store’s search settings (${Object.keys(req.body || {}).join(', ')})` });
		return view;
	})
);
router.get(
	'/search/packs',
	view,
	handle(async () => packList(await storeOf()))
);
router.post(
	'/search/packs/:id',
	edit,
	handle(async (req: any) => {
		const list = await setPack(await storeOf(), req.params.id, req.body?.on !== false);
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Search', text: `${req.body?.on === false ? 'switched off' : 'switched on'} the “${req.params.id}” synonyms` });
		return list;
	})
);
router.get(
	'/search/try',
	view,
	handle(async (req: any) =>
		storeSearch(await storeOf(), {
			q: String(req.query?.q ?? ''),
			limit: Math.min(48, Number(req.query?.limit) || 10),
			page: Number(req.query?.page) || 1,
			...(req.query?.sort && { sort: String(req.query.sort) as any }),
			explain: true,
		})
	)
);
router.get(
	'/search/insights',
	view,
	handle(async (req: any) => searchInsights(await storeOf(), { days: req.query?.days }))
);
router.get(
	'/search/insights/query',
	view,
	handle(async (req: any) => {
		const r = await searchQueryInsight(await storeOf(), { q: req.query?.q, days: req.query?.days });
		if (!r) throw Object.assign(new Error('Type a search'), { status: 400 });
		return r;
	})
);
router.get(
	'/search/insights/product/:id',
	view,
	handle(async (req: any) => {
		const r = await productSearchInsight(await storeOf(), req.params.id);
		if (!r) throw Object.assign(new Error('Not a product'), { status: 400 });
		return r;
	})
);
router.post(
	'/search/rules/preview',
	view,
	handle(async (req: any) => previewRule(await storeOf(), req.body?.rule || {}, { q: req.body?.q, limit: req.body?.limit }))
);
router.get(
	'/search/rules/touching',
	view,
	handle(async (req: any) => rulesTouching(await storeOf(), { q: req.query?.q ? String(req.query.q) : undefined, product: req.query?.product ? String(req.query.product) : undefined }))
);
router.get(
	'/search/insights/week',
	view,
	handle(async () => searchWeek(await storeOf()))
);
router.get(
	'/search/suggestions',
	view,
	handle(async (req: any) => (await storeOf(), listSuggestions({ status: req.query?.status ? String(req.query.status) : 'open', limit: Number(req.query?.limit) || 50 })))
);
router.post(
	'/search/suggestions/:id/accept',
	edit,
	handle(async (req: any) => {
		const r = await acceptSuggestion(await storeOf(), req.params.id, req.user?._id, req.body?.edits);
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Search', text: `accepted a suggested search ${r.kind}` });
		return r;
	})
);
router.post(
	'/search/suggestions/:id/dismiss',
	edit,
	handle(async (req: any) => (await storeOf(), dismissSuggestion(req.params.id, req.user?._id)))
);
router.post(
	'/search/learn',
	manage,
	handle(async () => {
		const r = await learnStore(await storeOf(), { force: true });
		return r || { skipped: 'Learning is off in Search settings' };
	})
);
router.post(
	'/search/rebuild',
	manage,
	handle(async (req: any, res: any) => {
		const store = await storeOf();
		const scope = currentScope()!;
		setImmediate(() => runInScope(scope, () => rebuildSearch(store, { reason: 'panel' })).catch((e: any) => console.error('search rebuild:', e?.message)));
		recordProjectEvent({ req, model: 'Store', modelPath: 'store', document: req.project._id, name: 'Search', text: 'rebuilt the store’s search' });
		res.status(202);
		return { started: true };
	})
);

export default router;
