import mongoose from 'mongoose';
import { storeOf, itemName, Store } from '../../functions/commerce/store.js';
import { syncVariants } from '../../functions/commerce/catalogue.js';
import { productStock, setStock } from '../../functions/commerce/stock.js';
import { listDeliveries, refresh, send, STATUS_LABEL } from '../../functions/commerce/deliveries.js';
import { adapterOf } from '../../functions/commerce/couriers/index.js';
import { mayWrite } from './website.tools.js';
import { routePermission } from '../builder/builder.controller.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * A store over MCP (docs/ecommerce EC-13a): the user's own AI reads stock, has
 * products' variants made from their options, and sets stock — through the
 * store's own engine (syncVariants, setStock), so every change is a stock
 * movement like one made in the panel. No sales, payments or refunds here.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string): Out => ({ text, isError: true });
const isId = (v: any) => mongoose.isValidObjectId(v) && String(v).length === 24;
const clean = (v: any) => String(v ?? '').trim();

/** A store, or why there isn't one. */
const theStore = async (): Promise<Store | Out> => {
	try {
		return await storeOf();
	} catch (e: any) {
		return refuse(e?.message || 'This project has no store.');
	}
};
const isOut = (x: any): x is Out => typeof x?.text === 'string' && x.isError;

/** A product by id, SKU or exact name. */
const findProduct = async (store: Store, q: any) => {
	const v = clean(q);
	if (!v) return null;
	const Product = store.M('product');
	if (isId(v)) return Product.findById(v).lean();
	return (await Product.findOne({ sku: v }).lean()) || (await Product.findOne({ name: v }).lean()) || (await Product.findOne({ name: new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean());
};

const outletsOf = (store: Store) => store.M('outlet').find({ active: { $ne: false } }).sort({ kind: 1, name: 1 }).lean();

/** An outlet by id, code or name; the store's only (or first selling) outlet when none is named. */
const findOutlet = (outlets: any[], q: any) => {
	const v = clean(q).toLowerCase();
	if (!v) return outlets.find(o => o.kind !== 'warehouse') || outlets[0] || null;
	return outlets.find(o => String(o._id) === v || clean(o.outletCode).toLowerCase() === v || clean(o.name).toLowerCase() === v) || null;
};

const by = (caller: Caller) => `${caller.user?.name || caller.user?.email || 'Someone'} (AI)`;

/* ---------------------------------------------------------- store_stock */

const storeStock = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const route = store.installed.stock?.route || store.installed.product.route;
	if (!caller.allows(`view-${routePermission(req.app, route) || route}`)) return refuse(`${caller.user?.name || 'The key’s owner'} can’t see /${route}.`);
	if (args?.product) {
		const p: any = await findProduct(store, args.product);
		if (!p) return refuse(`No product “${args.product}” — give its id, SKU or exact name.`);
		const s = await productStock(store, p._id);
		const lines = s.variants.map((v: any) => `- ${itemName(p, v)}${v.active ? '' : ' (not sold)'}: ${s.outlets.map((o: any) => `${o.name} ${v.stock[o._id].onHand}`).join(', ')} — total ${v.total}`);
		return { text: `${p.name} (${p.trackStock === false ? 'stock not tracked' : 'stock tracked'}):\n${lines.join('\n') || '- no variants yet — run sync_variants'}`, data: s };
	}
	const products: any[] = await store.M('product').find({}, { name: 1, sku: 1, totalStock: 1, trackStock: 1, status: 1 }).sort({ name: 1 }).limit(500).lean();
	const counts = await store.M('variant').aggregate([{ $group: { _id: '$product', n: { $sum: 1 } } }]);
	const variants = new Map(counts.map((c: any) => [String(c._id), c.n]));
	const lines = products.map(p => `- ${p.name}${p.sku ? ` [${p.sku}]` : ''}: ${p.trackStock === false ? 'not tracked' : p.totalStock || 0}${variants.get(String(p._id)) ? '' : ' — no variants yet'}${p.status !== 'active' ? ` (${p.status})` : ''}`);
	return { text: `Stock (all outlets):\n${lines.join('\n')}`, data: { products: products.map(p => ({ ...p, variants: variants.get(String(p._id)) || 0 })) } };
};

/* -------------------------------------------------------- sync_variants */

const syncTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const denied = mayWrite(req, caller, store.installed.variant?.route || store.installed.product.route);
	if (denied) return refuse(denied);
	const asked: any[] = Array.isArray(args?.products) ? args.products : [];
	const products: any[] = asked.length ? (await Promise.all(asked.map(q => findProduct(store, q)))).filter(Boolean) : await store.M('product').find({}, { _id: 1, name: 1 }).lean();
	if (asked.length && products.length < asked.length) return refuse('Some products weren’t found — give each one’s id, SKU or exact name.');
	const lines: string[] = [];
	for (const p of products) {
		try {
			const vs: any[] = await syncVariants(store, p._id);
			const sold = vs.filter(v => v.active !== false);
			lines.push(`- ${p.name}: ${sold.length === 1 && sold[0].isDefault ? 'sold as itself' : sold.map(v => v.title).join(', ')}`);
		} catch (e: any) {
			lines.push(`- ${p.name}: ${e?.message || 'failed'}`);
		}
	}
	return { text: `Variants brought in step with ${products.length} product(s):\n${lines.join('\n')}`, data: { products: products.length } };
};

