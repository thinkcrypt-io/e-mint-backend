import mongoose from 'mongoose';
import ApiCall from '../models/tenancy/apiCall.model.js';
import { parseUserAgent } from './sessions.function.js';

/**
 * A project's API request logs (docs/api-builder AB-06): what the public
 * router writes for each call (`callRecord`), and what the panel and MCP read
 * back — a filtered page of calls (`findLogs`), one call (`logView`), and the
 * numbers over a period (`logSummary`). Runs in the project's scope like
 * every tenant model, so a project only ever sees its own calls.
 */

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Query names whose values never reach the log. */
const SECRET_NAME = /token|secret|password|passwd|key|auth|signature|sig$/i;

/** The query string as called, with secret-looking values masked. */
export const maskedQuery = (url = '') => {
	const at = url.indexOf('?');
	if (at < 0) return '';
	const params = new URLSearchParams(url.slice(at + 1));
	const out: string[] = [];
	params.forEach((v, k) => out.push(`${encodeURIComponent(k)}=${SECRET_NAME.test(k) ? '•••' : encodeURIComponent(v)}`));
	return out.join('&').slice(0, 500);
};

/** "Chrome on macOS" for a browser; the client's own name ("curl/8.4.0", "node") otherwise. */
export const clientOf = (ua = '') => {
	if (!ua) return '';
	const { browser, os } = parseUserAgent(ua) as any;
	if (!['API client', 'Unknown browser'].includes(browser)) return `${browser} on ${os}`.slice(0, 80);
	return (ua.split(/\s/)[0] || ua).slice(0, 80);
};

/** The calling site: its Origin, else the host of its Referer. */
export const originOf = (req: any) => {
	const o = String(req.headers?.origin || '');
	if (o && o !== 'null') return o.slice(0, 200);
	try {
		const r = String(req.headers?.referer || '');
		return r ? new URL(r).origin.slice(0, 200) : '';
	} catch {
		return '';
	}
};

/**
 * The log entry for a finished call. `seen` is what the router learnt on the
 * way: the endpoint that answered, the signed-in customer, the server key, and
 * the error it answered with.
 */
export const callRecord = (req: any, res: any, started: number) => {
	const seen = req.apiLog || {};
	const path = String(req.path || '/').slice(0, 300);
	const route = path.split('/')[1] || '';
	const who = seen.key ? 'key' : seen.customer ? 'customer' : 'anyone';
	return {
		method: req.method,
		path,
		query: maskedQuery(req.originalUrl || req.url),
		route: route === 'auth' ? '' : route.slice(0, 60),
		endpoint: seen.endpoint?._id,
		endpointName: seen.endpoint?.name,
		status: res.statusCode,
		ms: Date.now() - started,
		customer: who === 'customer',
		who,
		customerId: seen.customer?._id,
		customerEmail: seen.customer?.email,
		keyId: seen.key?._id,
		keyName: seen.key?.name,
		error: res.statusCode >= 400 ? String(seen.error?.message || '').slice(0, 300) || undefined : undefined,
		code: res.statusCode >= 400 ? String(seen.error?.code || '').slice(0, 60) || undefined : undefined,
		origin: originOf(req) || undefined,
		client: clientOf(String(req.headers?.['user-agent'] || '')) || undefined,
	};
};

export const LOG_STATUS = ['ok', 'errors', '4xx', '5xx'] as const;
export const LOG_PERIODS = [1, 24, 168] as const;

/** The Mongo filter for the panel's (or MCP's) log filters. */
export const logFilter = (q: any = {}) => {
	const f: any = {};
	const hours = Number(q.hours);
	if (LOG_PERIODS.includes(hours as any)) f.createdAt = { $gte: new Date(Date.now() - hours * 3600_000) };
	if (q.endpoint === 'none') f.endpoint = { $exists: false };
	else if (isId(q.endpoint)) f.endpoint = new mongoose.Types.ObjectId(String(q.endpoint));
	const status = String(q.status || '');
	if (status === 'ok') f.status = { $lt: 400 };
	else if (status === 'errors') f.status = { $gte: 400 };
	else if (status === '4xx') f.status = { $gte: 400, $lt: 500 };
	else if (status === '5xx') f.status = { $gte: 500 };
	else if (/^[1-5]\d\d$/.test(status)) f.status = Number(status);
	const method = String(q.method || '').toUpperCase();
	if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) f.method = method;
	if (['anyone', 'customer', 'key'].includes(q.who)) f.who = q.who;
	if (isId(q.customer)) f.customerId = new mongoose.Types.ObjectId(String(q.customer));
	if (isId(q.key)) f.keyId = new mongoose.Types.ObjectId(String(q.key));
	const text = String(q.q || '').trim().slice(0, 100);
	if (text) {
		const rx = new RegExp(escapeRx(text), 'i');
		f.$or = [{ path: rx }, { query: rx }, { error: rx }, { customerEmail: rx }];
	}
	return f;
};

