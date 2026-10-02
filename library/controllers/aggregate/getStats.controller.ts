import { Response } from 'express';
import mongoose from 'mongoose';
import { scopedModel } from '../../functions/routeRegistry.function.js';

/**
 * GET /<route>/get/stats — what a dashboard widget shows: one number, a series
 * over time, or a breakdown by a field, for the records this admin may read.
 *
 * It runs after the route's own filter, permission and access middleware, so
 * `req.queryHelper` already narrows it to what the list would return — the
 * widget's conditions arrive as the list's filters (`?status=open`).
 *
 *   metric   count (default) | sum | avg, with `field` for sum / avg (a number)
 *   group    none (default) | time | field
 *   dateField  the date the range and the time series read (default createdAt)
 *   range    all | today | 7d | 30d (default) | 90d | month | 12m | year
 *   interval day | week | month — the time series' step
 *   by       the field a breakdown groups by; `limit` its top N (default 6)
 *   compare  1: with group none, the previous period of the same length too
 *   tz       the viewer's IANA time zone, for day / month boundaries
 *
 * Only fields the route exposes (settings, not hidden, not secret-named) can
 * be used — the same ones its list can be filtered by.
 */

const RANGES = ['all', 'today', '7d', '30d', '90d', 'month', '12m', 'year'];
const INTERVALS = ['day', 'week', 'month'];
const MAX_POINTS = 400;
const LABEL_KEYS = ['name', 'title', 'label', 'code', 'email', 'phone'];

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const validTz = (tz: any) => {
	if (typeof tz !== 'string' || !tz) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return tz;
	} catch {
		return 'UTC';
	}
};

/** A date's wall-clock parts in `tz`. */
const partsIn = (date: Date, tz: string) => {
	const p: any = {};
	for (const { type, value } of new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(date))
		p[type] = value;
	return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
};

/** The instant a wall-clock time in `tz` happens. */
const instantIn = (tz: string, y: number, m: number, d: number) => {
	const guess = Date.UTC(y, m - 1, d);
	const p = partsIn(new Date(guess), tz);
	const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - guess;
	return new Date(guess - offset);
};