/* ------------------------------------------------------------ set_stock */

const REASONS = ['opening', 'count', 'adjustment', 'receive'];

const setStockTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const denied = mayWrite(req, caller, store.installed.stock?.route || store.installed.product.route);
	if (denied) return refuse(denied);
	const items: any[] = Array.isArray(args?.items) ? args.items : [];
	if (!items.length) return refuse('Send items: [{ product, variant?, outlet?, onHand }].');
	if (items.length > 200) return refuse('Up to 200 items per call.');
	const outlets: any[] = await outletsOf(store);
	if (!outlets.length) return refuse('The store has no active outlet.');

	// Everything is found first, so a mistake changes nothing.
	const plan: { label: string; variant: string; outlet: any; body: any }[] = [];
	const problems: string[] = [];
	for (const [i, it] of items.entries()) {
		const p: any = await findProduct(store, it?.product);
		if (!p) {
			problems.push(`items[${i}]: no product “${it?.product}”`);
			continue;
		}
		let vs: any[] = await store.M('variant').find({ product: p._id, active: { $ne: false } }).lean();
		if (!vs.length) vs = (await syncVariants(store, p._id)).filter((v: any) => v.active !== false);
		const want = clean(it?.variant).toLowerCase();
		const v = want ? vs.find(x => String(x._id) === want || clean(x.title).toLowerCase() === want || clean(x.sku).toLowerCase() === want) : vs.length === 1 ? vs[0] : null;
		if (!v) {
			problems.push(`items[${i}]: ${p.name} ${want ? `has no variant “${it.variant}”` : `is sold as ${vs.map(x => x.title).join(', ')} — name the variant`}`);
			continue;
		}
		const o = findOutlet(outlets, it?.outlet);
		if (!o) {
			problems.push(`items[${i}]: no outlet “${it?.outlet}” (${outlets.map(x => x.name).join(', ')})`);
			continue;
		}
		const hasCount = it?.onHand !== undefined && it?.onHand !== null && it?.onHand !== '';
		if (!hasCount && (it?.change === undefined || it?.change === null)) {
			problems.push(`items[${i}]: give onHand (what's there) or change (+/-)`);
			continue;
		}
		const reason = REASONS.includes(it?.reason) ? it.reason : hasCount ? 'count' : 'adjustment';
		plan.push({ label: `${itemName(p, v)} at ${o.name}`, variant: String(v._id), outlet: o, body: { variant: String(v._id), outlet: String(o._id), ...(hasCount ? { onHand: it.onHand } : { change: it.change }), reason, note: clean(it?.note).slice(0, 300) } });
	}
	if (problems.length) return refuse(`Nothing changed:\n- ${problems.join('\n- ')}`);

	const lines: string[] = [];
	for (const s of plan) {
		try {
			const r: any = await setStock(store, s.body, by(caller));
			lines.push(`- ${s.label}: ${r.unchanged ? 'unchanged' : `${r.change > 0 ? '+' : ''}${r.change} → ${r.after}`}`);
		} catch (e: any) {
			lines.push(`- ${s.label}: ${e?.message || 'failed'}`);
		}
	}
	return { text: `Stock set (each change is a stock movement):\n${lines.join('\n')}`, data: { changed: plan.length } };
};

