import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from './recordAccess.function.js';
import { ownRecordsOf } from './projectIndexes.function.js';
import { evaluate, linkedModelOf, parse, refsOf } from './formula.function.js';
import { permissionsOf, resources } from '../controllers/builder/viewDocument.controller.js';

/**
 * Fields filled in from a linked record (settings `schema.fillFrom`): a
 * payment's amount from the bill it pays — `{ from: 'bill', formula: 'total' }`
 * — or a formula over the bill's fields (`total - paid`). The form fills it
 * the moment a bill is picked and it stays editable; on create the server
 * fills it too when it was left empty (a record added through the panel's
 * API without the form). Only from a record the person may read.
 *
 * Two field types are built on it (docs/autofill): `autofill` (this, as a
 * type of its own) and `autofillreadonly` — the server owns it: set from the
 * picked record on every save, whatever the form sends is dropped, and it
 * follows the record's later changes (formulaDependents.function).
 *
 * `formula` is a single field of the linked record (copied as it is — text,
 * a date, a number) or an expression over its number fields (formula.function).
 */

export type LinkedFill = { key: string; from: string; formula: string; readonly: boolean };

export const READONLY_TYPE = 'autofillreadonly';

export const fillsOf = (settings: Record<string, any> | undefined): LinkedFill[] =>
	Object.entries(settings || {})
		.map(([key, s]: [string, any]) => ({
			key,
			from: s?.schema?.fillFrom?.from,
			formula: s?.schema?.fillFrom?.formula,
			readonly: s?.schema?.type === READONLY_TYPE,
		}))
		.filter((f): f is LinkedFill => typeof f.from === 'string' && !!f.from && typeof f.formula === 'string' && !!f.formula.trim());

/** An autofill field inside a list's rows (docs/autofill D8): `items.rate` copied from the product picked in the same row. */
export type RowFill = { list: string; key: string; from: string; formula: string; readonly: boolean; route?: string };

export const rowFillsOf = (settings: Record<string, any> | undefined): RowFill[] =>
	Object.entries(settings || {}).flatMap(([list, s]: [string, any]) => {
		if (s?.schema?.type !== 'section-data-array') return [];
		const dm: any[] = s.schema.section?.dataModel ?? s.schema.dataModel ?? [];
		return dm
			.filter(x => x?.name && typeof x?.fillFrom?.from === 'string' && typeof x?.fillFrom?.formula === 'string' && x.fillFrom.formula.trim())
			.map(x => ({
				list,
				key: x.name,
				from: x.fillFrom.from,
				formula: x.fillFrom.formula,
				readonly: x.type === READONLY_TYPE,
				route: dm.find(y => y?.name === x.fillFrom.from)?.model,
			}));
	});