/** Where a range starts, in the viewer's time zone. */
const rangeStart = (range: string, tz: string, now = new Date()): Date | null => {
	const { y, m, d } = partsIn(now, tz);
	switch (range) {
		case 'today':
			return instantIn(tz, y, m, d);
		case '7d':
			return instantIn(tz, y, m, d - 6);
		case '30d':
			return instantIn(tz, y, m, d - 29);
		case '90d':
			return instantIn(tz, y, m, d - 89);
		case 'month':
			return instantIn(tz, y, m, 1);
		case '12m':
			return instantIn(tz, y, m - 11, 1);
		case 'year':
			return instantIn(tz, y, 1, 1);
		default:
			return null;
	}
};

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO week key (2026-W09) of a wall-clock date. */
const isoWeek = (y: number, m: number, d: number) => {
	const date = new Date(Date.UTC(y, m - 1, d));
	const day = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - day);
	const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
	const week = Math.ceil(((+date - yearStart) / 86400000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${pad(week)}`;
};

const keyOf = (date: Date, interval: string, tz: string) => {
	const { y, m, d } = partsIn(date, tz);
	if (interval === 'month') return `${y}-${pad(m)}`;
	if (interval === 'week') return isoWeek(y, m, d);
	return `${y}-${pad(m)}-${pad(d)}`;
};

/** Every bucket key from `from` to `to`, so empty days show as 0. */
const keysBetween = (from: Date, to: Date, interval: string, tz: string) => {
	const keys: string[] = [];
	const start = partsIn(from, tz);
	for (let i = 0; keys.length <= MAX_POINTS; i++) {
		const at =
			interval === 'month'
				? instantIn(tz, start.y, start.m + i, 1)
				: instantIn(tz, start.y, start.m, start.d + i * (interval === 'week' ? 7 : 1));
		if (at > to) break;
		const key = keyOf(at, interval, tz);
		if (keys[keys.length - 1] !== key) keys.push(key);
	}
	// The last bucket (today, this week) even when the step jumped past it.
	const last = keyOf(to, interval, tz);
	if (keys[keys.length - 1] !== last) keys.push(last);
	return keys;
};

const FORMAT: Record<string, string> = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };

const getStats = (Model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const q = req.query || {};
			const built = req.resolvedRoute?.built;
			const allowed = new Set<string>([
				...(built?.FILTER_OPTIONS?.allowFilter || []),
				...(built?.FILTER_OPTIONS?.allowSort || []),
				'createdAt',
				'updatedAt',
			]);
			const pathOf = (key: any): any => (typeof key === 'string' && allowed.has(key) ? Model.schema.path(key) : null);

			const metric = ['sum', 'avg'].includes(q.metric) ? q.metric : 'count';
			const group = ['time', 'field'].includes(q.group) ? q.group : 'none';
			const range = RANGES.includes(q.range) ? q.range : '30d';
			const interval = INTERVALS.includes(q.interval) ? q.interval : 'day';
			const tz = validTz(q.tz);
			const limit = Math.min(Math.max(parseInt(q.limit, 10) || 6, 1), 20);

			let field: string | undefined;
			if (metric !== 'count') {
				const p = pathOf(q.field);
				if (!p || !['Number', 'Decimal128'].includes(p.instance))
					return fail(res, 400, `“${q.field || ''}” isn’t a number field of this route`);
				field = q.field;
			}

			const dateField = q.dateField || 'createdAt';
			const datePath = pathOf(dateField);
			if (!datePath || datePath.instance !== 'Date') return fail(res, 400, `“${dateField}” isn’t a date field of this route`);

			// The list's query — filters, access — cast the way find() would.
			let base: any;
			try {
				base = Model.find(req.queryHelper || {}).cast(Model);
			} catch (e: any) {
				return fail(res, 400, `A filter doesn’t fit its field: ${e.message}`);
			}

			const now = new Date();
			const from = rangeStart(range, tz, now);
			const inRange = (start: Date | null, end: Date) =>
				start ? { $and: [base, { [dateField]: { $gte: start, $lte: end } }] } : base;

			const value = metric === 'count' ? { $sum: 1 } : { [`$${metric}`]: `$${field}` };
			const numberOf = (v: any) => (v === null || v === undefined ? 0 : Number(v.toString()));

			if (group === 'none') {
				const total = async (match: any) => {
					const [r] = await (Model as any).aggregate([{ $match: match }, { $group: { _id: null, value } }]);
					return numberOf(r?.value);
				};
				const out: any = { value: await total(inRange(from, now)), from, to: now };
				if (q.compare === '1' && from) {
					const prevFrom = new Date(+from - (+now - +from));
					out.previous = await (Model as any).aggregate([
						{ $match: { $and: [base, { [dateField]: { $gte: prevFrom, $lt: from } }] } },
						{ $group: { _id: null, value } },
					]).then(([r]: any[]) => numberOf(r?.value));
				}
				return res.status(200).json(out);
			}

			if (group === 'time') {
				let start = from;
				if (!start) {
					const [first] = await Model.find({ $and: [base, { [dateField]: { $ne: null } }] })
						.sort({ [dateField]: 1 })
						.limit(1)
						.select(dateField)
						.lean();
					start = (first as any)?.[dateField] ? new Date((first as any)[dateField]) : now;
				}
				const keys = keysBetween(start as Date, now, interval, tz);
				if (keys.length > MAX_POINTS)
					return fail(res, 400, `That’s more than ${MAX_POINTS} ${interval}s — pick a shorter range or a longer step`);
				const rows = await (Model as any).aggregate([
					{ $match: { $and: [base, { [dateField]: { $gte: start, $lte: now } }] } },
					{ $group: { _id: { $dateToString: { format: FORMAT[interval], date: `$${dateField}`, timezone: tz } }, value } },
				]);
				const byKey = new Map<string, number>(rows.map((r: any) => [String(r._id), numberOf(r.value)]));
				const points = keys.map(key => ({ key, value: byKey.get(key) || 0 }));
				const sum = points.reduce((a, p) => a + p.value, 0);
				return res.status(200).json({ points, total: metric === 'avg' ? null : sum, from: start, to: now, interval });
			}

			// group === 'field': a breakdown, biggest first, the rest as "other".
			const byPath = pathOf(q.by);
			if (!byPath) return fail(res, 400, `“${q.by || ''}” isn’t a field of this route`);
			const isArray = byPath.instance === 'Array';
			const rows = await (Model as any).aggregate([
				{ $match: inRange(from, now) },
				...(isArray ? [{ $unwind: `$${q.by}` }] : []),
				{ $group: { _id: `$${q.by}`, value } },
				{ $sort: { value: -1 } },
			]);
			const top = rows.slice(0, limit);
			const rest = rows.slice(limit);

			// A linked record's key is its id: name it by its own display field.
			const ref = isArray ? byPath.caster?.options?.ref || byPath.options?.type?.[0]?.ref : byPath.options?.ref;
			const labels = new Map<string, string>();
			const Ref = ref ? scopedModel(ref) : null;
			if (Ref) {
				const ids = top.map((r: any) => r._id).filter((id: any) => mongoose.isValidObjectId(id));
				const docs: any[] = await Ref.find({ _id: { $in: ids } }).select(LABEL_KEYS.join(' ')).lean();
				for (const d of docs) labels.set(String(d._id), String(LABEL_KEYS.map(k => d[k]).find(v => v !== undefined && v !== '') ?? d._id));
			}
			const points = top.map((r: any) => {
				const key = r._id === null || r._id === undefined || r._id === '' ? null : String(r._id);
				return { key, label: key === null ? 'Not set' : labels.get(key) || (typeof r._id === 'boolean' ? (r._id ? 'Yes' : 'No') : key), value: numberOf(r.value) };
			});
			const other = metric === 'avg' ? null : rest.reduce((a: number, r: any) => a + numberOf(r.value), 0);
			return res.status(200).json({ points, other, otherCount: rest.length, from, to: now });
		} catch (e: any) {
			console.error('getStats:', e.message);
			return fail(res, 500, process.env.NODE_ENV === 'development' ? e.message : 'Could not work out the numbers');
		}
	};
};

export default getStats;
