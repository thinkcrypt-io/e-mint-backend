import mongoose from 'mongoose';
import Joi from 'joi';
import LinkedChange from '../models/linked-change/model.js';
import { LOCK_OPS, LockCondition, isRef, meets, lockedChanges, lockedMessage } from './fieldLocks.function.js';
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
	/** Take this number (or this record's number field) off — given back on undo. */
	dec?: string | number;
	/** With inc / dec: the field never goes below this — the save is refused instead (a balance can't go under 0). */
	min?: number;
	/** What the refusal says, instead of "not enough …". */
	message?: string;
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
	/** Also run for saves through the public API (a website, an app) — as the system. Off by default. */
	fromApi?: boolean;
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
	dec: Joi.alternatives(Joi.number(), Joi.string()),
	min: Joi.number(),
	message: Joi.string().allow('').max(300),
	clear: Joi.boolean().valid(true),
})
	.xor('value', 'from', 'formula', 'inc', 'dec', 'clear')
	.oxor('min', 'value')
	.oxor('min', 'from')
	.oxor('min', 'formula')
	.oxor('min', 'clear');

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
	fromApi: Joi.boolean(),
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

/** Conditions on `doc`; a value `{ ref: 'this.amount' }` compares with the record being saved (`self`, the doc itself by default). */
const holds = (doc: any, conds?: LockCondition[], match?: 'all' | 'any', self?: any) =>
	!conds?.length || meets(doc, conds, match === 'any' ? 'any' : 'all', { this: self ?? doc });

/** This record's fields a condition list compares with (`{ ref: 'this.amount' }`). */
const refsIn = (conds?: LockCondition[]) =>
	(conds || []).flatMap(c => (isRef(c?.value) && c.value.ref.startsWith('this.') ? [c.value.ref.slice(5)] : []));

/** An add or a take-off: the amount as written (a number, or this record's field). */
const stepOf = (a: Assignment) => (a.dec !== undefined ? a.dec : a.inc);
const isStep = (a: Assignment) => a.inc !== undefined || a.dec !== undefined;
/** This record's field an add or take-off reads, if it reads one. */
const stepField = (a: Assignment): string | undefined => {
	const v = stepOf(a);
	return typeof v === 'string' && v && !Number.isFinite(Number(v)) ? v : undefined;
};

