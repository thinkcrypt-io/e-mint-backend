import mongoose from 'mongoose';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { displayFieldOf } from './dynamicModels.function.js';
import { TenancyError } from './tenancy.function.js';

/**
 * How a project's public API reads its models (docs/multi-tenancy WO-11,
 * WO-40): which models are public, how a record goes out, and the list's
 * filters, search, sort and fields — the admin lists' `<field>_<op>=<value>`
 * syntax. Shared by the public router (routes-public/public.router.ts) and the
 * site builder's data (library/siteBuilder/resolve.ts, docs/site-builder
 * SB-09), so a builder page can never show more than the public API would.
 * Runs inside the project's scope.
 */

/** The project's models with a public API, by route. */
export const publicDefs = async () => {
	const defs: any[] = await ModelDefinition.find({ active: { $ne: false }, 'publicApi.enabled': true }).lean();
	return new Map(defs.map(d => [d.route, d]));
};
export const SYSTEM_OUT = ['_id', 'code', 'createdAt', 'updatedAt'];

export const fieldKeys = (def: any) => def.fields.filter((f: any) => f.kind !== 'formula').map((f: any) => f.key);
export const outKeys = (def: any) => [...SYSTEM_OUT, ...def.fields.map((f: any) => f.key)];

/**
 * How linked records come out: by their naming field. Returned as options (not
 * applied to a query here — awaiting a Mongoose query runs it).
 */
export const refPopulates = async (def: any) => {
	const defs: any[] = await ModelDefinition.find({}, { name: 1, fields: 1, displayField: 1, code: 1 }).lean();
	const byName = new Map(defs.map(d => [d.name, d]));
	return def.fields
		.filter((f: any) => (f.kind === 'reference' || f.kind === 'references') && byName.get(f.ref))
		.map((f: any) => ({ path: f.key, select: `_id ${displayFieldOf(byName.get(f.ref))}` }));
};

export const shape = (doc: any, def: any) => {
	if (!doc) return doc;
	const out: any = {};
	for (const k of outKeys(def)) if (doc[k] !== undefined) out[k] = doc[k];
	return out;
};

export const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

/* ------------------------------------------- lists: filters, search, sort */

/**
 * How GET /:route narrows and orders a list — the admin lists' syntax
 * (middleware/filter.middleware.ts: `<field>_<op>=<value>`), read per kind of
 * field. Documented for tenants in the admin's user-docs/public-api (#filters)
 * and on the Public API page's reference, which reads `listCapabilities` from
 * GET /.
 *
 *   <field>=<value>            equals (a list field: has it; a date: that whole
 *                              day, or today|week|month|year|days_7|months_3)
 *   <field>=a&<field>=b        any of them (same as _in)
 *   <field>_<op>=<value>       ne, in, nin, gt, gte, lt, lte, btwn, contains, all
 *   search=<words>             the text fields contain it, any case
 *   sort=-price,name           up to three fields, `-` for descending
 *   fields=name,price          only these fields come back (_id always)
 *
 * Different filters must all match. Names the API doesn't know (a field that
 * isn't filterable, `?v=2` cache busters, sorting by an unknown field) are
 * ignored; a value it can't read, or an operator a field doesn't take, answers
 * 400. Field keys may contain `_`: the whole key is tried as a field first.
 * Only string values are read (qs's `a[b]=` objects answer 400), so nothing
 * from the query string reaches MongoDB as an operator.
 */
export type Family = 'text' | 'choice' | 'number' | 'date' | 'boolean' | 'id' | 'list' | 'ids';

const FAMILY: Record<string, Family> = {
	text: 'text',
	email: 'text',
	url: 'text',
	textarea: 'text',
	select: 'choice',
	number: 'number',
	formula: 'number',
	date: 'date',
	boolean: 'boolean',
	reference: 'id',
	multiselect: 'list',
	tags: 'list',
	references: 'ids',
};

const OPS: Record<Family, string[]> = {
	text: ['eq', 'ne', 'in', 'nin', 'contains'],
	choice: ['eq', 'ne', 'in', 'nin'],
	number: ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'btwn'],
	date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'btwn'],
	boolean: ['eq', 'ne'],
	id: ['eq', 'ne', 'in', 'nin'],
	list: ['eq', 'ne', 'in', 'nin', 'all'],
	ids: ['eq', 'ne', 'in', 'nin', 'all'],
};
const ALL_OPS = new Set(Object.values(OPS).flat());

