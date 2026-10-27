import { TenancyError } from '../tenancy.function.js';
import { Store, itemName } from './store.js';
import { isId } from './catalogue.js';

/**
 * Stock per variant per outlet (docs/ecommerce EC8). A level is never edited:
 * every change is `move()` — an atomic `$inc` that, taking stock out, only
 * matches while the outlet has enough (unless the store sells below zero) —
 * and a Stock movement saying why. The variant's and product's totals follow.
 * Several moves together (a sale, a transfer) run in order and are taken back
 * newest first if one fails (EC17).
 */

export type Move = {
	variant: any;
	outlet: any;
	/** + puts stock in, − takes it out. */
	change: number;
	reason: string;
	reference?: string;
	note?: string;
	by?: string;
	/** Selling below zero is allowed for this move (the store's setting, or a count). */
	allowNegative?: boolean;
};

export class NotEnoughStock extends TenancyError {
	constructor(name: string, outletName: string, available: number) {
		super(409, available > 0 ? `Only ${available} of ${name} left at ${outletName}` : `${name} is out of stock at ${outletName}`, 'not_enough_stock');
		(this as any).extra = { available, item: name };
	}
}

const describe = async (store: Store, variantId: any, outletId: any) => {
	const variant: any = await store.M('variant').findById(variantId).lean();
	if (!variant) throw new TenancyError(400, 'That item no longer exists');
	const [product, outlet]: any[] = await Promise.all([store.M('product').findById(variant.product).lean(), store.M('outlet').findById(outletId).lean()]);
	if (!outlet) throw new TenancyError(400, 'Choose an outlet');
	return { variant, product, outlet, name: itemName(product, variant) };
};

/** One move; returns the on-hand figure after it. Items that don't track stock only log nothing and return null. */
export const move = async (store: Store, m: Move): Promise<{ after: number | null; movement: any | null }> => {
	if (!isId(m.variant) || !isId(m.outlet)) throw new TenancyError(400, 'An item and an outlet are needed');
	const change = Number(m.change);
	if (!Number.isFinite(change) || !change) return { after: null, movement: null };
	const { variant, product, outlet, name } = await describe(store, m.variant, m.outlet);
	if (product?.trackStock === false) return { after: null, movement: null };
	const Stock = store.M('stock');
	const label = `${name} @ ${outlet.outletCode || outlet.name}`;
	// The level exists first (0), so the take-out below is one atomic, conditional update.
	await Stock.updateOne(
		{ variant: variant._id, outlet: outlet._id },
		{ $setOnInsert: { variant: variant._id, product: product?._id, outlet: outlet._id, onHand: 0, label } },
		{ upsert: true }
	);
	const floor = change < 0 && !(m.allowNegative ?? store.answers.store.negativeStock);
	const level: any = await Stock.findOneAndUpdate(
		{ variant: variant._id, outlet: outlet._id, ...(floor && { onHand: { $gte: -change } }) },
		{ $inc: { onHand: change }, $set: { label } },
		{ new: true }
	).lean();
	if (!level) {
		const now: any = await Stock.findOne({ variant: variant._id, outlet: outlet._id }, { onHand: 1 }).lean();
		throw new NotEnoughStock(name, outlet.name, Math.max(0, Number(now?.onHand) || 0));
	}
	await Promise.all([
		store.M('variant').updateOne({ _id: variant._id }, { $inc: { totalStock: change } }),
		product && store.M('product').updateOne({ _id: product._id }, { $inc: { totalStock: change } }),
	]);
	const movement = await store.M('movement').create({
		label: name,
		variant: variant._id,
		product: product?._id,
		outlet: outlet._id,
		change,
		after: level.onHand,
		reason: m.reason,
		reference: m.reference || '',
		by: m.by || '',
		...(m.note && { note: m.note }),
	});
	return { after: level.onHand, movement };
};

