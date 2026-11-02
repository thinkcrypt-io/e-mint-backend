import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from './recordAccess.function.js';
import { ownRecordsOf } from './projectIndexes.function.js';
import { evaluate, linkedModelOf, parse, refsOf } from './formula.function.js';
import { permissionsOf, resources } from '../controllers/builder/viewDocument.controller.js';
import { meets } from './fieldLocks.function.js';

/**
 * Fields filled in from a linked record (settings `schema.fillFrom`): a
 * payment's amount from the bill it pays — `{ from: 'bill', formula: 'total' }`
 * — or a formula over the bill's fields (`total - paid`). The form fills it
 * the moment a bill is picked and it stays editable; on create the server
 * fills it too when it was left empty (a record added through the panel's
 * API without the form). Only from a record the person may read.
 *
 * It is a setting on any field, not a type (docs/autofill, AF-09): the field keeps
 * its own kind and `fillFrom` adds `readonly` (the server owns it: set from the
 * picked record on every save, whatever the form sends is dropped, and it follows
 * the record's later changes — formulaDependents.function) and `when` + `match`
 * (conditions; D12). A condition's field is one of this record's, or of the picked
 * record's with the `@.` prefix (`@.type`). While they hold, autofill works; when
 * they don't, an editable field is left alone and a read-only one is cleared (and
 * stays locked).
 *
 * `formula` is a single field of the linked record (copied as it is — text,
 * a date, a number) or an expression over its number fields (formula.function).
 */

export type FillWhen = { field: string; op: string; value?: any };
export type LinkedFill = { key: string; from: string; formula: string; readonly: boolean; when?: FillWhen[]; match?: 'all' | 'any' };

/** The prefix of a condition on the picked record's field rather than this record's. */
export const SOURCE_PREFIX = '@.';

/** Is this settings field a locked (server-owned) autofill? Every place that used to name the read-only kind asks this. */
export const isLockedFill = (field: any): boolean => field?.schema?.fillFrom?.readonly === true || field?.fillFrom?.readonly === true;

const specOf = (fillFrom: any) => ({
	from: fillFrom?.from,
	formula: fillFrom?.formula,
	readonly: fillFrom?.readonly === true,
	when: Array.isArray(fillFrom?.when) && fillFrom.when.length ? (fillFrom.when as FillWhen[]) : undefined,
	match: (fillFrom?.match === 'any' ? 'any' : 'all') as 'all' | 'any',
});

const usable = (f: { from?: any; formula?: any }) => typeof f.from === 'string' && !!f.from && typeof f.formula === 'string' && !!f.formula.trim();

export const fillsOf = (settings: Record<string, any> | undefined): LinkedFill[] =>
	Object.entries(settings || {})
		.map(([key, s]: [string, any]) => ({ key, ...specOf(s?.schema?.fillFrom) }))
		.filter(usable) as LinkedFill[];

/** An autofill field inside a list's rows (docs/autofill D8): `items.rate` copied from the product picked in the same row. */
export type RowFill = LinkedFill & { list: string; route?: string };

export const rowFillsOf = (settings: Record<string, any> | undefined): RowFill[] =>
	Object.entries(settings || {}).flatMap(([list, s]: [string, any]) => {
		if (s?.schema?.type !== 'section-data-array') return [];
		const dm: any[] = s.schema.section?.dataModel ?? s.schema.dataModel ?? [];
		return dm
			.filter(x => x?.name && usable({ from: x?.fillFrom?.from, formula: x?.fillFrom?.formula }))
			.map(x => ({
				list,
				key: x.name,
				...specOf(x.fillFrom),
				route: dm.find(y => y?.name === x.fillFrom.from)?.model,
			}));
	});

/** Does a fill have conditions that read the picked record? */
const usesSource = (f: { when?: FillWhen[] }) => !!f.when?.some(c => typeof c?.field === 'string' && c.field.startsWith(SOURCE_PREFIX));

/** The keys of this record a fill's conditions read. */
export const whenKeys = (f: { when?: FillWhen[] }): string[] =>
	(f.when || []).map(c => String(c?.field || '')).filter(k => k && !k.startsWith(SOURCE_PREFIX)).map(k => k.split('.')[0]);

/**
 * Do a fill's conditions hold for `record`, with `linked` the picked record (null: none, or unreadable)?
 * No conditions: always. A condition on the picked record never holds without one.
 */
export const fillHolds = (f: { when?: FillWhen[]; match?: 'all' | 'any' }, record: any, linked: any): boolean => {
	if (!f.when?.length) return true;
	const one = (c: FillWhen) => {
		const src = typeof c?.field === 'string' && c.field.startsWith(SOURCE_PREFIX);
		if (src && !linked) return false;
		return meets(src ? linked : record, [src ? { ...c, field: c.field.slice(SOURCE_PREFIX.length) } : c], 'all', { this: record });
	};
	return f.match === 'any' ? f.when.some(one) : f.when.every(one);
};

