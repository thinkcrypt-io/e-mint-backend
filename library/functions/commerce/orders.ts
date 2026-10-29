import { TenancyError } from '../tenancy.function.js';
import { Store, roundFor } from './store.js';
import { isId } from './catalogue.js';
import { Move, moveAll, undoMoves } from './stock.js';
import { Quote, QuoteInput, quote } from './pricing.js';
import { PaymentInput, checkPayments, moveCredit, recordPayment, settleOrder, tendersOf } from './payments.js';
import { currentShift, shiftForSale } from './shifts.js';
import { extraFields } from './lists.js';
import { nextCode } from '../dynamicModels.function.js';

/**
 * Orders (docs/ecommerce EC6, EC9, EC17): a POS sale, an order taken by phone
 * or by hand, a held sale, paying the rest, cancelling. The browser sends what
 * was picked and how it's paid; prices and totals come from `quote()`. A sale
 * is several writes — the coupon use, stock, store credit, payments — done in
 * order and taken back newest first if one fails, the order with them.
 */

export type Ctx = { project: any; by: string };
export type SaleInput = QuoteInput & { register?: any; payments?: PaymentInput[]; note?: string; heldId?: any };
export type ManualInput = QuoteInput & {
	payments?: PaymentInput[];
	note?: string;
	delivery?: { name?: string; phone?: string; address?: string; area?: string; rate?: string };
};

const problemsError = (problems: string[]) => {
	const e: any = new TenancyError(400, problems[0], 'cannot_sell');
	e.extra = { problems };
	return e;
};

const itemsOf = (q: Quote) =>
	q.lines.map(l => ({ variant: l.variant, product: l.product, name: l.name, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, tax: l.tax, total: l.total, returned: 0 }));

const totalsOf = (q: Quote) => ({
	items: itemsOf(q),
	subtotal: q.subtotal,
	discount: q.discount,
	orderDiscount: q.orderDiscount,
	coupon: q.coupon?._id || null,
	couponCode: q.coupon?.code || '',
	tax: q.tax,
	shipping: q.shipping,
	total: q.total,
});

const outletFor = async (store: Store, outlet: any) => {
	const o: any = isId(outlet) ? await store.M('outlet').findById(outlet).lean() : null;
	if (!o || o.active === false) throw new TenancyError(400, 'Choose an outlet');
	return o;
};

const customerFor = async (store: Store, customer: any) => {
	if (!customer) {
		if (store.answers.pos.customerRequired) throw new TenancyError(400, 'Add a customer to this order');
		return null;
	}
	const c: any = isId(customer) ? await store.M('customer').findById(customer).lean() : null;
	if (!c) throw new TenancyError(400, 'That customer no longer exists');
	return c;
};

/** Uses one of the coupon's goes — only while it has some left. */
const claimCoupon = async (store: Store, id: any) => {
	const r = await store.M('coupon').updateOne(
		{ _id: id, $or: [{ usageLimit: { $in: [null, 0] } }, { usageLimit: { $exists: false } }, { $expr: { $lt: [{ $ifNull: ['$used', 0] }, '$usageLimit'] } }] },
		{ $inc: { used: 1 } }
	);
	if (!r.modifiedCount) throw new TenancyError(409, 'That coupon has just been used up', 'coupon_used_up');
};

/**
 * The money and stock of a new order, all or none: the coupon use, stock out
 * of the outlet, then each payment (store credit taken from the customer).
 * Throws after taking back what was done.
 */
