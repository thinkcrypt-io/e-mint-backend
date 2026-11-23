import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import Report, { REPORT_FORMATS, REPORT_OPS, REPORT_RANGES, REPORT_TYPES } from '../library/models/tenancy/report.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { dynamicModelsDispatcher } from '../library/functions/dynamicModels.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/saved-reports — a project's reports (docs/panel-users RP-01…03).
 * Developers (Build) make them; anyone who can view a report's model runs it —
 * a panel user also needs `reports:view`, and `reports:export` to download.
 *
 *   GET    /                 { doc: reports this reader can run, canBuild }
 *   GET    /models           Build: each model's fields, for the report builder
 *   POST   /preview          Build: run an unsaved report { …report, from?, to? }
 *   GET    /:id
 *   POST   /                 Build: { name, description?, category?, route, type, columns, sort, totals, groupBy, interval, sums, filters, dateField, range, exportable, formats }
 *   PUT    /:id              Build: the same
 *   DELETE /:id              Build
 *   POST   /:id/run          { from?, to?, limit?, tz? } → { report, columns, rows, footer, count, truncated }
 *   POST   /:id/export       { format, from?, to?, tz? } → the file — refused unless the report is exportable in that format
 *
 * Running goes through the model's own route — POST /<route>/get/report with
 * the report's filters as the list's — so its read permission, access rules and
 * archived-record hiding apply as they do to its table.
 */
const router = express.Router({ mergeParams: true });

const canBuild = (req: any) => !req.panelAdmin && grants(req.permissions, ['build']);
const buildOnly = (req: any, res: any, next: any) => (canBuild(req) ? next() : res.status(403).json({ message: 'Only developers make reports' }));
const viewKey = (def: any) => `view-${def?.permission || def?.route}`;
const canRun = (req: any, def: any) => !!def && grants(req.permissions, [viewKey(def)]) && (!req.panelAdmin || grants(req.permissions, ['reports:view']));
export const canDownload = (req: any, report: any) => report.exportable !== false && (!req.panelAdmin || grants(req.permissions, ['reports:export']));

const DATE_KINDS = ['date', 'datetime', 'dateformula'];
const NUMBER_KINDS = ['number', 'currency', 'formula', 'percent', 'decimal', 'integer', 'rating'];

