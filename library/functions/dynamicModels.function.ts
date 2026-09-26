import express from 'express';
import mongoose, { Schema } from 'mongoose';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import Counter from '../../models/counter/counter.model.js';
import defineRoutes from '../../routes-admin/common/router.js';
import {
	ADMIN_API_PREFIX,
	collectResourceRoutes,
	dynamicMounts,
	mountPath,
	setDynamicMount,
} from './routeRegistry.function.js';
import { invalidateRoute } from './resolveRoute.function.js';
import { ACCESS_KEYS, PRIVACY_OPTIONS, PRIVACY_VALUES, recordAccessMiddleware } from './recordAccess.function.js';
import { accessNotifications } from './notifications.function.js';
import { format as formatFormula, parse as parseFormula } from './formula.function.js';

/**
 * Models built in the model builder (ModelDefinition documents), made real:
 *
 * - each definition is compiled into a Mongoose model registered under its
 *   `name`, so `ref: '<name>'` works from any model, code or built, and
 *   populate finds it like any other;
 * - its settings and config are generated from the fields — the same objects
 *   a hand-written settings.ts / config.ts would export — and it gets an admin
 *   route from the same `defineRoutes`, so the route builder, filters, the
 *   generic table page and the view page all work on it unchanged;
 * - one dispatcher, mounted last in the admin router, serves every built
 *   route, so a model can be created or rebuilt without a restart.
 *
 * Each process keeps its compiled copies in step with the database: it checks
 * the definitions at most every 10 seconds (and at once after a change it
 * made itself), recompiling only what changed.
 */

const TTL_MS = 10_000;

