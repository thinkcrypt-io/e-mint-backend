import { recordProjectEvent } from '../../functions/recordHistory.function.js';
import mongoose from 'mongoose';
import { Feature, ModelDefinition } from '../../models/builder/_index.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import {
	Availability,
	ModelDef,
	REFERENCE_KINDS,
	checkAvailability,
	linkTargets,
	singular,
	syncDynamicModels,
	toModelName,
} from '../../functions/dynamicModels.function.js';
import { listModelFields } from '../../functions/routeRegistry.function.js';
import { BuildError, buildPreview, checkCopies, createModelCore, deleteModelCore, updateModelCore } from './models.controller.js';
import { applyLayout } from './ai.controller.js';
import { effectiveConfig, publishConfigPatch } from './builder.controller.js';
import { PROTECTED_ROUTES } from './validate.js';

/**
 * A feature: several models built together, with the links between them.
 *
 * A plan is a list of steps —
 *   create: a new model (the model builder's definition, plus an optional page
 *           layout: table columns, filters, form and view sections, button);
 *   update: an existing model — fields added to it or changed, when it was
 *           built in the model builder; code models keep their fields, but
 *           can still get tabs.
 * — and each step can carry tabs: a list of another model's records on this
 * model's detail page (a client's invoices). Every link a step makes gets a
 * tab suggested on the page it points at, on by default.
 *
 * `planFeature` checks a plan without writing anything: the same checks the
 * model builder runs on each model, with the batch's own models allowed as
 * link targets. `buildFeature` builds it — new models in link order (a cycle
 * is closed with a second pass), then the changes to existing ones, then the
 * tabs — and undoes everything done so far if any step fails.
 *
 * The feature wizard (admin /model-builder/features/new) and the MCP tools
 * (library/controllers/mcp) both go through here.
 */

export const MAX_STEPS = 12;
/** A template (docs/templates TD7) is a whole app, checked and built as one plan. */
export const TEMPLATE_MAX_STEPS = 40;

type PlanOptions = { maxSteps?: number };

export type TabPlan = { from: string; fromRoute: string; field: string; title: string; enabled: boolean; suggested: boolean };
export type LinkPlan = { field: string; label: string; to: string; toRoute: string; many: boolean };

type StepBase = {
	index: number;
	rationale: string;
	tabs: TabPlan[];
	links: LinkPlan[];
	problems: string[];
};

export type CreateStep = StepBase & {
	action: 'create';
	requested: string;
	name: string;
	route: string;
	title: string;
	description: string;
	displayField: string;
	code: any;
	access: any;
	fields: any[];
	table?: string[];
	filters?: string[];
	form?: any[];
	view?: any[];
	buttonTitle?: string;
	sidebarCategory: string | null;
	availability: Availability | null;
};

export type UpdateStep = StepBase & {
	action: 'update';
	model: string;
	route: string;
	title: string;
	built: boolean;
	modelId: string | null;
	/** Added by the plan itself, only to carry the tabs its links suggest. */
	synthesized: boolean;
	existingFields: { key: string; label: string; kind: string; ref?: string }[];
	addFields: any[];
	changeFields: any[];
};

export type Step = CreateStep | UpdateStep;

export type FeaturePlan = {
	title: string;
	description: string;
	summary: string;
	sidebarCategory: string | null;
	/** Put the new pages in a new sidebar category, named after the feature. */
	newCategory: boolean;
	steps: Step[];
	relations: { from: string; field: string; to: string; many: boolean }[];
	problems: string[];
	ok: boolean;
};

const str = (v: any, max = 300) => String(v ?? '').trim().slice(0, max);
const lower = (v: string) => v.toLowerCase();
const isRef = (f: any) => REFERENCE_KINDS.includes(f?.kind);