const col = Joi.object({ key: Joi.string().trim().max(120).required(), label: Joi.string().trim().max(80).allow('') });
const schema = Joi.object({
	name: Joi.string().trim().min(1).max(80).required().messages({ 'any.required': 'Give the report a name', 'string.empty': 'Give the report a name' }),
	description: Joi.string().trim().max(300).allow(''),
	category: Joi.string().trim().max(60).allow(''),
	route: Joi.string().trim().max(120).required().messages({ 'any.required': 'Pick the model the report is on' }),
	type: Joi.string().valid(...REPORT_TYPES).default('list'),
	columns: Joi.array().items(col).max(60).default([]),
	sort: Joi.string().trim().max(120).pattern(/^-?[\w.]+$/).allow(''),
	totals: Joi.array().items(Joi.string().trim().max(120)).max(20).default([]),
	groupBy: Joi.string().trim().max(120).allow(''),
	interval: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
	sums: Joi.array().items(Joi.object({ field: Joi.string().trim().max(120).required(), label: Joi.string().trim().max(80).allow('') })).max(10).default([]),
	filters: Joi.array()
		.items(Joi.object({ field: Joi.string().trim().max(120).pattern(/^[\w.]+$/).required(), op: Joi.string().valid(...REPORT_OPS).default('eq'), value: Joi.any() }))
		.max(20)
		.default([]),
	readerFilters: Joi.array().items(Joi.string().trim().max(120).pattern(/^[\w.]+$/)).max(6).default([]),
	dateField: Joi.string().trim().max(120).default('createdAt'),
	range: Joi.string().valid(...REPORT_RANGES).default('all'),
	exportable: Joi.boolean().default(true),
	formats: Joi.array().items(Joi.string().valid(...REPORT_FORMATS)).max(3).default(['csv', 'xlsx', 'pdf']),
	order: Joi.number().default(0),
});
export const checkReport = (value: any) => {
	const { error, value: out } = schema.validate(value || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	if (out.type === 'list' && !out.columns.length) throw new TenancyError(400, 'Pick the report’s columns');
	if (out.type === 'summary' && !out.groupBy) throw new TenancyError(400, 'Pick the field each row of the summary is');
	if (!out.formats.length) out.exportable = false;
	return out;
};

export const modelOf = async (route: string): Promise<any> => ModelDefinition.findOne({ route: String(route || '').toLowerCase() }).lean();

export const reportView = (r: any, req: any, def?: any) => ({
	_id: String(r._id),
	name: r.name,
	description: r.description || '',
	category: r.category || '',
	route: r.route,
	model: def ? def.title || def.name : r.route,
	type: r.type || 'list',
	columns: r.columns || [],
	sort: r.sort || '',
	totals: r.totals || [],
	groupBy: r.groupBy || '',
	interval: r.interval || 'month',
	sums: r.sums || [],
	filters: r.filters || [],
	readerFilters: r.readerFilters || [],
	dateField: r.dateField || 'createdAt',
	range: r.range || 'all',
	exportable: r.exportable !== false,
	formats: r.formats || [],
	canDownload: canDownload(req, r),
	order: r.order || 0,
	updatedAt: r.updatedAt,
});

/** Where a range starts, as YYYY-MM-DD in `tz` (the report's default when the reader picks no dates). */
export const rangeFrom = (range: string, tz: string): string | undefined => {
	if (!range || range === 'all') return undefined;
	const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
	const now = new Date();
	const back = (n: number) => day(new Date(+now - n * 86400000));
	if (range === 'today') return day(now);
	if (range === '7d') return back(6);
	if (range === '30d') return back(29);
	if (range === '90d') return back(89);
	if (range === 'month') return `${day(now).slice(0, 7)}-01`;
	if (range === 'year') return `${day(now).slice(0, 4)}-01-01`;
	return undefined;
};

/** The report's filters in the list's terms: { status: 'open', amount_gte: '10' }. */
const filterQuery = (filters: any[] = []) => {
	const q: Record<string, string> = {};
	for (const f of filters) {
		if (!f?.field) continue;
		const v = Array.isArray(f.value) ? f.value.join(',') : f.value === undefined || f.value === null ? '' : String(f.value);
		q[f.op && f.op !== 'eq' ? `${f.field}_${f.op}` : f.field] = v;
	}
	return q;
};

/** The reader's picks, for the fields the report lets them filter by — the report's own filters win. */
const readerQuery = (report: any, picks: Record<string, string> = {}) => {
	const allowed = new Set<string>(report.readerFilters || []);
	const q: Record<string, string> = {};
	for (const [key, v] of Object.entries(picks || {})) if (allowed.has(key) && v !== '' && v != null) q[key] = String(v);
	return q;
};

/**
 * What the report page needs to show each reader filter: its label and kind,
 * a choice field's choices, and for a linked field the model to pick records
 * from (its route and display field).
 */
export const readerFilterFields = async (report: any, def: any) => {
	const keys: string[] = report.readerFilters || [];
	if (!keys.length || !def) return [];
	const byKey = new Map<string, any>((def.fields || []).map((f: any) => [f.key, f]));
	const refs = [...new Set(keys.map(k => byKey.get(k)?.ref).filter(Boolean))];
	const targets: any[] = refs.length ? await ModelDefinition.find({ name: { $in: refs } }, { route: 1, name: 1, title: 1, displayField: 1 }).lean() : [];
	return keys
		.map(key => {
			const f = byKey.get(key);
			if (!f) return null;
			const t = f.ref && targets.find(x => x.name === f.ref);
			return {
				key,
				label: f.label || key,
				kind: f.kind,
				options: (f.options || []).map((o: any) => ({ value: o.value, label: o.label || o.value })),
				number: NUMBER_KINDS.includes(f.kind),
				link: t ? { route: t.route, name: t.title || t.name, displayField: t.displayField || '' } : null,
			};
		})
		.filter(Boolean);
};

const day = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null);
const runBody = Joi.object({
	from: day,
	to: day,
	limit: Joi.number().integer().min(1).max(5000),
	tz: Joi.string().max(60),
	format: Joi.string().valid('csv', 'xlsx', 'pdf'),
	filters: Joi.object().pattern(/^[\w.]+$/, Joi.string().allow('').max(2000)).max(6),
});

