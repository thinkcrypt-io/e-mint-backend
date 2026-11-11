/**
 * Store search — the rollups (docs/search SI17, SI-13). Two jobs, each run from the search sweep and claimed on the
 * store's settings so two servers never run one store at once:
 *
 *  1. **Daily totals** (every hour): the raw events (`SearchEvent`, 90 days) added up into `SearchQueryDaily`
 *     (13 months), one row per day × normalised query: searches, visitors, no results, clicks, adds to the bag, orders
 *     and revenue from search. Days are the store's own (its time zone). Each run writes again every day from the
 *     last finished one through today, so today's row fills up through the day and a late event still counts.
 *  2. **Signals** (once a day): each product's numbers recounted for ranking (SI14) and the panel —
 *     - `sold30`: units sold in the last 30 days, from the orders (open or completed, any channel; returns taken off).
 *       Website orders add theirs as they're placed (SI-12); this puts it right.
 *     - `views30`: page views in the last 30 days, from the per-day counts `viewProduct` keeps on the search document.
 *     - `wishes`: from the product's own wish count.
 *     - On the product (engine fields, read-only): `sold30` and `searchClicks30` (results opened from search, 30 days).
 *     Only what changed is written; products are written without touching `updatedAt`, so the sweep doesn't rebuild them.
 *
 * State lives in the store's CommerceSettings under `search.rollup`: dailyAt, lastDay (the last finished day written),
 * signalsAt, lastSignals { at, products, changed, ms }.
 */
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import SearchDoc from '../../../models/tenancy/searchDoc.model.js';
import SearchEvent from '../../../models/tenancy/searchEvent.model.js';
import SearchQueryDaily from '../../../models/tenancy/searchQueryDaily.model.js';
import { scopeFilter } from '../../tenantScope.function.js';
import type { Store } from '../store.js';
import { dayOf, startOfDay, validZone, zoneOffset } from '../zones.js';

const DAY = 24 * 60 * 60 * 1000;
const DAILY_MS = () => Number(process.env.SEARCH_DAILY_MS) || 60 * 60 * 1000;
const SIGNALS_MS = () => Number(process.env.SEARCH_SIGNALS_MS) || DAY;
/** Raw events are kept 90 days: a store's first rollup goes back that far. */
const FIRST_DAYS = 90;
const BATCH = 1000;
const COUNTED = ['open', 'completed'];

const zoneOf = (store: Store) => {
	const tz = (store.answers as any)?.store?.timeZone;
	return validZone(tz) ? tz : 'UTC';
};

/** Today in the zone, as the 00:00 UTC that names it. */
export const todayIn = (tz: string, now = Date.now()) => dayOf(now + zoneOffset(tz, now) * 60000)!;

/** The instants a store day runs between. */
export const dayBounds = (day: number, tz: string) => ({ from: startOfDay(day, tz)!, to: startOfDay(day + DAY, tz)! });

const rollupState = async (): Promise<any> => ((await CommerceSettings.findOne({}, { 'search.rollup': 1 }).lean()) as any)?.search?.rollup || {};

/** Claims a job by moving its stamp; false when another server has it or it isn't due. */
const claim = async (key: 'dailyAt' | 'signalsAt', was: any, every: number, force: boolean) => {
	if (!force && was && Date.now() - new Date(was).getTime() < every) return false;
	const r = await CommerceSettings.updateOne({ [`search.rollup.${key}`]: was ?? null }, { $set: { [`search.rollup.${key}`]: new Date() } });
	return r.modifiedCount > 0;
};

/* --------------------------------------------------------------- daily totals */

