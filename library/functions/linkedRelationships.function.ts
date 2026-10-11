import mongoose from 'mongoose';
import Joi from 'joi';
import LinkedChange from '../models/linked-change/model.js';
import { LOCK_OPS, LockCondition, meets, lockedChanges, lockedMessage } from './fieldLocks.function.js';
import { accessRule, isAccessRestricted } from './recordAccess.function.js';
import { ownRecordsOf } from './projectIndexes.function.js';
import { applyFormulas, evaluate, formulasOf, parse, refsOf } from './formula.function.js';
import { permissionsOf, resolveOther, resources } from '../controllers/builder/viewDocument.controller.js';
import recordHistory, { diffFields } from './recordHistory.function.js';
import { secretPaths } from './secretFields.function.js';
import { displayModelName, ResourceRouteEntry } from './routeRegistry.function.js';
import type { ResolvedRoute } from './resolveRoute.function.js';

/**
 * Linked Relationships (docs/linked-relationships): saving one record changes
 * the records it picks. A payment with "Mark as paid" ticked sets its
 * invoice's status to Paid and copies its payment date there:
 *
 *   linkedRelationships: [{
 *     id: 'mark-paid', name: 'Mark invoice paid', on: ['create', 'update'],
 *     when: [{ field: 'markPaid', op: 'is', value: true }],
 *     target: { via: 'invoice' },
 *     set: [{ field: 'status', value: 'paid' }, { field: 'paymentDate', from: 'paymentDate' }],
 *     undo: 'revert',
 *   }]
 *
 * The rules sit in the route's config (`linkedRelationships`), published from
 * the builder's Linked Relationships tab. Conditions are the field locks' and
 * view tabs' (`{ field, op, value }`, `match` all | any).
 *
 * A save runs in two halves, so a rule that can't run never leaves half a
 * change behind:
 *
 * - `prepare`, before anything is written: picks the rules that apply, checks
 *   the fields they need are filled in, loads each target (in this project, one
 *   the person may edit unless the rule is `asSystem`), works out its new
 *   values and checks them against the target route's own rules — its update
 *   validator, editable fields, field locks and the model. Any problem → a 400
 *   that names the target and the field, and nothing is saved.
 * - `apply`, after the record itself is saved: writes the targets, logs each
 *   change (LinkedChange — what makes undo possible), runs the targets' own
 *   rules (at most 3 steps deep) and writes their history. If a write fails,
 *   everything it did is put back and the error is thrown; the caller puts
 *   the record itself back too.
 *
 * When a rule stops holding — the payment is deleted, "Mark as paid" is
 * unticked, another invoice is picked — its earlier change is undone (`undo`:
 * revert, the default) or left (`keep`), or the save is refused (`block`).
 * Reverting only touches fields that still hold what the rule set.
 *
 * An update only re-runs a rule when a field it reads changed, so editing a
 * payment's note doesn't touch the invoice — but changing its date does.
 */

export const LINKED_ACTIONS = ['create', 'update', 'delete'] as const;
export type LinkedAction = (typeof LINKED_ACTIONS)[number];
export const MAX_DEPTH = 3;

export type Assignment = {
	field: string;
	/** Set to this value. */
	value?: any;
	/** Copy this record's field. */
	from?: string;
	/** Work it out: `this.amount`, `target.paid + this.amount`. */
	formula?: string;
	/** Add this number (or this record's number field) — taken off again on undo. */
	inc?: string | number;
	/** Empty the field. */
	clear?: boolean;
};

export type LinkedRule = {
	id: string;
	name?: string;
	enabled?: boolean;
	on?: LinkedAction[];
	when?: LockCondition[];
	match?: 'all' | 'any';
	target: { via: string; route?: string; when?: LockCondition[]; match?: 'all' | 'any' };
	set?: Assignment[];
	block?: { message: string };
	undo?: 'revert' | 'keep' | 'block';
	require?: string[];
	asSystem?: boolean;
};