/** What a code model's schema holds, in the builder's terms (no secrets, no system paths). */
const codeFields = (name: string) => {
	const Model = mongoose.models[name];
	if (!Model) return [];
	return listModelFields(Model)
		.filter(f => !['_id', 'createdAt', 'updatedAt'].includes(f.key) && !f.key.includes('.'))
		.map(f => ({
			key: f.key,
			label: f.key,
			kind: f.ref ? (f.isArray ? 'references' : 'reference') : f.enum ? 'select' : lower(String(f.instance || 'mixed')),
			...(f.ref && { ref: f.ref }),
		}));
};

/**
 * Every model a feature can link to or change, with its fields — for the AI
 * prompt, the MCP `list_models` / `get_model` tools and the wizard.
 */
export const modelCatalog = async (app: any) => {
	const [targets, defs] = await Promise.all([linkTargets(app), ModelDefinition.find({}).lean()]);
	const byName = new Map((defs as any[]).map(d => [d.name, d]));
	return targets.map((t: any) => {
		const def: any = byName.get(t.name);
		return {
			name: t.name,
			title: t.title || def?.title || t.name,
			route: t.route,
			built: !!def,
			protected: PROTECTED_ROUTES.has(t.route),
			display: t.display,
			...(def && { id: String(def._id), description: def.description || '' }),
			fields: def
				? (def.fields || []).map((f: any) => ({ key: f.key, label: f.label || f.key, kind: f.kind, ...(f.ref && { ref: f.ref }), ...(f.required && { required: true }) }))
				: codeFields(t.name),
		};
	});
};

/** A definition body (what createModel / updateModel take) from a saved definition. */
const bodyOf = (d: any) => ({
	title: d.title,
	description: d.description || '',
	displayField: d.displayField || '',
	code: d.code,
	access: d.access,
	fields: d.fields,
	active: d.active !== false,
});