/** Query names that are the list's own, never a field filter (as in the admin's filter middleware). */
const RESERVED = new Set(['page', 'limit', 'sort', 'search', 'fields', 'skip', 'archived']);
/** Kinds `search` looks through. */
const SEARCHED = new Set(['text', 'email', 'textarea', 'select', 'tags']);
const SYSTEM_DATES = [
	{ key: 'createdAt', label: 'Created', kind: 'date' },
	{ key: 'updatedAt', label: 'Updated', kind: 'date' },
];

/** The fields a list can be filtered by, with their family. */
export const filterable = (def: any) =>
	[...def.fields, ...SYSTEM_DATES].filter((f: any) => FAMILY[f.kind] && !RESERVED.has(f.key)).map((f: any) => ({ ...f, family: FAMILY[f.kind] as Family }));

/** What a model's list takes, for GET / (the API reference is built from it). */
export const listCapabilities = (def: any) => ({
	filters: filterable(def).map(f => ({ key: f.key, kind: f.kind, ops: OPS[f.family as Family] })),
	search: def.fields.filter((f: any) => SEARCHED.has(f.kind)).map((f: any) => f.key),
	sort: [...def.fields.filter((f: any) => !['section', 'sectionlist', 'password'].includes(f.kind)).map((f: any) => f.key), ...SYSTEM_OUT],
});

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** A date filter's value as [from, to) — a plain day is the whole day (UTC); the admin's shortcuts work too. */
const dayRange = (f: any, raw: string): [Date, Date] => {
	const v = raw.trim().toLowerCase();
	const today = startOfDay(new Date());
	const tomorrow = new Date(today.getTime() + DAY);
	const back = (n: number, unit: 'days' | 'months') => {
		const d = new Date(today);
		if (unit === 'days') d.setUTCDate(d.getUTCDate() - n);
		else d.setUTCMonth(d.getUTCMonth() - n);
		return d;
	};
	if (v === 'today' || v === 'daily') return [today, tomorrow];
	if (v === 'week' || v === 'weekly') return [back(7, 'days'), tomorrow];
	if (v === 'month' || v === 'monthly') return [back(1, 'months'), tomorrow];
	if (v === 'year' || v === 'yearly') return [back(12, 'months'), tomorrow];
	const rel = v.match(/^(days|months)_(\d{1,4})$/);
	if (rel) return [back(Number(rel[2]), rel[1] as 'days' | 'months'), tomorrow];
	const d = readValue(f, raw);
	return DATE_ONLY.test(raw.trim()) ? [d, new Date(d.getTime() + DAY)] : [d, new Date(d.getTime() + 1)];
};

/** One query value, read for the field's family — or a 400 naming the field. */
const readValue = (f: any, raw: any): any => {
	if (typeof raw !== 'string') throw new TenancyError(400, `${f.key}: send one plain value (use ${f.key}_gte=…, not ${f.key}[gte]=…)`);
	const v = raw.trim();
	switch (f.family as Family) {
		case 'number': {
			const n = Number(v);
			if (v === '' || !Number.isFinite(n)) throw new TenancyError(400, `${f.key} must be a number`);
			return n;
		}
		case 'boolean':
			if (v === 'true' || v === '1') return true;
			if (v === 'false' || v === '0') return false;
			throw new TenancyError(400, `${f.key} must be true or false`);
		case 'date': {
			const d = new Date(v);
			if (!v || Number.isNaN(d.getTime())) throw new TenancyError(400, `${f.key} must be a date, like 2026-10-04 or 2026-10-04T09:30:00Z`);
			return d;
		}
		case 'id':
		case 'ids':
			if (!isId(v)) throw new TenancyError(400, `${f.key} must be a record’s _id`);
			return new mongoose.Types.ObjectId(v);
		default:
			if (v.length > 200) throw new TenancyError(400, `${f.key}: at most 200 characters`);
			return f.kind === 'email' ? v.toLowerCase() : v;
	}
};

/** `a,b` or a repeated name, as a list of values. */
const valuesOf = (f: any, raw: any): any[] => {
	const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((r: any) => (typeof r === 'string' ? r.split(',') : [r])).filter((r: any) => r !== '');
	if (!parts.length) throw new TenancyError(400, `${f.key}: give at least one value`);
	if (parts.length > 100) throw new TenancyError(400, `${f.key}: at most 100 values`);
	return parts.map((p: any) => readValue(f, typeof p === 'string' ? p.trim() : p));
};

