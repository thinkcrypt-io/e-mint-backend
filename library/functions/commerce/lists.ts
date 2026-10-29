import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { TenancyError } from '../tenancy.function.js';
import { Store } from './store.js';
import { isId } from './catalogue.js';
import { ModelKey, modelSpecs } from './blueprint.js';

/**
 * The panel's own Orders and Returns pages (docs/ecommerce EC19, EC-09): the
 * lists with their quick filters and counts, a return's page, and the fields
 * people added to a store model ("More details"). Reads only, but for moving
 * a return along its status flow.
 */

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const page = (q: any) => ({ page: Math.max(1, Number(q.page) || 1), limit: Math.min(100, Math.max(1, Number(q.limit) || 25)) });

/** Names for the ids a list shows: customers and outlets, one query each. */
const namesOf = async (store: Store, docs: any[]) => {
	const ids = (k: string) => [...new Set(docs.map(d => d[k]).filter(isId).map(String))];
	const [people, outlets] = await Promise.all([
		ids('customer').length ? store.M('customer').find({ _id: { $in: ids('customer') } }, { name: 1, phone: 1 }).lean() : [],
		ids('outlet').length ? store.M('outlet').find({ _id: { $in: ids('outlet') } }, { name: 1, outletCode: 1 }).lean() : [],
	]);
	const by = (rows: any[]) => new Map(rows.map((r: any) => [String(r._id), r]));
	return { people: by(people as any[]), outlets: by(outlets as any[]) };
};

/** Customers whose name, phone or email has the words — for searching orders and returns by who. */
const customersMatching = async (store: Store, words: string) =>
	(await store.M('customer').find({ $or: ['name', 'phone', 'email'].map(k => ({ [k]: { $regex: escapeRegex(words), $options: 'i' } })) }, { _id: 1 }).limit(200).lean()).map((c: any) => c._id);

/* --------------------------------------------------------------- orders */

export const ORDER_VIEWS = ['all', 'today', 'unpaid', 'to-ship', 'returns', 'cancelled', 'new', 'confirmed', 'out', 'delivered'] as const;
type OrderView = (typeof ORDER_VIEWS)[number];

const startOfToday = () => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
};

/** Each quick filter (EC19): held sales are the POS's, never in the list. */
const orderView = (view: OrderView): Record<string, any> => {
	switch (view) {
		case 'today':
			return { createdAt: { $gte: startOfToday() } };
		case 'unpaid':
			return { status: { $ne: 'cancelled' }, paymentStatus: { $in: ['unpaid', 'partial'] } };
		case 'to-ship':
			return { status: 'open', fulfilment: { $in: ['unfulfilled', 'fulfilled', 'shipped'] } };
		case 'returns':
			return { returnedItems: { $gt: 0 } };
		case 'cancelled':
			return { status: 'cancelled' };
		// The website orders' flow (EC-24): new → confirmed → packed / out for delivery → delivered.
		case 'new':
			return { status: 'open', fulfilment: 'unfulfilled' };
		case 'confirmed':
			return { status: 'open', fulfilment: { $in: ['confirmed', 'fulfilled'] } };
		case 'out':
			return { status: 'open', fulfilment: 'shipped' };
		case 'delivered':
			return { fulfilment: 'delivered' };
		default:
			return {};
	}
};

export type OrderListQuery = { view?: string; status?: string; q?: string; scope?: string; area?: string; channel?: string; outlet?: string; paymentStatus?: string; fulfilment?: string; page?: any; limit?: any };

/**
 * The Orders table: newest first, a page at a time, with how many orders each
 * quick filter has (searched and filtered the same way) for its tab.
 */
