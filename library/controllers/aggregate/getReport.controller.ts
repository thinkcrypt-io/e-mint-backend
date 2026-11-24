import { Response } from 'express';
import mongoose from 'mongoose';
import { displayModelName, scopedModel } from '../../functions/routeRegistry.function.js';
import { MAX_ROWS, TableCell, cellValue, get, stamp, writeTable } from '../export/exportRows.controller.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { Node, evaluate, parse } from '../../functions/formula.function.js';

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

/**
 * Calculated columns (`calcs`): a number worked out on each row with the formula
 * language of formula fields (formula.function.ts) — `leaveType.daysPerYear - approvedDays`,
 * `if(count > 3, 1, 0)`. A list's formula reads the record's fields and linked parts;
 * a summary's or timeline's reads `count`, the summed fields, the lookups and earlier
 * calcs, by key. The Total row works its formula out on the totals.
 */
export type ReportCalc = { key: string; label: string; formula: string };
export const CALC_KEY = /^[a-zA-Z][\w]*$/;

const calcsOf = (raw: any): (ReportCalc & { tree: Node })[] =>
	(Array.isArray(raw) ? raw : [])
		.filter((c: any) => c && typeof c.formula === 'string' && c.formula.trim() && CALC_KEY.test(String(c.key || '')))
		.slice(0, 10)
		.map((c: any) => {
			try {
				return { key: c.key, label: String(c.label || c.key), formula: c.formula, tree: parse(c.formula) };
			} catch (e: any) {
				throw new ReportError(`The calculated column “${c.label || c.key}” doesn’t work out: ${e.message}`);
			}
		});