const commit = async (store: Store, order: any, q: Quote, payments: ReturnType<typeof checkPayments>['payments'], ctx: { outlet: any; shift: any; customer: any; by: string }) => {
	const undo: (() => Promise<any>)[] = [];
	try {
		if (q.coupon) {
			await claimCoupon(store, q.coupon._id);
			undo.push(() => store.M('coupon').updateOne({ _id: q.coupon!._id }, { $inc: { used: -1 } }));
		}
		const moves: Move[] = q.lines.map(l => ({ variant: l.variant, outlet: ctx.outlet._id, change: -l.quantity, reason: 'sale', reference: order.code, by: ctx.by }));
		const done = await moveAll(store, moves);
		undo.push(() => undoMoves(store, done));
		for (const p of payments) {
			if (p.method === 'store-credit') {
				await moveCredit(store, { customer: ctx.customer?._id, amount: -p.amount, reason: 'sale', reference: order.code, by: ctx.by });
				undo.push(() => moveCredit(store, { customer: ctx.customer?._id, amount: p.amount, reason: 'reversal', reference: order.code, by: ctx.by, note: 'Sale didn’t go through' }));
			}
			const row = await recordPayment(store, {
				order: order._id,
				type: 'payment',
				method: p.method,
				methodLabel: p.label,
				amount: p.amount,
				...(p.tendered !== undefined && { tendered: p.tendered }),
				...(p.change !== undefined && { change: p.change }),
				reference: p.reference,
				outlet: ctx.outlet._id,
				...(ctx.shift && { shift: ctx.shift._id }),
				...(ctx.customer && { customer: ctx.customer._id }),
				by: ctx.by,
			});
			undo.push(() => store.M('payment').deleteOne({ _id: row._id }));
		}
	} catch (e) {
		for (const u of undo.reverse()) await u().catch((err: any) => console.error('sale undo:', err?.message));
		throw e;
	}
};

const countCustomer = (store: Store, customer: any, total: number, sign: 1 | -1) =>
	customer && store.M('customer').updateOne({ _id: customer._id || customer }, { $inc: { ordersCount: sign, spent: sign * total }, ...(sign > 0 && { $set: { lastOrderAt: new Date() } }) });

const needsCustomerForCredit = (payments: PaymentInput[] | undefined, customer: any) => {
	if (!customer && (payments || []).some(p => p?.method === 'store-credit' && Number(p.amount) > 0)) throw new TenancyError(400, 'Store credit needs a customer on the order');
};

/** A POS sale: paid in full, taken away. */
export const sale = async (store: Store, input: SaleInput, ctx: Ctx) => {
	let register: any = null;
	if (input.register) {
		register = isId(input.register) ? await store.M('register').findById(input.register).lean() : null;
		if (!register || register.active === false) throw new TenancyError(400, 'Choose a register');
	} else if (store.features.includes('shifts')) throw new TenancyError(400, 'Choose a register');
	const shift = register ? await shiftForSale(store, register._id) : null;
	const outlet = await outletFor(store, register?.outlet || input.outlet);
	const customer = await customerFor(store, input.customer);
	needsCustomerForCredit(input.payments, customer);

	const q = await quote(store, { ...input, outlet: outlet._id, shipping: 0 }, { forSale: true });
	if (q.problems.length) throw problemsError(q.problems);
	const { payments } = checkPayments(store, await tendersOf(store, ctx.project), input.payments || [], q.total, { full: true });

	const Order = store.M('order');
	const order = await Order.create({
		channel: 'pos',
		status: 'open',
		outlet: outlet._id,
		...(customer && { customer: customer._id }),
		...totalsOf(q),
		...(register && { register: register._id }),
		...(shift && { shift: shift._id }),
		cashier: ctx.by,
		fulfilment: 'unfulfilled',
		...(input.note && { note: String(input.note).slice(0, 1000) }),
	});
	try {
		await commit(store, order, q, payments, { outlet, shift, customer, by: ctx.by });
	} catch (e) {
		await Order.deleteOne({ _id: order._id }).catch(() => null);
		throw e;
	}
	await Order.updateOne({ _id: order._id }, { $set: { status: 'completed', fulfilment: 'fulfilled', completedAt: new Date() } });
	await settleOrder(store, order._id);
	await countCustomer(store, customer, q.total, 1);
	if (isId(input.heldId)) await Order.deleteOne({ _id: input.heldId, status: 'held' }).catch(() => null);
	return orderDetail(store, order._id);
};

