/**
 * Store search — Insights (docs/search README §6, SI-14): what the panel's Insights page, the Search card on a product
 * and the dashboard's search widget show. Read from the daily totals (`SearchQueryDaily`, SI-13, 13 months) and, for
 * what they can't answer (different visitors over a period, sessions, clicks by position, what people searched next,
 * a product's searches), from the raw events (`SearchEvent`, 90 days).
 *
 * Days are the store's own (its time zone), today included: its row fills up through the day (the rollup is hourly).
 *
 * Rates:
 *   - no results: searches that found nothing / searches
 *   - click rate: results opened / searches that showed results (capped at 100%: one search can open several)
 *   - conversion: orders with a line from search / searches
 */
import mongoose from 'mongoose';
import SearchDoc from '../../../models/tenancy/searchDoc.model.js';
import SearchEvent from '../../../models/tenancy/searchEvent.model.js';
import SearchQueryDaily from '../../../models/tenancy/searchQueryDaily.model.js';
import WebsiteEvent from '../../../models/tenancy/websiteEvent.model.js';
import type { Store } from '../store.js';
import { validZone } from '../zones.js';
import { cleanQuery, normalisedOf } from './events.js';
import { dayBounds, todayIn } from './rollup.js';

const DAY = 24 * 60 * 60 * 1000;
export const PERIODS = [7, 30, 90] as const;
/** Raw events are kept this long: what only they can answer stops there. */
const RAW_DAYS = 90;
/** A table's rows. */
const ROWS = 25;
/** Low click rate: searches at least this often, with results, opened less than this share. */
const LOW_MIN = 3;
const LOW_RATE = 0.15;
/** Trending: searched at least this often in the last 7 days. */
const TREND_MIN = 3;
/** What people searched next: within this long of the search, in the same session. */
const NEXT_WINDOW = 10 * 60 * 1000;

export const periodOf = (v: any) => ((PERIODS as readonly number[]).includes(Number(v)) ? Number(v) : 30);

const zoneOf = (store: Store) => {
	const tz = (store.answers as any)?.store?.timeZone;
	return validZone(tz) ? tz : 'UTC';
};

type Sums = { searches: number; zero: number; clicks: number; carts: number; orders: number; revenue: number };
const SUMS = { searches: { $sum: '$searches' }, zero: { $sum: '$zero' }, clicks: { $sum: '$clicks' }, carts: { $sum: '$carts' }, orders: { $sum: '$orders' }, revenue: { $sum: '$revenue' } };
const EMPTY: Sums = { searches: 0, zero: 0, clicks: 0, carts: 0, orders: 0, revenue: 0 };

const share = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : 0);
const round = (n: number) => Math.round(n * 100) / 100;

/** A query row with its rates. */
const withRates = <T extends Sums>(r: T) => ({
	...r,
	revenue: round(r.revenue || 0),
	zeroRate: share(r.zero, r.searches),
	clickRate: share(r.clicks, r.searches - r.zero),
	conversion: share(r.orders, r.searches),
});

/** The store days [from, to] of the last `days` (today the last), and the same length before. */
const windowOf = (store: Store, days: number) => {
	const tz = zoneOf(store);
	const today = todayIn(tz);
	const from = today - (days - 1) * DAY;
	return { tz, today, from, prevFrom: from - days * DAY, prevTo: from - DAY };
};

const sumsBetween = async (from: number, to: number, extra: any = {}): Promise<Sums> => {
	const [r]: any[] = await SearchQueryDaily.aggregate([{ $match: { ...extra, day: { $gte: new Date(from), $lte: new Date(to) } } }, { $group: { _id: null, ...SUMS } }]);
	return r ? { searches: r.searches, zero: r.zero, clicks: r.clicks, carts: r.carts, orders: r.orders, revenue: r.revenue } : { ...EMPTY };
};

/** Different visitors who searched, and the sessions with a search, between two instants (raw events). */
const searchersBetween = async (from: Date, to: Date, extra: any = {}) => {
	const [r]: any[] = await SearchEvent.aggregate([
		{ $match: { ...extra, type: 'search', at: { $gte: from, $lt: to } } },
		{ $group: { _id: null, visitors: { $addToSet: { $ifNull: ['$visitor', '$session'] } }, sessions: { $addToSet: '$session' } } },
		{ $project: { visitors: { $size: { $setDifference: ['$visitors', [null]] } }, sessions: { $size: { $setDifference: ['$sessions', [null]] } } } },
	]);
	return { visitors: r?.visitors || 0, sessions: r?.sessions || 0 };
};