/* ------------------------------------------------------------ the shape */

const conditionSchema = Joi.object({
	field: Joi.string().required(),
	op: Joi.string()
		.valid(...LOCK_OPS)
		.required(),
	value: Joi.any(),
});
const assignmentSchema = Joi.object({
	field: Joi.string().required(),
	value: Joi.any(),
	from: Joi.string(),
	formula: Joi.string().max(500),
	inc: Joi.alternatives(Joi.number(), Joi.string()),
	clear: Joi.boolean().valid(true),
}).xor('value', 'from', 'formula', 'inc', 'clear');

export const linkedRuleSchema = Joi.object({
	id: Joi.string().max(60).required(),
	name: Joi.string().allow('').max(120),
	enabled: Joi.boolean(),
	on: Joi.array()
		.items(Joi.string().valid(...LINKED_ACTIONS))
		.min(1)
		.unique(),
	when: Joi.array().items(conditionSchema).max(10),
	match: Joi.string().valid('all', 'any'),
	target: Joi.object({
		via: Joi.string().required(),
		route: Joi.string(),
		when: Joi.array().items(conditionSchema).max(10),
		match: Joi.string().valid('all', 'any'),
	}).required(),
	set: Joi.array().items(assignmentSchema).min(1).max(30),
	block: Joi.object({ message: Joi.string().max(300).required() }),
	undo: Joi.string().valid('revert', 'keep', 'block'),
	require: Joi.array().items(Joi.string()).max(30),
	asSystem: Joi.boolean(),
}).xor('set', 'block');

export const linkedRulesSchema = Joi.array().items(linkedRuleSchema).max(50).unique('id');

/** A route's rules that are on, from its config. */
export const linkedRulesOf = (config: any): LinkedRule[] =>
	(Array.isArray(config?.linkedRelationships) ? config.linkedRelationships : []).filter(
		(r: any) => r && r.enabled !== false && r.target?.via && (r.set?.length || r.block?.message)
	);

/** create + update unless the rule says otherwise. */
export const actionsOf = (r: LinkedRule): LinkedAction[] => (Array.isArray(r.on) && r.on.length ? r.on : ['create', 'update']);

/* ---------------------------------------------------------------- values */

const get = (doc: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);

/** Stored values as plain data, so two of them compare: ids as text, dates as times. */
const plain = (v: any): any => {
	if (v === null || v === undefined) return null;
	if (Array.isArray(v)) return v.map(plain);
	if (v instanceof Date) return v.getTime();
	if (v instanceof mongoose.Types.ObjectId) return String(v);
	if (typeof v === 'object') {
		if (v._id) return String(v._id);
		const out: any = {};
		for (const k of Object.keys(v).sort()) out[k] = plain(v[k]);
		return out;
	}
	return v;
};
const same = (a: any, b: any) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));
const blank = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

/** A picked record (or several) as ids. */
const idsOf = (v: any): string[] =>
	(Array.isArray(v) ? v : [v])
		.map(x => (x && typeof x === 'object' && !(x instanceof mongoose.Types.ObjectId) ? x._id ?? x.value : x))
		.filter(x => x && mongoose.isValidObjectId(x))
		.map(String);

/** A populated record copied over is its id. */
const asStored = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v._id ? v._id : v);

const holds = (doc: any, conds?: LockCondition[], match?: 'all' | 'any') => !conds?.length || meets(doc, conds, match === 'any' ? 'any' : 'all');

/** Every field of this record a rule reads — an update re-runs it only when one of them changed. */
export const fieldsRead = (r: LinkedRule): string[] => {
	const out = new Set<string>([r.target.via, ...(r.require || [])]);
	(r.when || []).forEach(c => c?.field && out.add(c.field));
	for (const a of r.set || []) {
		if (a.from) out.add(a.from);
		if (typeof a.inc === 'string' && !Number.isFinite(Number(a.inc))) out.add(a.inc);
		if (a.formula)
			try {
				refsOf(parse(a.formula)).forEach(k => k.startsWith('this.') && out.add(k.slice(5)));
			} catch {
				/* checked at publish */
			}
	}
	return [...out];
};