/** An order taken by phone or by hand: stock comes out of the outlet now; it can be paid now, in part, or later. */
export const createManual = async (store: Store, input: ManualInput, ctx: Ctx) => {
	const outlet = await outletFor(store, input.outlet);
	const customer = await customerFor(store, input.customer);
	needsCustomerForCredit(input.payments, customer);

	let shipping = Number(input.shipping) || 0;
	const d = input.delivery;
	let delivery: any = null;
	if (d && Object.values(d).some(x => String(x ?? '').trim())) {
		if (!store.features.includes('delivery')) throw new TenancyError(400, 'Delivery is switched off for this store');
		const rate = d.rate ? store.answers.delivery.rates.find(r => r.name === d.rate) : null;
		if (d.rate && !rate) throw new TenancyError(400, `There’s no shipping rate “${d.rate}”`);
		if (rate && (input.shipping === undefined || input.shipping === null || input.shipping === '')) shipping = rate.amount;
		delivery = { name: String(d.name || customer?.name || '').slice(0, 120), phone: String(d.phone || customer?.phone || '').slice(0, 40), address: String(d.address || customer?.address || '').slice(0, 500), area: String(d.area || '').slice(0, 120), rate: rate?.name || '' };
		if (!delivery.address) throw new TenancyError(400, 'Where should it go? Add the delivery address');
	}

	const q = await quote(store, { ...input, outlet: outlet._id, shipping }, { forSale: true });
	if (q.problems.length) throw problemsError(q.problems);
	const { payments } = checkPayments(store, await tendersOf(store, ctx.project), input.payments || [], q.total, { full: false });

	const Order = store.M('order');
	const order = await Order.create({
		channel: 'manual',
		status: 'open',
		outlet: outlet._id,
		...(customer && { customer: customer._id }),
		...totalsOf(q),
		cashier: ctx.by,
		fulfilment: 'unfulfilled',
		...(delivery && { delivery }),
		...(input.note && { note: String(input.note).slice(0, 1000) }),
	});
	try {
		await commit(store, order, q, payments, { outlet, shift: null, customer, by: ctx.by });
	} catch (e) {
		await Order.deleteOne({ _id: order._id }).catch(() => null);
		throw e;
	}
	await settleOrder(store, order._id);
	await countCustomer(store, customer, q.total, 1);
	return orderDetail(store, order._id);
};

/* -------------------------------------------------------------- website */

export type WebsiteInput = {
	lines: { product?: any; variant?: any; quantity: any }[];
	customerName?: string;
	phone?: string;
	email?: string;
	address?: string;
	area?: string;
	city?: string;
	landmark?: string;
	slot?: string;
	note?: string;
	paymentMethod?: string;
	couponCode?: string;
};

const clip = (v: any, n: number) => String(v ?? '').trim().slice(0, n);

/**
 * An order placed on the store's website (docs/ecommerce EC-23): priced and
 * checked by the store (never by the browser), stock out of the first active
 * store outlet now — it goes back if the order is cancelled — numbered WEB-00001,
 * paid later (cash on delivery) unless the buyer pays online.
 */
export const createWebsite = async (store: Store, input: WebsiteInput, ctx: Ctx) => {
	const outlet: any = await store.M('outlet').findOne({ kind: 'store', active: { $ne: false } }).sort({ createdAt: 1 }).lean();
	if (!outlet) throw new TenancyError(409, 'The store has no outlet to sell from yet');
	const name = clip(input.customerName, 120);
	const phone = clip(input.phone, 40);
	const address = clip(input.address, 500);
	if (!name || !phone || !address) throw new TenancyError(400, 'Name, phone and delivery address are needed');
	const email = clip(input.email, 160).toLowerCase();

	// Product ids without a variant sell their default variant.
	const raw = (Array.isArray(input.lines) ? input.lines : []).slice(0, 50);
	const lines: { variant: any; quantity: any }[] = [];
	for (const l of raw) {
		let variant = l?.variant;
		if (!isId(variant) && isId(l?.product)) variant = (await store.M('variant').findOne({ product: l.product, isDefault: true }, { _id: 1 }).lean() as any)?._id;
		if (!isId(variant)) throw new TenancyError(400, 'An item in your cart is no longer sold — please remove it');
		lines.push({ variant, quantity: l.quantity });
	}

	// The delivery charge is the store's rate for the area chosen.
	const rates = store.answers.delivery.enabled ? store.answers.delivery.rates : [];
	const rate = rates.find(r => r.name === input.area);
	if (rates.length && !rate) throw new TenancyError(400, 'Please choose your delivery area');

	const q = await quote(store, { lines, couponCode: input.couponCode, outlet: outlet._id, shipping: rate?.amount ?? 0 }, { forSale: true });
	if (q.problems.length) throw problemsError(q.problems);

	const Order = store.M('order');
	const code = await nextCode({ name: 'StoreWebsiteOrders', code: { prefix: 'WEB', padding: 5 } } as any);
	const order = new Order({
		channel: 'website',
		status: 'open',
		outlet: outlet._id,
		...totalsOf(q),
		...(email && { email }),
		slot: clip(input.slot, 80),
		paymentMethod: clip(input.paymentMethod, 40) || 'cod',
		cashier: ctx.by,
		fulfilment: 'unfulfilled',
		delivery: { name, phone, address, area: clip(rate?.name || input.area, 120), city: clip(input.city, 80), landmark: clip(input.landmark, 160), email, rate: rate?.name || '' },
		...(input.note && { note: clip(input.note, 1000) }),
	});
	order.$locals.code = code;
	await order.save();
	try {
		await commit(store, order, q, [], { outlet, shift: null, customer: null, by: ctx.by });
	} catch (e) {
		await Order.deleteOne({ _id: order._id }).catch(() => null);
		throw e;
	}
	await settleOrder(store, order._id);
	return order._id;
};