export const FIELD_KINDS = [
	'text',
	'textarea',
	'editor',
	'email',
	'url',
	'number',
	// A number calculated from the record's other number fields (`formula`) — never typed.
	'formula',
	'boolean',
	'date',
	'select',
	'multiselect',
	'tags',
	'color',
	'image',
	'images',
	'file',
	'files',
	'video',
	'reference',
	'references',
	// A group of fields of its own (`fields`), stored as one object: an address, a billing block.
	'section',
	// Rows of the same fields (`fields`), stored as a list: an invoice's items.
	'sectionlist',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** Kinds made of fields of their own. */
export const SECTION_KINDS: FieldKind[] = ['section', 'sectionlist'];
/** What a section's own fields can be — no links, no nested sections. */
export const SUB_KINDS: FieldKind[] = [
	'text',
	'textarea',
	'email',
	'url',
	'color',
	'number',
	'formula',
	'boolean',
	'date',
	'select',
	'image',
	'file',
];

/** Kinds whose value is short text — the ones that can name a record. */
export const TEXT_KINDS: FieldKind[] = ['text', 'email', 'url', 'select'];
export const REFERENCE_KINDS: FieldKind[] = ['reference', 'references'];
/** Kinds that can be limited to a list of allowed values (an enum). Select and multi-select always are. */
export const ENUM_KINDS: FieldKind[] = ['text', 'number', 'select', 'multiselect', 'tags'];
/** Kinds stored as a list. */
export const ARRAY_KINDS: FieldKind[] = ['multiselect', 'tags', 'images', 'files', 'references'];
/** Kinds with no default value. */
export const NO_DEFAULT_KINDS: FieldKind[] = ['reference', 'references', 'formula', 'section', 'sectionlist'];
/** A formula written out tidily, or as typed when it doesn't parse (the builder says why). */
export const tidyFormula = (src: any) => {
	const text = typeof src === 'string' ? src.trim() : '';
	try {
		return text ? formatFormula(parseFormula(text)) : '';
	} catch {
		return text;
	}
};
/**
 * What a formula may use among `fields` (formula.function.ts FieldInfo): the
 * number fields; a section list itself (count) and its rows' values
 * (`items.total`, for sum / avg); a section's values as `address.zip`.
 */
export const formulaInfoOf = (fields: ModelFieldDef[] = []) =>
	fields.flatMap(x => {
		const numeric = (k: FieldKind) => k === 'number' || k === 'formula';
		if (x.kind === 'sectionlist')
			return [
				{ key: x.key, label: x.label, numeric: false, list: true },
				...(x.fields || []).map(y => ({ key: `${x.key}.${y.key}`, label: y.label, numeric: numeric(y.kind), inList: x.key })),
			];
		if (x.kind === 'section')
			return (x.fields || []).map(y => ({ key: `${x.key}.${y.key}`, label: y.label, numeric: numeric(y.kind) }));
		return [{ key: x.key, label: x.label, numeric: numeric(x.kind), ...(x.kind === 'formula' && { formula: x.formula }) }];
	});

/** Kinds whose text length can be limited. */
export const LENGTH_KINDS: FieldKind[] = ['text', 'email', 'url', 'textarea', 'editor'];

/** The allowed values of a field, when it has any — numbers for a number field. */
export const enumOf = (f: Pick<ModelFieldDef, 'kind' | 'options'>): (string | number)[] | null => {
	if (!ENUM_KINDS.includes(f.kind) || !f.options?.length) return null;
	return f.options.map(o => (f.kind === 'number' ? Number(o.value) : o.value));
};

/**
 * A field's default as its type stores it, or undefined for none: a list for
 * list kinds, a number for numbers, 'now' or a date for dates.
 */
export const defaultOf = (f: Pick<ModelFieldDef, 'kind' | 'default'>): any => {
	const d = f.default;
	if (NO_DEFAULT_KINDS.includes(f.kind) || d === undefined || d === null || d === '') return undefined;
	if (ARRAY_KINDS.includes(f.kind)) {
		const list = (Array.isArray(d) ? d : [d]).map(x => String(x).trim()).filter(Boolean);
		return list.length ? list : undefined;
	}
	if (f.kind === 'boolean') return d === true || d === 'true' ? true : d === false || d === 'false' ? false : undefined;
	if (f.kind === 'number') return Number.isFinite(Number(d)) ? Number(d) : undefined;
	if (f.kind === 'date') return d === 'now' ? 'now' : Number.isNaN(new Date(d).getTime()) ? undefined : new Date(d).toISOString().slice(0, 10);
	return typeof d === 'string' ? d : String(d);
};

/** Keys Mongoose or the generated model already own — a field by one of these names breaks documents. */
export const RESERVED_KEYS = [
	'_id', 'id', '__v', 'code', 'createdAt', 'updatedAt',
	'collection', 'db', 'emit', 'errors', 'get', 'init', 'isModified', 'isNew', 'listeners', 'modelName',
	'on', 'once', 'populated', 'prototype', 'remove', 'removeListener', 'save', 'schema', 'set',
	'toObject', 'toJSON', 'validate', 'isSelected', 'model', 'baseModel',
];

/**
 * Route names the admin app already uses for its own pages (a built route
 * with one of these names would open that page instead of its table) plus
 * words that read as actions. The backend's own mounts are checked live.
 */
const RESERVED_ROUTES = new Set([
	'api', 'admin', 'auth', 'builder', 'model-builder', 'docs', 'doc', 'view', 'views', 'dashboard', 'settings',
	'notifications', 'access-users',
	'new', 'edit', 'create', 'test', 'error', 'not-found', 'heroku-doc', 'vercel-doc', 'user-feedback',
	'user-feedback-success', 'purchased-themes', 'customer-ledger', 'invoices-old', 'repos', 'qr', 'users',
	'orders', 'payments', 'groups', 'damages', 'deliveries', 'suppliers', 'images', 'fgroups', 'servicecat',
	'clickevents', 'modelattributes', 'plannedmodels', 'plannedpages', 'plannedprojects', 'plannedfeatures',
]);

export type ModelFieldDef = {
	key: string;
	label?: string;
	kind: FieldKind;
	required?: boolean;
	unique?: boolean;
	index?: boolean;
	default?: any;
	options?: { value: string; label?: string }[];
	ref?: string;
	min?: number;
	max?: number;
	showInTable?: boolean;
	searchable?: boolean;
	helper?: string;
	/** A formula kind's calculation, e.g. `total - paid` (formula.function.ts). */
	formula?: string;
	/** A section's own fields (SUB_KINDS only). */
	fields?: ModelFieldDef[];
	/** A section list's add button, e.g. "Add item". */
	addLabel?: string;
};

export type ModelDef = {
	_id?: any;
	name: string;
	route: string;
	collectionName: string;
	title: string;
	description?: string;
	permission: string;
	displayField?: string;
	code?: { enabled?: boolean; prefix?: string; padding?: number; start?: number };
	/** Per-record access (recordAccess.function.ts): an owner, a privacy and an access list on every record. */
	access?: { enabled?: boolean; default?: string };
	fields: ModelFieldDef[];
	active?: boolean;
	version?: number;
	updatedAt?: Date;
};

/* ---------------------------------------------------------------- names */

/** 'invoice item' / 'invoice_item' -> 'InvoiceItem'. Empty if nothing usable. */
export const toModelName = (value: string) => {
	const name = String(value || '')
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean)
		.map(w => w[0].toUpperCase() + w.slice(1))
		.join('');
	return /^[A-Z][A-Za-z0-9]*$/.test(name) ? name : '';
};

/** 'Invoices' -> 'Invoice' — the model name a title implies when none is given. */
export const singular = (title: string) =>
	String(title || '')
		.trim()
		.replace(/ies$/i, 'y')
		.replace(/(ch|sh|x|ss)es$/i, '$1')
		.replace(/([^s])s$/i, '$1');

/** 'InvoiceItem' -> 'invoiceitems', the way Mongoose names collections. */
export const toRoute = (name: string) => mongoose.pluralize()!(name).toLowerCase().replace(/[^a-z0-9-]/g, '');

export const humanize = (key = '') =>
	key
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/\b\w/g, c => c.toUpperCase());

