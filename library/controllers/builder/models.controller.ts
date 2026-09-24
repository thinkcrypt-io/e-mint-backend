import { Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { ModelDefinition, RouteConfig, RouteSettings, RouteVersion } from '../../models/builder/_index.js';
import Permission from '../../models/permissions/model.js';
import SidebarItem from '../../models/sidebaritems/model.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import Counter from '../../../models/counter/counter.model.js';
import { configToData, listModelFields, settingsToData } from '../../functions/routeRegistry.function.js';
import { checkSettings, validateDraft, withSystemFields } from './validate.js';
import { ACCESS_KEYS, PRIVACY_VALUES } from '../../functions/recordAccess.function.js';
import { ACCESS_FORM_SECTION, ACCESS_VIEW_SECTION } from '../../functions/dynamicModels.function.js';
import { invalidateRoute } from '../../functions/resolveRoute.function.js';
import {
	ARRAY_KINDS,
	ENUM_KINDS,
	FIELD_KINDS,
	NO_DEFAULT_KINDS,
	REFERENCE_KINDS,
	defaultOf,
	enumOf,
	RESERVED_KEYS,
	TEXT_KINDS,
	Availability,
	ModelDef,
	buildSchema,
	checkAvailability,
	compileError,
	compiledModel,
	displayFieldOf,
	generateConfig,
	generateSettings,
	linkTargets,
	makeTargetLookup,
	nextCode,
	singular,
	syncDynamicModels,
} from '../../functions/dynamicModels.function.js';

/**
 * /admin/api/builder/models — the model builder.
 *
 * A definition saved here becomes a Mongoose model and an admin route at once
 * (dynamicModels.function.ts). Its settings and config are generated from the
 * fields; once someone customizes them in the route builder, those published
 * copies are kept in step here: a field added to the model is added to them,
 * a removed one is taken out, a changed one is updated — so the route never
 * validates against, or shows, a field the model no longer has.
 */

// Same rule as the route builder's: a built model has no business holding secrets.
const SENSITIVE = /pass(word)?|token|secret|api_?key|apikey|private|otp|salt|hash/i;
const SELF = '__self__';

const fail = (res: Response, status: number, message: string, problems?: string[]) =>
	res.status(status).json({ message, ...(problems && { problems }) });

const fieldSchema = Joi.object({
	key: Joi.string()
		.pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/)
		.max(40)
		.invalid(...RESERVED_KEYS)
		.required()
		.messages({
			'string.pattern.base': 'Field keys start with a letter and use only letters, digits and _',
			'any.invalid': '"{#value}" is reserved',
		}),
	label: Joi.string().allow('').max(80),
	kind: Joi.string()
		.valid(...FIELD_KINDS)
		.required(),
	required: Joi.boolean(),
	unique: Joi.boolean(),
	index: Joi.boolean(),
	default: Joi.any(),
	options: Joi.array()
		.items(Joi.object({ value: Joi.string().trim().min(1).max(80).required(), label: Joi.string().allow('').max(80) }))
		.unique('value')
		.max(200),
	ref: Joi.string().allow(''),
	min: Joi.number().allow(null),
	max: Joi.number().allow(null),
	showInTable: Joi.boolean(),
	searchable: Joi.boolean(),
	helper: Joi.string().allow('').max(200),
});

const bodySchema = Joi.object({
	name: Joi.string().trim().max(60),
	route: Joi.string().trim().allow('').max(60),
	title: Joi.string().trim().min(1).max(80).required(),
	description: Joi.string().allow('').max(300),
	displayField: Joi.string().allow(''),
	code: Joi.object({
		enabled: Joi.boolean(),
		prefix: Joi.string()
			.allow('')
			.pattern(/^[A-Za-z0-9]{0,10}$/)
			.messages({ 'string.pattern.base': 'The code prefix is up to 10 letters or digits' }),
		padding: Joi.number().integer().min(1).max(12),
		start: Joi.number().integer().min(0),
	}),
	access: Joi.object({
		enabled: Joi.boolean(),
		default: Joi.string().valid(...PRIVACY_VALUES),
	}),
	fields: Joi.array()
		.items(fieldSchema)
		.unique((a: any, b: any) => a.key.toLowerCase() === b.key.toLowerCase())
		.min(1)
		.max(100)
		.required()
		.messages({ 'array.unique': 'Two fields have the same key', 'array.min': 'Add at least one field' }),
	active: Joi.boolean(),
	sidebar: Joi.object({ category: Joi.string().allow('', null) }),
}).options({ stripUnknown: true });