/** What a buyer may see of their own website order (found by its id and the phone on it). */
export const trackWebsite = async (store: Store, id: any, phone: any) => {
	const tail = (v: any) => String(v ?? '').replace(/\D/g, '').slice(-10);
	const o: any = isId(id) ? await store.M('order').findOne({ _id: id, channel: 'website' }).lean() : null;
	// The same answer for a wrong id and a wrong phone.
	if (!o || tail(phone).length < 7 || tail(o.delivery?.phone) !== tail(phone)) throw new TenancyError(404, 'We couldn’t find an order with those details.');
	return publicOrder(o);
};

/** The order as its buyer sees it: no staff notes, cashier or ids of other records. */
export const publicOrder = (o: any) => ({
	_id: String(o._id),
	code: o.code,
	status: o.status,
	fulfilment: o.fulfilment,
	paymentStatus: o.paymentStatus,
	paymentMethod: o.paymentMethod || 'cod',
	createdAt: o.createdAt,
	slot: o.slot || '',
	items: (o.items || []).map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
	subtotal: o.subtotal,
	shipping: o.shipping,
	discount: (Number(o.discount) || 0) + (Number(o.orderDiscount) || 0),
	total: o.total,
	balance: o.balance,
	delivery: { name: o.delivery?.name || '', phone: o.delivery?.phone || '', address: o.delivery?.address || '', area: o.delivery?.area || '', city: o.delivery?.city || '', landmark: o.delivery?.landmark || '' },
	email: o.email || '',
	note: o.note || '',
});

/* ----------------------------------------------------------------- held */

const heldOn = (store: Store) => {
	if (!store.features.includes('held')) throw new TenancyError(400, 'Held sales are switched off for this store');
};

/** Parks a basket: no stock or money moves until it's resumed and paid. */
export const hold = async (store: Store, input: SaleInput, ctx: Ctx) => {
	heldOn(store);
	const register: any = isId(input.register) ? await store.M('register').findById(input.register).lean() : null;
	const outlet = await outletFor(store, register?.outlet || input.outlet);
	const customer = input.customer && isId(input.customer) ? await store.M('customer').findById(input.customer).lean() : null;
	const q = await quote(store, { ...input, outlet: outlet._id, shipping: 0 });
	const doc = await store.M('order').create({
		channel: 'pos',
		status: 'held',
		outlet: outlet._id,
		...(customer && { customer: (customer as any)._id }),
		...totalsOf(q),
		...(register && { register: register._id }),
		cashier: ctx.by,
		...(input.note && { note: String(input.note).slice(0, 1000) }),
	});
	return doc.toObject();
};

/** Held baskets at a register (or outlet), newest first, with their customer's name for the list. */
export const listHeld = async (store: Store, { outlet, register }: { outlet?: any; register?: any }) => {
	heldOn(store);
	const docs: any[] = await store
		.M('order')
		.find({ status: 'held', ...(isId(register) ? { register } : isId(outlet) && { outlet }) })
		.sort({ createdAt: -1 })
		.limit(50)
		.lean();
	const ids = docs.map(d => d.customer).filter(Boolean);
	const people: any[] = ids.length ? await store.M('customer').find({ _id: { $in: ids } }, { name: 1, storeCredit: 1 }).lean() : [];
	const byId = new Map(people.map(p => [String(p._id), p]));
	return docs.map(d => ({ ...d, ...(d.customer && byId.has(String(d.customer)) && { customerInfo: byId.get(String(d.customer)) }) }));
};