const valueOf = (a: Assignment, source: any, target: any) => {
	if (a.clear) return null;
	if (a.from) return asStored(get(source, a.from));
	if (a.formula) {
		const tree = parse(a.formula);
		const ctx = { this: source, target };
		return tree.t === 'ref' ? asStored(get(ctx, tree.key)) : evaluate(tree, ctx);
	}
	return a.value;
};

const incOf = (a: Assignment, source: any): number => {
	if (typeof a.inc === 'number') return a.inc;
	const n = Number(a.inc);
	if (Number.isFinite(n)) return n;
	return Number(get(source, String(a.inc))) || 0;
};

const labelOf = (settings: Record<string, any> | undefined, key: string) =>
	settings?.[key]?.title || settings?.[key]?.schema?.label || settings?.[key]?.label || key;

const nameOf = (doc: any) => String(doc?.code || doc?.name || doc?.title || doc?.invoiceNumber || doc?._id || '');

const recordLabel = (Model: mongoose.Model<any>, doc: any) => `${displayModelName(Model.modelName)} ${nameOf(doc)}`.trim();

/* ----------------------------------------------------------------- a run */

/** A refusal: `message` for the toast, `fields` for the inputs it's about. */
export class LinkedError extends Error {
	status: number;
	fields?: Record<string, string>;
	constructor(message: string, status = 400, fields?: Record<string, string>) {
		super(message);
		this.status = status;
		this.fields = fields;
	}
}

/** What another record went through, for the response and the form's hint. */
export type LinkedSummary = {
	rule: string;
	route: string;
	id: string;
	name: string;
	model: string;
	undo?: boolean;
	changes: { field: string; label: string; from: string; to: string }[];
};

type Journal = { Model: mongoose.Model<any>; id: any; raw: any | null }[];

type Run = {
	req: any;
	can?: (entry: ResourceRouteEntry, verb: any) => boolean;
	seen: Set<string>;
	journal: Journal;
	summary: LinkedSummary[];
	history: (() => void)[];
	depth: number;
};

const newRun = (req: any): Run => ({ req, seen: new Set(), journal: [], summary: [], history: [], depth: 0 });

type Step = {
	kind: 'apply' | 'undo';
	rule: LinkedRule;
	entry: ResourceRouteEntry;
	resolved: ResolvedRoute;
	Model: mongoose.Model<any>;
	doc: any;
	before: any;
	sets: Record<string, any>;
	incs: Record<string, number>;
	/**
	 * Every value the rule wants, changed or not: a second payment on a paid
	 * invoice also holds it at Paid, so taking the first one back leaves it paid.
	 */
	asserted: Record<string, any>;
	/** The logged change this continues (apply) or takes back (undo). */
	change?: any;
};

type Source = { route: string; Model: mongoose.Model<any>; settings: Record<string, any>; label: string; id: any; values: any };

export type Prepared = {
	/** A 400 body when the save must be refused; null when it may go ahead. */
	error: { message: string; fields?: Record<string, string> } | null;
	/** What would change — the form's hint. */
	preview: LinkedSummary[];
	/** Writes the changes; on failure puts back what it wrote and throws. */
	apply: (saved?: any) => Promise<LinkedSummary[]>;
};

const can = async (run: Run, entry: ResourceRouteEntry, verb: 'view' | 'edit') => {
	if (!run.can) run.can = await permissionsOf(run.req);
	return run.can(entry, verb);
};

/** The target route a rule writes to: the one its picker field points at. */
export const targetRouteOf = (rule: LinkedRule, settings: Record<string, any> | undefined): string | undefined => {
	const model = settings?.[rule.target.via]?.schema?.model;
	return rule.target.route || (typeof model === 'string' ? model : undefined);
};