/** Joi-valid body -> definition fields, plus the checks Joi can't express. */
const check = async (req: any, body: any, selfName: string) => {
	const { value, error } = bodySchema.validate(body, { abortEarly: false });
	if (error) return { problems: error.details.map(d => d.message.replace(/"/g, '')) };

	const problems: string[] = [];
	const targets = new Set((await linkTargets(req.app)).map(t => t.name));

	for (const f of value.fields) {
		const name = f.label || f.key;
		if (value.access?.enabled && ACCESS_KEYS.includes(f.key))
			problems.push(`${name}: “${f.key}” is used by access control — rename the field, or turn access off`);
		if (SENSITIVE.test(f.key)) problems.push(`${name}: fields that hold secrets can't be built here`);
		if (['select', 'multiselect'].includes(f.kind) && !f.options?.length)
			problems.push(`${name}: add at least one allowed value`);
		if (REFERENCE_KINDS.includes(f.kind)) {
			if (f.ref === SELF) f.ref = selfName;
			if (!f.ref) problems.push(`${name}: pick the model it links to`);
			else if (f.ref !== selfName && !targets.has(f.ref)) problems.push(`${name}: ${f.ref} isn't a model with an admin route`);
		} else delete f.ref;
		if (!ENUM_KINDS.includes(f.kind) || !f.options?.length) delete f.options;
		if (f.kind === 'number' && f.options?.some((o: any) => !Number.isFinite(Number(o.value))))
			problems.push(`${name}: the allowed values of a number must be numbers`);
		// The default as the field stores it; one outside the allowed values would fail every create.
		if (NO_DEFAULT_KINDS.includes(f.kind)) delete f.default;
		else if (f.default !== undefined) {
			const d = defaultOf(f);
			if (d === undefined) delete f.default;
			else {
				f.default = d;
				const allowed = enumOf(f);
				const outside = allowed && (Array.isArray(d) ? d : [d]).filter(x => !allowed.includes(x as any));
				if (outside?.length) problems.push(`${name}: the default ${outside.join(', ')} isn't one of the allowed values`);
			}
		}
		if (typeof f.min === 'number' && typeof f.max === 'number' && f.min > f.max) problems.push(`${name}: min is above max`);
		if (f.unique && (['boolean', 'editor', 'textarea'].includes(f.kind) || ARRAY_KINDS.includes(f.kind)))
			problems.push(`${name}: this kind of field can't be unique`);
	}
	if (value.displayField) {
		const df = value.fields.find((f: any) => f.key === value.displayField);
		if (value.displayField !== 'code' && !(df && TEXT_KINDS.includes(df.kind)))
			problems.push('The display field must be a text, email, link or select field — or the code');
		if (value.displayField === 'code' && !value.code?.enabled) problems.push('The display field is the code, but codes are off');
	}
	return { value, problems };
};

/** A validated body as the definition it would be saved as — nothing is written. */
const draftDef = (value: any, a: Availability): ModelDef => ({
	name: a.name,
	route: a.route,
	collectionName: a.collectionName,
	title: value.title,
	description: value.description,
	permission: a.route,
	displayField: value.displayField || undefined,
	code: value.code,
	access: value.access,
	active: true,
	fields: (value.fields || []).map((f: any) =>
		REFERENCE_KINDS.includes(f.kind) && (f.ref === SELF || !f.ref) ? { ...f, ref: a.name } : f
	),
});

/** What a definition generates: its settings and config, as RouteSettings / RouteConfig data. */
const generated = async (app: any, def: ModelDef) => {
	const saved: ModelDef[] = (await ModelDefinition.find({ name: { $ne: def.name } }).lean()) as any;
	const settings = generateSettings(def, makeTargetLookup(app, [...saved, def]));
	return {
		settingsObj: settings,
		settings: settingsToData(settings),
		config: configToData(
			generateConfig(def),
			Object.values(settings)
				.map((x: any) => x.filter)
				.filter(Boolean)
		),
	};
};

/**
 * Problems with settings / config a wizard sends along with a new model —
 * the same checks a route-builder publish runs, against the model that would
 * be created.
 */
export const checkCopies = async (app: any, def: ModelDef, settings: any, config: any) => {
	const problems: string[] = [];
	const out: { settings?: any; config?: any } = {};
	if (settings) {
		const { error, value } = validateDraft('settings', settings);
		if (error) problems.push(...error.map(e => `Settings: ${e}`));
		else {
			const { settingsObj } = await generated(app, def);
			const model = { schema: buildSchema(def) } as any;
			// System fields (createdAt; owner, privacy, access) are always as generated.
			const fixed = withSystemFields(value, model, settingsObj);
			const found = checkSettings({ route: def.route, data: fixed, model, codeSettings: settingsObj });
			if (found.length) problems.push(...found.map(e => `Settings: ${e}`));
			else out.settings = fixed;
		}
	}
	if (config) {
		const { error, value } = validateDraft('config', config);
		if (error) problems.push(...error.map(e => `Config: ${e}`));
		else out.config = { ...value, ...(value.route && { route: { ...value.route, path: def.route } }) };
	}
	return { problems, ...out };
};

/* ------------------------------------------------ keeping copies in step */

const keysOf = (d?: ModelDef | null) => [
	...(d?.code?.enabled ? ['code'] : []),
	...(d?.fields || []).map(f => f.key),
	...(d?.access?.enabled ? ACCESS_KEYS : []),
];
const fieldOf = (d: ModelDef | null | undefined, key: string) => d?.fields.find(f => f.key === key);
const sig = (f: any) =>
	JSON.stringify(f ? [f.kind, f.label, f.required, f.unique, f.ref, f.options, f.min, f.max, f.helper, f.default] : null);
/** What decides a field's input and cell: its kind, and whether it's limited to a list. */
const shapeOf = (f?: any) => (f ? `${f.kind}:${!!enumOf(f)}` : '');
/** Settings keys the model decides outright — dropped from a copy when the model no longer sets them. */
const MODEL_OWNED = ['value', 'options', 'helperText'];

/**
 * How a model change applies to a settings and a config object: a field added
 * to the model is added to them, a removed one taken out, a changed one
 * updated — and everything else in them (labels, columns, menus someone set)
 * left alone. `null` when the change touches no field.
 *
 * `extraDefs` are definitions not saved yet (the wizard's), so links to the
 * model being built resolve.
 */
const makePatchers = async (
	app: any,
	before: ModelDef | null,
	after: ModelDef,
	retarget: string[] = [],
	extraDefs: ModelDef[] = []
) => {
	const saved: ModelDef[] = (await ModelDefinition.find({}).lean()) as any;
	const extraNames = new Set(extraDefs.map(d => d.name));
	const defs = [...saved.filter(d => !extraNames.has(d.name)), ...extraDefs];
	const lookup = makeTargetLookup(app, defs);
	const generated = generateSettings(after, lookup);
	const genFields: any[] = settingsToData(generated).fields;
	const genByKey = new Map(genFields.map(f => [f.key, f]));
	const genFilters = configToData(
		null,
		Object.values(generated)
			.map((s: any) => s.filter)
			.filter(Boolean)
	).filters;

	const beforeKeys = keysOf(before);
	const afterKeys = keysOf(after);
	const removed = new Set(beforeKeys.filter(k => !afterKeys.includes(k)));
	const added = afterKeys.filter(k => !beforeKeys.includes(k));
	// A new kind, or a list added or taken away, changes the input and cell: the field is regenerated.
	const kindChanged = new Set(afterKeys.filter(k => fieldOf(before, k) && shapeOf(fieldOf(before, k)) !== shapeOf(fieldOf(after, k))));
	const changed = new Set([
		...afterKeys.filter(k => beforeKeys.includes(k) && sig(fieldOf(before, k)) !== sig(fieldOf(after, k))),
		...retarget,
	]);
	if (!removed.size && !added.length && !changed.size) return null;

	const insertBeforeCreated = (list: any[], items: any[], keyOf: (x: any) => string) => {
		const at = list.findIndex(x => keyOf(x) === 'createdAt');
		return at === -1 ? [...list, ...items] : [...list.slice(0, at), ...items, ...list.slice(at)];
	};

	const patchSettings = (data: any) => {
		if (!Array.isArray(data?.fields)) return data;
		let fields = data.fields
			.filter((f: any) => !removed.has(f.key))
			.map((f: any) => {
				const gen = genByKey.get(f.key);
				if (!gen || !changed.has(f.key)) return f;
				// A new kind invalidates everything kind-specific; otherwise the
				// model's facts win and the route builder's choices stay.
				if (kindChanged.has(f.key)) return gen;
				const schema = { ...(f.schema || {}), ...(gen.schema || {}) };
				for (const k of MODEL_OWNED) if (!(k in (gen.schema || {}))) delete schema[k];
				return { ...f, ...gen, schema };
			});
		fields = insertBeforeCreated(fields, added.map(k => genByKey.get(k)).filter(Boolean), (x: any) => x.key);
		return { ...data, fields };
	};

	// Access brings its own form and view section; its keys aren't added one by one.
	const accessAdded = added.includes('privacy') && !!after.access?.enabled;
	const newKeys = added.filter(k => k !== 'code' && !ACCESS_KEYS.includes(k));
	const viewKeys = added.filter(k => !ACCESS_KEYS.includes(k));
	/** A section emptied by this change goes too; one that was already empty was someone's choice. */
	const dropEmptied = (before: any[], after: any[]) => after.filter((s, i) => s.fields.length || !(before[i]?.fields || []).length);
	const patchConfig = (data: any) => {
		if (!data) return data;
		const out = { ...data };
		const strip = (list: any) => (Array.isArray(list) ? list.filter((k: any) => typeof k !== 'string' || !removed.has(k)) : list);
		if (Array.isArray(out.fields)) out.fields = insertBeforeCreated(strip(out.fields), added, (k: any) => k);
		if (Array.isArray(out.table))
			out.table = insertBeforeCreated(
				strip(out.table),
				added.filter(k => k === 'code' || (k !== 'access' && fieldOf(after, k)?.showInTable !== false)),
				(k: any) => k
			);
		if (Array.isArray(out.form)) {
			const formBefore = out.form;
			out.form = out.form.map((s: any) => ({
				...s,
				fields: (s.fields || [])
					.map((row: any) => (Array.isArray(row) ? row.filter((k: string) => !removed.has(k)) : removed.has(row) ? null : row))
					.filter((row: any) => row && (!Array.isArray(row) || row.length)),
			}));
			out.form = dropEmptied(formBefore, out.form);
			if (newKeys.length) {
				if (!out.form.length) out.form = [{ sectionTitle: 'Details', fields: [] }];
				out.form[0] = { ...out.form[0], fields: [...out.form[0].fields, ...newKeys] };
			}
			if (accessAdded) out.form = [...out.form, structuredClone(ACCESS_FORM_SECTION)];
		}
		if (Array.isArray(out.view)) {
			const viewBefore = out.view;
			out.view = out.view.map((s: any) => ({
				...s,
				fields: (s.fields || []).filter((i: any) =>
					typeof i === 'string' ? !removed.has(i) : i?.field ? !removed.has(i.field) : true
				),
			}));
			out.view = dropEmptied(viewBefore, out.view);
			if (viewKeys.length && out.view.length)
				out.view[0] = { ...out.view[0], fields: insertBeforeCreated(out.view[0].fields, viewKeys, (k: any) => k) };
			if (accessAdded) out.view = [...out.view, structuredClone(ACCESS_VIEW_SECTION)];
		}
		if (Array.isArray(out.filters)) {
			const replaced = new Set([...removed, ...kindChanged, ...changed]);
			const kept = out.filters.filter((f: any) => !replaced.has(f.name));
			const wanted = new Set([...added, ...kindChanged, ...changed]);
			out.filters = [...kept, ...genFilters.filter((f: any) => wanted.has(f.name))];
		}
		return out;
	};

	return { patchSettings, patchConfig };
};

/**
 * Applies a model change to the route's published settings and config (and
 * their drafts), when it has any.
 */
const syncCopies = async (
	app: any,
	before: ModelDef | null,
	after: ModelDef,
	adminId: any,
	retarget: string[] = []
) => {
	const patchers = await makePatchers(app, before, after, retarget);
	if (!patchers) return;
	const { patchSettings, patchConfig } = patchers;

	const note = 'Model builder: the model’s fields changed';
	for (const [kind, Model, patch] of [
		['settings', RouteSettings, patchSettings],
		['config', RouteConfig, patchConfig],
	] as const) {
		const doc: any = await (Model as any).findOne({ route: after.route }).lean();
		if (!doc) continue;
		const set: any = {};
		if (doc.data && doc.version) {
			const data = patch(doc.data);
			if (JSON.stringify(data) !== JSON.stringify(doc.data)) {
				const version = (doc.version || 0) + 1;
				Object.assign(set, { data, version, publishedAt: new Date(), publishedBy: adminId });
				await RouteVersion.create({ route: after.route, kind, version, data, note, publishedBy: adminId });
			}
		}
		if (doc.draft) {
			const draft = patch(doc.draft);
			if (JSON.stringify(draft) !== JSON.stringify(doc.draft)) set.draft = draft;
		}
		if (Object.keys(set).length) await (Model as any).updateOne({ _id: doc._id }, { $set: set });
	}
	invalidateRoute(after.route);
};

/** Gives existing records a code, oldest first, when codes are turned on. */
const backfillCodes = async (def: ModelDef) => {
	const Model = compiledModel(def.name);
	if (!Model) return 0;
	let n = 0;
	const cursor = Model.find({ $or: [{ code: { $exists: false } }, { code: null }, { code: '' }] }, { _id: 1 })
		.sort({ createdAt: 1, _id: 1 })
		.lean()
		.cursor();
	for await (const doc of cursor) {
		await Model.updateOne({ _id: (doc as any)._id }, { $set: { code: await nextCode(def) } });
		n++;
	}
	return n;
};

/** Brings the collection's indexes in line; a failure is reported, not thrown. */
const syncIndexes = async (def: ModelDef): Promise<string[]> => {
	const Model = compiledModel(def.name);
	if (!Model) return [];
	try {
		await Model.syncIndexes();
		return [];
	} catch (e: any) {
		const dup = /duplicate key|E11000/i.test(e.message);
		return [
			dup
				? 'A unique field couldn’t be enforced: existing records already share a value. Fix the duplicates and save again.'
				: `Indexes weren’t updated: ${e.message}`,
		];
	}
};

const upsertSidebar = async (def: any, category: string | null | undefined) => {
	if (category === undefined) return def.sidebarItem || null;
	if (!category) {
		if (def.sidebarItem) await SidebarItem.deleteOne({ _id: def.sidebarItem });
		return null;
	}
	if (!mongoose.isValidObjectId(category) || !(await SidebarCategory.exists({ _id: category }))) return def.sidebarItem || null;
	const item = {
		name: def.title,
		description: def.description || `Records of the ${def.title} model`,
		href: def.route,
		icon: 'blocks',
		priority: 50,
		isActive: true,
		category,
		permissionProtected: true,
		permission: `view-${def.permission}`,
	};
	if (def.sidebarItem && (await SidebarItem.exists({ _id: def.sidebarItem }))) {
		await SidebarItem.updateOne({ _id: def.sidebarItem }, { $set: item });
		return def.sidebarItem;
	}
	return (await SidebarItem.create(item))._id;
};

const withCount = async (def: any) => {
	const Model = compiledModel(def.name);
	let records: number | null = null;
	try {
		records = Model ? await Model.estimatedDocumentCount() : null;
	} catch {
		records = null;
	}
	return { ...def, records, error: compileError(def.name) };
};

/* ------------------------------------------------------------ handlers */

/** GET /builder/models */
export const listModels = async (req: any, res: Response): Promise<Response> => {
	try {
		await syncDynamicModels({ app: req.app });
		const defs = await ModelDefinition.find({}).sort({ title: 1 }).lean();
		return res.status(200).json({ doc: await Promise.all(defs.map(withCount)) });
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};

/** GET /builder/models/options — field kinds, link targets, sidebar categories. */
export const getModelOptions = async (req: any, res: Response): Promise<Response> => {
	try {
		const [targets, categories] = await Promise.all([
			linkTargets(req.app),
			SidebarCategory.find({}, { name: 1 }).sort({ priority: 1, name: 1 }).lean(),
		]);
		return res.status(200).json({ kinds: FIELD_KINDS, reservedKeys: RESERVED_KEYS, targets, categories });
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};

/** GET /builder/models/check?name=Invoice&route=&id= — what would be registered. */
export const checkModelName = async (req: any, res: Response): Promise<Response> => {
	try {
		const name = String(req.query.name || '');
		const route = String(req.query.route || '');
		const id = req.query.id && mongoose.isValidObjectId(req.query.id) ? req.query.id : undefined;
		const result = await checkAvailability(req.app, name, route, id);
		if (!result)
			return fail(res, 400, 'Use letters and digits, starting with a letter (e.g. “Invoice” or “Invoice item”)');
		return res.status(200).json(result);
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};

/**
 * POST /builder/models/preview  { ...definition, previous?: { definition, settings, config } }
 *
 * The model wizard's first step. Validates a definition and returns what it
 * would register as and generate — settings, config, model fields — without
 * saving anything. With `previous` (the definition and the copies the wizard
 * has been editing), the copies are carried over and only patched for what
 * changed in the fields, so going back a step doesn't lose later edits.
 */
export type PreviewResult =
	| { problems: string[]; message: string }
	| {
			problems?: undefined;
			def: ModelDef;
			value: any;
			availability: Availability;
			settings: any;
			config: any;
			generated: { settings: any; config: any };
			fields: any;
			models: string[];
	  };

/**
 * What a definition would register as and generate — nothing is written. With
 * `previous` (the wizard's edited copies of an earlier version), those copies
 * are patched for the change instead of generated afresh. The AI builder
 * shares it.
 */
export const buildPreview = async (req: any, body: any): Promise<PreviewResult> => {
	const availability = await checkAvailability(req.app, body?.name || singular(body?.title), body?.route);
	if (!availability) return { message: 'The model name must start with a letter (e.g. “Invoice”)', problems: [] };
	const { value, problems } = await check(req, body, availability.name);
	if (problems?.length) return { message: 'The model isn’t valid', problems };

	const def = draftDef(value, availability);
	const fresh = await generated(req.app, def);
	let settings = fresh.settings;
	let config: any = fresh.config;

	const previous = body?.previous;
	if (previous?.definition && previous.settings && previous.config) {
		const before = draftDef({ ...previous.definition, fields: previous.definition.fields || [] }, availability);
		const patchers = await makePatchers(req.app, before, def, [], [def]);
		settings = patchers ? patchers.patchSettings(previous.settings) : previous.settings;
		config = patchers ? patchers.patchConfig(previous.config) : previous.config;
		if (config?.route) config = { ...config, route: { ...config.route, path: def.route } };
	}

	return {
		def,
		value,
		availability,
		settings,
		config,
		generated: { settings: fresh.settings, config: fresh.config },
		fields: listModelFields({ schema: buildSchema(def) } as any),
		models: [...new Set([...mongoose.modelNames(), def.name])].sort(),
	};
};

export const previewModel = async (req: any, res: Response): Promise<Response> => {
	try {
		const p = await buildPreview(req, req.body);
		if (p.problems) return fail(res, 400, p.message, p.problems.length ? p.problems : undefined);
		const { availability, settings, config, generated, fields, models } = p;
		return res.status(200).json({ availability, settings, config, generated, fields, models });
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};

/** GET /builder/models/:id */
export const getModel = async (req: any, res: Response): Promise<Response> => {
	try {
		await syncDynamicModels({ app: req.app });
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const def: any = await ModelDefinition.findById(req.params.id).lean();
		if (!def) return fail(res, 404, 'Model not found');
		const referencedBy = await ModelDefinition.find({ 'fields.ref': def.name, _id: { $ne: def._id } }, { name: 1, title: 1, route: 1 }).lean();
		const sidebar = def.sidebarItem ? await SidebarItem.findById(def.sidebarItem, { category: 1 }).lean() : null;
		return res
			.status(200)
			.json({ doc: { ...(await withCount(def)), sidebarCategory: (sidebar as any)?.category || null, referencedBy } });
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};

/** POST /builder/models */
export const createModel = async (req: any, res: Response): Promise<Response> => {
	let created: any = null;
	try {
		const availability = await checkAvailability(req.app, req.body?.name || singular(req.body?.title), req.body?.route);
		if (!availability) return fail(res, 400, 'The model name must start with a letter (e.g. “Invoice”)');

		const { value, problems } = await check(req, req.body, availability.name);
		if (problems?.length) return fail(res, 400, 'The model isn’t valid', problems);

		// Settings and config edited in the wizard are checked before anything
		// is written, and published as version 1 once the model exists.
		const copies =
			req.body?.settings || req.body?.config
				? await checkCopies(req.app, draftDef(value, availability), req.body?.settings, req.body?.config)
				: { problems: [] as string[] };
		if (copies.problems.length) return fail(res, 400, 'The pages aren’t valid', copies.problems);

		// Its own permission, unless a code route already uses that key.
		let permission = availability.route;
		for (let n = 2; await Permission.exists({ key: permission }); n++) permission = `${availability.route}-${n}`;

		created = await ModelDefinition.create({
			...value,
			displayField: value.displayField || undefined,
			name: availability.name,
			requestedName: req.body?.name || req.body?.title,
			route: availability.route,
			collectionName: availability.collectionName,
			permission,
			version: 1,
			createdBy: req.user?._id,
			updatedBy: req.user?._id,
		});

		await syncDynamicModels({ app: req.app, force: true });
		const error = compileError(created.name);
		if (error) {
			await ModelDefinition.deleteOne({ _id: created._id });
			await syncDynamicModels({ app: req.app, force: true });
			return fail(res, 400, `The model couldn’t be registered: ${error}`);
		}

		await Permission.findOneAndUpdate(
			{ key: permission },
			{
				name: value.title,
				description: `Records of the ${value.title} model (built in the model builder)`,
				key: permission,
				isActive: true,
				options: { create: true, view: true, edit: true, delete: true },
			},
			{ upsert: true, setDefaultsOnInsert: true }
		);
		const sidebarItem = await upsertSidebar(created, value.sidebar?.category);
		if (sidebarItem) await ModelDefinition.updateOne({ _id: created._id }, { $set: { sidebarItem } });

		const now = new Date();
		for (const [kind, Model, data] of [
			['settings', RouteSettings, (copies as any).settings],
			['config', RouteConfig, (copies as any).config],
		] as const) {
			if (!data) continue;
			await (Model as any).findOneAndUpdate(
				{ route: created.route },
				{
					$set: { model: created.name, data, draft: null, version: 1, publishedAt: now, publishedBy: req.user?._id, source: 'inherit' },
				},
				{ upsert: true }
			);
			await RouteVersion.create({
				route: created.route,
				kind,
				version: 1,
				data,
				note: 'Created with the model wizard',
				publishedBy: req.user?._id,
			});
		}
		invalidateRoute(created.route);

		const warnings = await syncIndexes(created.toObject());
		return res.status(201).json({ doc: await withCount({ ...created.toObject(), sidebarItem }), availability, warnings });
	} catch (e: any) {
		console.error(e.message);
		if (created) {
			await ModelDefinition.deleteOne({ _id: created._id }).catch(() => {});
			await syncDynamicModels({ app: req.app, force: true }).catch(() => {});
		}
		return fail(res, 500, e.message);
	}
};

/** PUT /builder/models/:id — name, route and collection stay as they are. */
export const updateModel = async (req: any, res: Response): Promise<Response> => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const doc: any = await ModelDefinition.findById(req.params.id);
		if (!doc) return fail(res, 404, 'Model not found');
		const before: ModelDef = doc.toObject();

		const { value, problems } = await check(req, req.body, before.name);
		if (problems?.length) return fail(res, 400, 'The model isn’t valid', problems);

		// Snapshot what's being replaced, so a change can be looked up later.
		await RouteVersion.create({
			route: before.route,
			kind: 'model',
			version: before.version || 1,
			data: before,
			note: 'Before a model builder change',
			publishedBy: req.user?._id,
		});

		const { sidebar, name, route, ...rest } = value;
		doc.set({
			...rest,
			displayField: rest.displayField || undefined,
			version: (before.version || 1) + 1,
			updatedBy: req.user?._id,
		});
		await doc.save();

		await syncDynamicModels({ app: req.app, force: true });
		const error = compileError(doc.name);
		if (error) {
			// Put the working definition back rather than leave a model with no route.
			await ModelDefinition.replaceOne({ _id: doc._id }, { ...before, version: (before.version || 1) + 2 });
			await syncDynamicModels({ app: req.app, force: true });
			return fail(res, 400, `The change couldn’t be applied, so nothing was changed: ${error}`);
		}

		const after: ModelDef = doc.toObject();
		await syncCopies(req.app, before, after, req.user?._id);

		// Models linking here name its records by its display field: when that
		// changes, their populate and menus follow.
		if (displayFieldOf(before) !== displayFieldOf(after)) {
			const linking: ModelDef[] = (await ModelDefinition.find({ 'fields.ref': after.name, _id: { $ne: doc._id } }).lean()) as any;
			for (const d of linking)
				await syncCopies(req.app, d, d, req.user?._id, d.fields.filter(f => f.ref === after.name).map(f => f.key));
		}

		let codesAssigned = 0;
		if (after.code?.enabled && !before.code?.enabled) codesAssigned = await backfillCodes(after);

		// Records from before access was on were visible to everyone; they stay that way until their privacy is changed.
		let madePublic = 0;
		if (after.access?.enabled && !before.access?.enabled)
			madePublic = (
				await mongoose.connection
					.collection(after.collectionName)
					.updateMany({ privacy: { $nin: ['private', 'only-me', 'public'] } }, { $set: { privacy: 'public' } })
			).modifiedCount;

		const sidebarItem = await upsertSidebar(doc, sidebar?.category);
		if (String(sidebarItem || '') !== String(doc.sidebarItem || ''))
			await ModelDefinition.updateOne({ _id: doc._id }, sidebarItem ? { $set: { sidebarItem } } : { $unset: { sidebarItem: 1 } });
		else if (sidebarItem) await SidebarItem.updateOne({ _id: sidebarItem }, { $set: { name: after.title } });
		await Permission.updateOne({ key: after.permission }, { $set: { name: after.title } });

		const warnings = await syncIndexes(after);
		return res.status(200).json({ doc: await withCount({ ...after, sidebarItem }), warnings, codesAssigned, madePublic });
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};

/**
 * DELETE /builder/models/:id?dropData=true
 *
 * Removes the model, its route, its route-builder copies, permission and
 * sidebar item. The records stay in their collection unless `dropData` —
 * which is why the name stays taken until they're gone.
 */
export const deleteModel = async (req: any, res: Response): Promise<Response> => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const def: any = await ModelDefinition.findById(req.params.id).lean();
		if (!def) return fail(res, 404, 'Model not found');

		const linking = await ModelDefinition.find({ 'fields.ref': def.name, _id: { $ne: def._id } }, { title: 1 }).lean();
		if (linking.length)
			return fail(res, 409, 'Other models link to this one', linking.map((d: any) => `${d.title} links to it — remove that field first`));

		await ModelDefinition.deleteOne({ _id: def._id });
		await Promise.all([
			RouteSettings.deleteOne({ route: def.route }),
			RouteConfig.deleteOne({ route: def.route }),
			RouteVersion.deleteMany({ route: def.route }),
			Permission.deleteOne({ key: def.permission }),
			def.sidebarItem ? SidebarItem.deleteOne({ _id: def.sidebarItem }) : null,
		]);

		const dropData = req.query.dropData === 'true';
		if (dropData) {
			await Counter.deleteOne({ slug: `model-${def.name}` });
			await mongoose.connection.db?.dropCollection(def.collectionName).catch(() => {});
		}

		await syncDynamicModels({ app: req.app, force: true });
		return res.status(200).json({ message: dropData ? 'Model and records deleted' : 'Model deleted; its records were kept' });
	} catch (e: any) {
		console.error(e.message);
		return fail(res, 500, e.message);
	}
};
