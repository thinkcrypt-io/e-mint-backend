import { Response } from 'express';
import DashboardConfig from '../../models/builder/dashboardConfig.model.js';
import { currentScope } from '../../functions/tenantScope.function.js';

/**
 * The dashboard the builder saves (admin /dashboard-builder) and every admin's
 * home page reads. A widget only names a route and what to show of it; the
 * numbers come from that route's own /get/stats and list, under the viewer's
 * permissions — so saving a widget never shows anyone more than they could
 * already open.
 */

const MAX_WIDGETS = 40;
/** `templates`: Template Studio's overview (docs/templates T-11) — the super admin's dashboard only. */
const TYPES = ['stat', 'chart', 'recent', 'templates'];
const SIZES = ['sm', 'md', 'lg', 'xl', 'full'];
const METRICS = ['count', 'sum', 'avg'];
const RANGES = ['all', 'today', '7d', '30d', '90d', 'month', '12m', 'year'];
const INTERVALS = ['day', 'week', 'month'];
const CHARTS = ['bar', 'line', 'donut'];
const OPS = ['eq', 'ne', 'in'];
const KEY = /^[A-Za-z_][\w.]*$/;
const ROUTE = /^[A-Za-z0-9][\w\-/]*$/;

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const str = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const oneOf = (v: any, list: string[], fallback: string) => (list.includes(v) ? v : fallback);
const key = (v: any) => (typeof v === 'string' && KEY.test(v) ? v : undefined);

/** A widget's conditions: fixed-value ones only (a dashboard has no form to read from). */
const filtersOf = (list: any) =>
	(Array.isArray(list) ? list : [])
		.slice(0, 10)
		.map((f: any) => {
			const field = key(f?.field);
			if (!field) return null;
			const op = oneOf(f?.op, OPS, 'eq');
			const value = Array.isArray(f?.value)
				? f.value.map((x: any) => String(x).slice(0, 200)).slice(0, 50)
				: typeof f?.value === 'boolean' || typeof f?.value === 'number'
				? f.value
				: str(f?.value, 200);
			return { field, ...(op !== 'eq' && { op }), value };
		})
		.filter(Boolean);

/** A widget as saved: known properties only, each checked; unknown ones dropped. */
export const normalizeWidget = (w: any, i: number) => {
	const type = TYPES.includes(w?.type) ? w.type : null;
	if (type === 'templates') {
		// Inside a tenant project (or a template being checked) there are no templates to show.
		if (currentScope()) return { error: `Widget ${i + 1}: the Templates overview is only for the super admin’s dashboard` };
		return { widget: { id: str(w.id, 40) || `w${Date.now().toString(36)}${i}`, type, route: 'templates', title: str(w.title, 80), size: oneOf(w.size, SIZES, 'full'), filters: [] } };
	}
	const route = typeof w?.route === 'string' && ROUTE.test(w.route) ? w.route.replace(/\/+$/, '') : null;
	if (!type || !route) return { error: `Widget ${i + 1}: pick what it shows and the model it reads` };
	const out: any = {
		id: str(w.id, 40) || `w${Date.now().toString(36)}${i}`,
		type,
		route,
		title: str(w.title, 80),
		size: oneOf(w.size, SIZES, type === 'stat' ? 'sm' : type === 'recent' ? 'lg' : 'lg'),
		filters: filtersOf(w.filters),
	};
	if (type === 'stat' || type === 'chart') {
		out.metric = oneOf(w.metric, METRICS, 'count');
		if (out.metric !== 'count') {
			out.field = key(w.field);
			if (!out.field) return { error: `Widget ${i + 1}: pick the number field to ${out.metric === 'sum' ? 'add up' : 'average'}` };
		}
		out.range = oneOf(w.range, RANGES, type === 'stat' ? 'all' : '30d');
		out.dateField = key(w.dateField) || 'createdAt';
		out.prefix = str(w.prefix, 12);
		out.suffix = str(w.suffix, 12);
	}
	if (type === 'stat') out.compare = !!w.compare && out.range !== 'all';
	if (type === 'chart') {
		out.group = w.group === 'field' ? 'field' : 'time';
		out.chart = oneOf(w.chart, CHARTS, out.group === 'time' ? 'bar' : 'donut');
		if (out.group === 'time') {
			if (out.chart === 'donut') out.chart = 'bar';
			out.interval = oneOf(w.interval, INTERVALS, 'day');
		} else {
			if (out.chart === 'line') out.chart = 'bar';
			out.by = key(w.by);
			if (!out.by) return { error: `Widget ${i + 1}: pick the field to break it down by` };
			out.limit = Math.min(Math.max(parseInt(w.limit, 10) || 6, 2), 12);
		}
	}
	if (type === 'recent') {
		out.columns = (Array.isArray(w.columns) ? w.columns : []).map(key).filter(Boolean).slice(0, 6);
		out.limit = Math.min(Math.max(parseInt(w.limit, 10) || 5, 1), 20);
		out.sort = key(String(w.sort || '').replace(/^-/, '')) ? String(w.sort) : '-createdAt';
	}
	return { widget: out };
};

/** GET /dashboard — the saved widgets (none: the built-in dashboard). */
export const getDashboard = async (req: any, res: Response): Promise<Response> => {
	try {
		const doc: any = await DashboardConfig.findOne({ key: 'default' }).populate('updatedBy', 'name').lean();
		return res.status(200).json({
			widgets: doc?.widgets || [],
			saved: !!doc,
			updatedAt: doc?.updatedAt || null,
			updatedBy: doc?.updatedBy || null,
		});
	} catch (e: any) {
		console.error('getDashboard:', e.message);
		return fail(res, 500, 'Could not load the dashboard');
	}
};

/** PUT /dashboard { widgets } — replaces the dashboard. */
export const saveDashboard = async (req: any, res: Response): Promise<Response> => {
	try {
		const list = req.body?.widgets;
		if (!Array.isArray(list)) return fail(res, 400, 'Send the widgets as a list');
		if (list.length > MAX_WIDGETS) return fail(res, 400, `A dashboard holds up to ${MAX_WIDGETS} widgets`);
		const widgets: any[] = [];
		const seen = new Set<string>();
		for (let i = 0; i < list.length; i++) {
			const { widget, error } = normalizeWidget(list[i], i);
			if (error) return fail(res, 400, error);
			if (seen.has(widget.id)) widget.id = `${widget.id}-${i}`;
			seen.add(widget.id);
			widgets.push(widget);
		}
		const doc: any = await DashboardConfig.findOneAndUpdate(
			{ key: 'default' },
			{ $set: { widgets, updatedBy: req.user?._id } },
			{ upsert: true, new: true }
		).lean();
		return res.status(200).json({ widgets: doc.widgets, saved: true, updatedAt: doc.updatedAt });
	} catch (e: any) {
		console.error('saveDashboard:', e.message);
		return fail(res, 500, 'Could not save the dashboard');
	}
};

/** DELETE /dashboard — back to the built-in dashboard. */
export const resetDashboard = async (req: any, res: Response): Promise<Response> => {
	try {
		await DashboardConfig.deleteOne({ key: 'default' });
		return res.status(200).json({ widgets: [], saved: false });
	} catch (e: any) {
		console.error('resetDashboard:', e.message);
		return fail(res, 500, 'Could not reset the dashboard');
	}
};
