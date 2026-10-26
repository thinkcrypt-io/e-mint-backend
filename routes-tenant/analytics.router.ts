import express from 'express';
import WebsiteEvent from '../library/models/tenancy/websiteEvent.model.js';
import WebsiteVisitor from '../library/models/tenancy/websiteVisitor.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';

/**
 * /tenant/api/p/:projectId/analytics — a website project's reports
 * (docs/multi-tenancy WO-19), over the events /public/track.js collects.
 * Inside the project's scope, so every aggregate only sees its events.
 *
 *   GET /summary?from&to          page views, visitors, sessions, pages per session, bounce rate, average visit — and the previous period's
 *   GET /timeseries?from&to       page views and visitors per day
 *   GET /top?dim=…&from&to&limit  top paths | referrers | devices | browsers | os | countries | clicks | events, and (WO-56)
 *                                 channels | sources | campaigns | entries (counted per visit) | cities | regions | isps | languages | screens | models
 *   GET /visitors?from&to&q&channel&country&known&sort&page&limit
 *                                 the people: each visitor's summary (WebsiteVisitor), last seen in the range
 *   GET /visitors/:visitorId      one visitor and their journey — every visit, page by page, with clicks and events
 *   GET /live                     who is on the site now (the last 5 minutes) and the page they're on
 *
 * `from`/`to` are dates (YYYY-MM-DD or ISO); the default is the last 30 days.
 * Reading needs view-analytics — records:view (WO-21) or *.
 */
const router = express.Router();
router.use(tenantPermissions(['view-analytics']));

const DAY = 24 * 60 * 60 * 1000;

const range = (q: any) => {
	const to = q.to ? new Date(q.to) : new Date();
	const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY);
	if (isNaN(+from) || isNaN(+to) || from > to) throw new TenancyError(400, 'Choose a valid date range');
	if (to.getTime() - from.getTime() > 400 * DAY) throw new TenancyError(400, 'At most 400 days at a time');
	// A bare date for `to` means the whole of that day.
	if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to.setUTCHours(23, 59, 59, 999);
	return { from, to };
};

const totals = async (from: Date, to: Date) => {
	const [row]: any[] = await WebsiteEvent.aggregate([
		{ $match: { type: 'pageview', createdAt: { $gte: from, $lte: to } } },
		{
			$facet: {
				views: [{ $count: 'n' }],
				visitors: [{ $group: { _id: '$visitorId' } }, { $count: 'n' }],
				sessions: [
					{ $group: { _id: '$sessionId', views: { $sum: 1 }, time: { $sum: { $ifNull: ['$duration', 0] } } } },
					{
						$group: {
							_id: null,
							n: { $sum: 1 },
							single: { $sum: { $cond: [{ $eq: ['$views', 1] }, 1, 0] } },
							// Visits timed by the tracker (WO-56): older ones have no time on page.
							timed: { $sum: { $cond: [{ $gt: ['$time', 0] }, 1, 0] } },
							time: { $sum: '$time' },
						},
					},
				],
			},
		},
	]);
	const views = row?.views?.[0]?.n || 0;
	const sessions = row?.sessions?.[0]?.n || 0;
	const timed = row?.sessions?.[0]?.timed || 0;
	return {
		/** Seconds. */
		avgDuration: timed ? Math.round((row.sessions[0].time || 0) / timed / 1000) : 0,
		pageviews: views,
		visitors: row?.visitors?.[0]?.n || 0,
		sessions,
		pagesPerSession: sessions ? Math.round((views / sessions) * 10) / 10 : 0,
		bounceRate: sessions ? Math.round(((row?.sessions?.[0]?.single || 0) / sessions) * 1000) / 10 : 0,
	};
};

router.get(
	'/summary',
	handle(async req => {
		const { from, to } = range(req.query);
		const span = to.getTime() - from.getTime();
		const [current, previous] = await Promise.all([totals(from, to), totals(new Date(from.getTime() - span), new Date(from.getTime() - 1))]);
		return { from, to, current, previous };
	})
);

router.get(
	'/timeseries',
	handle(async req => {
		const { from, to } = range(req.query);
		const rows: any[] = await WebsiteEvent.aggregate([
			{ $match: { type: 'pageview', createdAt: { $gte: from, $lte: to } } },
			{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, pageviews: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
			{ $project: { _id: 0, date: '$_id', pageviews: 1, visitors: { $size: '$visitors' } } },
			{ $sort: { date: 1 } },
		]);
		// Every day in the range, zero when nothing happened.
		const byDate = new Map(rows.map(r => [r.date, r]));
		const days: any[] = [];
		for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= to.getTime(); t += DAY) {
			const date = new Date(t).toISOString().slice(0, 10);
			days.push(byDate.get(date) || { date, pageviews: 0, visitors: 0 });
		}
		return { from, to, days };
	})
);