/** One field's condition for one operator. */
const condition = (f: any, op: string, raw: any): any => {
	const ops = OPS[f.family as Family];
	if (!ops.includes(op)) throw new TenancyError(400, `${f.key} can’t use _${op} — it takes ${ops.filter(o => o !== 'eq').map(o => `${f.key}_${o}`).join(', ')}`);
	if (op === 'in' || op === 'nin' || op === 'all') return { [`$${op}`]: valuesOf(f, raw) };
	if (Array.isArray(raw)) throw new TenancyError(400, `${f.key}_${op}: send it once`);
	if (op === 'btwn') {
		// from_to (the admin's form), or from,to; either end may be left out.
		const [from = '', to = ''] = String(raw).split(/[_,]/);
		if (!from.trim() && !to.trim()) throw new TenancyError(400, `${f.key}_btwn takes from_to, like ${f.family === 'date' ? '2026-10-01_2026-10-31' : '10_50'}`);
		const cond: any = {};
		if (f.family === 'date') {
			if (from.trim()) cond.$gte = dayRange(f, from)[0];
			if (to.trim()) cond.$lt = dayRange(f, to)[1];
		} else {
			if (from.trim()) cond.$gte = readValue(f, from);
			if (to.trim()) cond.$lte = readValue(f, to);
		}
		return cond;
	}
	if (f.family === 'date') {
		const [from, to] = dayRange(f, String(raw));
		return { eq: { $gte: from, $lt: to }, ne: { $not: { $gte: from, $lt: to } }, gt: { $gte: to }, gte: { $gte: from }, lt: { $lt: from }, lte: { $lt: to } }[op];
	}
	const value = readValue(f, raw);
	if (op === 'contains') return { $regex: escapeRegex(value), $options: 'i' };
	return op === 'eq' ? value : { [`$${op}`]: value };
};

/** A query name as a field and operator: `price` → eq, `price_gte` → gte, `first_name_in` → first_name + in. */
const parseKey = (key: string, fields: Map<string, any>): { f: any; op: string } | null => {
	if (fields.has(key)) return { f: fields.get(key), op: 'eq' };
	const cut = key.lastIndexOf('_');
	if (cut < 1) return null;
	const f = fields.get(key.slice(0, cut));
	const op = key.slice(cut + 1);
	if (!f) return null;
	if (!ALL_OPS.has(op) && op !== 'eq') throw new TenancyError(400, `Unknown operator _${op} on ${f.key}`);
	return { f, op };
};

/** The list's filter conditions (each must match) from the query string. */
export const listFilters = (def: any, q: any): any[] => {
	const fields = new Map(filterable(def).map(f => [f.key, f]));
	const and: any[] = [];
	for (const [key, raw] of Object.entries(q)) {
		if (RESERVED.has(key) || raw === undefined || raw === '') continue;
		const hit = parseKey(key, fields);
		if (!hit) continue;
		const op = hit.op === 'eq' && Array.isArray(raw) ? 'in' : hit.op;
		and.push({ [hit.f.key]: condition(hit.f, op, raw) });
	}
	if (q.search !== undefined) {
		const words = String(Array.isArray(q.search) ? q.search[0] : q.search).trim().slice(0, 100);
		const keys = def.fields.filter((f: any) => SEARCHED.has(f.kind)).map((f: any) => f.key);
		if (words && !keys.length) throw new TenancyError(400, 'This model has no text fields to search');
		if (words) and.push({ $or: keys.map((k: string) => ({ [k]: { $regex: escapeRegex(words), $options: 'i' } })) });
	}
	return and;
};

/** `sort=-price,name` → up to three keys, then _id so pages never overlap. Unknown keys are skipped. */
export const listSort = (def: any, raw: any) => {
	const allowed = new Set(listCapabilities(def).sort);
	const sort: Record<string, 1 | -1> = {};
	for (const part of String(Array.isArray(raw) ? raw.join(',') : raw || '').split(/[, ]/)) {
		const key = part.trim().replace(/^[-+]/, '');
		if (key && allowed.has(key) && !(key in sort) && Object.keys(sort).length < 3) sort[key] = part.trim().startsWith('-') ? -1 : 1;
	}
	if (!Object.keys(sort).length) sort.createdAt = -1;
	if (!('_id' in sort)) sort._id = -1;
	return sort;
};

/** `fields=name,price` → those of the record's keys (always _id); none asked or none known → all. */
export const listSelect = (def: any, raw: any) => {
	const all = outKeys(def);
	const asked = String(Array.isArray(raw) ? raw.join(',') : raw || '')
		.split(',')
		.map(k => k.trim())
		.filter(k => all.includes(k));
	return asked.length ? [...new Set(['_id', ...asked])] : all;
};

/**
 * The records a public read may reach: never archived; with owner-only, only
 * the customer's own; on a model with per-record access (D19) only those
 * marked public.
 */
export const publicReach = (def: any, customer: any | null = null) => ({
	archivedAt: null,
	...(def.publicApi?.ownerOnly && { _customer: customer?._id ?? null }),
	...(def.access?.enabled && { privacy: 'public' }),
});