const blank = (v: any) => v === undefined || v === null || v === '';
const valueAt = (doc: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const idOf = (v: any) => {
	const id = v && typeof v === 'object' ? v._id ?? v.value : v;
	return mongoose.isValidObjectId(id) ? String(id) : null;
};
/** An update setting `key` to `next`; empty is unset (a number's setter would turn a null `$set` into nothing). */
const writeOf = (key: string, next: any) => (next === null || next === undefined ? { $unset: { [key]: '' } } : { $set: { [key]: next } });
const has = (o: any, k: string) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/** A link copied from the picked record is its id as text, as the form sends it (the validator takes a string). */
const plainId = (v: any) => (v && typeof v === 'object' && !(v instanceof Date) && typeof v.toHexString === 'function' ? v.toHexString() : v);

/** The value a fill gives for this linked record: a field as it is, or a formula's result. */
export const fillValue = (formula: string, linked: any): any => {
	const tree = parse(formula);
	if (tree.t === 'ref') return plainId(valueAt(linked, tree.key));
	return evaluate(tree, linked);
};

/** The fill's value, or undefined when the formula no longer parses (a field renamed) — it fills nothing. */
const safeValue = (formula: string, linked: any) => {
	try {
		return fillValue(formula, linked);
	} catch {
		return undefined;
	}
};

/**
 * Fills a save from the records it picks (docs/autofill D4, D6, D12).
 *
 * Editable: on create, filled into `body` when left empty; on update
 * (`current`, the stored record), when its link changes in this save and the
 * field wasn't sent — a typed value is kept otherwise — or when it has conditions
 * and is empty. Read-only: its value is never taken from `body`; it is set from
 * the picked record on every save, cleared with the link or when its conditions
 * don't hold, and left as it was when the person can't read the record. Those
 * come back as `{ key: value }` for the controller to write (`req.autofilled`).
 */
export const autofill = async (req: any, settings: Record<string, any> | undefined, body: any, current: any = null): Promise<Record<string, any>> => {
	const auto: Record<string, any> = {};
	if (!body || typeof body !== 'object') return auto;
	const fills = fillsOf(settings);
	const rowFills = rowFillsOf(settings);
	for (const f of fills) if (f.readonly) delete body[f.key];
	if (!fills.length && !rowFills.length) return auto;
	let canRead: ((entry: any) => boolean) | null = null;
	const cache = new Map<string, any>();
	const loadFrom = async (route: unknown, id: string) => {
		const entry = typeof route === 'string' ? resources(req.app).get(route) : undefined;
		if (!entry) return null;
		canRead ||= await permissionsOf(req);
		if (!canRead(entry)) return null;
		const cacheKey = `${route}:${id}`;
		if (!cache.has(cacheKey)) {
			const Linked = entry.source.Model;
			const and: any[] = [{ _id: id }, ownRecordsOf(Linked), ...(isAccessRestricted(Linked) ? [accessRule(req.user?._id)] : [])];
			cache.set(cacheKey, await Linked.findOne({ $and: and.filter(x => Object.keys(x).length) }).lean().catch(() => null));
		}
		return cache.get(cacheKey);
	};
	const load = (f: LinkedFill, id: string) => loadFrom(settings?.[f.from]?.schema?.model, id);
	// The record as it will be saved, for the conditions.
	const record = () => ({ ...(current || {}), ...body });
	for (const f of fills) {
		const sent = has(body, f.from);
		const id = idOf(sent ? body[f.from] : current?.[f.from]);
		if (f.readonly) {
			if (sent && !id) {
				auto[f.key] = null;
				continue;
			}
			if (!id) {
				// No link to read: conditions on this record alone can still clear it.
				if (f.when && !usesSource(f) && !fillHolds(f, record(), null)) auto[f.key] = null;
				continue;
			}
		} else {
			if (!id) continue;
			if (current) {
				// A field the page doesn't let anyone edit (the store's engine-owned ones) isn't taken from a save: the update validator would refuse it.
				if (settings?.[f.key]?.edit === false) continue;
				const linkChanged = sent && id !== idOf(current[f.from]);
				// Conditions that start to hold fill an empty field (Delivery becomes Home).
				const nowHolds = !!f.when && !sent && blank(current[f.key]);
				if ((!linkChanged && !nowHolds) || has(body, f.key)) continue;
			} else if (!blank(body[f.key])) continue;
		}
		const linked = await load(f, id);
		if (!linked) {
			if (f.readonly && f.when && !usesSource(f) && !fillHolds(f, record(), null)) auto[f.key] = null;
			continue;
		}
		if (!fillHolds(f, record(), linked)) {
			if (f.readonly) auto[f.key] = null;
			continue;
		}
		const v = safeValue(f.formula, linked);
		if (f.readonly) auto[f.key] = blank(v) ? null : v;
		else if (!blank(v)) body[f.key] = v;
	}
	// Rows (D8): each row is filled from the record picked in that row. Rows are sent whole, so a
	// row's editable fill is "when empty" and its read-only one is always set from its own pick.
	for (const f of rowFills) {
		if (!Array.isArray(body[f.list])) continue;
		for (const row of body[f.list]) {
			if (!row || typeof row !== 'object') continue;
			if (f.readonly) delete row[f.key];
			const id = idOf(row[f.from]);
			if (!id) {
				if (f.readonly) row[f.key] = null;
				continue;
			}
			if (!f.readonly && !blank(row[f.key])) continue;
			const linked = await loadFrom(f.route, id);
			if (!linked) continue;
			if (!fillHolds(f, row, linked)) {
				if (f.readonly) row[f.key] = null;
				continue;
			}
			const v = safeValue(f.formula, linked);
			if (f.readonly) row[f.key] = blank(v) ? null : v;
			else if (!blank(v)) row[f.key] = v;
		}
	}
	return auto;
};

/** Create-time fill of the empty editable fields (kept for callers that predate Autofill). */
export const fillLinked = async (req: any, settings: Record<string, any> | undefined, body: any) => {
	await autofill(req, settings, body);
};

/**
 * Sets the read-only autofill fields of the records matching `filter` from the
 * records they pick — bulk edit, import, merge. System-level: no person's read
 * permission is involved, the link is already on the record. `only` names the
 * fields that changed (a link, or a field the conditions read). Returns the keys written.
 */
export const syncReadonly = async (Model: mongoose.Model<any>, settings: Record<string, any> | undefined, filter: any, only?: string[]): Promise<string[]> => {
	const fills = fillsOf(settings).filter(f => f.readonly && (!only || only.includes(f.from) || whenKeys(f).some(k => only.includes(k))));
	const rows = rowFillsOf(settings).filter(f => f.readonly && (!only || only.includes(f.list)));
	if (!fills.length && !rows.length) return [];
	const written: string[] = [];
	if (fills.length) {
		const docs = (await Model.find(filter).lean()) as any[];
		const cache = new Map<string, any>();
		for (const f of fills) {
			const Linked = linkedModelOf(Model, f.from);
			if (!Linked) continue;
			for (const d of docs) {
				const id = idOf(d[f.from]);
				let linked: any = null;
				if (id) {
					const ck = `${f.from}:${id}`;
					if (!cache.has(ck)) cache.set(ck, await Linked.findById(id).lean());
					linked = cache.get(ck);
				}
				if (id && !linked) continue; // the picked record is gone: leave the copy
				const v = linked && fillHolds(f, d, linked) ? safeValue(f.formula, linked) : undefined;
				const next = blank(v) ? null : v;
				if (JSON.stringify(d[f.key] ?? null) !== JSON.stringify(next)) await Model.updateOne({ _id: d._id }, writeOf(f.key, next));
			}
			written.push(f.key);
		}
	}
	for (const f of rows) {
		const Linked = rowLinkModel(Model, f);
		if (!Linked) continue;
		const docs = await Model.find(filter).select(f.list).lean();
		for (const d of docs as any[]) {
			const list: any[] = Array.isArray(d[f.list]) ? d[f.list] : [];
			let changed = false;
			for (const row of list) {
				const id = idOf(row?.[f.from]);
				const linked = id ? await Linked.findById(id).lean() : null;
				const v = linked && fillHolds(f, row, linked) ? safeValue(f.formula, linked) : undefined;
				const next = blank(v) ? null : v;
				if (JSON.stringify(row[f.key] ?? null) !== JSON.stringify(next)) ((row[f.key] = next), (changed = true));
			}
			if (changed) await Model.updateOne({ _id: d._id }, { $set: { [f.list]: list } });
		}
		written.push(`${f.list}.${f.key}`);
	}
	return written;
};

/** The model a row's link points to: `items.product`. Mongoose reaches a row's path through the list's own schema. */
const rowLinkModel = (Model: mongoose.Model<any>, f: { list: string; from: string }): mongoose.Model<any> | null => {
	const list: any = Model.schema.path(f.list);
	const ref = list?.schema?.path?.(f.from)?.options?.ref;
	return typeof ref === 'string' ? ((mongoose.models[ref] as any) || (Model as any).db?.models?.[ref] || null) : null;
};

/** Does a fill read any of the changed fields of its source record? `changed` null = anything may have. */
const reads = (f: { formula: string; when?: FillWhen[] }, changed: Set<string> | null) => {
	if (!changed) return true;
	const hit = (r: string) => [...changed].some(c => r === c || r.startsWith(`${c}.`) || c.startsWith(`${r}.`));
	// Conditions on the picked record's fields (`@.type`) are read from it too.
	if ((f.when || []).some(c => typeof c?.field === 'string' && c.field.startsWith(SOURCE_PREFIX) && hit(c.field.slice(SOURCE_PREFIX.length)))) return true;
	try {
		for (const r of refsOf(parse(f.formula))) if (hit(r)) return true;
	} catch {
		// Doesn't parse: reads nothing.
	}
	return false;
};

/**
 * AF-06: `ids` of `Source` were saved — every record of `Dep` whose read-only
 * autofill copies from it takes the new value (or is cleared when its conditions
 * no longer hold, D12). Editable ones are never touched.
 * Returns the records changed and the fields written, for the caller to go on from.
 */
export const followReadonly = async (
	Dep: mongoose.Model<any>,
	settings: Record<string, any> | undefined,
	Source: mongoose.Model<any>,
	heads: string[],
	ids: mongoose.Types.ObjectId[],
	changed: Set<string> | null
): Promise<{ ids: any[]; keys: string[] }> => {
	const fills = fillsOf(settings).filter(f => f.readonly && heads.includes(f.from) && linkedModelOf(Dep, f.from)?.modelName === Source.modelName && reads(f, changed));
	const out = { ids: [] as any[], keys: [] as string[] };
	for (const id of fills.length ? ids : []) {
		const linked = await Source.findById(id).lean();
		if (!linked) continue; // a deleted source leaves the copies as they are
		for (const f of fills) {
			const docs = (await Dep.find({ [f.from]: id }).lean()) as any[];
			if (!docs.length) continue;
			const v = safeValue(f.formula, linked);
			// Conditions on this record decide per record.
			const groups = new Map<string, any[]>();
			for (const d of docs) {
				const next = fillHolds(f, d, linked) && !blank(v) ? v : null;
				const k = JSON.stringify(next ?? null);
				groups.set(k, [...(groups.get(k) || []), d._id]);
			}
			for (const [k, hit] of groups) await Dep.updateMany({ _id: { $in: hit } }, writeOf(f.key, JSON.parse(k)));
			out.ids.push(...docs.map(d => d._id));
			if (!out.keys.includes(f.key)) out.keys.push(f.key);
		}
	}
	// Rows: `items.rate` copied from the product picked in its row.
	for (const f of rowFillsOf(settings).filter(x => x.readonly && rowLinkModel(Dep, x)?.modelName === Source.modelName && reads(x, changed))) {
		for (const id of ids) {
			const linked = await Source.findById(id).lean();
			if (!linked) continue;
			const v = safeValue(f.formula, linked);
			const docs = (await Dep.find({ [`${f.list}.${f.from}`]: id }).select(f.list).lean()) as any[];
			if (!docs.length) continue;
			for (const d of docs) {
				const list: any[] = Array.isArray(d[f.list]) ? d[f.list] : [];
				for (const row of list) if (idOf(row?.[f.from]) === String(id)) row[f.key] = fillHolds(f, row, linked) && !blank(v) ? v : null;
				await Dep.updateOne({ _id: d._id }, { $set: { [f.list]: list } });
			}
			out.ids.push(...docs.map(d => d._id));
			if (!out.keys.includes(f.list)) out.keys.push(f.list);
		}
	}
	return out;
};

/**
 * Autofill on a document in hand, without a signed-in person — the public API
 * with a server key. Read-only fields are set from their link (cleared when their
 * conditions don't hold); editable ones fill when left empty on create, or when
 * their link changed and they didn't.
 */
export const fillDoc = async (Model: mongoose.Model<any>, settings: Record<string, any> | undefined, doc: any, created: boolean) => {
	for (const f of fillsOf(settings)) {
		const Linked = linkedModelOf(Model, f.from);
		if (!Linked) continue;
		const id = idOf(doc.get(f.from));
		if (f.readonly) {
			if (!id) {
				doc.set(f.key, null);
				continue;
			}
		} else {
			if (!id) continue;
			if (created ? !blank(doc.get(f.key)) : !doc.isModified(f.from) || doc.isModified(f.key)) continue;
		}
		const linked = await Linked.findById(id).lean();
		if (!linked) continue;
		const rec = doc.toObject ? doc.toObject() : doc;
		if (!fillHolds(f, rec, linked)) {
			if (f.readonly) doc.set(f.key, null);
			continue;
		}
		const v = safeValue(f.formula, linked);
		if (f.readonly) doc.set(f.key, blank(v) ? null : v);
		else if (!blank(v)) doc.set(f.key, v);
	}
};