type Dim = { type: string; key: any; entry?: boolean; extra?: Record<string, any> };

/** "Dhaka, Bangladesh" from a row's city and country. */
const cityKey = { $cond: [{ $ifNull: ['$city', false] }, { $concat: ['$city', { $cond: [{ $ifNull: ['$country', false] }, { $concat: [', ', '$country'] }, ''] }] }, null] };

const DIMENSIONS: Record<string, Dim> = {
	paths: { type: 'pageview', key: '$path', extra: { avgDuration: { $avg: '$duration' } } },
	referrers: { type: 'pageview', key: '$referrerHost' },
	devices: { type: 'pageview', key: '$device' },
	browsers: { type: 'pageview', key: '$browser' },
	os: { type: 'pageview', key: '$os' },
	countries: { type: 'pageview', key: '$country', extra: { code: { $first: '$countryCode' } } },
	clicks: { type: 'click', key: '$name' },
	events: { type: 'event', key: '$name' },
	// WO-56. These four count visits — a visit's entry page view carries where it came from.
	channels: { type: 'pageview', key: '$channel', entry: true },
	sources: { type: 'pageview', key: '$source', entry: true },
	campaigns: { type: 'pageview', key: '$utmCampaign', entry: true },
	entries: { type: 'pageview', key: '$path', entry: true },
	cities: { type: 'pageview', key: cityKey, extra: { code: { $first: '$countryCode' } } },
	regions: { type: 'pageview', key: '$region' },
	isps: { type: 'pageview', key: '$isp' },
	languages: { type: 'pageview', key: '$language' },
	screens: { type: 'pageview', key: '$screen' },
	models: { type: 'pageview', key: '$deviceModel' },
};

router.get(
	'/top',
	handle(async req => {
		const dim = DIMENSIONS[String(req.query.dim || 'paths')];
		if (!dim) throw new TenancyError(400, `dim is one of ${Object.keys(DIMENSIONS).join(', ')}`);
		const { from, to } = range(req.query);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
		const rows: any[] = await WebsiteEvent.aggregate([
			{ $match: { type: dim.type, createdAt: { $gte: from, $lte: to }, ...(dim.entry && { entry: true }) } },
			{ $group: { _id: dim.key, count: { $sum: 1 }, visitors: { $addToSet: '$visitorId' }, ...dim.extra } },
			{
				$project: {
					_id: 0,
					value: { $ifNull: ['$_id', ''] },
					count: 1,
					visitors: { $size: '$visitors' },
					...Object.fromEntries(Object.keys(dim.extra || {}).map(k => [k, 1])),
				},
			},
			{ $sort: { count: -1, value: 1 } },
			{ $limit: limit },
		]);
		// Seconds, for time on page.
		for (const r of rows) if (typeof r.avgDuration === 'number') r.avgDuration = Math.round(r.avgDuration / 1000);
		return { dim: req.query.dim || 'paths', from, to, rows };
	})
);

/* ------------------------------------------------------------ visitors */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTS: Record<string, any> = {
	lastSeen: { lastSeen: -1 },
	firstSeen: { firstSeen: -1 },
	visits: { visits: -1, lastSeen: -1 },
	pageviews: { pageviews: -1, lastSeen: -1 },
};

router.get(
	'/visitors',
	handle(async req => {
		const { from, to } = range(req.query);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const filter: any = { lastSeen: { $gte: from, $lte: to } };
		const q = String(req.query.q || '').trim().slice(0, 100);
		if (q) {
			const re = new RegExp(escape(q), 'i');
			filter.$or = ['visitorId', 'name', 'email', 'userId', 'place.ip', 'place.city', 'place.country', 'place.isp', 'place.org'].map(k => ({ [k]: re }));
		}
		if (req.query.channel) filter.$and = [{ $or: [{ 'first.channel': String(req.query.channel) }, { lastChannel: String(req.query.channel) }] }];
		if (req.query.country) filter['place.countryCode'] = String(req.query.country).toUpperCase().slice(0, 4);
		if (req.query.known === 'true') filter.$and = [...(filter.$and || []), { $or: [{ customer: { $exists: true } }, { email: { $exists: true } }, { userId: { $exists: true } }] }];
		const [rows, total] = await Promise.all([
			WebsiteVisitor.find(filter)
				.sort(SORTS[String(req.query.sort)] || SORTS.lastSeen)
				.skip((page - 1) * limit)
				.limit(limit)
				.lean(),
			WebsiteVisitor.countDocuments(filter),
		]);
		return { rows, total, page, pages: Math.max(Math.ceil(total / limit), 1), from, to };
	})
);