export const listOrders = async (store: Store, q: OrderListQuery) => {
	const view: OrderView = (ORDER_VIEWS as readonly string[]).includes(String(q.view)) ? (q.view as OrderView) : 'all';
	const base: Record<string, any> = { status: { $ne: 'held' } };
	const and: Record<string, any>[] = [];
	// The builder's Order filters (status, paymentStatus, fulfilment, channel, outlet): one value, or several joined by commas.
	const many = (v: any) => String(v ?? '').split(',').map(x => x.trim()).filter(Boolean);
	for (const k of ['paymentStatus', 'fulfilment'] as const) if (many(q[k]).length) base[k] = { $in: many(q[k]) };
	const statuses = many(q.status);
	if (statuses.length) base.status = { $in: statuses.filter(x => x !== 'held') };
	// The two tables: POS orders (POS and phone) and website orders — one model, told apart by origin; a channel filter narrows within the table's own.
	const own = q.scope === 'website' ? ['website'] : q.scope === 'pos' ? ['pos', 'manual'] : null;
	const picked = many(q.channel);
	const channels = own ? (picked.length ? picked.filter(c => own.includes(c)) : own) : picked;
	if (own || picked.length) base.channel = { $in: channels };
	if (q.area) base['delivery.area'] = String(q.area).slice(0, 120);
	const outletIds = many(q.outlet).filter(isId);
	if (outletIds.length) base.outlet = { $in: outletIds };
	const words = String(q.q || '').trim().slice(0, 100);
	if (words) and.push({ $or: [{ code: { $regex: escapeRegex(words), $options: 'i' } }, { customer: { $in: await customersMatching(store, words) } }, { 'delivery.phone': { $regex: escapeRegex(words), $options: 'i' } }, { 'delivery.name': { $regex: escapeRegex(words), $options: 'i' } }, { 'delivery.address': { $regex: escapeRegex(words), $options: 'i' } }, { email: { $regex: escapeRegex(words), $options: 'i' } }] });
	// $and, so a view's own status ($ne cancelled, open…) can't undo the base's $ne held.
	const filter = (v: OrderView) => ({ $and: [base, orderView(v), ...and] });

	const Order = store.M('order');
	const { page: p, limit } = page(q);
	const [docs, total, ...counts] = await Promise.all([
		Order.find(filter(view))
			.sort({ createdAt: -1 })
			.skip((p - 1) * limit)
			.limit(limit)
			.lean(),
		Order.countDocuments(filter(view)),
		...ORDER_VIEWS.map(v => Order.countDocuments(filter(v))),
	]);
	const { people, outlets } = await namesOf(store, docs);
	return {
		doc: docs.map((d: any) => ({
			...d,
			customerInfo: d.customer ? people.get(String(d.customer)) || null : null,
			outletInfo: d.outlet ? outlets.get(String(d.outlet)) || null : null,
			itemCount: (d.items || []).reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0),
		})),
		total,
		page: p,
		limit,
		views: Object.fromEntries(ORDER_VIEWS.map((v, i) => [v, counts[i]])),
	};
};

/* -------------------------------------------------------------- returns */

export const RETURN_VIEWS = ['all', 'open', 'refunded', 'rejected'] as const;
type ReturnView = (typeof RETURN_VIEWS)[number];
const returnView = (view: ReturnView): Record<string, any> =>
	view === 'open' ? { status: { $in: ['requested', 'approved', 'received'] } } : view === 'refunded' ? { status: { $in: ['refunded', 'closed'] } } : view === 'rejected' ? { status: 'rejected' } : {};

const returnsOn = (store: Store) => {
	if (!store.installed.return || !store.answers.returns?.allowed) throw new TenancyError(404, 'Returns are switched off for this store — turn them on in Store settings → Returns', 'returns_off');
};

/** The Returns page: newest first, with each quick filter's count and the orders' numbers. */
export const listReturns = async (store: Store, q: { view?: string; q?: string; outlet?: string; page?: any; limit?: any }) => {
	returnsOn(store);
	const view: ReturnView = (RETURN_VIEWS as readonly string[]).includes(String(q.view)) ? (q.view as ReturnView) : 'all';
	const base: Record<string, any> = {};
	if (isId(q.outlet)) base.outlet = q.outlet;
	const words = String(q.q || '').trim().slice(0, 100);
	if (words) {
		const rx = { $regex: escapeRegex(words), $options: 'i' };
		const orders = (await store.M('order').find({ code: rx }, { _id: 1 }).limit(200).lean()).map((o: any) => o._id);
		base.$or = [{ code: rx }, { order: { $in: orders } }, { customer: { $in: await customersMatching(store, words) } }];
	}
	const filter = (v: ReturnView) => ({ ...base, ...returnView(v) });
	const Return = store.M('return');
	const { page: p, limit } = page(q);
	const [docs, total, ...counts] = await Promise.all([
		Return.find(filter(view))
			.sort({ createdAt: -1 })
			.skip((p - 1) * limit)
			.limit(limit)
			.lean(),
		Return.countDocuments(filter(view)),
		...RETURN_VIEWS.map(v => Return.countDocuments(filter(v))),
	]);
	const { people, outlets } = await namesOf(store, docs);
	const orderIds = [...new Set(docs.map((d: any) => d.order).filter(isId).map(String))];
	const orders = new Map(((orderIds.length ? await store.M('order').find({ _id: { $in: orderIds } }, { code: 1 }).lean() : []) as any[]).map(o => [String(o._id), o]));
	return {
		doc: docs.map((d: any) => ({
			...d,
			orderInfo: d.order ? orders.get(String(d.order)) || null : null,
			customerInfo: d.customer ? people.get(String(d.customer)) || null : null,
			outletInfo: d.outlet ? outlets.get(String(d.outlet)) || null : null,
			itemCount: (d.lines || []).reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0),
		})),
		total,
		page: p,
		limit,
		views: Object.fromEntries(RETURN_VIEWS.map((v, i) => [v, counts[i]])),
	};
};

