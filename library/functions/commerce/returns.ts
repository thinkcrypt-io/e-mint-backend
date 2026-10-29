import { TenancyError } from '../tenancy.function.js';
import { Store, roundFor } from './store.js';
import { isId } from './catalogue.js';
import { Move, moveAll } from './stock.js';
import { moveCredit, recordPayment, settleOrder } from './payments.js';
import { orderDetail } from './orders.js';

/**
 * Returns and refunds (docs/ecommerce EC-08): items brought back — all of an
 * order or part of it. What's sellable goes back to the outlet's stock, the
 * order's returned counts and balance move, and what was paid comes back the
 * way the person chooses (the way it was paid, cash, or store credit) — never
 * more than was paid.
 */

export type ReturnInput = {
	lines: { line: number; quantity: any; reason?: string; condition?: string; restock?: boolean }[];
	refundMethod?: string;
	note?: string;
	register?: any;
};

const REASONS = ['changed-mind', 'wrong-size', 'damaged', 'not-as-described', 'other'];

export const returnItems = async (store: Store, orderId: any, input: ReturnInput, ctx: { by: string }) => {
	const rules = store.answers.returns;
	if (!store.installed.return || !rules?.allowed) throw new TenancyError(404, 'Returns are switched off for this store — turn them on in Store settings → Returns', 'returns_off');
	const round = roundFor(store.answers.store.currency);
	const Order = store.M('order');
	const order: any = isId(orderId) ? await Order.findById(orderId).lean() : null;
	if (!order || order.status === 'held') throw new TenancyError(404, 'Order not found');
	if (order.status === 'cancelled') throw new TenancyError(409, 'This order is cancelled — there is nothing to return');
	if (rules.windowDays > 0 && Date.now() - new Date(order.createdAt).getTime() > rules.windowDays * 86400000)
		throw new TenancyError(409, `Returns are taken within ${rules.windowDays} days of the order`, 'return_window');

	// The lines: each order line once, a whole number, no more than what's left to return.
	const items: any[] = order.items || [];
	const asked = new Map<number, { quantity: number; reason: string; condition: string; restock: boolean }>();
	for (const l of Array.isArray(input?.lines) ? input.lines : []) {
		const i = Number(l?.line);
		const q = Number(l?.quantity);
		if (!Number.isInteger(i) || !items[i]) throw new TenancyError(400, 'One of the items isn’t on this order');
		if (!Number.isInteger(q) || q <= 0) throw new TenancyError(400, 'Quantities are whole numbers above 0');
		const left = (Number(items[i].quantity) || 0) - (Number(items[i].returned) || 0);
		const have = asked.get(i)?.quantity || 0;
		if (have + q > left) throw new TenancyError(409, `Only ${left} of ${items[i].name} can still be returned`);
		const condition = l.condition === 'damaged' ? 'damaged' : 'sellable';
		asked.set(i, {
			quantity: have + q,
			reason: REASONS.includes(String(l.reason)) ? String(l.reason) : 'other',
			condition,
			restock: l.restock === undefined ? rules.restockDefault && condition === 'sellable' : !!l.restock && condition === 'sellable',
		});
	}
	if (!asked.size) throw new TenancyError(400, 'Choose what is coming back');
	if (!rules.partial && items.some((it, i) => (asked.get(i)?.quantity || 0) + (Number(it.returned) || 0) < (Number(it.quantity) || 0)))
		throw new TenancyError(400, 'This store takes whole orders back — return every item');

	// Claim the quantities: one return can't take what another already did.
	const done: number[] = [];
	try {
		for (const [i, a] of asked) {
			const left = (Number(items[i].quantity) || 0) - a.quantity;
			const r = await Order.updateOne({ _id: order._id, [`items.${i}.returned`]: { $lte: left } }, { $inc: { [`items.${i}.returned`]: a.quantity, returnedItems: a.quantity } });
			if (!r.modifiedCount) throw new TenancyError(409, `${items[i].name} was returned just now — reload the order`);
			done.push(i);
		}
	} catch (e) {
		for (const i of done) await Order.updateOne({ _id: order._id }, { $inc: { [`items.${i}.returned`]: -asked.get(i)!.quantity, returnedItems: -asked.get(i)!.quantity } }).catch(() => null);
		throw e;
	}

	const lines = [...asked].map(([i, a]) => {
		const it = items[i];
		const unitRefund = round((Number(it.total) || 0) / Math.max(1, Number(it.quantity) || 1));
		return { line: i, variant: it.variant, name: it.name, sku: it.sku, quantity: a.quantity, unitRefund, total: round(unitRefund * a.quantity), reason: a.reason, condition: a.condition, restock: a.restock };
	});

	// Stock back for what's sellable (never refused).
	const moves: Move[] = lines
		.filter(l => l.restock && isId(l.variant))
		.map(l => ({ variant: l.variant, outlet: order.outlet, change: l.quantity, reason: 'return', reference: order.code, by: ctx.by, allowNegative: true }));
	if (moves.length) await moveAll(store, moves).catch((e: any) => console.error('return restock:', e?.message));

	// Money back: what the lines are worth, but never more than what's been paid and not refunded.
	const rows: any[] = await store.M('payment').find({ order: order._id, status: 'completed' }).lean();
	const net = new Map<string, { label: string; amount: number }>();
	for (const p of rows) {
		const t = net.get(p.method) || { label: p.methodLabel || p.method, amount: 0 };
		t.amount = round(t.amount + (p.type === 'refund' ? -1 : 1) * (Number(p.amount) || 0));
		net.set(p.method, t);
	}
	const paidNet = round([...net.values()].reduce((s, t) => s + Math.max(0, t.amount), 0));
	const worth = round(lines.reduce((s, l) => s + l.total, 0));
	const refundDue = Math.min(worth, paidNet);
	const method = String(input.refundMethod || 'original');
	let refunded = 0;
	const give = async (m: string, label: string, amount: number) => {
		if (amount <= 0) return;
		if (m === 'store-credit') {
			if (!order.customer) throw new TenancyError(400, 'Store credit needs a customer on the order');
			await moveCredit(store, { customer: order.customer, amount, reason: 'refund', reference: order.code, by: ctx.by, note: 'Items returned' });
		}
		await recordPayment(store, { order: order._id, type: 'refund', method: m, methodLabel: label, amount, outlet: order.outlet, ...(order.customer && { customer: order.customer }), by: ctx.by, note: 'Items returned' });
		refunded = round(refunded + amount);
	};
	try {
		if (method === 'original') {
			let left = refundDue;
			for (const [m, t] of net) {
				const part = Math.min(left, Math.max(0, t.amount));
				await give(m, t.label, part);
				left = round(left - part);
			}
		} else if (method === 'store-credit') await give('store-credit', 'Store credit', refundDue);
		else await give('cash', 'Cash', refundDue);
	} catch (e) {
		// Put the order back as it was: the quantities and (best effort) the stock.
		for (const [i, a] of asked) await Order.updateOne({ _id: order._id }, { $inc: { [`items.${i}.returned`]: -a.quantity, returnedItems: -a.quantity } }).catch(() => null);
		if (moves.length) await moveAll(store, moves.map(m => ({ ...m, change: -m.change, reason: 'adjustment' as any }))).catch(() => null);
		throw e;
	}

	const ret = await store.M('return').create({
		order: order._id,
		...(order.customer && { customer: order.customer }),
		outlet: order.outlet,
		lines,
		refundDue,
		refunded,
		restocked: moves.length > 0,
		status: 'refunded',
		by: ctx.by,
		...(input.note && { note: String(input.note).slice(0, 1000) }),
	});

	// All of it back: the order is returned.
	const after: any = await Order.findById(order._id, { items: 1 }).lean();
	if ((after.items || []).every((it: any) => (Number(it.returned) || 0) >= (Number(it.quantity) || 0)))
		await Order.updateOne({ _id: order._id }, { $set: { fulfilment: 'returned' } });
	await settleOrder(store, order._id);
	return { return: { _id: ret._id, code: ret.code, refundDue, refunded }, order: await orderDetail(store, order._id) };
};
