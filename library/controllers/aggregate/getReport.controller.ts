import { Response } from 'express';
import mongoose from 'mongoose';
import { scopedModel } from '../../functions/routeRegistry.function.js';
import { MAX_ROWS, TableCell, cellValue, get, stamp, writeTable } from '../export/exportRows.controller.js';

/**
 * POST /<route>/get/report?<filters> — a report on this route's records (docs/panel-users RP-02):
 * the rows, a breakdown by a field, or a timeline, with totals — as JSON for the
 * screen or as a CSV / Excel / PDF download.
 *
 * Runs after the route's filter, read permission and access middleware, like the
 * table's export: `req.queryHelper` holds the report's filters and what the
 * reader may see, so a report never shows a record its reader couldn't open.
 *
 * Body:
 *   type       list (default) | summary | timeline
 *   columns    [{ key, label? }]                      list: the columns (a linked record's part: "animal.tagId")
 *   sort       '-date'                                list: the order (default -createdAt)
 *   limit      list: rows on screen (default 500); a download takes up to MAX_ROWS
 *   totals     ['amount']                             list: number fields summed in the last row
 *   groupBy    'shed'                                 summary: the field each row is
 *   sums       [{ field, label? }]                    summary / timeline: number fields summed per row
 *   interval   day | week | month (default month)     timeline: one row per step
 *   dateField  the date `from` / `to` and a timeline read (default createdAt)
 *   from, to   YYYY-MM-DD, inclusive, in `tz`
 *   tz         the reader's IANA time zone
 *   format     json (default) | csv | xlsx | pdf
 *   title, subtitle   a download's heading
 *
 * Answers { type, columns: [{ key, label, kind }], rows: cell[][], footer, count, truncated }.
 * Only fields the route exposes can be used — the ones its list can be filtered or sorted by.
 */

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const LABEL_KEYS = ['name', 'title', 'label', 'code', 'tagId', 'email', 'phone'];
const FORMAT: Record<string, string> = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m', year: '%Y' };
const numberOf = (v: any) => (v === null || v === undefined ? 0 : Number(v.toString()));

const validTz = (tz: any) => {
	if (typeof tz !== 'string' || !tz) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return tz;
	} catch {
		return 'UTC';
	}
};

/** The instant a YYYY-MM-DD day starts (or, with `end`, ends) in `tz`. */
const dayIn = (value: any, tz: string, end = false): Date | null => {
	const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return null;
	const guess = Date.UTC(+m[1], +m[2] - 1, +m[3] + (end ? 1 : 0));
	const parts: any = {};
	for (const { type, value: v } of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess)))
		parts[type] = v;
	const offset = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - guess;
	return new Date(guess - offset - (end ? 1 : 0));
};

const titleOf = (settings: any, key: string) => {
	const root = key.split('.')[0];
	if (key === 'createdAt') return 'Created';
	if (key === 'updatedAt') return 'Updated';
	return String(settings[key]?.title || settings[root]?.title || key);
};

export class ReportError extends Error {}

export type ReportContext = {
	/** The records it reads: the list's filters and the reader's access. */
	query: any;
	/** The route's field settings by key ({ title, exclude }). */
	settings: Record<string, any>;
	/** Fields that may be grouped, summed or dated. */
	allowed: Set<string>;
	select?: string;
	populate?: any;
};

export type ReportResult = { type: string; format: string; columns: { key: string; label: string; kind: string }[]; rows: TableCell[][]; footer: TableCell[] | null; count: number; truncated: boolean; from: Date | null; to: Date | null };