/** One store day's events, added up by normalised query. */
export const totalsForDay = async (day: number, tz: string) => {
	const { from, to } = dayBounds(day, tz);
	const match = { at: { $gte: from, $lt: to }, type: { $in: ['search', 'click', 'cart', 'order'] }, nq: { $type: 'string', $ne: '' } };
	const is = (type: string) => ({ $eq: ['$type', type] });
	const firstPage = { $and: [is('search'), { $lte: [{ $ifNull: ['$page', 1] }, 1] }] };
	const [counts, typed] = await Promise.all([
		SearchEvent.aggregate([
			{ $match: match },
			{
				$group: {
					_id: '$nq',
					searches: { $sum: { $cond: [firstPage, 1, 0] } },
					zero: { $sum: { $cond: [{ $and: [firstPage, { $eq: [{ $ifNull: ['$results', 0] }, 0] }] }, 1, 0] } },
					clicks: { $sum: { $cond: [is('click'), 1, 0] } },
					carts: { $sum: { $cond: [is('cart'), 1, 0] } },
					revenue: { $sum: { $cond: [is('order'), { $ifNull: ['$revenue', 0] }, 0] } },
					orders: { $addToSet: { $cond: [is('order'), '$order', null] } },
					visitors: { $addToSet: { $cond: [is('search'), { $ifNull: ['$visitor', '$session'] }, null] } },
				},
			},
			{ $project: { searches: 1, zero: 1, clicks: 1, carts: 1, revenue: 1, orders: { $size: { $setDifference: ['$orders', [null]] } }, visitors: { $size: { $setDifference: ['$visitors', [null]] } } } },
		]),
		// How each was typed most often (a click carries its search's query too).
		SearchEvent.aggregate([
			{ $match: { ...match, type: 'search' } },
			{ $group: { _id: { nq: '$nq', q: { $toLower: '$q' } }, n: { $sum: 1 } } },
			{ $sort: { n: -1, '_id.q': 1 } },
			{ $group: { _id: '$_id.nq', q: { $first: '$_id.q' } } },
		]),
	]);
	const sample = new Map(typed.map((t: any) => [t._id, t.q]));
	return counts.map((c: any) => ({ nq: c._id, q: sample.get(c._id) || c._id, searches: c.searches, visitors: c.visitors, zero: c.zero, clicks: c.clicks, carts: c.carts, orders: c.orders, revenue: Math.round(c.revenue * 100) / 100 }));
};

/** Writes one store day's rows (replacing what that day had). Returns the rows written. */
export const writeDay = async (day: number, tz: string) => {
	const rows = await totalsForDay(day, tz);
	const scope = scopeFilter() || {};
	const at = new Date();
	const date = new Date(day);
	for (let i = 0; i < rows.length; i += BATCH)
		// bulkWrite isn't confined by the tenant plugin: the scope goes in by hand.
		await SearchQueryDaily.bulkWrite(
			rows.slice(i, i + BATCH).map(r => ({ updateOne: { filter: { ...scope, day: date, nq: r.nq }, update: { $set: { ...r, ...scope, day: date, at } }, upsert: true } })) as any,
			{ ordered: false }
		);
	// A query the day no longer has (its events expired before a late re-run) goes.
	await SearchQueryDaily.deleteMany({ day: date, nq: { $nin: rows.map(r => r.nq) } });
	return rows.length;
};

/**
 * Every day from the last finished one written through today. Due once an hour (`SEARCH_DAILY_MS`); `force` runs it
 * now (a script, a test). Returns the days and rows written, or null when it wasn't due.
 */
export const rollupDaily = async (store: Store, { force = false } = {}) => {
	const state = await rollupState();
	if (!(await claim('dailyAt', state.dailyAt, DAILY_MS(), force))) return null;
	const tz = zoneOf(store);
	const today = todayIn(tz);
	let first = state.lastDay ? dayOf(state.lastDay)! : today - FIRST_DAYS * DAY;
	if (!state.lastDay) {
		// A first run starts at the store's oldest event, not 90 empty days before it.
		const oldest: any = await SearchEvent.findOne({ at: { $gte: dayBounds(first, tz).from } }, { at: 1 }).sort({ at: 1 }).lean();
		first = oldest ? Math.max(first, todayIn(tz, new Date(oldest.at).getTime())) : today;
	}
	let days = 0;
	let rows = 0;
	for (let day = first; day <= today; day += DAY) {
		rows += await writeDay(day, tz);
		days++;
	}
	await CommerceSettings.updateOne({}, { $set: { 'search.rollup.lastDay': new Date(today - DAY) } });
	return { days, rows };
};

/* ------------------------------------------------------------------- signals */

/** "20261111": the UTC day a product view is counted under. */
export const viewDayKey = (at = Date.now()) => new Date(at).toISOString().slice(0, 10).replace(/-/g, '');

/** A product page view, counted by day on its search document (views30). */
export const countView = (productId: any) =>
	SearchDoc.updateOne({ product: productId }, { $inc: { [`signals.viewDays.${viewDayKey()}`]: 1 } }).catch((e: any) => console.error('search view:', e?.message));

/** The last 30 days' views of a document's day counts, and the keys older than that (to drop). */
export const viewsOf = (viewDays: Record<string, number> | undefined, now = Date.now()) => {
	const since = viewDayKey(now - 29 * DAY);
	let views30 = 0;
	const old: string[] = [];
	for (const [k, n] of Object.entries(viewDays || {}))
		if (k >= since) views30 += Number(n) || 0;
		else old.push(k);
	return { views30, old };
};

