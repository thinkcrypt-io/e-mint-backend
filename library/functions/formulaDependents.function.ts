import mongoose from 'mongoose';
import { collectResourceRoutes, getDynamicVersion } from './routeRegistry.function.js';
import { resolveRoute } from './resolveRoute.function.js';
import { scopeKey } from './tenantScope.function.js';
import { Formula, formulasOf, linkedModelOf, linksRead, recalculateFormulas } from './formula.function.js';

/**
 * Formulas reading through a link (`total = price * qty + tax.amount`) are
 * worked out when the record using them is saved. When the linked record
 * changes instead — a Tax's amount edited, or the Tax deleted — every record
 * picking it is recalculated here, so a Bill's total follows its tax without
 * being saved again (a deleted record reads as 0).
 *
 * Called after a save by every path that writes records — edit, bulk edit and
 * status, delete and undo, import, merge, the public API, MCP, Linked
 * Relationships — with the records changed and the fields that changed. Only
 * a model (in the same scope: a tenant project sees only its own) whose
 * formulas read one of those fields through a link to the changed model is
 * touched. Their formula fields can be read through links in turn (a Payment
 * reading `bill.total`), so it goes on from them — each model at most once
 * per change, and never more than MAX_DEPTH links away, so a loop (A reads B
 * reads A) ends.
 */

export const MAX_DEPTH = 4;

type Candidate = { route: string; source: any; heads: string[] };

/** Per scope and dynamic-routes version: the routes whose model has a link to a given model. */
const candidatesCache = new Map<string, { version: number; byModel: Map<string, Candidate[]> }>();

/** Every route whose model has a single link to `model` — before looking at any formulas. */
const candidatesFor = (app: any, model: mongoose.Model<any>): Candidate[] => {
	const key = scopeKey();
	const version = getDynamicVersion();
	let entry = candidatesCache.get(key);
	if (!entry || entry.version !== version) candidatesCache.set(key, (entry = { version, byModel: new Map() }));
	const hit = entry.byModel.get(model.modelName);
	if (hit) return hit;

	const out: Candidate[] = [];
	const seenModels = new Set<string>();
	for (const e of collectResourceRoutes(app)) {
		const Dep: mongoose.Model<any> | undefined = e.source?.Model;
		if (!Dep?.schema || seenModels.has(Dep.modelName)) continue;
		seenModels.add(Dep.modelName); // two routes over one model: the first, as a live request finds it
		const heads = Object.entries<any>(Dep.schema.paths)
			.filter(([k, p]) => p.instance === 'ObjectId' && typeof p.options?.ref === 'string' && !k.startsWith('_'))
			.filter(([k]) => linkedModelOf(Dep, k)?.modelName === model.modelName)
			.map(([k]) => k);
		if (heads.length) out.push({ route: e.route, source: e.source, heads });
	}
	entry.byModel.set(model.modelName, out);
	return out;
};

type Dependent = { Model: mongoose.Model<any>; formulas: Formula[]; reads: Map<string, string[]> };

/** The models whose formulas read `model`'s fields through a link, with what they read through which link. */
const dependentsOf = async (app: any, model: mongoose.Model<any>): Promise<Dependent[]> => {
	const out: Dependent[] = [];
	for (const c of candidatesFor(app, model)) {
		const { settings } = await resolveRoute(c.route, { ...c.source, built: null });
		const formulas = formulasOf(settings);
		if (!formulas.length) continue;
		const reads = new Map<string, string[]>();
		for (const [head, { Linked, paths }] of linksRead(formulas, c.source.Model))
			if (c.heads.includes(head) && Linked.modelName === model.modelName) reads.set(head, paths);
		if (reads.size) out.push({ Model: c.source.Model, formulas, reads });
	}
	return out;
};

/** A field read (`amount`, `address.zip`) that one of the changed fields touches. */
const touches = (read: string, changed: Set<string>) => {
	if (changed.has(read)) return true;
	for (const c of changed) if (read.startsWith(`${c}.`) || c.startsWith(`${read}.`)) return true;
	return false;
};

const idsOf = (ids: any[]) => [...new Set(ids.filter(id => id && mongoose.isValidObjectId(id)).map(String))].map(id => new mongoose.Types.ObjectId(id));

/**
 * Recalculates the formula fields of every record that reads `ids` (of
 * `model`) through a link. `fields`: what changed on them — omitted (a
 * delete, an undo) means anything may have. Returns how many records changed.
 * Never throws: the save it follows has already happened.
 */
export const recalculateDependents = async (
	app: any,
	model: mongoose.Model<any> | undefined | null,
	ids: any[],
	fields?: Iterable<string> | null,
	seen: Set<string> = new Set(),
	depth = 0
): Promise<number> => {
	if (!app || !model?.modelName || depth >= MAX_DEPTH) return 0;
	const changedIds = idsOf(ids);
	if (!changedIds.length) return 0;
	const changed = fields ? new Set(fields) : null;
	if (changed && !changed.size) return 0;
	const path = new Set(seen).add(model.modelName);
	let total = 0;
	try {
		for (const d of await dependentsOf(app, model)) {
			const heads = [...d.reads].filter(([, paths]) => !changed || paths.some(p => touches(p, changed))).map(([h]) => h);
			if (!heads.length) continue;
			const filter = heads.length === 1 ? { [heads[0]]: { $in: changedIds } } : { $or: heads.map(h => ({ [h]: { $in: changedIds } })) };
			// Their own formula fields may be read through a link in turn: go on from the records changed, once per model.
			const next = path.has(d.Model.modelName) ? [] : await d.Model.find(filter).distinct('_id');
			total += await recalculateFormulas(d.Model, filter, d.formulas);
			if (next.length) total += await recalculateDependents(app, d.Model, next, d.formulas.filter(f => !f.sub).map(f => f.key), path, depth + 1);
		}
	} catch (e: any) {
		console.error('Formulas: recalculating the records that read', model.modelName, 'failed:', e?.message);
	}
	return total;
};