/** The report itself — rows, a breakdown or a timeline — for the route endpoint below and the MCP's run_report. */
export const reportData = async (Model: mongoose.Model<any>, ctx: ReportContext, body: any): Promise<ReportResult> => {
		const { settings, allowed } = ctx;
		const pathOf = (key: any): any => (typeof key === 'string' && allowed.has(key) ? Model.schema.path(key) : null);
		const isNumber = (key: any) => ['Number', 'Decimal128'].includes(pathOf(key)?.instance);

		const type = ['summary', 'timeline'].includes(body.type) ? body.type : 'list';
		const format = ['csv', 'xlsx', 'pdf'].includes(body.format) ? body.format : 'json';
		const tz = validTz(body.tz);

		const dateField = body.dateField || 'createdAt';
		if (pathOf(dateField)?.instance !== 'Date') throw new ReportError(`“${dateField}” isn’t a date field of this route`);
		const from = dayIn(body.from, tz);
		const to = dayIn(body.to, tz, true);

		let base: any;
		try {
			base = Model.find(ctx.query || {}).cast(Model);
		} catch (e: any) {
			throw new ReportError(`A filter doesn’t fit its field: ${e.message}`);
		}
		const range = from || to ? { [dateField]: { ...(from && { $gte: from }), ...(to && { $lte: to }) } } : null;
		const match = range ? { $and: [base, range] } : base;

		const sums: { field: string; label: string }[] = (Array.isArray(body.sums) ? body.sums : [])
			.map((s: any) => (typeof s === 'string' ? { field: s } : s))
			.filter((s: any) => s && isNumber(s.field))
			.slice(0, 10)
			.map((s: any) => ({ field: s.field, label: String(s.label || titleOf(settings, s.field)) }));

		let columns: { key: string; label: string; kind: string }[] = [];
		let rows: TableCell[][] = [];
		let footer: TableCell[] | null = null;
		let truncated = false;

		if (type === 'list') {
			columns = (Array.isArray(body.columns) ? body.columns : [])
				.filter((c: any) => c && typeof c.key === 'string')
				.filter((c: any) => {
					const root = c.key.split('.')[0];
					return (root in settings || ['_id', 'createdAt', 'updatedAt'].includes(root)) && !settings[root]?.exclude;
				})
				.slice(0, 60)
				.map((c: any) => {
					const p = Model.schema.path(c.key.split('.')[0]) as any;
					const kind = p?.instance === 'Date' ? 'date' : ['Number', 'Decimal128'].includes(p?.instance) && !c.key.includes('.') ? 'number' : 'text';
					return { key: c.key, label: String(c.label || titleOf(settings, c.key)), kind };
				});
			if (!columns.length) throw new ReportError('Pick at least one column');
			const cap = format === 'json' ? Math.min(Math.max(parseInt(body.limit, 10) || 500, 1), 5000) : MAX_ROWS;
			const sort = typeof body.sort === 'string' && /^-?[\w.]+$/.test(body.sort) ? body.sort : '-createdAt';
			const docs = await Model.find(match)
				.sort(sort)
				.limit(cap + 1)
				.select(ctx.select || '')
				.populate(ctx.populate || '')
				.lean();
			truncated = docs.length > cap;
			rows = docs.slice(0, cap).map((doc: any) => columns.map(c => cellValue(get(doc, c.key))));
			const totals = (Array.isArray(body.totals) ? body.totals : []).filter((f: any) => columns.some(c => c.key === f) && isNumber(f));
			if (totals.length) {
				const group: any = { _id: null };
				totals.forEach((f: string, i: number) => (group[`t${i}`] = { $sum: `$${f}` }));
				const [r] = await (Model as any).aggregate([{ $match: match }, { $group: group }]);
				footer = columns.map((c, i) => {
					const at = totals.indexOf(c.key);
					return at >= 0 ? numberOf(r?.[`t${at}`]) : i === 0 ? 'Total' : null;
				});
			}
		} else {
			const group: any = { count: { $sum: 1 } };
			sums.forEach((s, i) => (group[`s${i}`] = { $sum: `$${s.field}` }));
			let keyLabel = 'Period';
			let pipeline: any[];
			let byPath: any = null;
			if (type === 'summary') {
				byPath = pathOf(body.groupBy);
				if (!byPath) throw new ReportError(`“${body.groupBy || ''}” isn’t a field of this route`);
				keyLabel = titleOf(settings, body.groupBy);
				const isArray = byPath.instance === 'Array';
				pipeline = [{ $match: match }, ...(isArray ? [{ $unwind: `$${body.groupBy}` }] : []), { $group: { _id: `$${body.groupBy}`, ...group } }, { $sort: { count: -1 } }, { $limit: 1000 }];
			} else {
				const interval = FORMAT[body.interval] ? body.interval : 'month';
				pipeline = [
					{ $match: { $and: [match, { [dateField]: { $ne: null } }] } },
					{ $group: { _id: { $dateToString: { format: FORMAT[interval], date: `$${dateField}`, timezone: tz } }, ...group } },
					{ $sort: { _id: 1 } },
					{ $limit: 1000 },
				];
			}
			const out: any[] = await (Model as any).aggregate(pipeline);
			truncated = out.length >= 1000;
			// A linked record's key is its id: name it by its own display field.
			const labels = new Map<string, string>();
			if (byPath) {
				const ref = byPath.instance === 'Array' ? byPath.caster?.options?.ref || byPath.options?.type?.[0]?.ref : byPath.options?.ref;
				const Ref = ref ? scopedModel(ref) : null;
				if (Ref) {
					const ids = out.map(r => r._id).filter(id => mongoose.isValidObjectId(id));
					const docs: any[] = await Ref.find({ _id: { $in: ids } }).select(LABEL_KEYS.join(' ')).lean();
					for (const d of docs) labels.set(String(d._id), String(LABEL_KEYS.map(k => d[k]).find(v => v !== undefined && v !== '') ?? d._id));
				}
			}
			const labelOf = (id: any) =>
				id === null || id === undefined || id === '' ? 'Not set' : typeof id === 'boolean' ? (id ? 'Yes' : 'No') : id instanceof Date ? id.toISOString().slice(0, 10) : labels.get(String(id)) || String(id);
			columns = [
				{ key: 'key', label: keyLabel, kind: 'text' },
				{ key: 'count', label: 'Records', kind: 'number' },
				...sums.map((s, i) => ({ key: `s${i}`, label: s.label, kind: 'number' })),
			];
			rows = out.map(r => [labelOf(r._id), numberOf(r.count), ...sums.map((_, i) => numberOf(r[`s${i}`]))]);
			footer = ['Total', rows.reduce((a, r) => a + Number(r[1]), 0), ...sums.map((_, i) => rows.reduce((a, r) => a + Number(r[i + 2]), 0))];
		}

		return { type, format, columns, rows, footer, count: rows.length, truncated, from, to };
};