/** Loads one target the person may reach (and edit, unless the rule runs as the system). */
const loadTarget = async (run: Run, rule: LinkedRule, source: Source, id: string, verb: 'view' | 'edit') => {
	const route = targetRouteOf(rule, source.settings);
	const entry = route ? resources(run.req.app).get(route) : undefined;
	if (!entry) throw new LinkedError(`“${rule.name || rule.id}” points at a page that doesn't exist (${route || rule.target.via}).`);
	const title = displayModelName(entry.source.Model.modelName);
	if (!rule.asSystem && !(await can(run, entry, verb)))
		throw new LinkedError(`You can't ${verb === 'edit' ? 'change' : 'see'} ${title} records, so “${rule.name || rule.id}” can't run.`, 403);
	const Model = entry.source.Model;
	const and: any[] = [{ _id: id }, ownRecordsOf(Model)];
	if (!rule.asSystem && isAccessRestricted(Model)) and.push(accessRule(run.req.user?._id));
	const doc = await Model.findOne({ $and: and.filter(x => Object.keys(x).length) });
	if (!doc) throw new LinkedError(`${title} ${id} wasn't found, so “${rule.name || rule.id}” can't run.`, 404);
	return { entry, Model, doc, resolved: await resolveOther(entry) };
};

/**
 * The new values for a target, checked against its route: editable, the
 * update validator, field locks, then the model (with its formulas worked
 * out). Applied to `doc` in memory; nothing is written.
 */
const checkTarget = async (step: Step, checkEditable: boolean) => {
	const { resolved, doc, before, sets, incs, Model } = step;
	const label = recordLabel(Model, before);
	const fields = [...Object.keys(sets), ...Object.keys(incs)];
	if (checkEditable) {
		const allow: string[] = resolved.built?.EDITS?.allowEdits || [];
		const blocked = fields.filter(f => !allow.includes(f));
		if (blocked.length)
			throw new LinkedError(`${label}: ${blocked.map(f => labelOf(resolved.settings, f)).join(', ')} can't be changed on this page, so “${step.rule.name || step.rule.id}” can't run.`);
	}
	const validator = resolved.built?.VALIDATORS?.UPDATE;
	const payload = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(sets).filter(([, v]) => v !== null && v !== undefined))));
	if (validator && Object.keys(payload).length) {
		const { error } = validator.validate(payload);
		if (error) throw new LinkedError(`${label}: ${error.details?.[0]?.message || error.message}`);
	}
	const locked = lockedChanges(resolved.settings, before, sets);
	if (locked.length) throw new LinkedError(`${label}: ${lockedMessage(locked)}`);
	for (const [k, v] of Object.entries(sets)) doc.set(k, v === null ? undefined : v);
	for (const [k, d] of Object.entries(incs)) doc.set(k, (Number(doc.get(k)) || 0) + d);
	applyFormulas(doc, formulasOf(resolved.settings));
	try {
		await doc.validate();
	} catch (e: any) {
		const first: any = Object.values(e?.errors || {})[0];
		throw new LinkedError(`${label}: ${first?.message || e.message}`);
	}
};

const summaryOf = (step: Step, after: any): LinkedSummary => ({
	rule: step.rule.name || step.rule.id,
	route: step.entry.route,
	id: String(step.before._id),
	name: nameOf(step.before),
	model: displayModelName(step.Model.modelName),
	...(step.kind === 'undo' && { undo: true }),
	changes: diffFields({
		before: step.before,
		after,
		fields: [...new Set([...Object.keys(step.sets), ...Object.keys(step.incs), ...formulasOf(step.resolved.settings).map(f => f.key)])],
		settings: step.resolved.settings,
		secret: secretPaths(step.Model.schema),
	}),
});

/**
 * Works out what saving this record does to the records it picks — the
 * first half of a save (see the top of the file). `before` is the stored
 * record (null on create), `after` the record as it will be saved (null on
 * delete). Null when the route has no rules.
 */