/** Every first path segment the admin API already answers. */
const adminMounts = (app: any): Set<string> => {
	const found = new Set<string>();
	const walk = (stack: any[], prefix: string) => {
		for (const layer of stack || []) {
			const full = layer.route ? `${prefix}${layer.route.path}` : `${prefix}${mountPath(layer) ?? '\u0000'}`;
			if (full.startsWith(`${ADMIN_API_PREFIX}/`)) {
				const seg = full.slice(ADMIN_API_PREFIX.length + 1).split('/')[0];
				if (seg && !seg.startsWith(':')) found.add(seg.toLowerCase());
				continue;
			}
			if (!layer.route && Array.isArray(layer.handle?.stack) && ADMIN_API_PREFIX.startsWith(full))
				walk(layer.handle.stack, full);
		}
	};
	walk(app?._router?.stack, '');
	return found;
};

export type Availability = {
	requested: string;
	name: string;
	route: string;
	collectionName: string;
	/** True when `name` or `route` had to differ from what was asked. */
	changed: boolean;
	reasons: string[];
};

/**
 * The model name and route to register for `requested`: as asked when free,
 * otherwise with the lowest number appended that makes both free — 'Invoice'
 * taken gives 'Invoice2' at '/invoices2'. A name counts as taken if any
 * Mongoose model (code or built) uses it, and a route if the admin API or app
 * already answers it or a collection by that name already holds data.
 */
export const checkAvailability = async (
	app: any,
	requested: string,
	requestedRoute?: string,
	excludeId?: any
): Promise<Availability | null> => {
	const base = toModelName(requested);
	if (!base) return null;
	const baseRoute = (requestedRoute && requestedRoute.toLowerCase().replace(/[^a-z0-9-]/g, '')) || toRoute(base);
	if (!/^[a-z][a-z0-9-]*$/.test(baseRoute)) return null;

	const defs = await ModelDefinition.find(excludeId ? { _id: { $ne: excludeId } } : {}, { name: 1, route: 1, collectionName: 1 }).lean();
	const own = excludeId ? await ModelDefinition.findById(excludeId, { name: 1 }).lean() : null;
	const names = new Set(
		mongoose
			.modelNames()
			.filter(n => n !== (own as any)?.name)
			.concat(defs.map((d: any) => d.name))
			.map(n => n.toLowerCase())
	);
	const routes = new Set([...adminMounts(app), ...RESERVED_ROUTES, ...defs.map((d: any) => d.route)]);
	const collections = new Set(
		((await mongoose.connection.db?.listCollections({}, { nameOnly: true }).toArray()) || []).map((c: any) =>
			c.name.toLowerCase()
		)
	);
	defs.forEach((d: any) => collections.add(d.collectionName.toLowerCase()));

	const reasons: string[] = [];
	for (let n = 1; n < 200; n++) {
		const name = n === 1 ? base : `${base}${n}`;
		const route = n === 1 ? baseRoute : `${baseRoute}${n}`;
		const nameTaken = names.has(name.toLowerCase());
		const routeTaken = routes.has(route) || dynamicMounts.has(route);
		const collectionTaken = collections.has(route);
		if (!nameTaken && !routeTaken && !collectionTaken)
			return { requested, name, route, collectionName: route, changed: n > 1, reasons };
		if (n === 1) {
			if (nameTaken) reasons.push(`A model named ${name} already exists`);
			if (routeTaken) reasons.push(`/${route} is already an admin route`);
			else if (collectionTaken) reasons.push(`A "${route}" collection already holds data`);
		}
	}
	return null;
};

/* ------------------------------------------------------------ the model */

const blankToUndefined = (v: any) => (v === '' || v === null ? undefined : v);
const idsOnly = (v: any) =>
	Array.isArray(v) ? v.map(x => (x && typeof x === 'object' && x._id ? x._id : x)).filter(x => x !== '' && x != null) : v;
const idOnly = (v: any) => blankToUndefined(v && typeof v === 'object' && v._id ? v._id : v);

const codeCounterSlug = (name: string) => `model-${name}`;

/** The next code for a built model: atomic, so two creates never share one. */
export const nextCode = async (def: Pick<ModelDef, 'name' | 'code'>) => {
	const { prefix = '', padding = 4, start = 1 } = def.code || {};
	const counter: any = await Counter.findOneAndUpdate(
		{ slug: codeCounterSlug(def.name) },
		{ $inc: { sequenceValue: 1 } },
		{ upsert: true, new: true, setDefaultsOnInsert: true }
	);
	const value = counter.sequenceValue + Math.max(0, (start ?? 1) - 1);
	const digits = String(value).padStart(Math.min(Math.max(padding || 0, 1), 12), '0');
	return prefix ? `${prefix.toUpperCase()}-${digits}` : digits;
};