/** The website's sessions between two instants (its analytics, WO-56); null when it has none. */
const siteSessionsBetween = async (from: Date, to: Date) => {
	const [r]: any[] = await WebsiteEvent.aggregate([
		{ $match: { createdAt: { $gte: from, $lt: to }, sessionId: { $type: 'string' } } },
		{ $group: { _id: '$sessionId' } },
		{ $count: 'n' },
	]);
	return r?.n || null;
};

/** Per day between two store days, every day there (an empty one as zeros). */
const seriesBetween = async (from: number, to: number, extra: any = {}) => {
	const rows: any[] = await SearchQueryDaily.aggregate([{ $match: { ...extra, day: { $gte: new Date(from), $lte: new Date(to) } } }, { $group: { _id: '$day', ...SUMS } }]);
	const byDay = new Map(rows.map(r => [new Date(r._id).getTime(), r]));
	const out = [];
	for (let d = from; d <= to; d += DAY) {
		const r = byDay.get(d) || EMPTY;
		out.push({ day: new Date(d).toISOString().slice(0, 10), searches: r.searches, zero: r.zero, clicks: r.clicks, orders: r.orders, revenue: round(r.revenue) });
	}
	return out;
};

/** Each query's sums between two store days, as typed most often (the day it was searched most). */
const BY_QUERY = (from: number, to: number): any[] => [
	{ $match: { day: { $gte: new Date(from), $lte: new Date(to) } } },
	{ $sort: { searches: -1 } },
	{ $group: { _id: '$nq', q: { $first: '$q' }, last: { $max: '$day' }, ...SUMS } },
];
const rowOf = (r: any) => ({ nq: r._id, q: r.q || r._id, last: r.last ? new Date(r.last).toISOString().slice(0, 10) : undefined, ...withRates({ searches: r.searches, zero: r.zero, clicks: r.clicks, carts: r.carts, orders: r.orders, revenue: r.revenue }) });

/**
 * The Insights page: totals for the period against the one before, a chart by day, and the tables — Top searches,
 * No results (the worst first), Low click rate (results show, nobody opens them) and Trending (up the most against the
 * week before, whatever the period).
 */