/** Steps of a visit, in order: page views with their time on page, and the clicks and events between them. */
const step = (e: any) => ({
	type: e.type,
	at: e.createdAt,
	path: e.path,
	title: e.title,
	name: e.name,
	duration: typeof e.duration === 'number' ? Math.round(e.duration / 1000) : undefined,
	scroll: e.scroll,
	element: e.element,
	props: e.props,
});

router.get(
	'/visitors/:visitorId',
	handle(async req => {
		const visitorId = String(req.params.visitorId).slice(0, 64);
		const visitor: any = await WebsiteVisitor.findOne({ visitorId }).lean();
		const events: any[] = await WebsiteEvent.find({ visitorId }).sort({ createdAt: -1 }).limit(2000).lean();
		if (!visitor && !events.length) throw new TenancyError(404, 'No visitor with that id');
		const bySession = new Map<string, any[]>();
		for (const e of events.reverse()) {
			const key = e.sessionId || `day:${new Date(e.createdAt).toISOString().slice(0, 10)}`;
			if (!bySession.has(key)) bySession.set(key, []);
			bySession.get(key)!.push(e);
		}
		const visits = [...bySession.entries()]
			.map(([sessionId, list]) => {
				const views = list.filter(e => e.type === 'pageview');
				const entry = list.find(e => e.entry) || views[0] || list[0];
				const start = new Date(list[0].createdAt).getTime();
				const end = new Date(list[list.length - 1].createdAt).getTime();
				const lastView = views[views.length - 1];
				return {
					sessionId,
					start: list[0].createdAt,
					/** Seconds: first event to last plus the time on the last page — or the pages' own times added up, when that's more. */
					duration: Math.round(Math.max(end - start + (lastView?.duration || 0), views.reduce((n, e) => n + (e.duration || 0), 0)) / 1000),
					pageviews: views.length,
					channel: entry?.channel,
					source: entry?.source,
					referrer: entry?.referrer,
					utmCampaign: entry?.utmCampaign,
					landing: entry?.path,
					exit: lastView?.path,
					city: entry?.city,
					country: entry?.country,
					countryCode: entry?.countryCode,
					ip: entry?.ip,
					isp: entry?.isp,
					device: entry?.device,
					browser: entry?.browser,
					os: entry?.os,
					steps: list.map(step),
				};
			})
			.reverse();
		const latest = events[events.length - 1];
		return {
			visitor: visitor || {
				visitorId,
				firstSeen: events[0].createdAt,
				lastSeen: latest.createdAt,
				visits: visits.length,
				pageviews: events.filter(e => e.type === 'pageview').length,
				device: latest.device,
				os: latest.os,
				browser: latest.browser,
				place: { country: latest.country, countryCode: latest.countryCode, city: latest.city },
			},
			visits,
			/** The journey stops at the latest 2000 events. */
			truncated: events.length >= 2000,
		};
	})
);

const LIVE_MS = 5 * 60 * 1000;

router.get(
	'/live',
	handle(async () => {
		const rows: any[] = await WebsiteEvent.aggregate([
			{ $match: { createdAt: { $gte: new Date(Date.now() - LIVE_MS) } } },
			{ $sort: { createdAt: -1 } },
			{
				$group: {
					_id: '$visitorId',
					lastSeen: { $first: '$createdAt' },
					path: { $first: '$path' },
					title: { $first: '$title' },
					city: { $first: '$city' },
					country: { $first: '$country' },
					countryCode: { $first: '$countryCode' },
					device: { $first: '$device' },
					browser: { $first: '$browser' },
					events: { $sum: 1 },
				},
			},
			{ $sort: { lastSeen: -1 } },
			{ $limit: 100 },
			{ $project: { _id: 0, visitorId: '$_id', lastSeen: 1, path: 1, title: 1, city: 1, country: 1, countryCode: 1, device: 1, browser: 1, events: 1 } },
		]);
		const named: any[] = rows.length ? await WebsiteVisitor.find({ visitorId: { $in: rows.map(r => r.visitorId) } }).select('visitorId name email lastSource lastChannel').lean() : [];
		const byId = new Map(named.map(v => [v.visitorId, v]));
		return {
			now: rows.length,
			visitors: rows.map(r => {
				const v = byId.get(r.visitorId);
				return { ...r, name: v?.name, email: v?.email, source: v?.lastSource, channel: v?.lastChannel };
			}),
		};
	})
);

export default router;