/** The Mongoose paths for a list of fields — a model's, or a section's own. */
const pathsOf = (fields: ModelFieldDef[]) => {
	const paths: Record<string, any> = {};

	for (const f of fields) {
		const label = f.label || humanize(f.key);
		const required = f.required ? [true, `${label} is required`] : undefined;
		let p: any;

		const allowed = enumOf(f);
		const enumRule = allowed && { values: allowed, message: `${label}: "{VALUE}" is not one of the allowed values` };
		const dflt = defaultOf(f);

		switch (f.kind) {
			case 'text':
			case 'url':
			case 'color':
			case 'image':
			case 'file':
			case 'video':
				p = { type: String, trim: true };
				break;
			case 'email':
				p = { type: String, trim: true, lowercase: true };
				break;
			case 'textarea':
			case 'editor':
				p = { type: String };
				break;
			case 'formula':
				// Calculated on save (formula.function.ts); never required or typed.
				p = { type: Number, default: null };
				break;
			case 'number':
				p = { type: Number, set: blankToUndefined };
				if (typeof f.min === 'number') p.min = f.min;
				if (typeof f.max === 'number') p.max = f.max;
				break;
			case 'boolean':
				p = { type: Boolean, set: blankToUndefined, default: dflt === true };
				break;
			case 'date':
				p = { type: Date, set: blankToUndefined };
				break;
			case 'select':
				p = { type: String, trim: true };
				break;
			case 'multiselect':
			case 'tags':
			case 'images':
			case 'files':
				p = { type: [{ type: String, trim: true, ...(enumRule && { enum: enumRule }) }], default: undefined };
				break;
			case 'reference':
				p = { type: Schema.Types.ObjectId, ref: f.ref, set: idOnly };
				break;
			case 'references':
				p = { type: [{ type: Schema.Types.ObjectId, ref: f.ref }], set: idsOnly, default: undefined };
				break;
			case 'section':
				p = { type: new Schema(pathsOf(f.fields || []), { _id: false, minimize: false }), default: undefined };
				break;
			case 'sectionlist':
				p = { type: [new Schema(pathsOf(f.fields || []), { _id: false })], default: undefined };
				break;
		}

		// A single value limited to a list: blank means "not set", not a value outside it.
		if (enumRule && !ARRAY_KINDS.includes(f.kind)) {
			p.enum = enumRule;
			p.set = blankToUndefined;
		}
		if (LENGTH_KINDS.includes(f.kind)) {
			if (typeof f.min === 'number') p.minlength = f.min;
			if (typeof f.max === 'number') p.maxlength = f.max;
		}
		if (required) p.required = required;
		if (f.unique) {
			p.unique = true;
			if (!f.required) p.sparse = true;
		} else if (f.index) p.index = true;
		if (dflt !== undefined && f.kind !== 'boolean') {
			if (f.kind === 'date') p.default = dflt === 'now' ? Date.now : () => new Date(dflt);
			// A function, so no two records share one array.
			else if (Array.isArray(dflt)) p.default = () => [...dflt];
			else p.default = dflt;
		}

		paths[f.key] = p;
	}
	return paths;
};

export const buildSchema = (def: ModelDef) => {
	const paths = pathsOf(def.fields);

	if (def.code?.enabled) paths.code = { type: String, trim: true, unique: true, sparse: true };

	const restricted = !!def.access?.enabled;
	if (restricted) {
		paths.privacy = {
			type: String,
			enum: { values: PRIVACY_VALUES, message: 'Privacy is only me, private or public' },
			default: PRIVACY_VALUES.includes(def.access?.default || '') ? def.access!.default : 'private',
		};
		paths.access = { type: [{ type: Schema.Types.ObjectId, ref: 'Admin' }], set: idsOnly, default: undefined };
		paths.addedBy = { type: Schema.Types.ObjectId, ref: 'Admin', set: idOnly };
	}

	// Indexes are synced explicitly (syncIndexes) after a change, where a
	// failure — duplicates under a new unique field — can be reported back.
	const schema = new Schema<any>(paths, { timestamps: true, versionKey: false, autoIndex: false });

	if (restricted) {
		schema.index({ addedBy: 1 });
		schema.index({ access: 1 });
		schema.plugin(accessNotifications, { route: def.route, noun: humanize(def.name), displayField: displayFieldOf(def) });
	}

	if (def.code?.enabled)
		schema.pre('save', async function (this: any) {
			// Always for a new record, so a copied record never keeps its source's code.
			if (this.isNew) this.code = await nextCode(def);
		});

	return schema;
};

/* ------------------------------------------ settings and config, generated */

export type TargetInfo = { route: string; display: string; title?: string; built: boolean };

/** The field that names a record of a built model when it's linked. */
export const displayFieldOf = (def: ModelDef) => {
	if (def.displayField && (def.fields.some(f => f.key === def.displayField) || def.displayField === 'code'))
		return def.displayField;
	return def.fields.find(f => f.kind === 'text')?.key || def.fields.find(f => TEXT_KINDS.includes(f.kind))?.key || (def.code?.enabled ? 'code' : '_id');
};