const blank = (v: any) => v === undefined || v === null || v === '';
const valueAt = (doc: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const idOf = (v: any) => {
	const id = v && typeof v === 'object' ? v._id ?? v.value : v;
	return mongoose.isValidObjectId(id) ? String(id) : null;
};
const has = (o: any, k: string) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/** The value a fill gives for this linked record: a field as it is, or a formula's result. */
export const fillValue = (formula: string, linked: any): any => {
	const tree = parse(formula);
	if (tree.t === 'ref') return valueAt(linked, tree.key);
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
 * Fills a save from the records it picks (docs/autofill D4, D6).
 *
 * Autofill (editable): on create, filled into `body` when left empty; on
 * update (`current`, the stored record), only when its link changes in this
 * save and the field wasn't sent — a typed value is kept otherwise.
 * Autofill (read-only): its value is never taken from `body`; it is set from
 * the picked record on every save, cleared with the link, and left as it was
 * when the person can't read the record. Those come back as `{ key: value }`
 * for the controller to write (`req.autofilled`).
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
	for (const f of fills) {
		const sent = has(body, f.from);
		const id = idOf(sent ? body[f.from] : current?.[f.from]);
		if (f.readonly) {
			if (sent && !id) {
				auto[f.key] = null;
				continue;
			}
			if (!id) continue;
		} else {
			if (!id) continue;
			if (current) {
				if (!sent || id === idOf(current[f.from]) || has(body, f.key)) continue;
			} else if (!blank(body[f.key])) continue;
		}
		const linked = await load(f, id);
		if (!linked) continue;
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
 * permission is involved, the link is already on the record. Returns the keys written.
 */
export const syncReadonly = async (Model: mongoose.Model<any>, settings: Record<string, any> | undefined, filter: any, only?: string[]): Promise<string[]> => {
	const fills = fillsOf(settings).filter(f => f.readonly && (!only || only.includes(f.from)));
	const rows = rowFillsOf(settings).filter(f => f.readonly && (!only || only.includes(f.list)));
	if (!fills.length && !rows.length) return [];
	const docs = await Model.find(filter).select(fills.map(f => f.from).join(' ')).lean();
	const written: string[] = [];
	for (const f of fills) {
		const Linked = linkedModelOf(Model, f.from);
		if (!Linked) continue;
		const byLink = new Map<string, any[]>();
		for (const d of docs as any[]) {
			const id = idOf(d[f.from]);
			if (id) byLink.set(id, [...(byLink.get(id) || []), d._id]);
		}
		for (const [id, ids] of byLink) {
			const linked = await Linked.findById(id).lean();
			if (!linked) continue;
			const v = safeValue(f.formula, linked);
			await Model.updateMany({ _id: { $in: ids } }, { $set: { [f.key]: blank(v) ? null : v } });
		}
		written.push(f.key);
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
				const v = linked ? safeValue(f.formula, linked) : undefined;
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
const reads = (formula: string, changed: Set<string> | null) => {
	if (!changed) return true;
	try {
		for (const r of refsOf(parse(formula))) for (const c of changed) if (r === c || r.startsWith(`${c}.`) || c.startsWith(`${r}.`)) return true;
	} catch {
		// Doesn't parse: reads nothing.
	}
	return false;
};

/**
 * AF-06: `ids` of `Source` were saved — every record of `Dep` whose read-only
 * autofill copies from it takes the new value. Editable ones are never touched.
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
	const fills = fillsOf(settings).filter(
		f => f.readonly && heads.includes(f.from) && linkedModelOf(Dep, f.from)?.modelName === Source.modelName && reads(f.formula, changed)
	);
	const out = { ids: [] as any[], keys: [] as string[] };
	for (const id of fills.length ? ids : []) {
		const linked = await Source.findById(id).lean();
		if (!linked) continue; // a deleted source leaves the copies as they are
		for (const f of fills) {
			const v = safeValue(f.formula, linked);
			const hit = await Dep.find({ [f.from]: id }).distinct('_id');
			if (!hit.length) continue;
			await Dep.updateMany({ _id: { $in: hit } }, { $set: { [f.key]: blank(v) ? null : v } });
			out.ids.push(...hit);
			if (!out.keys.includes(f.key)) out.keys.push(f.key);
		}
	}
	// Rows: `items.rate` copied from the product picked in its row.
	for (const f of rowFillsOf(settings).filter(x => x.readonly && rowLinkModel(Dep, x)?.modelName === Source.modelName && reads(x.formula, changed))) {
		for (const id of ids) {
			const linked = await Source.findById(id).lean();
			if (!linked) continue;
			const v = safeValue(f.formula, linked);
			const hit = await Dep.find({ [`${f.list}.${f.from}`]: id }).distinct('_id');
			if (!hit.length) continue;
			await Dep.updateMany({ _id: { $in: hit } }, { $set: { [`${f.list}.$[r].${f.key}`]: blank(v) ? null : v } }, { arrayFilters: [{ [`r.${f.from}`]: id }] });
			out.ids.push(...hit);
			if (!out.keys.includes(f.list)) out.keys.push(f.list);
		}
	}
	return out;
};

/**
 * Autofill on a document in hand, without a signed-in person — the public API
 * with a server key. Read-only fields are set from their link; editable ones
 * fill when left empty on create, or when their link changed and they didn't.
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
		const v = safeValue(f.formula, linked);
		if (f.readonly) doc.set(f.key, blank(v) ? null : v);
		else if (!blank(v)) doc.set(f.key, v);
	}
};