/** A return with its order, customer, outlet, refunds and stock moves — the return page's data. */
export const returnDetail = async (store: Store, id: any) => {
	returnsOn(store);
	const ret: any = isId(id) ? await store.M('return').findById(id).lean() : null;
	if (!ret) throw new TenancyError(404, 'Return not found');
	const [order, customer, outlet, payments, movements] = await Promise.all([
		ret.order ? store.M('order').findById(ret.order, { code: 1, total: 1, paid: 1, refunded: 1, createdAt: 1, channel: 1 }).lean() : null,
		ret.customer ? store.M('customer').findById(ret.customer, { name: 1, phone: 1, email: 1, storeCredit: 1 }).lean() : null,
		ret.outlet ? store.M('outlet').findById(ret.outlet, { name: 1, outletCode: 1 }).lean() : null,
		store.M('payment').find({ returnRef: ret._id }).sort({ createdAt: 1 }).lean(),
		ret.code ? store.M('movement').find({ reference: ret.code }).sort({ createdAt: 1 }).lean() : [],
	]);
	return { return: ret, order, customer, outlet, payments, movements, extra: await extraFields(store, 'return', ret) };
};

/**
 * Where a return can go from each status by hand. Refunding is the returns
 * engine's (EC-08): it pays the money back and marks the return refunded.
 */
export const RETURN_NEXT: Record<string, string[]> = {
	requested: ['approved', 'rejected'],
	approved: ['received', 'rejected'],
	refunded: ['closed'],
	rejected: ['closed'],
};

export const moveReturn = async (store: Store, id: any, to: string, by: string, note?: string) => {
	returnsOn(store);
	const ret: any = isId(id) ? await store.M('return').findById(id, { status: 1, note: 1 }).lean() : null;
	if (!ret) throw new TenancyError(404, 'Return not found');
	const from = ret.status || 'requested';
	if (!(RETURN_NEXT[from] || []).includes(to)) throw new TenancyError(409, `A return that’s ${from} can’t be marked ${to}`);
	const line = [`${to[0].toUpperCase()}${to.slice(1)} by ${by}`, String(note || '').trim().slice(0, 300)].filter(Boolean).join(': ');
	const r = await store.M('return').updateOne({ _id: ret._id, status: from }, { $set: { status: to, note: [ret.note, line].filter(Boolean).join('\n') } });
	if (!r.modifiedCount) throw new TenancyError(409, 'Someone else changed this return — reload it');
	return returnDetail(store, ret._id);
};

/* --------------------------------------------------------- more details */

/**
 * The fields people added to one of the store's models, with the record's
 * values — the "More details" card (EC19), so the models stay extendable.
 */
export const extraFields = async (store: Store, key: ModelKey, record: any) => {
	const own = new Set((modelSpecs(store.answers).find(s => s.key === key)?.step.fields || []).map((f: any) => f.key));
	const def: any = store.installed[key] ? await ModelDefinition.findById(store.installed[key].id, { fields: 1 }).lean() : null;
	return (def?.fields || [])
		.filter((f: any) => f?.key && !own.has(f.key) && !['code', 'createdAt', 'updatedAt'].includes(f.key))
		.map((f: any) => ({ key: f.key, label: f.label || f.key, kind: f.kind, value: record?.[f.key] ?? null }));
};