/** A code model's best guess at the same. */
const guessDisplay = (Model: mongoose.Model<any>) =>
	['name', 'title', 'code', 'email', 'label'].find(p => Model.schema.path(p)) || '_id';

/**
 * The settings object for a built model — what its settings.ts would export.
 * Filters ride along under `filter:`, exactly as in code settings.
 */
export const generateSettings = (def: ModelDef, target: (ref?: string) => TargetInfo | null) => {
	const settings: Record<string, any> = {};

	if (def.code?.enabled)
		settings.code = {
			title: 'Code',
			type: 'string',
			sort: true,
			search: true,
			schema: { default: true, displayInTable: true, sort: true, copy: true },
		};

	for (const f of def.fields) {
		const title = f.label || humanize(f.key);
		const shown = f.showInTable !== false;
		const s: any = { title, edit: true, schema: { default: shown, displayInTable: shown } };
		// With a default, leaving it out isn't an error — the model fills it in.
		// The form still marks it required, and starts from the default.
		if (f.required && defaultOf(f) === undefined) s.required = true;
		else if (f.required) s.schema.isRequired = true;
		if (f.unique) s.unique = true;
		// `helperText` is what the form reads.
		if (f.helper) s.schema.helperText = f.helper;
		const allowed = enumOf(f);
		const options = allowed?.map((v, i) => ({ value: v, label: f.options![i].label || humanize(String(v)) }));
		const listFilter = () => ({
			name: f.key,
			field: `${f.key}_in`,
			type: 'multi-select',
			label: title,
			title: `Filter by ${title}`,
			options,
		});
		const sortable = (on: boolean) => {
			if (!on) return;
			s.sort = true;
			s.schema.sort = true;
		};

		switch (f.kind) {
			case 'text':
				Object.assign(s, { type: 'string', trim: true, search: f.searchable ?? true });
				sortable(true);
				break;
			case 'textarea':
				Object.assign(s, { type: 'string', search: f.searchable ?? false });
				s.schema.type = 'textarea';
				break;
			case 'editor':
				Object.assign(s, { type: 'string', search: f.searchable ?? false });
				s.schema.type = 'editor';
				break;
			case 'email':
				Object.assign(s, { type: 'email', trim: true, search: f.searchable ?? true });
				s.schema.copy = true;
				sortable(true);
				break;
			case 'url':
				Object.assign(s, { type: 'uri', trim: true, search: f.searchable ?? false });
				s.schema.viewType = 'external-link';
				break;
			case 'color':
				Object.assign(s, { type: 'string', trim: true });
				s.schema.type = 'color';
				break;
			case 'image': {
				s.type = 'string';
				s.schema.type = 'image';
				// A thumbnail beside the record's name; the detail page shows it large.
				const display = displayFieldOf(def);
				s.schema.tableType = 'image-text';
				s.schema.imageKey = f.key;
				if (display !== '_id' && display !== f.key) s.schema.tableKey = display;
				s.schema.viewType = 'image';
				s.schema.viewKey = f.key;
				break;
			}
			case 'images':
				s.type = 'array-string';
				s.schema.type = 'image-array';
				s.schema.tableType = 'data-array-count';
				s.schema.viewType = 'image-array';
				break;
			case 'file':
				s.type = 'string';
				s.schema.type = 'file';
				s.schema.tableType = 'file';
				s.schema.viewType = 'file';
				break;
			case 'files':
				s.type = 'array-string';
				s.schema.type = 'file-array';
				s.schema.tableType = 'data-array-count';
				s.schema.viewType = 'file-array';
				break;
			case 'video':
				s.type = 'string';
				s.schema.type = 'video';
				s.schema.tableType = 'external-link';
				s.schema.viewType = 'external-link';
				break;
			case 'number':
				s.type = 'number';
				s.schema.type = 'number';
				sortable(true);
				break;
			case 'formula':
				// Read-only: calculated from other number fields on every save.
				Object.assign(s, { type: 'number', edit: false });
				delete s.required;
				delete s.schema.isRequired;
				s.schema.type = 'formula';
				s.schema.formula = tidyFormula(f.formula);
				s.schema.tableType = 'number';
				s.schema.viewType = 'number';
				sortable(true);
				break;
			case 'boolean':
				s.type = 'boolean';
				s.schema.type = 'checkbox';
				sortable(true);
				s.filter = { name: f.key, type: 'boolean', label: title, title: `Filter by ${title}` };
				break;
			case 'date':
				s.type = 'date';
				s.schema.type = 'date';
				sortable(true);
				s.filter = { name: f.key, type: 'date', label: title, title: `Filter by ${title}` };
				break;
			case 'select':
				Object.assign(s, { type: 'string', search: f.searchable ?? true });
				sortable(true);
				break;
			case 'multiselect':
				Object.assign(s, { type: 'array-string', search: f.searchable ?? true });
				s.schema.type = 'select-tag';
				s.schema.tableType = 'tag';
				s.schema.viewType = 'tag';
				break;
			case 'tags':
				Object.assign(s, { type: 'array-string', search: f.searchable ?? true });
				s.schema.type = 'tag';
				break;
			case 'reference':
			case 'references': {
				const t = target(f.ref);
				const display = t?.display || '_id';
				s.type = f.kind === 'reference' ? 'string' : 'array';
				s.populate = { path: f.key, select: display === '_id' ? '_id' : display };
				s.schema.model = t?.route;
				s.schema.menuKey = display;
				s.schema.labelKey = display;
				if (f.kind === 'reference') {
					s.schema.type = 'data-menu';
					s.schema.tableType = 'string';
					s.schema.tableKey = `${f.key}.${display}`;
					sortable(true);
				} else {
					s.schema.type = 'data-tag';
					s.schema.viewType = 'data-array-tag';
				}
				if (f.ref)
					s.filter = {
						name: f.key,
						field: `${f.key}_in`,
						type: 'multi-select',
						category: 'model',
						model: f.ref,
						key: display,
						label: title,
						title: `Filter by ${title}`,
					};
				break;
			}
			case 'section':
				s.type = 'object';
				s.schema.type = 'section-object';
				s.schema.dataModel = dataModelOf(f.fields);
				s.schema.tableType = 'section-object';
				s.schema.viewType = 'section-object';
				break;
			case 'sectionlist': {
				s.type = 'array-object';
				const dataModel = dataModelOf(f.fields);
				const texts = (f.fields || []).filter(x => ['text', 'email', 'url', 'select', 'textarea'].includes(x.kind));
				s.schema.type = 'section-data-array';
				s.schema.section = {
					title,
					// The form lists the rows as a table, number columns added up.
					table: true,
					addBtnText: f.addLabel || 'Add row',
					display: {
						title: texts[0]?.key,
						description: texts[1]?.key,
						image: (f.fields || []).find(x => x.kind === 'image')?.key,
					},
					dataModel,
				};
				s.schema.tableType = 'data-array-count';
				s.schema.viewType = 'section-data-array';
				break;
			}
		}

		// Limited to a list: picked from it in the form, and filtered by it.
		if (options) {
			s.schema.options = options;
			if (f.kind === 'tags') s.schema.type = 'select-tag';
			else if (f.kind !== 'multiselect') s.schema.type = 'select';
			if (f.kind !== 'number') s.filter = listFilter();
		}

		// Prefilled in the create form; the model applies it too when nothing is sent.
		const dflt = defaultOf(f);
		if (dflt !== undefined && dflt !== 'now' && dflt !== false) s.schema.value = dflt;

		if (typeof f.min === 'number') s.min = f.min;
		if (typeof f.max === 'number') s.max = f.max;
		settings[f.key] = s;
	}

	if (def.access?.enabled) Object.assign(settings, accessSettings(def));

	settings.createdAt = {
		title: 'Created',
		type: 'date',
		sort: true,
		schema: { type: 'date', default: true, displayInTable: true, sort: true },
	};

	return settings;
};