export const prepareLinked = async ({
	req,
	resolved,
	Model,
	action,
	before,
	after,
	run = newRun(req),
}: {
	req: any;
	resolved: ResolvedRoute | undefined;
	Model: mongoose.Model<any>;
	action: LinkedAction;
	before: any;
	after: any;
	run?: Run;
}): Promise<Prepared | null> => {
	const rules = linkedRulesOf(resolved?.frontendConfig);
	if (!rules.length || !resolved) return null;
	if (run.depth >= MAX_DEPTH) throw new LinkedError(`Linked Relationships went more than ${MAX_DEPTH} steps deep — check the rules for a loop.`);

	const values = action === 'delete' ? before : after;
	const source: Source = {
		route: resolved.key || '',
		Model,
		settings: resolved.settings,
		label: recordLabel(Model, values),
		id: values?._id,
		values,
	};
	const active: any[] = action === 'create' || !source.id ? [] : await LinkedChange.find({ source: source.id, revertedAt: null }).lean();

	const steps: Step[] = [];
	/** Changes left as they are (`undo: 'keep'`, or the record is gone): only marked as over. */
	const ended: any[] = [];
	const messages: string[] = [];
	const fields: Record<string, string> = {};

	const fail = (e: any) => {
		if (e instanceof LinkedError) messages.push(e.message);
		else throw e;
	};

	for (const rule of rules) {
		const name = rule.name || rule.id;
		const acts = actionsOf(rule);
		const mine = active.filter(c => c.rule === rule.id);
		const relevant = action !== 'update' || fieldsRead(rule).some(f => !same(get(before, f), get(after, f)));

		// A check across records: refuse the save while it holds.
		if (rule.block) {
			if (!acts.includes(action) || !relevant || !holds(values, rule.when, rule.match)) continue;
			for (const id of idsOf(get(values, rule.target.via)))
				try {
					const t = await loadTarget(run, { ...rule, asSystem: true }, source, id, 'view');
					if (holds(t.doc.toObject(), rule.target.when, rule.target.match)) messages.push(rule.block.message);
				} catch (e) {
					fail(e);
				}
			continue;
		}

		// Taking back what the rule did, as the rule says.
		const takeBack = async (change: any) => {
			const undo = rule.undo || 'revert';
			if (undo === 'block') {
				messages.push(`“${name}” changed ${change.targetModel ? displayModelName(change.targetModel) : 'another record'} — it can't be taken back, so this change isn't allowed.`);
				return;
			}
			if (undo === 'keep') {
				ended.push(change);
				return;
			}
			try {
				const t = await loadTarget(run, rule, source, String(change.target), 'edit');
				const step: Step = { kind: 'undo', rule, ...t, before: t.doc.toObject(), sets: {}, incs: {}, asserted: {}, change };
				const others = await LinkedChange.find({ rule: rule.id, target: change.target, revertedAt: null, _id: { $ne: change._id } }).lean();
				for (const [f, v] of Object.entries(change.after || {})) {
					// Someone changed it since, or another record's rule still holds it: left as it is.
					if (!same(get(step.before, f), v) || others.some((o: any) => f in (o.after || {}))) continue;
					step.sets[f] = (change.before || {})[f] ?? null;
				}
				for (const [f, d] of Object.entries(change.incs || {})) if (Number(d)) step.incs[f] = -Number(d);
				await checkTarget(step, false);
				steps.push(step);
			} catch (e) {
				// The record it changed is gone: nothing to put back.
				if (e instanceof LinkedError && e.status === 404) ended.push(change);
				else fail(e);
			}
		};

		if (action === 'delete' && !acts.includes('delete')) {
			for (const c of mine) await takeBack(c);
			continue;
		}
		if (!acts.includes(action) || !relevant) continue;

		const now = holds(values, rule.when, rule.match);

		// Fields the rule copies or asks for are required while it holds.
		if (now && action !== 'delete')
			for (const f of [...(rule.require || []), ...(rule.set || []).map(a => a.from).filter((x): x is string => !!x)])
				if (blank(get(values, f))) fields[f] = `${labelOf(source.settings, f)} is needed for “${name}”.`;

		const targets = now ? idsOf(get(values, rule.target.via)) : [];
		if (action !== 'delete') for (const c of mine) if (!targets.includes(String(c.target))) await takeBack(c);

		for (const id of targets) {
			const key = `${rule.id}:${id}`;
			if (run.seen.has(key)) continue;
			run.seen.add(key);
			try {
				const t = await loadTarget(run, rule, source, id, 'edit');
				const targetBefore = t.doc.toObject();
				if (!holds(targetBefore, rule.target.when, rule.target.match)) continue;
				const change = mine.find(c => String(c.target) === id);
				const step: Step = { kind: 'apply', rule, ...t, before: targetBefore, sets: {}, incs: {}, asserted: {}, change };
				for (const a of rule.set || []) {
					if (a.inc !== undefined) {
						// Only the difference from what this record added last time.
						const d = incOf(a, values) - (Number(change?.incs?.[a.field]) || 0);
						if (d) step.incs[a.field] = d;
					} else {
						const v = valueOf(a, values, targetBefore);
						step.asserted[a.field] = v;
						if (!same(get(targetBefore, a.field), v)) step.sets[a.field] = v;
					}
				}
				// Already as the rule wants it and already logged: nothing to do. (Not
				// logged yet: it's logged without a write, so it holds those values too.)
				const unchanged = !Object.keys(step.sets).length && !Object.keys(step.incs).length;
				if (unchanged && (change ? Object.entries(step.asserted).every(([k, v]) => same((change.after || {})[k], v)) : !Object.keys(step.asserted).length)) continue;
				await checkTarget(step, true);
				steps.push(step);
			} catch (e) {
				fail(e);
			}
		}
	}

	const error = messages.length || Object.keys(fields).length ? { message: [...messages, ...Object.values(fields)].join(' '), ...(Object.keys(fields).length > 0 && { fields }) } : null;

	return {
		error,
		preview: steps.map(s => summaryOf(s, s.doc.toObject())).filter(s => s.changes.length),
		apply: async (saved?: any) => {
			const top = run.depth === 0;
			try {
				for (const change of ended) {
					run.journal.push({ Model: LinkedChange, id: change._id, raw: await LinkedChange.findById(change._id).lean() });
					await LinkedChange.updateOne({ _id: change._id }, { $set: { revertedAt: new Date() } });
				}
				for (const step of steps) await applyStep(run, step, source, saved);
				if (top) run.history.forEach(h => h());
				return run.summary;
			} catch (e) {
				if (top) await rollback(run.journal);
				throw e;
			}
		},
	};
};