const getReport = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const body = req.body || {};
		const built = req.resolvedRoute?.built;
		const ctx: ReportContext = {
			query: req.queryHelper || {},
			settings: req.resolvedRoute?.settings || {},
			allowed: new Set<string>([...(built?.FILTER_OPTIONS?.allowFilter || []), ...(built?.FILTER_OPTIONS?.allowSort || []), 'createdAt', 'updatedAt']),
			select: built?.QUERY_OPTIONS?.exclude || '',
			populate: built?.QUERY_OPTIONS?.populate || '',
		};
		const out = await reportData(Model, ctx, body);
		const { type, format, columns, rows, footer, truncated, from, to } = out;
		if (format === 'json') return res.status(200).json({ type, columns, rows, footer, count: rows.length, truncated });

		const route = req.resolvedRoute?.key || 'report';
		const title = String(body.title || req.resolvedRoute?.frontendConfig?.route?.title || route);
		const file = `${String(body.title || route).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'}-${stamp()}`;
		const subtitle = [body.subtitle, from || to ? `${body.from || '…'} to ${body.to || '…'}` : ''].filter(Boolean).join(' · ');
		return await writeTable(res, { format, title, file, columns, rows, footer, subtitle });
	} catch (e: any) {
		if (e instanceof ReportError) return fail(res, 400, e.message);
		console.error('getReport:', e.message);
		if (!res.headersSent) return fail(res, 500, process.env.NODE_ENV === 'development' ? e.message : 'Could not make the report');
		res.end();
	}
};

export default getReport;
