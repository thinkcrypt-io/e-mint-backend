import express from 'express';
import WebsiteEvent from '../library/models/tenancy/websiteEvent.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';

/**
 * /tenant/api/p/:projectId/analytics — a website project's reports
 * (docs/multi-tenancy WO-19), over the events /public/track.js collects.
 * Inside the project's scope, so every aggregate only sees its events.
 *
 *   GET /summary?from&to          page views, visitors, sessions, pages per session, bounce rate — and the previous period's
 *   GET /timeseries?from&to       page views and visitors per day
 *   GET /top?dim=…&from&to&limit  top paths | referrers | devices | browsers | os | countries | clicks | events
 *
 * `from`/`to` are dates (YYYY-MM-DD or ISO); the default is the last 30 days.
 * Reading needs view-analytics (or data:*, data:view, *).
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
				sessions: [{ $group: { _id: '$sessionId', views: { $sum: 1 } } }, { $group: { _id: null, n: { $sum: 1 }, single: { $sum: { $cond: [{ $eq: ['$views', 1] }, 1, 0] } } } }],
			},
		},
	]);
	const views = row?.views?.[0]?.n || 0;
	const sessions = row?.sessions?.[0]?.n || 0;
	return {
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

const DIMENSIONS: Record<string, { type: string; key: string; label?: string }> = {
	paths: { type: 'pageview', key: '$path' },
	referrers: { type: 'pageview', key: '$referrerHost' },
	devices: { type: 'pageview', key: '$device' },
	browsers: { type: 'pageview', key: '$browser' },
	os: { type: 'pageview', key: '$os' },
	countries: { type: 'pageview', key: '$country' },
	clicks: { type: 'click', key: '$name' },
	events: { type: 'event', key: '$name' },
};

router.get(
	'/top',
	handle(async req => {
		const dim = DIMENSIONS[String(req.query.dim || 'paths')];
		if (!dim) throw new TenancyError(400, `dim is one of ${Object.keys(DIMENSIONS).join(', ')}`);
		const { from, to } = range(req.query);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
		const rows: any[] = await WebsiteEvent.aggregate([
			{ $match: { type: dim.type, createdAt: { $gte: from, $lte: to } } },
			{ $group: { _id: dim.key, count: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
			{ $project: { _id: 0, value: { $ifNull: ['$_id', ''] }, count: 1, visitors: { $size: '$visitors' } } },
			{ $sort: { count: -1, value: 1 } },
			{ $limit: limit },
		]);
		return { dim: req.query.dim || 'paths', from, to, rows };
	})
);

export default router;