/**
 * Sends the request on to `/<route>/get/report` through the project's compiled
 * routes, as if the reader had called it — their token, permissions and access.
 * With `capture`, the JSON answer comes back here instead of going out.
 */
const forward = (req: any, res: any, report: any, run: any, capture: boolean): Promise<{ status: number; body: any } | void> =>
	new Promise((resolve, reject) => {
		const tz = run.tz || 'UTC';
		const child: any = Object.create(req);
		child.url = `/${report.route}/get/report`;
		child.method = 'POST';
		child.query = { ...readerQuery(report, run.filters), ...filterQuery(report.filters) };
		child.params = {};
		child.body = {
			type: report.type,
			columns: report.columns,
			sort: report.sort || undefined,
			totals: report.totals,
			groupBy: report.groupBy,
			interval: report.interval,
			sums: report.sums,
			dateField: report.dateField,
			from: run.from || (run.to ? undefined : rangeFrom(report.range, tz)),
			to: run.to || undefined,
			tz,
			limit: run.limit,
			format: run.format || 'json',
			title: report.name,
			subtitle: report.description || undefined,
		};
		let out: any = res;
		if (capture) {
			let status = 200;
			out = Object.create(res);
			out.status = (s: number) => ((status = s), out);
			out.setHeader = () => out;
			out.set = () => out;
			out.json = (body: any) => (resolve({ status, body }), out);
			out.send = (body: any) => (resolve({ status, body }), out);
			out.end = () => (resolve({ status, body: null }), out);
		} else {
			res.on('finish', () => resolve());
		}
		dynamicModelsDispatcher(child, out, (err?: any) => (err ? reject(err) : capture ? resolve({ status: 404, body: { message: 'That model has no records route' } }) : resolve()));
	});

router.get(
	'/',
	handle(async (req: any) => {
		const [reports, defs] = await Promise.all([Report.find({}).sort({ order: 1, category: 1, name: 1 }).lean(), ModelDefinition.find({}, { route: 1, permission: 1, title: 1, name: 1 }).lean()]);
		const byRoute = new Map(defs.map((d: any) => [d.route, d]));
		const build = canBuild(req);
		const doc = reports.filter((r: any) => build || canRun(req, byRoute.get(r.route))).map((r: any) => reportView(r, req, byRoute.get(r.route)));
		return { doc, totalDocs: doc.length, canBuild: build };
	})
);

router.get(
	'/models',
	buildOnly,
	handle(async () => {
		const defs: any[] = await ModelDefinition.find({}, { route: 1, title: 1, name: 1, fields: 1, displayField: 1 }).sort({ title: 1 }).lean();
		return {
			doc: defs.map(d => ({
				route: d.route,
				name: d.title || d.name,
				/** The model's own name — what other models' `ref` points at. */
				model: d.name,
				displayField: d.displayField || '',
				fields: [
					...(d.fields || [])
						.filter((f: any) => f.kind !== 'section' && f.kind !== 'password')
						.map((f: any) => ({
							key: f.key,
							label: f.label || f.key,
							kind: f.kind,
							ref: f.ref || null,
							/** A choice field's choices, so the builder's conditions can offer them. */
							...(f.options?.length && { options: f.options.map((o: any) => ({ value: o.value, label: o.label || o.value })) }),
							date: DATE_KINDS.includes(f.kind),
							number: NUMBER_KINDS.includes(f.kind),
						})),
					{ key: 'createdAt', label: 'Created', kind: 'date', ref: null, date: true, number: false },
					{ key: 'updatedAt', label: 'Updated', kind: 'date', ref: null, date: true, number: false },
				],
			})),
		};
	})
);

