import { TenancyError } from '../tenancy.function.js';
import { Store, roundFor } from './store.js';
import { isId } from './catalogue.js';
import { offeredFor } from './settings.js';

/**
 * The store's money (docs/ecommerce EC9, EC15): one Payments ledger — money in
 * (`payment`) and out (`refund`) — that an order's paid / refunded / balance
 * and payment status are worked out from; and store credit, a ledger of its
 * own whose running figure sits on the customer.
 */

export type Tender = { id: string; label: string; cash?: boolean };

/** The ways a customer can pay at this store: its tenders, its own named ways, store credit. */
export const tendersOf = async (store: Store, project: any): Promise<Tender[]> => {
	const offered = await offeredFor(project);
	const label = (id: string) => offered.tenders.find(t => t.id === id)?.label.replace(/ \(.*\)$/, '') || id;
	return [
		...store.answers.payments.tenders.map(id => ({ id, label: label(id), ...(id === 'cash' && { cash: true }) })),
		...store.answers.payments.custom.map(name => ({ id: `custom:${name}`, label: name })),
		...(store.features.includes('store-credit') ? [{ id: 'store-credit', label: 'Store credit' }] : []),
	];
};

export type PaymentInput = { method: string; amount: any; tendered?: any; reference?: string };

/**
 * Checks payments against the tenders: known methods, positive amounts; only
 * cash may be more than what's due (the rest is change). Returns them with the
 * change worked out and the total they settle.
 */
export const checkPayments = (store: Store, tenders: Tender[], input: PaymentInput[], due: number, opts: { full: boolean }) => {
	const round = roundFor(store.answers.store.currency);
	const list = (Array.isArray(input) ? input : []).filter(p => p && Number(p.amount) > 0);
	const out: { method: string; label: string; amount: number; tendered?: number; change?: number; reference: string }[] = [];
	for (const p of list) {
		const t = tenders.find(x => x.id === p.method);
		if (!t) throw new TenancyError(400, `This store doesn’t take “${p.method}”`);
		out.push({ method: t.id, label: t.label, amount: round(Number(p.amount)), reference: String(p.reference || '').slice(0, 120), ...(t.cash && p.tendered && { tendered: round(Number(p.tendered)) }) });
	}
	let paying = round(out.reduce((s, p) => s + p.amount, 0));
	// Too much: cash gives change; anything else over the total is refused.
	if (paying > due) {
		const over = round(paying - due);
		const cash = out.find(p => p.method === 'cash');
		if (!cash || cash.amount < over) throw new TenancyError(400, 'Only cash can be more than what’s due — take the extra off the card or wallet');
		cash.tendered = cash.tendered && cash.tendered >= cash.amount ? cash.tendered : cash.amount;
		cash.amount = round(cash.amount - over);
		cash.change = round(cash.tendered - cash.amount);
		paying = due;
	} else for (const p of out) if (p.tendered && p.tendered > p.amount) p.change = round(p.tendered - p.amount);
	if (opts.full && paying < due) throw new TenancyError(400, `${round(due - paying)} is still to pay`, 'not_paid');
	return { payments: out.filter(p => p.amount > 0), paying };
};

/** One ledger row. */
export const recordPayment = (store: Store, row: Record<string, any>) => store.M('payment').create({ status: 'completed', ...row });

/** Works an order's paid, refunded, balance and payment status out from its payments and returns. */
export const settleOrder = async (store: Store, orderId: any) => {
	const round = roundFor(store.answers.store.currency);
	const Order = store.M('order');
	const order: any = await Order.findById(orderId).lean();
	if (!order) return null;
	const rows: any[] = await store.M('payment').find({ order: order._id, status: 'completed' }, { type: 1, amount: 1 }).lean();
	const paid = round(rows.filter(r => r.type !== 'refund').reduce((s, r) => s + (Number(r.amount) || 0), 0));
	const refunded = round(rows.filter(r => r.type === 'refund').reduce((s, r) => s + (Number(r.amount) || 0), 0));
	// What's owed shrinks by what came back (returns, EC-08) and a cancelled order owes nothing.
	const returned = round(
		(order.items || []).reduce((s: number, it: any) => s + (Number(it.returned) || 0) * ((Number(it.total) || 0) / Math.max(1, Number(it.quantity) || 1)), 0)
	);
	const owed = order.status === 'cancelled' ? 0 : round((Number(order.total) || 0) - returned);
	const balance = round(owed - (paid - refunded));
	const paymentStatus =
		refunded > 0 && paid - refunded <= 0
			? 'refunded'
			: refunded > 0
			? 'partially-refunded'
			: paid <= 0
			? 'unpaid'
			: balance > 0
			? 'partial'
			: 'paid';
	await Order.updateOne({ _id: order._id }, { $set: { paid, refunded, balance, paymentStatus } });
	return { paid, refunded, balance, paymentStatus };
};

/**
 * Store credit given (+) or spent (−): the customer's figure moves atomically
 * (spending only while there's enough), and a ledger row records it with the
 * figure after.
 */
export const moveCredit = async (store: Store, { customer, amount, reason, reference, by, note }: { customer: any; amount: number; reason: string; reference?: string; by?: string; note?: string }) => {
	if (!store.features.includes('store-credit')) throw new TenancyError(400, 'Store credit is switched off for this store');
	if (!isId(customer)) throw new TenancyError(400, 'Store credit needs a customer');
	const round = roundFor(store.answers.store.currency);
	const change = round(amount);
	if (!change) return null;
	const Customer = store.M('customer');
	const after: any = await Customer.findOneAndUpdate({ _id: customer, ...(change < 0 && { storeCredit: { $gte: -change } }) }, { $inc: { storeCredit: change } }, { new: true }).lean();
	if (!after) {
		const c: any = await Customer.findById(customer, { storeCredit: 1, name: 1 }).lean();
		if (!c) throw new TenancyError(400, 'That customer no longer exists');
		throw new TenancyError(409, `${c.name} has ${round(Number(c.storeCredit) || 0)} in store credit`, 'not_enough_credit');
	}
	return store.M('credit').create({ customer, amount: change, balance: round(Number(after.storeCredit) || 0), reason, reference: reference || '', by: by || '', ...(note && { note }) });
};