export const logView = (c: any) => ({
	_id: String(c._id),
	at: c.createdAt,
	method: c.method,
	path: c.path || '/',
	query: c.query || '',
	status: c.status,
	ms: c.ms ?? null,
	endpoint: c.endpoint ? { _id: String(c.endpoint), name: c.endpointName || '' } : null,
	who: c.who || (c.customer ? 'customer' : 'anyone'),
	customer: c.customerId ? { _id: String(c.customerId), email: c.customerEmail || '' } : null,
	key: c.keyId ? { _id: String(c.keyId), name: c.keyName || '' } : null,
	error: c.error || '',
	code: c.code || '',
	origin: c.origin || '',
	client: c.client || '',
});

/** A page of calls, newest first; `before` (a call's _id) continues from where the last page ended. */
export const findLogs = async (q: any = {}) => {
	const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
	const f = logFilter(q);
	if (isId(q.before)) f._id = { $lt: new mongoose.Types.ObjectId(String(q.before)) };
	const docs: any[] = await ApiCall.find(f).sort({ _id: -1 }).limit(limit + 1).lean();
	return { doc: docs.slice(0, limit).map(logView), hasMore: docs.length > limit };
};

/** The bar width of each period's chart: 5 minutes, an hour, 6 hours. */
const BUCKET: Record<number, number> = { 1: 5 * 60_000, 24: 3600_000, 168: 6 * 3600_000 };

/**
 * The numbers over the last `hours` (1, 24 or 168), with the same filters as
 * the list: calls, errors, typical and slow times, calls per bar of the chart
 * (ok and failed), the commonest errors, and the busiest endpoints.
 */
export const logSummary = async (q: any = {}) => {
	const hours = LOG_PERIODS.includes(Number(q.hours) as any) ? Number(q.hours) : 24;
	const f = logFilter({ ...q, hours });
	const size = BUCKET[hours];
	const now = Date.now();
	const from = now - hours * 3600_000;
	const [totals, buckets, errors, endpoints]: any[] = await Promise.all([
		ApiCall.aggregate([
			{ $match: f },
			{ $group: { _id: null, total: { $sum: 1 }, errors: { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } }, avgMs: { $avg: '$ms' } } },
		]),
		ApiCall.aggregate([
			{ $match: f },
			{ $group: { _id: { $subtract: [{ $toLong: '$createdAt' }, { $mod: [{ $toLong: '$createdAt' }, size] }] }, ok: { $sum: { $cond: [{ $lt: ['$status', 400] }, 1, 0] } }, errors: { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } } } },
		]),
		ApiCall.aggregate([
			{ $match: { ...f, status: { $gte: 400 } } },
			{ $group: { _id: { status: '$status', code: '$code', error: '$error', endpoint: '$endpointName' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
			{ $sort: { count: -1, last: -1 } },
			{ $limit: 5 },
		]),
		ApiCall.aggregate([
			{ $match: { ...f, endpoint: { $exists: true } } },
			{ $group: { _id: '$endpoint', name: { $last: '$endpointName' }, calls: { $sum: 1 }, errors: { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } }, avgMs: { $avg: '$ms' } } },
			{ $sort: { calls: -1 } },
			{ $limit: 5 },
		]),
	]);
	const t = totals[0] || { total: 0, errors: 0, avgMs: null };
	// The slowest 5%: the time below which 95% of calls answered.
	const p95: any = t.total ? (await ApiCall.find(f, { ms: 1 }).sort({ ms: 1 }).skip(Math.min(t.total - 1, Math.floor(t.total * 0.95))).limit(1).lean())[0] : null;
	const byStart = new Map(buckets.map((b: any) => [Number(b._id), b]));
	const series = [];
	for (let at = from - (from % size); at <= now; at += size) {
		const b: any = byStart.get(at);
		series.push({ at: new Date(at), ok: b?.ok || 0, errors: b?.errors || 0 });
	}
	return {
		hours,
		total: t.total,
		errors: t.errors,
		avgMs: t.avgMs == null ? null : Math.round(t.avgMs),
		p95Ms: p95?.ms ?? null,
		series,
		topErrors: errors.map((e: any) => ({ status: e._id.status, code: e._id.code || '', error: e._id.error || '', endpoint: e._id.endpoint || '', count: e.count, last: e.last })),
		topEndpoints: endpoints.map((e: any) => ({ _id: String(e._id), name: e.name || '', calls: e.calls, errors: e.errors, avgMs: Math.round(e.avgMs || 0) })),
	};
};
