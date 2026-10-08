import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from './recordAccess.function.js';
import { ownRecordsOf } from './projectIndexes.function.js';
import { evaluate, parse } from './formula.function.js';
import { permissionsOf, resources } from '../controllers/builder/viewDocument.controller.js';

/**
 * Fields filled in from a linked record (settings `schema.fillFrom`): a
 * payment's amount from the bill it pays — `{ from: 'bill', formula: 'total' }`
 * — or a formula over the bill's fields (`total - paid`). The form fills it
 * the moment a bill is picked and it stays editable; on create the server
 * fills it too when it was left empty (a record added through the panel's
 * API without the form). Only from a record the person may read.
 *
 * `formula` is a single field of the linked record (copied as it is — text,
 * a date, a number) or an expression over its number fields (formula.function).
 */

export type LinkedFill = { key: string; from: string; formula: string };

export const fillsOf = (settings: Record<string, any> | undefined): LinkedFill[] =>
	Object.entries(settings || {})
		.map(([key, s]: [string, any]) => ({ key, from: s?.schema?.fillFrom?.from, formula: s?.schema?.fillFrom?.formula }))
		.filter((f): f is LinkedFill => typeof f.from === 'string' && !!f.from && typeof f.formula === 'string' && !!f.formula.trim());

const blank = (v: any) => v === undefined || v === null || v === '';
const valueAt = (doc: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
const idOf = (v: any) => {
	const id = v && typeof v === 'object' ? v._id ?? v.value : v;
	return mongoose.isValidObjectId(id) ? String(id) : null;
};

/** The value a fill gives for this linked record: a field as it is, or a formula's result. */
export const fillValue = (formula: string, linked: any): any => {
	const tree = parse(formula);
	if (tree.t === 'ref') return valueAt(linked, tree.key);
	return evaluate(tree, linked);
};

/** Fills the empty fields of `body` whose linked record is picked in it. */
export const fillLinked = async (req: any, settings: Record<string, any> | undefined, body: any) => {
	if (!body || typeof body !== 'object') return;
	const fills = fillsOf(settings).filter(f => blank(body[f.key]) && idOf(body[f.from]));
	if (!fills.length) return;
	const canRead = await permissionsOf(req);
	const cache = new Map<string, any>();
	for (const f of fills) {
		const route = settings?.[f.from]?.schema?.model;
		const entry = typeof route === 'string' ? resources(req.app).get(route) : undefined;
		if (!entry || !canRead(entry)) continue;
		const id = idOf(body[f.from])!;
		const cacheKey = `${route}:${id}`;
		if (!cache.has(cacheKey)) {
			const Linked = entry.source.Model;
			const and: any[] = [{ _id: id }, ownRecordsOf(Linked), ...(isAccessRestricted(Linked) ? [accessRule(req.user?._id)] : [])];
			cache.set(cacheKey, await Linked.findOne({ $and: and.filter(x => Object.keys(x).length) }).lean().catch(() => null));
		}
		const linked = cache.get(cacheKey);
		if (!linked) continue;
		try {
			const v = fillValue(f.formula, linked);
			if (!blank(v)) body[f.key] = v;
		} catch {
			// A formula that no longer parses (a field renamed) fills nothing.
		}
	}
};