const idOf = (v: any) => (v == null ? '' : String(v?._id ?? v));

/** Units sold per product in the last 30 days, from the orders. */
const soldByProduct = async (store: Store) => {
	if (!store.installed.order) return new Map<string, number>();
	const rows: any[] = await store.M('order').aggregate([
		{ $match: { status: { $in: COUNTED }, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } } },
		{ $unwind: '$items' },
		{ $group: { _id: { $toString: '$items.product' }, n: { $sum: { $subtract: [{ $ifNull: ['$items.quantity', 0] }, { $ifNull: ['$items.returned', 0] }] } } } },
	]);
	return new Map(rows.filter(r => r._id && r.n > 0).map(r => [String(r._id), r.n]));
};

/** Results opened from search per product in the last 30 days. */
const clicksByProduct = async () => {
	const rows: any[] = await SearchEvent.aggregate([{ $match: { type: 'click', at: { $gte: new Date(Date.now() - 30 * DAY) } } }, { $group: { _id: '$product', n: { $sum: 1 } } }]);
	return new Map(rows.filter(r => r._id).map(r => [String(r._id), r.n]));
};

/**
 * Every product's numbers recounted. Due once a day (`SEARCH_SIGNALS_MS`); `force` runs it now. Returns the counts,
 * or null when it wasn't due.
 */
export const rollupSignals = async (store: Store, { force = false } = {}) => {
	const state = await rollupState();
	if (!(await claim('signalsAt', state.signalsAt, SIGNALS_MS(), force))) return null;
	const started = Date.now();
	const [sold, clicks] = await Promise.all([soldByProduct(store), clicksByProduct()]);
	const scope = scopeFilter() || {};
	const Product = store.installed.product ? store.M('product') : null;
	let products = 0;
	let changed = 0;
	let last: any = null;
	for (;;) {
		const docs: any[] = await SearchDoc.find(last ? { _id: { $gt: last } } : {}, { product: 1, signals: 1 }).sort({ _id: 1 }).limit(BATCH).lean();
		if (!docs.length) break;
		last = docs[docs.length - 1]._id;
		products += docs.length;
		const own: any[] = Product ? await Product.find({ _id: { $in: docs.map(d => d.product) } }, { wishlistCount: 1, sold30: 1, searchClicks30: 1 }).lean() : [];
		const byId = new Map(own.map(p => [idOf(p._id), p]));
		const docOps: any[] = [];
		const productOps: any[] = [];
		for (const d of docs) {
			const id = idOf(d.product);
			const p = byId.get(id);
			const sig = d.signals || {};
			const { views30, old } = viewsOf(sig.viewDays);
			const next = { sold30: sold.get(id) || 0, views30, wishes: p ? Number(p.wishlistCount) || 0 : Number(sig.wishes) || 0 };
			if (next.sold30 !== (sig.sold30 || 0) || next.views30 !== sig.views30 || next.wishes !== (sig.wishes || 0) || old.length) {
				const unset = Object.fromEntries(old.map(k => [`signals.viewDays.${k}`, '']));
				docOps.push({ updateOne: { filter: { ...scope, _id: d._id }, update: { $set: { 'signals.sold30': next.sold30, 'signals.views30': next.views30, 'signals.wishes': next.wishes }, ...(old.length && { $unset: unset }) } } });
			}
			const clicked = clicks.get(id) || 0;
			if (p && (next.sold30 !== (p.sold30 ?? null) || clicked !== (p.searchClicks30 ?? null)))
				productOps.push({ updateOne: { filter: { _id: p._id }, update: { $set: { sold30: next.sold30, searchClicks30: clicked } }, timestamps: false } });
		}
		if (docOps.length) await SearchDoc.bulkWrite(docOps, { ordered: false });
		if (productOps.length && Product) await Product.bulkWrite(productOps, { ordered: false, timestamps: false } as any);
		changed += docOps.length;
	}
	const lastSignals = { at: new Date(), products, changed, ms: Date.now() - started };
	// New numbers change the ranking: the search caches start again.
	await CommerceSettings.updateOne({}, { $set: { 'search.rollup.lastSignals': lastSignals }, ...(changed && { $inc: { 'search.index.version': 1 } }) });
	return lastSignals;
};

/** Both jobs, when each is due (the search sweep, indexer.ts). */
export const rollupStore = async (store: Store, opts: { force?: boolean } = {}) => ({ daily: await rollupDaily(store, opts), signals: await rollupSignals(store, opts) });