/** Writes one step, logs it, and runs the target's own rules. */
const applyStep = async (run: Run, step: Step, source: Source, saved: any) => {
	const { Model, rule, resolved, entry } = step;
	const id = step.before._id;
	const name = rule.name || rule.id;
	const by = run.req.user?._id;
	const log = async (changeId: any, update: any) => {
		const raw = changeId ? await LinkedChange.findById(changeId).lean() : null;
		const doc = changeId ? await LinkedChange.findByIdAndUpdate(changeId, update, { new: true }) : await LinkedChange.create(update);
		run.journal.push({ Model: LinkedChange, id: doc._id, raw });
	};

	run.journal.push({ Model, id, raw: (await Model.collection.findOne({ _id: id })) || null });

	let doc = step.doc;
	if (Object.keys(step.incs).length) {
		// Added in the database, so two payments at once both count.
		await Model.updateOne({ _id: id }, { $inc: step.incs });
		doc = await Model.findById(id);
		for (const [k, v] of Object.entries(step.sets)) doc.set(k, v === null ? undefined : v);
		applyFormulas(doc, formulasOf(resolved.settings));
	}
	const after = (await doc.save()).toObject();

	if (step.kind === 'undo') {
		// Another record's change on this field took over from this one: hand it the value from before both.
		const others = await LinkedChange.find({ rule: rule.id, target: id, revertedAt: null, _id: { $ne: step.change._id } }).lean();
		for (const o of others)
			for (const [f, v] of Object.entries(step.change.after || {}))
				if (f in (o.after || {}) && same((o.before || {})[f], v)) await log(o._id, { $set: { [`before.${f}`]: (step.change.before || {})[f] ?? null } });
		await log(step.change._id, { $set: { revertedAt: new Date() } });
	} else if (step.change) {
		const set: any = {};
		for (const [k, v] of Object.entries(step.asserted)) {
			set[`after.${k}`] = v;
			if (!(k in (step.change.before || {}))) set[`before.${k}`] = get(step.before, k) ?? null;
		}
		const inc: any = {};
		for (const [k, d] of Object.entries(step.incs)) inc[`incs.${k}`] = d;
		await log(step.change._id, { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(inc).length && { $inc: inc }) });
	} else {
		await log(null, {
			rule: rule.id,
			ruleName: name,
			sourceRoute: source.route,
			sourceModel: source.Model.modelName,
			source: saved?._id || source.id,
			targetRoute: entry.route,
			targetModel: Model.modelName,
			target: id,
			before: Object.fromEntries(Object.keys(step.asserted).map(k => [k, get(step.before, k) ?? null])),
			after: step.asserted,
			incs: step.incs,
			by,
		});
	}

	const summary = summaryOf(step, after);
	if (summary.changes.length) run.summary.push(summary);
	const note = `(${step.kind === 'undo' ? 'taken back by' : 'by'} rule “${name}” from ${source.label})`;
	run.history.push(() =>
		recordHistory({ req: run.req, action: 'update', model: Model.modelName, doc: after, changes: summary.changes, modelPath: entry.route, note })
	);

	// The target's own rules: an invoice marked paid can change its client in turn.
	const next = await prepareLinked({
		req: run.req,
		resolved,
		Model,
		action: 'update',
		before: step.before,
		after,
		run: { ...run, depth: run.depth + 1 },
	});
	if (next?.error) throw new LinkedError(`${recordLabel(Model, after)}: ${next.error.message}`, 400, next.error.fields);
	if (next) await next.apply(after);
};