const categoryId = async (value: any): Promise<string | null> => {
	const v = str(value, 200);
	if (!v) return null;
	if (mongoose.isValidObjectId(v) && (await SidebarCategory.exists({ _id: v }))) return v;
	const found: any = await SidebarCategory.findOne({ name: new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, { _id: 1 }).lean();
	return found ? String(found._id) : null;
};

/* ------------------------------------------------------------- planning */

export const planFeature = async (req: any, input: any, opts: PlanOptions = {}): Promise<FeaturePlan> => {
	const app = req.app;
	const maxSteps = Math.min(opts.maxSteps || MAX_STEPS, TEMPLATE_MAX_STEPS);
	await syncDynamicModels({ app });
	const problems: string[] = [];

	const title = str(input?.title, 120);
	if (!title) problems.push('Give the feature a title');
	const raw: any[] = Array.isArray(input?.steps) ? input.steps.filter((s: any) => s && typeof s === 'object') : [];
	if (!raw.length) problems.push('A feature needs at least one step');
	if (raw.length > maxSteps) problems.push(`At most ${maxSteps} steps in one ${maxSteps > MAX_STEPS ? 'template' : 'feature — split it in two'}`);

	const catalog = await modelCatalog(app);
	const existing = new Map(catalog.map(c => [lower(c.name), c]));
	const defs = new Map(((await ModelDefinition.find({}).lean()) as any[]).map(d => [d.name, d]));

	const defaultCategory = await categoryId(input?.sidebarCategory);
	const newCategory = !defaultCategory && input?.sidebarCategory === 'new';

	/* 1. The name each new model registers as, and how refs name it. */
	const alias = new Map<string, string>();
	const takenRoutes = new Set<string>();
	const creates: CreateStep[] = [];
	const updates: UpdateStep[] = [];
	const steps: Step[] = [];

	for (const [index, s] of raw.slice(0, maxSteps).entries()) {
		const action = s.action === 'update' ? 'update' : 'create';
		const base = { index, rationale: str(s.rationale, 1500), tabs: [], links: [], problems: [] as string[] };
		if (action === 'create') {
			const stepTitle = str(s.title, 80);
			const requested = toModelName(str(s.name, 60) || singular(stepTitle));
			const step: CreateStep = {
				...base,
				action,
				requested,
				name: requested,
				route: '',
				title: stepTitle,
				description: str(s.description, 300),
				displayField: str(s.displayField, 40),
				code: s.code,
				access: s.access,
				fields: Array.isArray(s.fields) ? s.fields : [],
				...(Array.isArray(s.table) && { table: s.table }),
				...(Array.isArray(s.filters) && { filters: s.filters }),
				...(Array.isArray(s.form) && { form: s.form }),
				...(Array.isArray(s.view) && { view: s.view }),
				...(s.buttonTitle && { buttonTitle: str(s.buttonTitle, 60) }),
				sidebarCategory: (await categoryId(s.sidebarCategory)) || defaultCategory,
				availability: null,
			};
			if (!stepTitle) step.problems.push('Give the model a title');
			if (!requested) step.problems.push('The model name must start with a letter (e.g. “Leave request”)');
			else if (existing.has(lower(requested)))
				step.problems.push(
					`A model named ${existing.get(lower(requested))!.name} already exists — link to it, or change it with an update step`
				);
			else if (alias.has(lower(requested))) step.problems.push(`Two steps create ${requested}`);
			else {
				let availability = await checkAvailability(app, requested, str(s.route, 60) || undefined);
				for (let n = 2; availability && takenRoutes.has(availability.route) && n < 50; n++)
					availability = await checkAvailability(app, `${requested}${n}`);
				if (!availability) step.problems.push('The model name must start with a letter');
				else {
					step.availability = availability;
					step.name = availability.name;
					step.route = availability.route;
					takenRoutes.add(availability.route);
					alias.set(lower(requested), availability.name);
					if (stepTitle) alias.set(lower(toModelName(singular(stepTitle))), availability.name);
				}
			}
			creates.push(step);
			steps.push(step);
		} else {
			const wanted = str(s.model, 60);
			const target = existing.get(lower(toModelName(wanted))) || existing.get(lower(wanted));
			const def: any = target ? defs.get(target.name) : null;
			const step: UpdateStep = {
				...base,
				action,
				model: target?.name || wanted,
				route: target?.route || '',
				title: target?.title || wanted,
				built: !!def,
				modelId: def ? String(def._id) : null,
				synthesized: false,
				existingFields: target?.fields || [],
				addFields: Array.isArray(s.addFields) ? s.addFields : [],
				changeFields: Array.isArray(s.changeFields) ? s.changeFields : [],
			};
			if (!target) step.problems.push(`There's no model named “${wanted}” to change`);
			else if (target.protected) step.problems.push(`${target.name} controls access and can't be changed here`);
			else if (updates.some(u => u.model === target.name)) step.problems.push(`Two steps change ${target.name} — put the changes in one`);
			updates.push(step);
			steps.push(step);
		}
	}

	/** A ref as the batch knows it: a new model's final name, or an existing model's exact one. */
	const resolve = (ref: any, selfName: string) => {
		const r = str(ref, 80);
		if (!r || r === '__self__') return selfName;
		const key = lower(toModelName(r));
		return alias.get(key) || existing.get(key)?.name || existing.get(lower(r))?.name || r;
	};
	const resolveFields = (fields: any[], selfName: string) =>
		fields.map(f => (isRef(f) ? { ...f, ref: resolve(f.ref, selfName) } : f));

	for (const c of creates) c.fields = resolveFields(c.fields, c.name);
	for (const u of updates) {
		u.addFields = resolveFields(u.addFields, u.model);
		u.changeFields = resolveFields(u.changeFields, u.model);
	}

	// Definitions of the batch's new models, so links between them check and generate.
	const extraDefs: ModelDef[] = creates
		.filter(c => c.availability)
		.map(c => ({
			name: c.name,
			route: c.route,
			collectionName: c.availability!.collectionName,
			title: c.title || c.name,
			permission: c.route,
			displayField: c.displayField || undefined,
			code: c.code,
			access: c.access,
			fields: c.fields,
			active: true,
		}));

	/* 2. Each model, checked as the model builder would. */
	for (const c of creates) {
		if (!c.availability || c.problems.length) continue;
		const body = {
			name: c.name,
			route: c.route,
			title: c.title,
			description: c.description,
			displayField: c.displayField,
			code: c.code,
			access: c.access,
			fields: c.fields,
		};
		const preview = await buildPreview(req, body, { extraDefs, availability: c.availability });
		if (preview.problems) c.problems.push(...(preview.problems.length ? preview.problems : [preview.message]));
		else {
			c.fields = preview.value.fields;
			c.displayField = preview.value.displayField || '';
			c.code = preview.value.code;
			c.access = preview.value.access;
		}
	}

	for (const u of updates) {
		if (u.problems.length) continue;
		if (!u.built) {
			if (u.addFields.length || u.changeFields.length)
				u.problems.push(
					`${u.model} is defined in code, so its fields can't change here — put the link on the new model instead (its records can still show as a tab on the ${u.title} page)`
				);
			continue;
		}
		const def: any = defs.get(u.model);
		const keys = new Map<string, any>(def.fields.map((f: any) => [lower(f.key), f]));
		for (const f of u.addFields)
			if (keys.has(lower(str(f?.key, 40)))) u.problems.push(`${u.model} already has “${f.key}” — list it under the changed fields`);
		for (const f of u.changeFields) {
			const was = keys.get(lower(str(f?.key, 40)));
			if (!was) u.problems.push(`${u.model} has no field “${f?.key}” to change`);
			else if (f.kind && f.kind !== was.kind) u.problems.push(`“${f.key}” is a ${was.kind} field — a feature build can't change its kind`);
		}
		if (u.problems.length) continue;
		const changed = new Map(u.changeFields.map((f: any) => [lower(f.key), f]));
		const merged = [
			...def.fields.map((f: any) => (changed.has(lower(f.key)) ? { ...f, ...changed.get(lower(f.key)), key: f.key, kind: f.kind } : f)),
			...u.addFields,
		];
		const availability: Availability = {
			requested: def.name,
			name: def.name,
			route: def.route,
			collectionName: def.collectionName,
			changed: false,
			reasons: [],
		};
		const preview = await buildPreview(req, { ...bodyOf(def), fields: merged }, { extraDefs, availability });
		if (preview.problems) u.problems.push(...(preview.problems.length ? preview.problems : [preview.message]));
		else {
			const checked = new Map<string, any>(preview.value.fields.map((f: any) => [lower(f.key), f]));
			u.addFields = u.addFields.map(f => checked.get(lower(f.key)) || f);
			u.changeFields = u.changeFields.map(f => ({ ...(checked.get(lower(f.key)) || f), before: keys.get(lower(f.key)) }));
		}
	}

	/* 3. Links, and the tabs they suggest on the page they point at. */
	const routeOf = (name: string) => creates.find(c => c.name === name)?.route || existing.get(lower(name))?.route || '';
	const titleOf = (name: string) => creates.find(c => c.name === name)?.title || existing.get(lower(name))?.title || name;
	const stepFor = (name: string): Step | undefined =>
		creates.find(c => c.name === name) || updates.find(u => u.model === name);

	const relations: FeaturePlan['relations'] = [];
	const linking: { from: string; field: any }[] = [];
	for (const c of creates) linking.push(...c.fields.filter(isRef).map(field => ({ from: c.name, field })));
	for (const u of updates) linking.push(...u.addFields.filter(isRef).map(field => ({ from: u.model, field })));

	for (const { from, field } of linking) {
		const link: LinkPlan = {
			field: field.key,
			label: field.label || field.key,
			to: field.ref,
			toRoute: routeOf(field.ref),
			many: field.kind === 'references',
		};
		stepFor(from)?.links.push(link);
		relations.push({ from, field: field.key, to: field.ref, many: link.many });
		if (field.ref === from || !link.toRoute || PROTECTED_ROUTES.has(link.toRoute)) continue;

		let target = stepFor(field.ref);
		if (!target) {
			const t = existing.get(lower(field.ref));
			if (!t) continue;
			const u: UpdateStep = {
				index: steps.length,
				action: 'update',
				rationale: `Adds a “${titleOf(from)}” tab to the ${t.title} page, listing the records linked to each one.`,
				tabs: [],
				links: [],
				problems: [],
				model: t.name,
				route: t.route,
				title: t.title,
				built: t.built,
				modelId: t.built ? (t as any).id : null,
				synthesized: true,
				existingFields: t.fields,
				addFields: [],
				changeFields: [],
			};
			updates.push(u);
			steps.push(u);
			target = u;
		}
		target.tabs.push({
			from,
			fromRoute: routeOf(from),
			field: field.key,
			title: titleOf(from),
			enabled: true,
			suggested: true,
		});
	}

	// Tabs the plan names itself: switch a suggested one off, retitle it, or add one.
	for (const [i, s] of raw.slice(0, maxSteps).entries()) {
		const step = steps[i];
		if (!step || !Array.isArray(s.tabs)) continue;
		for (const t of s.tabs) {
			const from = resolve(t?.from, '');
			const fieldKey = str(t?.field, 40);
			const found = step.tabs.find(x => x.from === from && x.field === fieldKey);
			if (found) {
				if (typeof t.enabled === 'boolean') found.enabled = t.enabled;
				if (t.title) found.title = str(t.title, 60);
				continue;
			}
			const ownName = step.action === 'create' ? step.name : step.model;
			const fromFields = creates.find(c => c.name === from)?.fields || existing.get(lower(from))?.fields || [];
			const ref = fromFields.find((f: any) => f.key === fieldKey && isRef(f));
			if (!ref || ref.ref !== ownName) {
				step.problems.push(`Tab: ${from || t?.from}.${fieldKey || '?'} doesn't link to ${ownName}`);
				continue;
			}
			step.tabs.push({ from, fromRoute: routeOf(from), field: fieldKey, title: str(t.title, 60) || titleOf(from), enabled: t.enabled !== false, suggested: false });
		}
	}

	const ok = !problems.length && steps.every(s => !s.problems.length);
	return {
		title,
		description: str(input?.description, 4000),
		summary: str(input?.summary, 2000),
		sidebarCategory: defaultCategory,
		newCategory,
		steps,
		relations,
		problems,
		ok,
	};
};

/** Every problem in a plan, each naming its step. */
export const planProblems = (plan: FeaturePlan) => [
	...plan.problems,
	...plan.steps.flatMap(s =>
		s.problems.map(p => `Step ${s.index + 1} (${s.action === 'create' ? `new ${s.name || s.title}` : `change ${s.model}`}): ${p}`)
	),
];

/* ------------------------------------------------------------- building */

/** New models in link order: a model comes after the new models it links to (a cycle keeps its order). */
const linkOrder = (creates: CreateStep[]) => {
	const names = new Set(creates.map(c => c.name));
	const done = new Set<string>();
	const out: CreateStep[] = [];
	const visiting = new Set<string>();
	const visit = (c: CreateStep) => {
		if (done.has(c.name) || visiting.has(c.name)) return;
		visiting.add(c.name);
		for (const f of c.fields)
			if (isRef(f) && f.ref !== c.name && names.has(f.ref)) visit(creates.find(x => x.name === f.ref)!);
		visiting.delete(c.name);
		done.add(c.name);
		out.push(c);
	};
	creates.forEach(visit);
	return out;
};

/** A tab's columns: the linked route's table columns, without the link back. */
const tabColumns = async (app: any, route: string, foreignField: string) => {
	const config = await effectiveConfig(app, route);
	const cols = (Array.isArray(config?.table) ? config.table : [])
		.map((c: any) => (typeof c === 'string' ? c : c?.key || c?.dataKey))
		.filter((c: any) => typeof c === 'string' && c && c !== foreignField && !c.includes('.'))
		.slice(0, 5);
	return cols.length ? cols : ['createdAt'];
};

export type BuildResult = {
	feature: any;
	created: { name: string; title: string; route: string; id: string }[];
	updated: { name: string; title: string; route: string; added: string[]; changed: string[] }[];
	tabs: { page: string; route: string; title: string; from: string }[];
	category: string | null;
	warnings: string[];
};

/**
 * Builds a plan — checked again first, whatever the caller checked before.
 * All or nothing: a failure undoes what this call did, newest first.
 */
export const buildFeature = async (
	req: any,
	input: any,
	opts: { source: 'wizard' | 'mcp' | 'template'; apiKey?: any; maxSteps?: number }
): Promise<BuildResult> => {
	const app = req.app;
	const plan = await planFeature(req, input, { maxSteps: opts.maxSteps });
	if (!plan.ok) throw new BuildError(400, 'The feature has problems, so nothing was built', planProblems(plan));

	const note = `Built with the feature “${plan.title}”`;
	const undo: (() => Promise<any>)[] = [];
	const result: BuildResult = { feature: null, created: [], updated: [], tabs: [], category: null, warnings: [] };

	try {
		// A category of its own for the new pages, named after the feature.
		let newCategory: string | null = null;
		if (plan.newCategory && plan.steps.some(s => s.action === 'create')) {
			const top: any = await SidebarCategory.findOne({}, { priority: 1 }).sort({ priority: -1 }).lean();
			const cat = await SidebarCategory.create({
				name: plan.title,
				description: plan.summary || plan.description || `Pages of ${plan.title}`,
				priority: (top?.priority || 0) + 10,
				icon: 'blocks',
				isActive: true,
			});
			newCategory = String(cat._id);
			result.category = newCategory;
			undo.push(() => SidebarCategory.deleteOne({ _id: cat._id }));
		}

		const creates = linkOrder(plan.steps.filter((s): s is CreateStep => s.action === 'create'));
		const extraDefs: ModelDef[] = creates.map(c => ({
			name: c.name,
			route: c.route,
			collectionName: c.availability!.collectionName,
			title: c.title,
			permission: c.route,
			displayField: c.displayField || undefined,
			code: c.code,
			access: c.access,
			fields: c.fields,
			active: true,
		}));

		// New models first. A link to a new model not made yet (a cycle) waits for the second pass.
		const made = new Map<string, string>();
		const later: { id: string; body: any }[] = [];
		for (const c of creates) {
			const pending = new Set(creates.filter(x => x.name !== c.name && !made.has(x.name)).map(x => x.name));
			const fields = c.fields.filter(f => !(isRef(f) && pending.has(f.ref)));
			const body: any = {
				name: c.name,
				route: c.route,
				title: c.title,
				description: c.description,
				displayField: fields.some(f => f.key === c.displayField) || c.displayField === 'code' ? c.displayField : '',
				code: c.code,
				access: c.access,
				fields,
				sidebar: { category: c.sidebarCategory || newCategory || '' },
			};

			// The page as the plan laid it out; a layout that doesn't fit falls back to the generated one.
			if (c.table || c.filters || c.form || c.view || c.buttonTitle) {
				const preview = await buildPreview(req, body, { extraDefs, availability: c.availability! });
				if (!preview.problems) {
					const laid = applyLayout(c, preview.def, preview.settings, preview.config);
					const copies = await checkCopies(app, preview.def, laid.settings, laid.config);
					if (copies.problems.length) result.warnings.push(`${c.title}: the suggested page layout didn’t fit, so the generated one is used`);
					else Object.assign(body, { settings: copies.settings, config: copies.config });
				}
			}

			const r = await createModelCore(req, body, { availability: c.availability!, note });
			const id = String(r.doc._id);
			made.set(c.name, id);
			undo.push(() => deleteModelCore(req, id, { dropData: true, ignoreLinks: true }));
			result.created.push({ name: r.doc.name, title: r.doc.title, route: r.doc.route, id });
			result.warnings.push(...(r.warnings || []).map((w: string) => `${c.title}: ${w}`));
			if (fields.length !== c.fields.length) later.push({ id, body: { ...body, fields: c.fields, displayField: c.displayField } });
		}
		for (const { id, body } of later) {
			const { settings, config, sidebar, ...rest } = body;
			await updateModelCore(req, id, rest, { note });
		}

		// Existing models built in the model builder: the fields added and changed.
		for (const u of plan.steps.filter((s): s is UpdateStep => s.action === 'update')) {
			if (!u.built || !u.modelId || (!u.addFields.length && !u.changeFields.length)) continue;
			const def: any = await ModelDefinition.findById(u.modelId).lean();
			const changed = new Map(u.changeFields.map(({ before, ...f }: any) => [lower(f.key), f]));
			const fields = [...def.fields.map((f: any) => changed.get(lower(f.key)) || f), ...u.addFields];
			const r = await updateModelCore(req, u.modelId, { ...bodyOf(def), fields }, { note });
			undo.push(() => updateModelCore(req, u.modelId, bodyOf(r.before), { note: `Undoing “${plan.title}”` }));
			result.updated.push({
				name: u.model,
				title: u.title,
				route: u.route,
				added: u.addFields.map(f => f.key),
				changed: u.changeFields.map(f => f.key),
			});
		}

		// Tabs, now that every route they name exists.
		await syncDynamicModels({ app, force: true });
		for (const s of plan.steps) {
			const route = s.route;
			const pageTitle = s.title;
			for (const t of s.tabs.filter(t => t.enabled)) {
				const columns = await tabColumns(app, t.fromRoute, t.field);
				const r = await publishConfigPatch(
					req,
					route,
					data => {
						const tabs = Array.isArray(data.viewTabs) ? data.viewTabs : [];
						if (tabs.some((x: any) => x.related === t.fromRoute && x.foreignField === t.field)) return data;
						return {
							...data,
							viewTabs: [...tabs, { related: t.fromRoute, foreignField: t.field, title: t.title, display: 'table', columns, pageSize: 10 }],
						};
					},
					note
				);
				undo.push(r.undo);
				result.tabs.push({ page: pageTitle, route, title: t.title, from: t.from });
			}
		}

		result.feature = await Feature.create({
			title: plan.title,
			description: plan.description,
			summary: plan.summary,
			source: opts.source,
			plan,
			result: { created: result.created, updated: result.updated, tabs: result.tabs, category: result.category },
			createdBy: req.user?._id,
			apiKey: opts.apiKey?._id,
		});
		const builtTitles = result.created.map(c => c.title).join(', ');
		recordProjectEvent({
			req,
			action: 'create',
			model: 'Feature',
			modelPath: 'model-builder/features',
			document: result.feature._id,
			name: plan.title,
			text: `built “${plan.title || 'a feature'}”${builtTitles ? ` — ${builtTitles}` : ''}${opts.source === 'mcp' ? ' (with AI)' : ''}`,
		});
		return result;
	} catch (e: any) {
		for (const step of undo.reverse()) await step().catch((err: any) => console.error('Undoing a feature build:', err?.message));
		await syncDynamicModels({ app, force: true }).catch(() => {});
		if (e instanceof BuildError) throw new BuildError(e.status, `Nothing was built — ${e.message}`, e.problems);
		throw new BuildError(e?.status || 500, `Nothing was built — ${e?.message || 'the build failed'}`, e?.problems);
	}
};