const load = async (req: any) => {
	const report: any = mongoose.isValidObjectId(req.params.id) && (await Report.findById(req.params.id));
	if (!report) throw new TenancyError(404, 'Report not found');
	return report;
};

/** A report this reader may run, and its model. */
const runnable = async (req: any) => {
	const report = await load(req);
	const def = await modelOf(report.route);
	if (!def) throw new TenancyError(404, 'This report’s model was deleted');
	if (!canBuild(req) && !canRun(req, def)) throw new TenancyError(403, 'Your role can’t open this report');
	return { report, def };
};

const answer = (res: any, out: any) => {
	if (out.status >= 400) throw new TenancyError(out.status, out.body?.message || 'Could not make the report');
	return out.body;
};

router.post(
	'/preview',
	buildOnly,
	handle(async (req: any, res: any) => {
		const report = checkReport(req.body);
		if (!(await modelOf(report.route))) throw new TenancyError(400, 'Pick the model the report is on');
		const run = runBody.validate({ from: req.body?.from, to: req.body?.to, tz: req.body?.tz, limit: 100 }, { stripUnknown: true }).value || {};
		const out: any = await forward(req, res, report, run, true);
		return { ...answer(res, out), report: { ...report, canDownload: false } };
	})
);

router.get(
	'/:id',
	handle(async (req: any) => {
		const { report, def } = await runnable(req);
		return { ...reportView(report, req, def), readerFilterFields: await readerFilterFields(report, def) };
	})
);

router.post(
	'/',
	buildOnly,
	handle(async (req: any, res: any) => {
		const b = checkReport(req.body);
		const def = await modelOf(b.route);
		if (!def) throw new TenancyError(400, 'Pick the model the report is on');
		const report = await Report.create({ ...b, route: def.route, createdBy: req.user._id, updatedBy: req.user._id });
		recordProjectEvent({ req, model: 'Report', modelPath: 'saved-reports', document: report._id, name: report.name, text: `added the report ${report.name}` });
		res.status(201);
		return reportView(report, req, def);
	})
);

router.put(
	'/:id',
	buildOnly,
	handle(async (req: any) => {
		const report = await load(req);
		const b = checkReport(req.body);
		const def = await modelOf(b.route);
		if (!def) throw new TenancyError(400, 'Pick the model the report is on');
		report.set({ ...b, route: def.route, updatedBy: req.user._id });
		await report.save();
		recordProjectEvent({ req, model: 'Report', modelPath: 'saved-reports', document: report._id, name: report.name, text: `changed the report ${report.name}` });
		return reportView(report, req, def);
	})
);

router.delete(
	'/:id',
	buildOnly,
	handle(async (req: any) => {
		const report = await load(req);
		await report.deleteOne();
		recordProjectEvent({ req, model: 'Report', modelPath: 'saved-reports', document: report._id, name: report.name, text: `deleted the report ${report.name}` });
		return { message: 'Report deleted' };
	})
);

router.post(
	'/:id/run',
	handle(async (req: any, res: any) => {
		const { report, def } = await runnable(req);
		const { error, value } = runBody.validate(req.body || {}, { stripUnknown: true });
		if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
		const out: any = await forward(req, res, report, { ...value, format: undefined }, true);
		return { ...answer(res, out), report: reportView(report, req, def) };
	})
);

router.post('/:id/export', async (req: any, res: any, next: any) => {
	try {
		const { report } = await runnable(req);
		const { error, value } = runBody.validate(req.body || {}, { stripUnknown: true });
		if (error) return res.status(400).json({ message: error.details[0].message.replace(/"/g, '') });
		const format = value.format || 'xlsx';
		if (!canDownload(req, report)) return res.status(403).json({ message: report.exportable === false ? 'This report can’t be downloaded' : 'Your role can’t download reports' });
		if (!(report.formats || []).includes(format)) return res.status(400).json({ message: `This report doesn’t download as ${format.toUpperCase()}` });
		await forward(req, res, report, { ...value, format }, false);
	} catch (e: any) {
		if (e instanceof TenancyError) return res.status((e as any).status || 400).json({ message: e.message });
		next(e);
	}
});

export default router;
