import mongoose from 'mongoose';
import { Store } from './store.js';
import { isId } from './catalogue.js';

/**
 * What each customer has bought (docs/ecommerce): one record per customer and
 * item with how many orders it was in, how many units, what it came to and
 * when it was last bought. The store keeps them — after an order is placed,
 * cancelled or has items returned, the affected rows are worked out again from
 * the customer's orders, so they can never drift from them.
 */

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));

/** Orders that count as bought: not held, not cancelled. */
const COUNTED = ['open', 'completed'];

/** Work out `customer`'s rows for these variants again from their orders. */
export const refreshPurchases = async (store: Store, customer: any, variants: any[]) => {
	if (!store.installed.purchase || !isId(customer)) return;
	const ids = [...new Set(variants.filter(isId).map(String))];
	if (!ids.length) return;
	const Purchase = store.M('purchase');
	const rows: any[] = await store.M('order').aggregate([
		{ $match: { customer: oid(customer), status: { $in: COUNTED } } },
		{ $addFields: { at: { $ifNull: ['$completedAt', '$createdAt'] } } },
		{ $unwind: '$items' },
		{ $match: { 'items.variant': { $in: ids } } },
		{ $sort: { at: 1 } },
		{
			$group: {
				_id: '$items.variant',
				product: { $last: '$items.product' },
				name: { $last: '$items.name' },
				times: { $sum: 1 },
				quantity: { $sum: { $subtract: [{ $ifNull: ['$items.quantity', 0] }, { $ifNull: ['$items.returned', 0] }] } },
				spent: { $sum: { $ifNull: ['$items.total', 0] } },
				first: { $first: '$at' },
				last: { $last: '$at' },
				lastOrder: { $last: '$code' },
			},
		},
	]);
	const live = new Set<string>();
	for (const r of rows) {
		const variant = String(r._id);
		live.add(variant);
		await Purchase.updateOne(
			{ customer: oid(customer), variant: oid(variant) },
			{
				$set: {
					...(isId(r.product) && { product: oid(r.product) }),
					name: r.name || '',
					timesBought: r.times,
					quantity: r.quantity,
					spent: Math.round((Number(r.spent) || 0) * 100) / 100,
					firstPurchasedAt: r.first,
					lastPurchasedAt: r.last,
					lastOrder: r.lastOrder || '',
				},
			},
			{ upsert: true },
		);
	}
	// Bought only on orders since cancelled: no row.
	const gone = ids.filter(v => !live.has(v)).map(oid);
	if (gone.length) await Purchase.deleteMany({ customer: oid(customer), variant: { $in: gone } });
};

/** After an order changes: its customer's rows for the items on it. Never fails the order. */
export const trackPurchases = async (store: Store, customer: any, items: { variant?: any }[] | undefined) => {
	try {
		await refreshPurchases(store, customer?._id || customer, (items || []).map(i => i.variant));
	} catch (e: any) {
		console.error('purchases:', e?.message);
	}
};

/** Every customer's rows, from all their orders — for a store that had orders before this existed. Returns the rows made. */
export const rebuildPurchases = async (store: Store) => {
	if (!store.installed.purchase) return 0;
	const Order = store.M('order');
	const customers: any[] = await Order.distinct('customer', { customer: { $ne: null }, status: { $in: COUNTED } });
	let n = 0;
	for (const c of customers) {
		const orders: any[] = await Order.find({ customer: c, status: { $in: COUNTED } }, { items: 1 }).lean();
		await refreshPurchases(store, c, orders.flatMap(o => (o.items || []).map((i: any) => i.variant)));
		n++;
	}
	return n;
};