export const discardHeld = async (store: Store, id: any) => {
	const r = isId(id) ? await store.M('order').deleteOne({ _id: id, status: 'held' }) : { deletedCount: 0 };
	if (!r.deletedCount) throw new TenancyError(404, 'That held sale is gone — resumed or discarded already');
	return { ok: true };
};

/* ------------------------------------------------------- pay, fulfil, cancel */

const openOrder = async (store: Store, id: any) => {
	const order: any = isId(id) ? await store.M('order').findById(id).lean() : null;
	if (!order || order.status === 'held') throw new TenancyError(404, 'Order not found');
	return order;
};

/** Takes money towards what an order still owes (split tenders; cash may give change). */
export const pay = async (store: Store, id: any, input: { payments: PaymentInput[]; register?: any }, ctx: Ctx) => {
	const order = await openOrder(store, id);
	if (order.status === 'cancelled') throw new TenancyError(409, 'This order is cancelled');
	const due = Number(order.balance) || 0;
	if (due <= 0) throw new TenancyError(409, 'Nothing is owed on this order');
	needsCustomerForCredit(input.payments, order.customer);
	const { payments } = checkPayments(store, await tendersOf(store, ctx.project), input.payments, due, { full: false });
	if (!payments.length) throw new TenancyError(400, 'How much, and how was it paid?');
	const shift = isId(input.register) ? await currentShift(store, input.register) : null;
	const outlet = { _id: order.outlet };
	const customer = order.customer ? { _id: order.customer } : null;
	await commit(store, order, { lines: [], coupon: null } as any, payments, { outlet, shift, customer, by: ctx.by });
	await settleOrder(store, order._id);
	return orderDetail(store, order._id);
};

const FULFIL_NEXT: Record<string, string[]> = {
	unfulfilled: ['confirmed', 'fulfilled', 'shipped', 'delivered'],
	confirmed: ['fulfilled', 'shipped', 'delivered'],
	fulfilled: ['shipped', 'delivered'],
	shipped: ['delivered'],
};

/** Moves an order along: packed, shipped, delivered. Delivered completes it. */
export const fulfil = async (store: Store, id: any, to: string) => {
	const order = await openOrder(store, id);
	if (order.status === 'cancelled') throw new TenancyError(409, 'This order is cancelled');
	const from = order.fulfilment || 'unfulfilled';
	if (!(FULFIL_NEXT[from] || []).includes(to)) throw new TenancyError(409, `An order that’s ${from} can’t be marked ${to}`);
	const done = to === 'delivered';
	const r = await store.M('order').updateOne({ _id: order._id, fulfilment: from }, { $set: { fulfilment: to, ...(done && { status: 'completed', completedAt: new Date() }) } });
	if (!r.modifiedCount) throw new TenancyError(409, 'Someone else changed this order — reload it');
	return orderDetail(store, order._id);
};

/**
 * Cancels an order: its stock goes back to the outlet, what was paid goes back
 * the way it came (store credit to the customer; anything else as a refund row
 * by the same method), the coupon gets its go back. Shipped orders come back
 * as returns instead (EC-08).
 */