/** Each calc's value on one row; a later calc can read an earlier one by its key. */
const runCalcs = (calcs: (ReportCalc & { tree: Node })[], values: Record<string, any>, doc: any = {}) => {
	const v = { ...values };
	return calcs.map(c => {
		const out = evaluate(c.tree, doc, v);
		v[c.key] = out;
		return out;
	});
};

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
		let listDocs: any[] = [];

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
			listDocs = docs.slice(0, cap);
			rows = listDocs.map((doc: any) => columns.map(c => cellValue(get(doc, c.key))));
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
			const interval = FORMAT[body.interval] ? body.interval : 'month';
			// summary: one or two fields each row is (groupBy, then thenBy) — an employee × a leave type.
			const by: { key: string; path: any; label: string; ref: string | null }[] = [];
			if (type === 'summary') {
				for (const key of [body.groupBy, body.thenBy].filter((k, i) => i === 0 || (k && k !== body.groupBy))) {
					const path = pathOf(key);
					if (!path) throw new ReportError(`“${key || ''}” isn’t a field of this route`);
					const ref = path.instance === 'Array' ? path.caster?.options?.ref || path.options?.type?.[0]?.ref : path.options?.ref;
					by.push({ key, path, label: titleOf(settings, key), ref: ref || null });
				}
			}
			let pipeline: any[];
			if (type === 'summary') {
				const unwind = by.filter(b => b.path.instance === 'Array').map(b => ({ $unwind: `$${b.key}` }));
				const id = by.length === 1 ? `$${by[0].key}` : { a: `$${by[0].key}`, b: `$${by[1].key}` };
				pipeline = [{ $match: match }, ...unwind, { $group: { _id: id, ...group } }, { $sort: { count: -1 } }, { $limit: 1000 }];
			} else {
				pipeline = [
					{ $match: { $and: [match, { [dateField]: { $ne: null } }] } },
					{ $group: { _id: { $dateToString: { format: FORMAT[interval], date: `$${dateField}`, timezone: tz } }, ...group } },
					{ $sort: { _id: 1 } },
					{ $limit: 1000 },
				];
			}
			const out: any[] = await (Model as any).aggregate(pipeline);
			const keysOf = (r: any): any[] => (by.length === 2 ? [r._id?.a, r._id?.b] : [r._id]);

			// Values of the record a row is grouped by: `leaveType.daysPerYear` (summary only, on a link).
			const lookups: { key: string; label: string; at: number }[] = (type === 'summary' && Array.isArray(body.lookups) ? body.lookups : [])
				.filter((l: any) => l && typeof l.key === 'string' && /^[\w]+\.[\w.]+$/.test(l.key))
				.map((l: any) => ({ key: l.key, label: String(l.label || l.key.split('.').slice(1).join('.')), at: by.findIndex(b => b.ref && b.key === l.key.split('.')[0]) }))
				.filter((l: any) => l.at >= 0)
				.slice(0, 10);

			// Each linked group's records, named by their display field, with what the lookups read.
			const linked: Map<string, any>[] = by.map(() => new Map());
			const allRows = type === 'summary' && body.allRows === true && by.length > 0 && by.every(b => b.ref);
			for (const [i, b] of by.entries()) {
				const Ref = b.ref ? scopedModel(b.ref) : null;
				if (!Ref) continue;
				// A project's link names its model by the scoped name (T<project>_Employee); its definition goes by Employee.
				const def: any = await ModelDefinition.findOne({ name: displayModelName(b.ref!) }, { displayField: 1, fields: 1 }).lean();
				const display = def?.displayField && def.displayField !== '_id' && Ref.schema.path(def.displayField) ? def.displayField : '';
				const names = [...new Set([display, ...LABEL_KEYS].filter(k => k && Ref.schema.path(k)))];
				const reads = lookups.filter(l => l.at === i).map(l => l.key.split('.').slice(1).join('.'));
				const ids = out.map(r => keysOf(r)[i]).filter(id => mongoose.isValidObjectId(id));
				// Every pair (allRows): all of the linked model's records still in use, not only the ones counted —
				// not archived, and active when the model has an "active" status (an inactive leave type gets no rows).
				const status: any = (def?.fields || []).find((f: any) => f.key === 'status');
				const activeOnly = !!Ref.schema.path('status') && (status?.options || []).some((o: any) => (o?.value ?? o) === 'active');
				const inUse = { $or: [{ _id: { $in: ids } }, { archivedAt: null, ...(activeOnly && { status: 'active' }) }] };
				const q = allRows ? inUse : { _id: { $in: ids } };
				const docs: any[] = await Ref.find(q)
					.select([...names, ...reads].join(' ') || '_id')
					.limit(allRows ? 1000 : 0)
					.lean();
				for (const d of docs) linked[i].set(String(d._id), { label: String(names.map(k => d[k]).find(v => v !== undefined && v !== null && v !== '') ?? d._id), doc: d });
			}

			// The rows: one per counted value (or pair); with allRows, also every pair nothing was counted for.
			const rowsBy = new Map<string, { keys: any[]; r: any }>();
			for (const r of out) rowsBy.set(keysOf(r).map(String).join('|'), { keys: keysOf(r), r });
			if (allRows) {
				const lists = linked.map(m => [...m.keys()].map(id => new mongoose.Types.ObjectId(id)));
				const pairs: any[][] = lists.length === 1 ? lists[0].map(a => [a]) : lists[0].flatMap(a => lists[1].map(b => [a, b]));
				for (const keys of pairs.slice(0, 1000)) {
					const k = keys.map(String).join('|');
					if (!rowsBy.has(k)) rowsBy.set(k, { keys, r: { count: 0 } });
				}
			}
			let entries = [...rowsBy.values()];
			truncated = out.length >= 1000 || entries.length > 1000;

			const labelOf = (id: any, i: number) =>
				id === null || id === undefined || id === ''
					? 'Not set'
					: typeof id === 'boolean'
						? id
							? 'Yes'
							: 'No'
						: id instanceof Date
							? id.toISOString().slice(0, 10)
							: linked[i]?.get(String(id))?.label || String(id);
			// Two fields: in name order, so each employee's leave types sit together.
			if (by.length === 2 || allRows)
				entries = entries.sort((x, y) => {
					for (let i = 0; i < x.keys.length; i++) {
						const c = labelOf(x.keys[i], i).localeCompare(labelOf(y.keys[i], i), undefined, { numeric: true });
						if (c) return c;
					}
					return 0;
				});
			entries = entries.slice(0, 1000);

			const calcs = calcsOf(body.calcs);
			const keyColumns = type === 'summary' ? by.map((b, i) => ({ key: i === 0 ? 'key' : `key${i}`, label: b.label, kind: 'text' })) : [{ key: 'key', label: 'Period', kind: 'text' }];
			columns = [
				...keyColumns,
				{ key: 'count', label: 'Records', kind: 'number' },
				...sums.map((s, i) => ({ key: `s${i}`, label: s.label, kind: 'number' })),
				...lookups.map((l, i) => ({ key: `l${i}`, label: l.label, kind: 'number' })),
				...calcs.map(c => ({ key: `c_${c.key}`, label: c.label, kind: 'number' })),
			];
			// What a calculated column's formula reads on a row: count, the summed fields, the lookups, earlier calcs.
			const valuesOf = (count: number, sumsAt: number[], looks: any[]) => {
				const v: Record<string, any> = { count };
				sums.forEach((s, i) => (v[s.field] = sumsAt[i]));
				lookups.forEach((l, i) => (v[l.key] = looks[i]));
				return v;
			};
			const lookOf = (keys: any[], l: { key: string; at: number }) => {
				const d = linked[l.at]?.get(String(keys[l.at]))?.doc;
				const raw = d ? get(d, l.key.split('.').slice(1).join('.')) : null;
				return raw === null || raw === undefined || raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : String(raw);
			};
			rows = entries.map(({ keys, r }) => {
				const count = numberOf(r.count);
				const sumsAt = sums.map((_, i) => numberOf(r[`s${i}`]));
				const looks = lookups.map(l => lookOf(keys, l));
				const named = type === 'summary' ? keys.map((k, i) => labelOf(k, i)) : [labelOf(r._id, -1)];
				return [...named, count, ...sumsAt, ...looks, ...runCalcs(calcs, valuesOf(count, sumsAt, looks))];
			});
			const n = keyColumns.length;
			const total = (i: number) => rows.reduce((a, r) => a + (Number.isFinite(Number(r[i])) ? Number(r[i]) : 0), 0);
			const countT = total(n);
			const sumsT = sums.map((_, i) => total(n + 1 + i));
			const looksT = lookups.map((_, i) => total(n + 1 + sums.length + i));
			footer = [...keyColumns.map((_, i) => (i === 0 ? 'Total' : null)), countT, ...sumsT, ...looksT, ...runCalcs(calcs, valuesOf(countT, sumsT, looksT))];
		}

		// Calculated columns on a list: from the row's own fields and linked parts (`leaveType.daysPerYear - approvedDays`).
		if (type === 'list') {
			const calcs = calcsOf(body.calcs);
			if (calcs.length) {
				const docs = listDocs;
				columns = [...columns, ...calcs.map(c => ({ key: `c_${c.key}`, label: c.label, kind: 'number' }))];
				rows = rows.map((row, i) => [...row, ...runCalcs(calcs, {}, docs[i])]);
				if (footer) footer = [...footer, ...calcs.map(() => null)];
			}
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