/** Every field of this record a rule reads — an update re-runs it only when one of them changed. */
export const fieldsRead = (r: LinkedRule): string[] => {
	const out = new Set<string>([r.target.via, ...(r.require || [])]);
	(r.when || []).forEach(c => c?.field && out.add(c.field));
	[...refsIn(r.when), ...refsIn(r.target.when)].forEach(f => out.add(f));
	for (const a of r.set || []) {
		if (a.from) out.add(a.from);
		const f = stepField(a);
		if (f) out.add(f);
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

/** What an add (or, negative, a take-off) does to the field. */
const incOf = (a: Assignment, source: any): number => {
	const v = stepOf(a);
	const n = typeof v === 'number' ? v : Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : Number(get(source, String(v))) || 0;
	return a.dec !== undefined ? -n : n;
};

/** Fields this record must fill in while a rule holds: what it copies, adds or takes off, and asks for. */
const neededBy = (r: LinkedRule): string[] =>
	r.block ? [] : [...(r.require || []), ...(r.set || []).flatMap(a => [a.from, stepField(a)]).filter((x): x is string => !!x)];

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

/**
 * What a run wrote, to put back if it fails. A whole document (`raw`, null:
 * it didn't exist) for the change log; for a target only the fields the run
 * touched — `set` back to what they held, `inc` taken off again — so another
 * save that changed the same record meanwhile (a second transfer on the same
 * account) keeps its change.
 */
type Journal = { Model: mongoose.Model<any>; id: any; raw?: any | null; set?: Record<string, any>; inc?: Record<string, number> }[];

type Run = {
	req: any;
	can?: (entry: ResourceRouteEntry, verb: any) => boolean;
	seen: Set<string>;
	journal: Journal;
	summary: LinkedSummary[];
	history: (() => void)[];
	depth: number;
	/** Many records in one go (bulk edit, import…): the caller applies, finishes and rolls back. */
	batch?: boolean;
	/** A public-API save: only rules with `fromApi` start, and they run as the system. */
	api?: boolean;
};

const newRun = (req: any, extra: Partial<Run> = {}): Run => ({ req, seen: new Set(), journal: [], summary: [], history: [], depth: 0, ...extra });

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
	/** Fields that mustn't go below a number (`min`): checked here, and again in the write itself. */
	floors: Record<string, { min: number; message?: string }>;
};

type Source = { route: string; Model: mongoose.Model<any>; settings: Record<string, any>; label: string; id: any; values: any };

export type Prepared = {
	/** A 400 body when the save must be refused; null when it may go ahead. */
	error: { message: string; fields?: Record<string, string> } | null;
	/** What would change — the form's hint. */
	preview: LinkedSummary[];
	/** The form's hint before saving: only what's wrong, not what's still to fill in. */
	previewError: { message: string; fields?: Record<string, string> } | null;
	/** Labels of the fields the rules still need — the hint asks for them instead. */
	missing: string[];
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
	const system = rule.asSystem || run.api;
	if (!system && !(await can(run, entry, verb)))
		throw new LinkedError(`You can't ${verb === 'edit' ? 'change' : 'see'} ${title} records, so “${rule.name || rule.id}” can't run.`, 403);
	const Model = entry.source.Model;
	const and: any[] = [{ _id: id }, ownRecordsOf(Model)];
	if (!system && isAccessRestricted(Model)) and.push(accessRule(run.req.user?._id));
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

/** Floors (`min`) on the fields this rule adds to or takes off. */
const floorsOf = (rule: LinkedRule): Step['floors'] =>
	Object.fromEntries((rule.set || []).filter(a => isStep(a) && typeof a.min === 'number').map(a => [a.field, { min: a.min as number, message: a.message || undefined }]));

/**
 * A take-off that would leave a field below its floor: the refusal. "Not
 * enough Balance on Account Cash: it has 50, this needs 80."
 */
const floorProblem = (step: Step, field: string, d: number, now = Number(get(step.before, field)) || 0): string | null => {
	const floor = step.floors[field];
	if (!floor || d >= 0 || now + d >= floor.min) return null;
	if (floor.message) return floor.message;
	const label = labelOf(step.resolved.settings, field);
	const keep = floor.min ? ` and keep ${floor.min}` : '';
	return `Not enough ${label} on ${recordLabel(step.Model, step.before)}: it has ${now}, this needs ${-d}${keep}.`;
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
	// A public-API save starts only the rules that opt in; what they change in turn runs as usual.
	const rules = linkedRulesOf(resolved?.frontendConfig).filter(r => !run.api || run.depth > 0 || r.fromApi);
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
	/** Blank fields a rule needs: refused on save, only asked for in the preview. */
	const needed: Record<string, string> = {};

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
					if (holds(t.doc.toObject(), rule.target.when, rule.target.match, values)) messages.push(rule.block.message);
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
				const step: Step = { kind: 'undo', rule, ...t, before: t.doc.toObject(), sets: {}, incs: {}, asserted: {}, change, floors: floorsOf(rule) };
				const others = await LinkedChange.find({ rule: rule.id, target: change.target, revertedAt: null, _id: { $ne: change._id } }).lean();
				for (const [f, v] of Object.entries(change.after || {})) {
					// Someone changed it since, or another record's rule still holds it: left as it is.
					if (!same(get(step.before, f), v) || others.some((o: any) => f in (o.after || {}))) continue;
					step.sets[f] = (change.before || {})[f] ?? null;
				}
				for (const [f, d] of Object.entries(change.incs || {})) if (Number(d)) step.incs[f] = -Number(d);
				// Giving back what was added can't take a field below its floor either.
				for (const [f, d] of Object.entries(step.incs)) {
					const problem = floorProblem(step, f, d);
					if (problem) throw new LinkedError(`“${name}” can't be taken back: ${problem}`);
				}
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
			for (const f of neededBy(rule)) if (blank(get(values, f))) needed[f] = `${labelOf(source.settings, f)} is needed for “${name}”.`;

		const targets = now ? idsOf(get(values, rule.target.via)) : [];
		if (action !== 'delete') for (const c of mine) if (!targets.includes(String(c.target))) await takeBack(c);

		for (const id of targets) {
			const key = `${source.id}:${rule.id}:${id}`;
			if (run.seen.has(key)) continue;
			run.seen.add(key);
			try {
				const t = await loadTarget(run, rule, source, id, 'edit');
				const targetBefore = t.doc.toObject();
				if (!holds(targetBefore, rule.target.when, rule.target.match, values)) continue;
				const change = mine.find(c => String(c.target) === id);
				const step: Step = { kind: 'apply', rule, ...t, before: targetBefore, sets: {}, incs: {}, asserted: {}, change, floors: floorsOf(rule) };
				let short = false;
				for (const a of rule.set || []) {
					if (isStep(a)) {
						// Only the difference from what this record added last time.
						const d = incOf(a, values) - (Number(change?.incs?.[a.field]) || 0);
						if (d) step.incs[a.field] = (step.incs[a.field] || 0) + d;
						const problem = floorProblem(step, a.field, step.incs[a.field] || 0);
						if (problem) {
							// Said under the field it takes off, when it's one of this record's.
							const f = stepField(a);
							if (f && !fields[f] && !needed[f]) fields[f] = problem;
							else messages.push(problem);
							short = true;
						}
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
				if (short) continue;
				await checkTarget(step, true);
				steps.push(step);
			} catch (e) {
				fail(e);
			}
		}
	}

	const errorOf = (fields: Record<string, string>) =>
		messages.length || Object.keys(fields).length ? { message: [...messages, ...Object.values(fields)].join(' '), ...(Object.keys(fields).length > 0 && { fields }) } : null;

	return {
		error: errorOf({ ...needed, ...fields }),
		previewError: errorOf(fields),
		missing: [...new Set(Object.keys(needed).map(f => labelOf(source.settings, f)))],
		preview: steps.map(s => summaryOf(s, s.doc.toObject())).filter(s => s.changes.length),
		apply: async (saved?: any) => {
			const top = run.depth === 0 && !run.batch;
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

	// Written from the record as it is now, not as it was when checked: in a
	// batch an earlier row may have changed it (or its log) since.
	const current = await Model.findById(id);
	if (!current) throw new LinkedError(`${recordLabel(Model, step.before)} was removed while this was being saved.`, 409);
	step.before = current.toObject();
	if (step.kind === 'undo') {
		// Fields that still hold what this change set, and that no other record's change holds.
		step.change = (await LinkedChange.findById(step.change._id).lean()) || step.change;
		const others = await LinkedChange.find({ rule: rule.id, target: id, revertedAt: null, _id: { $ne: step.change._id } }).lean();
		step.sets = {};
		for (const [f, v] of Object.entries(step.change.after || {}))
			if (same(get(step.before, f), v) && !others.some((o: any) => f in (o.after || {}))) step.sets[f] = (step.change.before || {})[f] ?? null;
		// Another record's change on this field took over from this one: hand it the value from before both.
		for (const o of others)
			for (const [f, v] of Object.entries(step.change.after || {}))
				if (f in (o.after || {}) && same((o.before || {})[f], v)) await log(o._id, { $set: { [`before.${f}`]: (step.change.before || {})[f] ?? null } });
	}

	let doc = current;
	if (Object.keys(step.incs).length) {
		// Added in the database, so two payments at once both count. A field
		// with a floor is only taken down while it still has enough: two
		// transfers at once can't both spend the same balance.
		const guard: Record<string, any> = { _id: id };
		for (const [f, d] of Object.entries(step.incs)) if (step.floors[f] && d < 0) guard[f] = { $gte: step.floors[f].min - d };
		const done = await Model.updateOne(guard, { $inc: step.incs });
		if (done.matchedCount) run.journal.push({ Model, id, inc: Object.fromEntries(Object.entries(step.incs).map(([k, d]) => [k, -d])) });
		else {
			const fresh = await Model.findById(id).lean();
			if (fresh) step.before = fresh;
			const problem = Object.entries(step.incs)
				.map(([f, d]) => floorProblem(step, f, d))
				.find(Boolean);
			throw new LinkedError(problem || `${recordLabel(Model, step.before)} changed while this was being saved — try again.`, 409);
		}
		doc = await Model.findById(id);
	}
	for (const [k, v] of Object.entries(step.sets)) doc.set(k, v === null ? undefined : v);
	applyFormulas(doc, formulasOf(resolved.settings));
	// What the save sets (the rule's fields and the formulas they move), as they were.
	const paths: string[] = doc.modifiedPaths();
	const touched = paths.filter(k => !paths.some(p => k !== p && k.startsWith(`${p}.`)));
	const was = touched.length ? await Model.collection.findOne({ _id: id }, { projection: Object.fromEntries(touched.map(k => [k, 1])) }) : null;
	const after = (await doc.save()).toObject();
	if (touched.length) run.journal.push({ Model, id, set: Object.fromEntries(touched.map((k: string) => [k, get(was, k)])) });

	if (step.kind === 'undo') {
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
			if (j.set || j.inc) {
				const $set: Record<string, any> = {};
				const $unset: Record<string, ''> = {};
				for (const [k, v] of Object.entries(j.set || {})) if (v === undefined) $unset[k] = '';
				else $set[k] = v;
				const update: any = {};
				if (Object.keys($set).length) update.$set = $set;
				if (Object.keys($unset).length) update.$unset = $unset;
				if (j.inc && Object.keys(j.inc).length) update.$inc = j.inc;
				if (Object.keys(update).length) await j.Model.collection.updateOne({ _id: j.id }, update);
			} else if (j.raw) await j.Model.collection.replaceOne({ _id: j.id }, j.raw);
			else await j.Model.collection.deleteOne({ _id: j.id });
		} catch (e: any) {
			console.error('Linked Relationships: putting back', j.Model.modelName, String(j.id), 'failed:', e?.message);
		}
	}
};

/**
 * Many records saved in one go — bulk edit, status, delete and undo, import.
 * Every record is prepared first (`error` lists the rows that can't go
 * ahead, nothing written), then the caller saves them all and calls `apply`
 * with the saved records in the same order. One failure puts back every
 * linked change of the batch and throws; the caller puts its own rows back.
 */
export const linkedMany = async (
	req: any,
	Model: mongoose.Model<any>,
	items: { action: LinkedAction; before: any; after: any; label?: string }[],
	opts: { resolved?: ResolvedRoute; api?: boolean } = {}
) => {
	const run = newRun(req, { batch: true, api: opts.api });
	const resolved = opts.resolved || req.resolvedRoute;
	const plans: (Prepared | null)[] = [];
	const problems: { index: number; message: string; fields?: Record<string, string> }[] = [];
	for (const [index, it] of items.entries()) {
		const plan = await prepareLinked({ req, resolved, Model, action: it.action, before: it.before, after: it.after, run });
		if (plan?.error) problems.push({ index, ...plan.error, message: it.label ? `${it.label}: ${plan.error.message}` : plan.error.message });
		plans.push(plan);
	}
	return {
		error: problems.length ? { message: problems.map(p => p.message).join(' '), problems } : null,
		any: plans.some(Boolean),
		apply: async (saved: any[] = []) => {
			try {
				for (const [i, plan] of plans.entries()) if (plan) await plan.apply(saved[i]);
				run.history.forEach(h => h());
				return run.summary;
			} catch (e) {
				await rollback(run.journal);
				throw e;
			}
		},
	};
};

/** One public-API save: only rules with `fromApi`, run as the system. */
export const linkedForApi = (req: any, resolved: ResolvedRoute, Model: mongoose.Model<any>, action: LinkedAction, before: any, after: any) =>
	prepareLinked({ req, resolved, Model, action, before, after, run: newRun(req, { api: true }) });

/**
 * The form's side of the rules, set on the schema the forms are built from:
 * `requiredIf` on a field a rule copies or asks for (required while the
 * rule's conditions hold — the panel shows the asterisk), and `linkedReads`
 * + `linkedRoute` on a field a rule reads, so the form can show what saving
 * will change in the records it picks (POST /<route>/linked/preview).
 */
export const withLinkedHints = (schema: Record<string, any>, config: any, route?: string | null) => {
	const rules = linkedRulesOf(config);
	if (!rules.length) return schema;
	const out: Record<string, any> = { ...schema };
	for (const r of rules) {
		const name = r.name || r.id;
		for (const f of neededBy(r))
			if (out[f])
				out[f] = { ...out[f], requiredIf: [...(out[f].requiredIf || []), { when: r.when || [], match: r.match === 'any' ? 'any' : 'all', rule: name }] };
		for (const f of fieldsRead(r))
			if (out[f]) out[f] = { ...out[f], linkedReads: [...new Set([...(out[f].linkedReads || []), name])], ...(route && { linkedRoute: route }) };
	}
	return out;
};

/**
 * POST /<route>/linked/preview { id?, values } — what saving these form
 * values would change in the records they pick, or why it would be refused.
 * Nothing is written. `id` for an edit (the values go over the stored record).
 */
export const previewLinked = (Model: mongoose.Model<any>) => async (req: any, res: any) => {
	try {
		if (!hasLinkedRules(req)) return res.status(200).json({ changes: [], error: null });
		const values = { ...(req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}) };
		for (const k of ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'addedBy']) delete values[k];
		const id = req.body?.id;
		let before: any = null;
		let doc: any;
		if (id && mongoose.isValidObjectId(id)) {
			doc = await Model.findOne({ $and: [{ _id: id }, ownRecordsOf(Model)].filter(x => Object.keys(x).length) });
			if (!doc) return res.status(404).json({ message: 'Record not found' });
			before = doc.toObject();
			for (const [k, v] of Object.entries(values)) {
				try {
					doc.set(k, v);
				} catch {
					/* a value the field can't take: the save will say so */
				}
			}
		} else doc = new Model({ ...values, addedBy: req.user?._id });
		applyFormulas(doc, formulasOf(req.resolvedRoute?.settings));
		const plan = await prepareLinked({ req, resolved: req.resolvedRoute, Model, action: before ? 'update' : 'create', before, after: doc.toObject() });
		return res.status(200).json({ changes: plan?.preview || [], error: plan?.previewError || null, missing: plan?.missing || [] });
	} catch (e: any) {
		return res.status(500).json({ message: e?.message || 'Could not work out the linked changes' });
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