export const searchInsights = async (store: Store, { days: asked }: { days?: any } = {}) => {
	const days = periodOf(asked);
	const w = windowOf(store, days);
	const from = dayBounds(w.from, w.tz).from;
	const now = new Date();
	// Different visitors can't be added up day by day: the raw events count them, as far back as they go.
	const prevRaw = 2 * days <= RAW_DAYS;
	const prevFrom = dayBounds(w.prevFrom, w.tz).from;
	const weekFrom = w.today - 6 * DAY;
	const [now_, before, who, whoBefore, sessions, series, tables, trend] = await Promise.all([
		sumsBetween(w.from, w.today),
		sumsBetween(w.prevFrom, w.prevTo),
		searchersBetween(from, now),
		prevRaw ? searchersBetween(prevFrom, from) : null,
		siteSessionsBetween(from, now),
		seriesBetween(w.from, w.today),
		SearchQueryDaily.aggregate<any>([
			...BY_QUERY(w.from, w.today),
			{
				$facet: {
					top: [{ $sort: { searches: -1, orders: -1, _id: 1 } }, { $limit: ROWS }],
					none: [{ $match: { zero: { $gt: 0 } } }, { $sort: { zero: -1, last: -1, _id: 1 } }, { $limit: ROWS }],
					low: [
						{ $addFields: { shown: { $subtract: ['$searches', '$zero'] } } },
						{ $match: { searches: { $gte: LOW_MIN }, shown: { $gt: 0 } } },
						{ $addFields: { rate: { $divide: ['$clicks', '$shown'] } } },
						{ $match: { rate: { $lt: LOW_RATE } } },
						{ $sort: { shown: -1, rate: 1, _id: 1 } },
						{ $limit: ROWS },
					],
				},
			},
		]),
		SearchQueryDaily.aggregate([
			{ $match: { day: { $gte: new Date(weekFrom - 7 * DAY), $lte: new Date(w.today) } } },
			{ $sort: { searches: -1 } },
			{
				$group: {
					_id: '$nq',
					q: { $first: '$q' },
					now: { $sum: { $cond: [{ $gte: ['$day', new Date(weekFrom)] }, '$searches', 0] } },
					before: { $sum: { $cond: [{ $lt: ['$day', new Date(weekFrom)] }, '$searches', 0] } },
					zero: { $sum: { $cond: [{ $gte: ['$day', new Date(weekFrom)] }, '$zero', 0] } },
				},
			},
			{ $match: { now: { $gte: TREND_MIN } } },
			{ $addFields: { up: { $subtract: ['$now', '$before'] } } },
			{ $match: { up: { $gt: 0 } } },
			{ $sort: { up: -1, now: -1, _id: 1 } },
			{ $limit: ROWS },
		]),
	]);
	const t = tables[0] || { top: [], none: [], low: [] };
	const totals = (s: Sums, v: { visitors: number; sessions: number } | null) => ({
		...withRates(s),
		visitors: v ? v.visitors : null,
		searchedSessions: v ? v.sessions : null,
	});
	return {
		days,
		timeZone: w.tz,
		from: new Date(w.from).toISOString().slice(0, 10),
		to: new Date(w.today).toISOString().slice(0, 10),
		totals: { ...totals(now_, who), sessions, sessionShare: sessions ? share(who.sessions, sessions) : null },
		before: totals(before, whoBefore),
		series,
		top: t.top.map(rowOf),
		noResults: t.none.map(rowOf),
		lowClicks: t.low.map(rowOf),
		trending: trend.map((r: any) => ({ nq: r._id, q: r.q || r._id, searches: r.now, before: r.before, up: r.up, zero: r.zero, isNew: r.before === 0 })),
	};
};

/**
 * One search, opened from Insights: its days and totals, the different visitors who made it, clicks by position, and
 * what people searched next in the same session. Its results as shoppers see them now come from /search/try.
 */
export const searchQueryInsight = async (store: Store, { q, days: asked }: { q?: any; days?: any }) => {
	const cleaned = cleanQuery(q);
	const nq = normalisedOf(cleaned);
	if (!nq) return null;
	const days = periodOf(asked);
	const w = windowOf(store, days);
	const from = dayBounds(w.from, w.tz).from;
	const [sums, before, series, who, named, clicks, mine] = await Promise.all([
		sumsBetween(w.from, w.today, { nq }),
		sumsBetween(w.prevFrom, w.prevTo, { nq }),
		seriesBetween(w.from, w.today, { nq }),
		searchersBetween(from, new Date(), { nq }),
		SearchQueryDaily.findOne({ nq }, { q: 1 }).sort({ searches: -1, day: -1 }).lean(),
		SearchEvent.aggregate([{ $match: { type: 'click', nq, at: { $gte: from } } }, { $group: { _id: { $min: [{ $ifNull: ['$position', 0] }, 11] }, n: { $sum: 1 } } }]),
		// Its last searches with a session, for what came next.
		SearchEvent.find({ type: 'search', nq, at: { $gte: from }, session: { $type: 'string' } }, { session: 1, at: 1 }).sort({ at: -1 }).limit(300).lean(),
	]);
	const byPos = new Map(clicks.map((c: any) => [c._id, c.n]));
	const positions = Array.from({ length: 11 }, (_, i) => ({ position: i + 1 === 11 ? '11+' : String(i + 1), clicks: byPos.get(i + 1) || 0 }));
	// What came next: the first other search in the same session within 10 minutes.
	const next = new Map<string, { q: string; n: number }>();
	const sessions = [...new Set((mine as any[]).map(m => m.session))];
	if (sessions.length) {
		const theirs: any[] = await SearchEvent.find({ type: 'search', session: { $in: sessions }, at: { $gte: from } }, { session: 1, at: 1, nq: 1, q: 1, page: 1 }).sort({ session: 1, at: 1 }).lean();
		const bySession = new Map<string, any[]>();
		for (const e of theirs) (bySession.get(e.session) || bySession.set(e.session, []).get(e.session)!).push(e);
		for (const list of bySession.values())
			for (let i = 0; i < list.length; i++) {
				if (list[i].nq !== nq || (list[i].page || 1) > 1) continue;
				const after = list.slice(i + 1).find(e => e.nq && e.nq !== nq && new Date(e.at).getTime() - new Date(list[i].at).getTime() <= NEXT_WINDOW);
				if (!after) continue;
				const was = next.get(after.nq) || { q: String(after.q || after.nq).toLowerCase(), n: 0 };
				was.n++;
				next.set(after.nq, was);
			}
	}
	return {
		q: (named as any)?.q || cleaned.toLowerCase(),
		nq,
		days,
		totals: { ...withRates(sums), visitors: who.visitors },
		before: withRates(before),
		series,
		positions,
		next: [...next.entries()]
			.map(([k, v]) => ({ nq: k, q: v.q, times: v.n }))
			.sort((a, b) => b.times - a.times || a.q.localeCompare(b.q))
			.slice(0, 8),
	};
};