export const cancel = async (store: Store, id: any, input: { reason?: string; register?: any }, ctx: Ctx) => {
	const round = roundFor(store.answers.store.currency);
	const order = await openOrder(store, id);
	if (order.status === 'cancelled') throw new TenancyError(409, 'This order is cancelled already');
	if (['shipped', 'delivered'].includes(order.fulfilment)) throw new TenancyError(409, 'It has gone out already — take it back as a return');
	if ((Number(order.returnedItems) || 0) > 0) throw new TenancyError(409, 'Some of it came back already — return the rest instead');
	const Order = store.M('order');
	// The claim: only one cancel gets past this.
	const r = await Order.updateOne(
		{ _id: order._id, status: { $in: ['open', 'completed'] } },
		{ $set: { status: 'cancelled', fulfilment: 'cancelled', ...(input.reason && { note: [order.note, `Cancelled: ${String(input.reason).slice(0, 300)}`].filter(Boolean).join('\n') }) } }
	);
	if (!r.modifiedCount) throw new TenancyError(409, 'This order is cancelled already');

	// Stock back, never refused.
	const moves: Move[] = (order.items || [])
		.filter((it: any) => isId(it.variant) && Number(it.quantity) > 0)
		.map((it: any) => ({ variant: it.variant, outlet: order.outlet, change: Number(it.quantity), reason: 'cancel', reference: order.code, by: ctx.by, allowNegative: true }));
	await moveAll(store, moves).catch((e: any) => console.error('cancel restock:', e?.message));

	// Money back, by method: what was paid less what was refunded already.
	const rows: any[] = await store.M('payment').find({ order: order._id, status: 'completed' }).lean();
	const net = new Map<string, { label: string; amount: number }>();
	for (const p of rows) {
		const t = net.get(p.method) || { label: p.methodLabel || p.method, amount: 0 };
		t.amount = round(t.amount + (p.type === 'refund' ? -1 : 1) * (Number(p.amount) || 0));
		net.set(p.method, t);
	}
	const shift = isId(input.register) ? await currentShift(store, input.register) : null;
	for (const [method, t] of net) {
		if (t.amount <= 0) continue;
		if (method === 'store-credit') await moveCredit(store, { customer: order.customer, amount: t.amount, reason: 'reversal', reference: order.code, by: ctx.by, note: 'Order cancelled' });
		await recordPayment(store, {
			order: order._id,
			type: 'refund',
			method,
			methodLabel: t.label,
			amount: t.amount,
			outlet: order.outlet,
			...(shift && { shift: (shift as any)._id }),
			...(order.customer && { customer: order.customer }),
			by: ctx.by,
			note: 'Order cancelled',
		});
	}
	if (order.coupon) await store.M('coupon').updateOne({ _id: order.coupon, used: { $gt: 0 } }, { $inc: { used: -1 } });
	await countCustomer(store, order.customer, Number(order.total) || 0, -1);
	await settleOrder(store, order._id);
	return orderDetail(store, order._id);
};

/** An order with its payments, stock moves, returns and store credit — the order page's data. */
export const orderDetail = async (store: Store, id: any) => {
	const order: any = isId(id) ? await store.M('order').findById(id).lean() : null;
	if (!order) throw new TenancyError(404, 'Order not found');
	const has = (k: any) => !!store.installed[k];
	const [payments, movements, returns, credit, customer, outlet] = await Promise.all([
		store.M('payment').find({ order: order._id }).sort({ createdAt: 1 }).lean(),
		order.code ? store.M('movement').find({ reference: order.code }).sort({ createdAt: 1 }).lean() : [],
		has('return') ? store.M('return').find({ order: order._id }).sort({ createdAt: 1 }).lean() : [],
		has('credit') && order.code ? store.M('credit').find({ reference: order.code }).sort({ createdAt: 1 }).lean() : [],
		order.customer ? store.M('customer').findById(order.customer).lean() : null,
		order.outlet ? store.M('outlet').findById(order.outlet, { name: 1, outletCode: 1, address: 1, phone: 1, receiptHeader: 1 }).lean() : null,
	]);
	return { order, payments, movements, returns, credit, customer, outlet, extra: await extraFields(store, 'order', order) };
};

/** What the POS needs to start: outlets that sell, their registers, the ways to pay, the switches. */
export const posSetup = async (store: Store, project: any, register?: any) => {
	const [outlets, registers, tenders] = await Promise.all([
		store.M('outlet').find({ kind: 'store', active: { $ne: false } }).sort({ name: 1 }).lean(),
		store.M('register').find({ active: { $ne: false } }).sort({ name: 1 }).lean(),
		tendersOf(store, project),
	]);
	const a = store.answers;
	return {
		currency: a.store.currency,
		features: store.features,
		outlets,
		registers,
		tenders,
		shift: store.features.includes('shifts') && isId(register) ? await currentShift(store, register) : null,
		pos: { receipt: a.pos.receipt, taxMode: a.pos.tax.mode, customerRequired: a.pos.customerRequired },
		delivery: a.delivery.enabled ? { rates: a.delivery.rates } : null,
		negativeStock: a.store.negativeStock,
	};
};