/** Takes a move back (its opposite, logged as such, never refused for stock). */
const reverse = (store: Store, m: Move) =>
	move(store, { ...m, change: -m.change, reason: m.change > 0 ? 'adjustment' : m.reason === 'sale' ? 'cancel' : 'adjustment', note: `Undone: ${m.reason}`, allowNegative: true });

/** Several moves, all or none: a failure takes back the ones done, newest first, and is thrown. */
export const moveAll = async (store: Store, moves: Move[]) => {
	const done: Move[] = [];
	try {
		for (const m of moves) {
			const r = await move(store, m);
			if (r.movement) done.push(m);
		}
		return done;
	} catch (e) {
		for (const m of done.reverse()) await reverse(store, m).catch((err: any) => console.error('stock undo:', err?.message));
		throw e;
	}
};

/** Sets an item's stock at an outlet to what was counted (or moves it by `change`). */
export const setStock = async (store: Store, body: any, by: string) => {
	const { variant, outlet } = body || {};
	if (!isId(variant) || !isId(outlet)) throw new TenancyError(400, 'Choose an item and an outlet');
	let change: number;
	if (body.onHand !== undefined && body.onHand !== null && body.onHand !== '') {
		const counted = Number(body.onHand);
		if (!Number.isFinite(counted) || counted < 0) throw new TenancyError(400, 'The count is a number of 0 or more');
		const now: any = await store.M('stock').findOne({ variant, outlet }, { onHand: 1 }).lean();
		change = counted - (Number(now?.onHand) || 0);
	} else change = Number(body.change);
	if (!Number.isFinite(change)) throw new TenancyError(400, 'Say how many to add or take away, or what was counted');
	if (!change) return { after: null, unchanged: true };
	const reason = ['opening', 'count', 'adjustment', 'receive', 'damage'].includes(body.reason) ? (body.reason === 'damage' ? 'adjustment' : body.reason) : body.onHand !== undefined ? 'count' : 'adjustment';
	const r = await move(store, { variant, outlet, change, reason, by, note: String(body.note || '').slice(0, 300), reference: 'Set by hand', allowNegative: true });
	return { after: r.after, change };
};

/** Stock of one product: each variant at each outlet. */
export const productStock = async (store: Store, productId: any) => {
	if (!isId(productId)) throw new TenancyError(400, 'Invalid product');
	const [variants, outlets, levels]: any[] = await Promise.all([
		store.M('variant').find({ product: productId }).sort({ active: -1, isDefault: -1, createdAt: 1 }).lean(),
		store.M('outlet').find({ active: { $ne: false } }).sort({ kind: 1, name: 1 }).lean(),
		store.M('stock').find({ product: productId }).lean(),
	]);
	const at = new Map(levels.map((l: any) => [`${l.variant}:${l.outlet}`, l]));
	return {
		outlets: outlets.map((o: any) => ({ _id: String(o._id), name: o.name, code: o.outletCode, kind: o.kind })),
		variants: variants.map((v: any) => ({
			_id: String(v._id),
			title: v.isDefault ? '' : v.title,
			sku: v.sku || '',
			barcode: v.barcode || '',
			price: v.price ?? null,
			active: v.active !== false,
			isDefault: !!v.isDefault,
			total: Number(v.totalStock) || 0,
			stock: Object.fromEntries(
				outlets.map((o: any) => {
					const l: any = at.get(`${v._id}:${o._id}`);
					return [String(o._id), { onHand: Number(l?.onHand) || 0, reorderPoint: l?.reorderPoint ?? null }];
				})
			),
		})),
	};
};

/* ---------------------------------------------------- adjustments, transfers */

const linesOf = (doc: any) => (Array.isArray(doc?.lines) ? doc.lines : []).filter((l: any) => isId(l?.variant));