/** Puts back every record a failed run wrote, newest first. */
const rollback = async (journal: Journal) => {
	for (const j of [...journal].reverse()) {
		try {
			if (j.raw) await j.Model.collection.replaceOne({ _id: j.id }, j.raw);
			else await j.Model.collection.deleteOne({ _id: j.id });
		} catch (e: any) {
			console.error('Linked Relationships: putting back', j.Model.modelName, String(j.id), 'failed:', e?.message);
		}
	}
};

/** Whether the request's route has rules on — the controllers skip all of this when not. */
export const hasLinkedRules = (req: any) => linkedRulesOf(req?.resolvedRoute?.frontendConfig).length > 0;

/**
 * What a controller calls: the plan for this save, or null when the route
 * has no rules. Refuse with `prepared.error` (400) before saving; after the
 * save, `apply` — and if it throws, put the record itself back and answer
 * with `linkedFailure`.
 */
export const linkedFor = (req: any, Model: mongoose.Model<any>, action: LinkedAction, before: any, after: any) =>
	prepareLinked({ req, resolved: req.resolvedRoute, Model, action, before, after });

/** The response for a refusal or a failed apply. */
export const linkedFailure = (res: any, e: any) => {
	const status = e instanceof LinkedError ? e.status : 500;
	if (!(e instanceof LinkedError)) console.error('Linked Relationships failed:', e?.message);
	return res.status(status).json({ message: e?.message || 'A linked record could not be updated', ...(e?.fields && { fields: e.fields }) });
};