/** The input type a section's own field gets in the form. */
const SUB_INPUT: Partial<Record<FieldKind, string>> = {
	text: 'text',
	textarea: 'textarea',
	email: 'email',
	url: 'text',
	color: 'color',
	number: 'number',
	formula: 'formula',
	boolean: 'checkbox',
	date: 'date',
	select: 'select',
	image: 'image',
	file: 'file',
};

/**
 * A section's fields as the form draws them (and formula.function.ts reads
 * them): `{ name, label, type, isRequired, options, formula }`.
 */
export const dataModelOf = (fields: ModelFieldDef[] = []) =>
	fields.map(x => {
		const allowed = enumOf(x);
		return {
			name: x.key,
			label: x.label || humanize(x.key),
			type: SUB_INPUT[x.kind] || 'text',
			kind: x.kind,
			...(x.required && x.kind !== 'formula' && { isRequired: true }),
			...(x.helper && { helper: x.helper }),
			...(allowed && { options: allowed.map((v, i) => ({ value: v, label: x.options![i].label || humanize(String(v)) })) }),
			...(x.kind === 'formula' && { formula: tidyFormula(x.formula) }),
		};
	});

/** The owner, privacy and access fields of an access-restricted model. */
export const accessSettings = (def: ModelDef) => ({
	privacy: {
		title: 'Privacy',
		type: 'string',
		edit: true,
		sort: true,
		schema: {
			type: 'select',
			options: PRIVACY_OPTIONS,
			value: PRIVACY_VALUES.includes(def.access?.default || '') ? def.access!.default : 'private',
			isRequired: true,
			helperText: 'Only me: just you. Private: you and the people you give access. Public: everyone who can open this page.',
			default: true,
			displayInTable: true,
			sort: true,
		},
		filter: {
			name: 'privacy',
			field: 'privacy_in',
			type: 'multi-select',
			label: 'Privacy',
			title: 'Filter by privacy',
			options: PRIVACY_OPTIONS,
		},
	},
	access: {
		title: 'Access',
		type: 'array',
		edit: true,
		populate: { path: 'access', select: 'name email' },
		schema: {
			type: 'data-tag',
			model: 'access-users',
			menuKey: 'name',
			labelKey: 'name',
			modelAddOn: 'email',
			helperText: 'They can see and edit it, and get a notification.',
			// Shown in the form only when the record is private.
			renderIf: { field: 'privacy', operator: 'eq', value: 'private' },
			viewType: 'data-array-tag',
			default: false,
			displayInTable: false,
		},
	},
	addedBy: {
		title: 'Owner',
		type: 'string',
		edit: false,
		sort: true,
		populate: { path: 'addedBy', select: 'name email' },
		schema: { type: 'read-only', tableType: 'string', tableKey: 'addedBy.name', default: true, displayInTable: true, sort: true },
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			category: 'model',
			model: 'Admin',
			key: 'name',
			label: 'Owner',
			title: 'Filter by owner',
		},
	},
});