/* ----------------------------------------------------------- deliveries */

const deliveryLine = (d: any) =>
	`- ${d.code} — order ${d.orderCode || '?'}: ${d.courierName}, ${STATUS_LABEL[d.status] || d.status}${d.trackingCode ? `, tracking ${d.trackingCode}` : ''}${d.cod ? `, cash to collect ${d.cod}` : ''}${d.error ? ` — ${d.error}` : ''} (id ${d._id})`;

/** The Deliveries page's list, read-only (CR-14). */
const listDeliveriesTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const route = store.installed.delivery?.route;
	if (!route) return refuse('This store has no Deliveries yet.');
	if (!caller.allows(`view-${routePermission(req.app, route) || route}`)) return refuse(`${caller.user?.name || 'The key’s owner'} can’t see /${route}.`);
	const r = await listDeliveries(store, { view: args?.view, courier: args?.courier, q: args?.q, limit: Math.min(50, Number(args?.limit) || 20) });
	const cash = r.cashWithCouriers.total ? `\nCash with couriers (delivered, not paid out yet): ${r.cashWithCouriers.total}` : '';
	return { text: `${r.total} deliver${r.total === 1 ? 'y' : 'ies'}${args?.view && args.view !== 'all' ? ` (${args.view})` : ''}:\n${r.doc.map(deliveryLine).join('\n') || '- none'}${cash}`, data: { views: r.views, cashWithCouriers: r.cashWithCouriers } };
};

/** An order sent to a courier — the same send as the panel's, as "<owner> (AI)"; the courier and the cash are always stated. */
const sendToCourierTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const route = store.installed.order.route;
	if (!caller.allows(`edit-${routePermission(req.app, route) || route}`)) return refuse(`${caller.user?.name || 'The key’s owner'} can’t change /${route}.`);
	if (!adapterOf(clean(args?.courier))) return refuse('Name the courier: steadfast, pathao or redx.');
	if (args?.cod === undefined || args.cod === null || args.cod === '') return refuse('Say how much cash the courier collects (cod) — 0 when it’s paid.');
	const Order = store.M('order');
	const q = clean(args?.order);
	const o: any = isId(q) ? await Order.findById(q).lean() : await Order.findOne({ code: q }).lean();
	if (!o) return refuse(`No order “${q}” — give its number (code) or id.`);
	try {
		const out: any = await send(store, caller.project, o._id, { courier: clean(args.courier), cod: Number(args.cod), ...(args.weight && { weight: args.weight }), ...(args.note && { note: args.note }), ...(args.options && { options: args.options }) }, by(caller));
		const d = out.delivery;
		return { text: `Sent ${o.code} to ${d.courierName}: ${d.code}, ${STATUS_LABEL[d.status] || d.status}${d.trackingCode ? `, tracking ${d.trackingCode}` : ''}.`, data: { delivery: d._id, code: d.code } };
	} catch (e: any) {
		return refuse(e?.message || 'Not sent.');
	}
};

const refreshDeliveryTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const route = store.installed.delivery?.route;
	if (!route) return refuse('This store has no Deliveries yet.');
	if (!caller.allows(`view-${routePermission(req.app, route) || route}`)) return refuse(`${caller.user?.name || 'The key’s owner'} can’t see /${route}.`);
	const q = clean(args?.delivery);
	const d: any = isId(q) ? await store.M('delivery').findById(q).lean() : await store.M('delivery').findOne({ code: q }).lean();
	if (!d) return refuse(`No delivery “${q}” — give its code (DLV-…) or id.`);
	try {
		const out: any = await refresh(store, caller.project, d._id);
		const x = out.delivery;
		return { text: `${x.code}: ${STATUS_LABEL[x.status] || x.status}${x.courierMessage ? ` — ${x.courierMessage}` : ''}.`, data: { status: x.status } };
	} catch (e: any) {
		return refuse(e?.message || 'The courier couldn’t be asked.');
	}
};

/* ---------------------------------------------------------------- tools */