/**
 * A product's Search card: over the last 30 days, the searches it was shown in, opened and added to the bag from,
 * sold from (units and their total), the searches that led to it most, and the keywords the index has for it.
 */
export const productSearchInsight = async (_store: Store, productId: string) => {
	if (!/^[a-f0-9]{24}$/i.test(String(productId))) return null;
	const doc: any = await SearchDoc.findOne({ product: productId }, { 'fields.keyword.words': 1, signals: 1, status: 1, builtAt: 1 }).lean();
	const from = new Date(Date.now() - 30 * DAY);
	const product = new mongoose.Types.ObjectId(String(productId));
	const [counts, queries, shown] = await Promise.all([
		SearchEvent.aggregate([
			{ $match: { type: { $in: ['click', 'cart', 'order'] }, product, at: { $gte: from } } },
			{ $group: { _id: '$type', n: { $sum: 1 }, quantity: { $sum: { $ifNull: ['$quantity', 0] } }, revenue: { $sum: { $ifNull: ['$revenue', 0] } } } },
		]),
		SearchEvent.aggregate([
			{ $match: { type: { $in: ['click', 'cart', 'order'] }, product, at: { $gte: from }, nq: { $type: 'string', $ne: '' } } },
			{ $sort: { at: -1 } },
			{
				$group: {
					_id: '$nq',
					q: { $first: { $toLower: '$q' } },
					clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] } },
					carts: { $sum: { $cond: [{ $eq: ['$type', 'cart'] }, 1, 0] } },
					orders: { $sum: { $cond: [{ $eq: ['$type', 'order'] }, 1, 0] } },
				},
			},
			{ $sort: { clicks: -1, orders: -1, carts: -1, _id: 1 } },
			{ $limit: 10 },
		]),
		SearchEvent.countDocuments({ type: 'search', top: product, at: { $gte: from } }),
	]);
	const of = (type: string) => counts.find((c: any) => c._id === type) || { n: 0, quantity: 0, revenue: 0 };
	return {
		indexed: !!doc,
		shown,
		clicks: of('click').n,
		carts: of('cart').n,
		orders: of('order').n,
		units: of('order').quantity,
		revenue: round(of('order').revenue),
		queries: queries.map((r: any) => ({ nq: r._id, q: r.q || r._id, clicks: r.clicks, carts: r.carts, orders: r.orders })),
		keywords: doc?.fields?.keyword?.words || [],
		sold30: doc?.signals?.sold30 || 0,
		views30: doc?.signals?.views30 ?? 0,
	};
};

/** The dashboard's search widget: this week's revenue and searches from search, and the top search that found nothing. */
export const searchWeek = async (store: Store) => {
	const w = windowOf(store, 7);
	const [now_, before, none]: any[] = await Promise.all([
		sumsBetween(w.from, w.today),
		sumsBetween(w.prevFrom, w.prevTo),
		SearchQueryDaily.aggregate([...BY_QUERY(w.from, w.today), { $match: { zero: { $gt: 0 } } }, { $sort: { zero: -1, last: -1, _id: 1 } }, { $limit: 3 }]),
	]);
	return { days: 7, totals: withRates(now_), before: withRates(before), noResults: none.map(rowOf) };
};