/** The form section, table columns and view section access adds. */
export const ACCESS_FORM_SECTION = {
	sectionTitle: 'Manage access',
	description: 'Who can see this record? Choose Private to share it with particular people.',
	fields: ['privacy', 'access'],
};
export const ACCESS_VIEW_SECTION = {
	title: 'Access',
	columns: 2,
	fields: ['privacy', { field: 'addedBy', show: ['name', 'email'], label: 'Owner' }, 'access'],
};

const DEFAULT_ROW_MENU = [
	{ type: 'view-server-modal', title: 'View' },
	{ type: 'view-item', title: 'Go To Details' },
	{ type: 'edit-server-modal', title: 'Edit' },
	{ type: 'delete', title: 'Delete' },
];

/** Short inputs sit two to a row in the generated form. */
const PAIRABLE: FieldKind[] = ['text', 'email', 'url', 'number', 'date', 'select', 'reference', 'boolean', 'color'];

export const generateFormRows = (fields: ModelFieldDef[]) => {
	const rows: (string | string[])[] = [];
	let pending: string | null = null;
	for (const f of fields) {
		if (!PAIRABLE.includes(f.kind)) {
			if (pending) rows.push(pending);
			pending = null;
			rows.push(f.key);
		} else if (pending) {
			rows.push([pending, f.key]);
			pending = null;
		} else pending = f.key;
	}
	if (pending) rows.push(pending);
	return rows;
};

/** The config object for a built model — what its config.ts would export. */
export const generateConfig = (def: ModelDef) => {
	const code = def.code?.enabled ? ['code'] : [];
	const keys = def.fields.map(f => f.key);
	const restricted = !!def.access?.enabled;
	return {
		fields: [...code, ...keys, ...(restricted ? ACCESS_KEYS : []), 'createdAt'],
		table: [
			...code,
			...def.fields.filter(f => f.showInTable !== false).map(f => f.key),
			...(restricted ? ['privacy', 'addedBy'] : []),
			'createdAt',
		],
		form: [{ sectionTitle: 'Details', fields: generateFormRows(def.fields) }, ...(restricted ? [ACCESS_FORM_SECTION] : [])],
		view: [
			{ title: 'Details', columns: 2, fields: [...code, ...keys, 'createdAt'] },
			...(restricted ? [ACCESS_VIEW_SECTION] : []),
		],
		route: {
			title: def.title,
			subTitle: def.description || '',
			path: def.route,
			button: { title: `New ${humanize(def.name)}`, isModal: true },
			export: true,
			menu: DEFAULT_ROW_MENU,
		},
	};
};

/* ---------------------------------------------------- registry and sync */

type Compiled = { def: ModelDef; Model: mongoose.Model<any>; stamp: string };
const compiled = new Map<string, Compiled>(); // by model name
const failures = new Map<string, string>(); // by model name
const mounts = new Map<string, any>(); // route -> wrapper router
let appRef: any = null;
let checkedAt = 0;
let running: Promise<void> | null = null;

const stampOf = (def: any) => `${def.version || 0}:${new Date(def.updatedAt || 0).getTime()}:${def.active !== false}`;

/** The compile error for a definition, if its last compile failed. */
export const compileError = (name: string) => failures.get(name) || null;
export const compiledModel = (name: string) => compiled.get(name)?.Model || null;
export const isBuiltModel = (name: string) => compiled.has(name);