export const STORE_INSTRUCTIONS = `

This project is a STORE. Products are sold through their variants, made from each product's options by the store (sync_variants). Stock is per variant per outlet and changes only through the store — use set_stock (never create_records) and read it with store_stock. Orders, payments and returns are made in the panel or at the POS, not over MCP. Orders are sent to the store's connected couriers with send_to_courier (always name the courier and the cash to collect, and say so to the user first); list_deliveries and refresh_delivery show where parcels are. Courier keys are never available over MCP.`;

export const STORE_TOOLS: ToolDef[] = [
	{
		name: 'store_stock',
		title: 'Read the store’s stock',
		description: 'Without `product`: every product with its stock across all outlets (and whether it has variants yet). With `product` (id, SKU or exact name): each variant at each outlet.',
		scope: 'data',
		only: 'ecommerce',
		inputSchema: { type: 'object', properties: { product: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: storeStock,
	},
	{
		name: 'sync_variants',
		title: 'Make products’ variants',
		description: 'Brings products’ variants in step with their options (Size: Large, Small → one variant each), the way saving a product in the panel does; a product without options gets its one hidden variant. `products`: ids, SKUs or exact names — empty for every product. Then set each variant’s price, SKU or image with create_records on the variants route (matchOn "title" is not unique — use the _id).',
		scope: 'build',
		only: 'ecommerce',
		inputSchema: { type: 'object', properties: { products: { type: 'array', items: { type: 'string' } } } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: syncTool,
	},
	{
		name: 'set_stock',
		title: 'Set stock',
		description:
			'Sets stock through the store, each change written as a stock movement: `onHand` is what is there now (a count), `change` adds or takes away. `product`: id, SKU or exact name; `variant`: its title, SKU or id (leave it out when the product is sold as itself); `outlet`: name, code or id (default: the store’s selling outlet). `reason`: opening, count, adjustment or receive. Everything is checked first — a mistake changes nothing.',
		scope: 'build',
		only: 'ecommerce',
		inputSchema: {
			type: 'object',
			required: ['items'],
			properties: {
				items: {
					type: 'array',
					maxItems: 200,
					items: {
						type: 'object',
						required: ['product'],
						properties: {
							product: { type: 'string' },
							variant: { type: 'string' },
							outlet: { type: 'string' },
							onHand: { type: 'number', minimum: 0 },
							change: { type: 'number' },
							reason: { type: 'string', enum: REASONS },
							note: { type: 'string' },
						},
					},
				},
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: setStockTool,
	},
	{
		name: 'list_deliveries',
		title: 'List deliveries',
		description: 'The store’s parcels sent to couriers: code, order, courier, status, tracking, cash to collect, and the cash couriers hold. `view`: all, problems, pickup, moving, delivered, returning, returned, cancelled; `courier`; `q` searches codes, tracking and phone.',
		scope: 'data',
		only: 'ecommerce',
		inputSchema: { type: 'object', properties: { view: { type: 'string' }, courier: { type: 'string' }, q: { type: 'string' }, limit: { type: 'number' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: listDeliveriesTool,
	},
	{
		name: 'send_to_courier',
		title: 'Send an order to a courier',
		description:
			'Books a parcel with one of the store’s connected couriers — the same send as the order page’s, with the same checks (one parcel per order at a time). `order`: its number or id; `courier`: steadfast, pathao or redx (must be connected and tested); `cod`: cash to collect, a whole number from 0 to what the order owes — required; `weight` (kg), `note`; `options.area` (+ areaName) for RedX, `options.city / zone / area` for Pathao. This calls the courier for real: confirm with the user first.',
		scope: 'build',
		only: 'ecommerce',
		inputSchema: {
			type: 'object',
			required: ['order', 'courier', 'cod'],
			properties: { order: { type: 'string' }, courier: { type: 'string', enum: ['steadfast', 'pathao', 'redx'] }, cod: { type: 'number', minimum: 0 }, weight: { type: 'number' }, note: { type: 'string' }, options: { type: 'object' } },
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		run: sendToCourierTool,
	},
	{
		name: 'refresh_delivery',
		title: 'Ask the courier where a parcel is',
		description: 'Asks the courier for a delivery’s status now and applies it (the order follows). `delivery`: its code (DLV-…) or id.',
		scope: 'data',
		only: 'ecommerce',
		inputSchema: { type: 'object', required: ['delivery'], properties: { delivery: { type: 'string' } } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		run: refreshDeliveryTool,
	},
];