/** Applies a draft adjustment: each line's change (or counted − on hand) as a movement. */
export const applyAdjustment = async (store: Store, id: any, by: string) => {
	const Adj = store.M('adjustment');
	const doc: any = isId(id) ? await Adj.findById(id).lean() : null;
	if (!doc) throw new TenancyError(404, 'Adjustment not found');
	if (doc.status === 'applied') throw new TenancyError(409, 'This adjustment was applied already');
	const lines = linesOf(doc);
	if (!lines.length) throw new TenancyError(400, 'Add the items first');
	// Claim it, so a double click applies once.
	const claimed = await Adj.updateOne({ _id: doc._id, status: { $ne: 'applied' } }, { $set: { status: 'applied', appliedAt: new Date(), by } });
	if (!claimed.modifiedCount) throw new TenancyError(409, 'This adjustment was applied already');
	try {
		const moves: Move[] = [];
		for (const l of lines) {
			let change = Number(l.change) || 0;
			if (l.counted !== undefined && l.counted !== null && l.counted !== '') {
				const now: any = await store.M('stock').findOne({ variant: l.variant, outlet: doc.outlet }, { onHand: 1 }).lean();
				change = Number(l.counted) - (Number(now?.onHand) || 0);
			}
			if (change) moves.push({ variant: l.variant, outlet: doc.outlet, change, reason: doc.reason === 'count' ? 'count' : 'adjustment', reference: doc.code, by, note: doc.reason, allowNegative: true });
		}
		await moveAll(store, moves);
		return { applied: moves.length };
	} catch (e) {
		await Adj.updateOne({ _id: doc._id }, { $set: { status: 'draft' }, $unset: { appliedAt: 1, by: 1 } });
		throw e;
	}
};

/** A transfer: sent (out of `from`, with the floor), received (into `to`), or cancelled (a sent one goes back). */
export const transferAction = async (store: Store, id: any, action: 'send' | 'receive' | 'cancel', by: string) => {
	const T = store.M('transfer');
	const doc: any = isId(id) ? await T.findById(id).lean() : null;
	if (!doc) throw new TenancyError(404, 'Transfer not found');
	if (String(doc.from) === String(doc.to)) throw new TenancyError(400, 'A transfer goes from one outlet to another');
	const lines = linesOf(doc).filter((l: any) => Number(l.quantity) > 0);
	const need: Record<string, string> = { send: 'draft', receive: 'sent', cancel: doc.status === 'sent' ? 'sent' : 'draft' };
	if (doc.status !== need[action])
		throw new TenancyError(409, action === 'send' ? 'Only a draft can be sent' : action === 'receive' ? 'Only a sent transfer can be received' : 'Only a draft or sent transfer can be cancelled');
	if (action !== 'cancel' && !lines.length) throw new TenancyError(400, 'Add the items and quantities first');
	const next = { send: 'sent', receive: 'received', cancel: 'cancelled' }[action];
	const claimed = await T.updateOne({ _id: doc._id, status: doc.status }, { $set: { status: next, by, ...(action === 'send' && { sentAt: new Date() }), ...(action === 'receive' && { receivedAt: new Date() }) } });
	if (!claimed.modifiedCount) throw new TenancyError(409, 'Someone else changed this transfer — reload it');
	try {
		if (action === 'send') await moveAll(store, lines.map((l: any) => ({ variant: l.variant, outlet: doc.from, change: -Number(l.quantity), reason: 'transfer-out', reference: doc.code, by })));
		if (action === 'receive') await moveAll(store, lines.map((l: any) => ({ variant: l.variant, outlet: doc.to, change: Number(l.quantity), reason: 'transfer-in', reference: doc.code, by })));
		if (action === 'cancel' && doc.status === 'sent')
			await moveAll(store, lines.map((l: any) => ({ variant: l.variant, outlet: doc.from, change: Number(l.quantity), reason: 'transfer-in', reference: doc.code, by, note: 'Transfer cancelled' })));
	} catch (e) {
		await T.updateOne({ _id: doc._id }, { $set: { status: doc.status } });
		throw e;
	}
	return { status: next };
};