/** What a reference to `modelName` needs: its admin route and display field. */
export const makeTargetLookup = (app: any, defs: ModelDef[]) => {
	const byName = new Map(defs.map(d => [d.name, d]));
	const codeRoutes = new Map<string, { route: string; Model: mongoose.Model<any>; title?: string }>();
	for (const e of collectResourceRoutes(app)) {
		const name = e.source.Model?.modelName;
		if (name && !byName.has(name) && !codeRoutes.has(name))
			codeRoutes.set(name, { route: e.route, Model: e.source.Model, title: e.source.frontendConfig?.route?.title });
	}
	return (ref?: string): TargetInfo | null => {
		if (!ref) return null;
		const d = byName.get(ref);
		if (d) return { route: d.route, display: displayFieldOf(d), title: d.title, built: true };
		const c = codeRoutes.get(ref);
		if (c) return { route: c.route, display: guessDisplay(c.Model), title: c.title, built: false };
		return null;
	};
};

/** Every model a field can link to: code models with an admin route, and built ones. */
export const linkTargets = async (app: any) => {
	await syncDynamicModels({ app });
	const defs: ModelDef[] = (await ModelDefinition.find({}).lean()) as any;
	const lookup = makeTargetLookup(app, defs);
	const names = new Set<string>();
	for (const e of collectResourceRoutes(app)) if (e.source.Model?.modelName) names.add(e.source.Model.modelName);
	defs.forEach(d => names.add(d.name));
	return [...names]
		.map(name => ({ name, ...lookup(name)! }))
		.filter(t => t.route)
		.sort((a, b) => a.name.localeCompare(b.name));
};

const compile = (def: ModelDef) => {
	const existing = mongoose.models[def.name];
	if (existing && !compiled.has(def.name))
		throw new Error(`A model in code is already registered as ${def.name}`);
	if (existing) mongoose.deleteModel(def.name);
	const Model = mongoose.model(def.name, buildSchema(def), def.collectionName);
	compiled.set(def.name, { def, Model, stamp: stampOf(def) });
	failures.delete(def.name);
	return Model;
};

const mount = (def: ModelDef, Model: mongoose.Model<any>, lookup: ReturnType<typeof makeTargetLookup>) => {
	const router = defineRoutes({
		Model,
		settings: generateSettings(def, lookup),
		permission: def.permission,
		frontendConfig: generateConfig(def),
		route: def.route,
		// Restricted records: only the owner, the people given access, or everyone when public.
		...(def.access?.enabled && { injectMiddleware: recordAccessMiddleware(Model) }),
	});
	const wrapper = express.Router();
	wrapper.use(`/${def.route}`, router);
	mounts.set(def.route, wrapper);
	setDynamicMount(def.route, router);
	invalidateRoute(def.route);
};

const unmount = (route: string) => {
	if (!mounts.has(route) && !dynamicMounts.has(route)) return;
	mounts.delete(route);
	setDynamicMount(route, null);
	invalidateRoute(route);
};

/**
 * Brings this process's compiled models and routes in line with the
 * definitions. Cheap when nothing changed: one small query, at most every
 * 10 seconds unless `force`.
 */
export const syncDynamicModels = async ({ app, force }: { app?: any; force?: boolean } = {}) => {
	if (app) appRef = app;
	if (running) return running;
	if (!force && Date.now() - checkedAt < TTL_MS) return;

	running = (async () => {
		try {
			const defs: ModelDef[] = (await ModelDefinition.find({}).lean()) as any;
			checkedAt = Date.now();
			let changed = false;

			// 1. Compile what's new or changed; a disabled model stays compiled so
			//    links to it still populate — it only loses its route.
			const live = new Set(defs.map(d => d.name));
			for (const def of defs) {
				if (compiled.get(def.name)?.stamp === stampOf(def)) continue;
				changed = true;
				try {
					compile(def);
				} catch (e: any) {
					failures.set(def.name, e.message);
					console.error(`Model builder: ${def.name} not compiled — ${e.message}`);
				}
			}
			for (const [name, c] of compiled)
				if (!live.has(name)) {
					changed = true;
					compiled.delete(name);
					if (mongoose.models[name]) mongoose.deleteModel(name);
					unmount(c.def.route);
				}

			// 2. Routes. Any change can alter another model's links (a target's
			//    display field or route), so every route is rebuilt together.
			if (changed || defs.some(d => d.active !== false && !mounts.has(d.route) && compiled.has(d.name))) {
				const lookup = makeTargetLookup(appRef, defs);
				for (const def of defs) {
					const c = compiled.get(def.name);
					if (c && def.active !== false) {
						try {
							mount(def, c.Model, lookup);
						} catch (e: any) {
							failures.set(def.name, e.message);
							unmount(def.route);
						}
					} else unmount(def.route);
				}
			}
		} finally {
			running = null;
		}
	})();

	return running;
};

/**
 * The admin router's last handler: serves every built route. Anything that
 * isn't one falls through to the usual 404.
 */
export const dynamicModelsDispatcher = async (req: any, res: any, next: any) => {
	try {
		await syncDynamicModels({ app: req.app });
	} catch (e) {
		return next(e);
	}
	const segment = String(req.path || '').split('/')[1];
	const wrapper = segment && mounts.get(segment.toLowerCase());
	if (!wrapper) return next();
	return wrapper(req, res, next);
};
