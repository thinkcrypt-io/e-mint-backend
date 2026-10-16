import express from 'express';
import { currentScope, scopeKey, withoutScope } from './tenantScope.function.js';
import { tenantPermissions } from './tenantPermissions.function.js';
import { projectHooks } from './projectHooks.function.js';
import mongoose, { Schema } from 'mongoose';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import ComponentDefinition from '../models/builder/componentDefinition.model.js';
import Counter from '../../models/counter/counter.model.js';
import defineRoutes from '../../routes-admin/common/router.js';
import {
	ADMIN_API_PREFIX,
	collectResourceRoutes,
	dynamicMounts,
	mountPath,
	forgetScopeMounts,
	setDynamicMount,
} from './routeRegistry.function.js';
import { invalidateRoute } from './resolveRoute.function.js';
import { ACCESS_KEYS, PRIVACY_OPTIONS, PRIVACY_VALUES, recordAccessMiddleware } from './recordAccess.function.js';
import { accessNotifications } from './notifications.function.js';
import { format as formatFormula, parse as parseFormula } from './formula.function.js';
import { MODEL_KEY, projectCollection } from './projectIndexes.function.js';

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
 *
 * A tenant project's models share one collection, `t_<projectId>` (D21,
 * WO-43): each is a discriminator of the project's base model, its records
 * marked `_model: <name>`. The super admin's models keep one collection each.
 */

const TTL_MS = 10_000;

export const FIELD_KINDS = [
	'text',
	'textarea',
	'editor',
	'email',
	'url',
	// A record's address, made from another field (`from`): "My first post" → my-first-post. Unique (docs/cms D2).
	'uid',
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
	// A shared group of fields (docs/cms D3) named by `component` — once, or `repeatable`. Compiles as a section (list).
	'component',
	// Content blocks (docs/cms D4): a list of components in any order, of the kinds in `components` — a page's sections.
	'blocks',
	// A credential kept for someone: stored as text, shown as dots in the panel (click to see); never in history.
	'password',
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

/**
 * What a component's own fields can be (docs/cms D3): a section's, plus rich
 * text, galleries, tags and media lists, links to records — and a group or
 * list of rows one level deep (its rows' fields are a section's: cards,
 * questions), or another component whose fields are all plain (CMS-03b).
 */
export const COMPONENT_KINDS: FieldKind[] = [
	...SUB_KINDS,
	'editor',
	'images',
	'files',
	'video',
	'tags',
	'multiselect',
	'reference',
	'references',
	'section',
	'sectionlist',
	'component',
];
/** Kinds that make a component hold fields of its own fields — what a component inside another may not have. */
export const NESTING_KINDS: FieldKind[] = ['section', 'sectionlist', 'component', 'blocks'];

/** Kinds whose value is short text — the ones that can name a record. */
export const TEXT_KINDS: FieldKind[] = ['text', 'email', 'url', 'select'];
export const REFERENCE_KINDS: FieldKind[] = ['reference', 'references'];
/** Kinds that can be limited to a list of allowed values (an enum). Select and multi-select always are. */
export const ENUM_KINDS: FieldKind[] = ['text', 'number', 'select', 'multiselect', 'tags'];
/** Kinds stored as a list. */
export const ARRAY_KINDS: FieldKind[] = ['multiselect', 'tags', 'images', 'files', 'references'];
/** Kinds with no default value. */
export const NO_DEFAULT_KINDS: FieldKind[] = ['reference', 'references', 'formula', 'section', 'sectionlist', 'password'];
/** Kinds whose key may say what they hold (password, pin, token): they're encrypted and hidden. */
export const SECRET_KINDS: FieldKind[] = ['password'];
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
	'toObject', 'toJSON', 'validate', 'isSelected', 'model', 'baseModel', MODEL_KEY,
];

/**
 * Route names the admin app already uses for its own pages (a built route
 * with one of these names would open that page instead of its table) plus
 * words that read as actions. The backend's own mounts are checked live.
 */
const RESERVED_ROUTES = new Set([
	'api', 'admin', 'auth', 'builder', 'model-builder', 'docs', 'doc', 'view', 'views', 'dashboard', 'settings',
	'notifications', 'access-users', 'templates', 'search',
	'new', 'edit', 'create', 'test', 'error', 'not-found', 'heroku-doc', 'vercel-doc', 'user-feedback',
	'user-feedback-success', 'purchased-themes', 'customer-ledger', 'invoices-old', 'repos', 'qr', 'users',
	'orders', 'payments', 'groups', 'damages', 'deliveries', 'suppliers', 'images', 'fgroups', 'servicecat',
	'clickevents', 'modelattributes', 'plannedmodels', 'plannedpages', 'plannedprojects', 'plannedfeatures',
]);

/**
 * A tenant project's route names that its own API already uses
 * (routes-tenant/project.router.ts) or the tenant panel shows as a page.
 */
const TENANT_RESERVED_ROUTES = new Set([
	// Only the tenant API's own paths (and action words): project tables live
	// at /t/<route> in the tenant panel, so the admin's page names are free.
	'api', 'auth', 'builder', 'model-builder', 'docs', 'view', 'views', 'dashboard', 'settings', 'notifications',
	'access-users', 'new', 'edit', 'create', 'test', 'error', 'not-found',
	'org', 'projects', 'invitations', 'p', 'sidebar', 'sidebarcategories', 'sidebaritems', 'upload', 'uploads', 'media',
	'files', 'permissionlist', 'analytics', 'api-keys', 'public', 'mcp', 'site', 'track', 'customers', 'members', 'roles',
	'sidebar-builder', 'dashboard-builder', 'account', 'switch', 'webhooks', 'api-overview', 'history', 'widgets', 'templates',
	// The tenant panel's project pages (/<project>/<page>): a model's table is /<project>/<route>.
	'images', 'public-api', 't',
	// The navbar search (WO-54).
	'search',
]);

/**
 * A tenant model's Mongoose name (docs/multi-tenancy D6): `T<projectId>_<Name>`
 * inside a project's scope, the name itself for the super admin. Names are
 * global per connection; this keeps every project's apart from the platform's.
 */
export const internalModelName = (name: string) => {
	const s = currentScope();
	return s?.project ? `T${s.project}_${name}` : name;
};

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
	/** A uid kind's source field: its slug is made from that field's value until it's typed by hand. */
	from?: string;
	/** A component kind's component (`category.name`), and whether it's a list of them (docs/cms D3). */
	component?: string;
	repeatable?: boolean;
	/** A blocks kind's allowed components (uids) — and, once expanded, what they are (docs/cms D4). */
	components?: string[];
	blockTypes?: { uid: string; title: string; icon?: string; description?: string; fields: ModelFieldDef[] }[];
	/** An image / images kind: the API sends { url, alt, caption, width, height, focal } (mediaDetails.function.ts). */
	details?: boolean;
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
	/** A collection of records, or a single type: exactly one record (docs/cms D2). */
	kind?: 'collection' | 'single';
	/** Records are drafts until published; the outside reads the published snapshot (docs/cms D5). */
	draftAndPublish?: boolean;
	code?: { enabled?: boolean; prefix?: string; padding?: number; start?: number };
	/** Per-record access (recordAccess.function.ts): an owner, a privacy and an access list on every record. */
	access?: { enabled?: boolean; default?: string };
	/** Tenant projects: the model's public API (routes-public). */
	publicApi?: { enabled?: boolean; actions?: string[]; auth?: 'none' | 'customer'; ownerOnly?: boolean; readOnlyFields?: string[] };
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
	// A tenant project checks its own names and routes only. All its models
	// share its one collection, t_<projectId> (D21), so a route never meets a
	// collection; a name is taken while records of a deleted model with that
	// name are still kept there (their `_model`).
	const tenant = currentScope();
	const collectionOf = (route: string) => (tenant?.project ? projectCollection(tenant.project) : route);
	const kept: string[] = tenant?.project
		? await mongoose.connection
				.collection(projectCollection(tenant.project))
				.distinct(MODEL_KEY)
				.catch(() => [])
		: [];
	const names = new Set(
		(tenant ? [] : mongoose.modelNames().filter(n => n !== (own as any)?.name))
			.concat(defs.map((d: any) => d.name), kept.filter(n => n !== (own as any)?.name))
			.map(n => String(n).toLowerCase())
	);
	const routes = new Set(
		tenant
			? [...TENANT_RESERVED_ROUTES, ...defs.map((d: any) => d.route)]
			: [...adminMounts(app), ...RESERVED_ROUTES, ...defs.map((d: any) => d.route)]
	);
	// The platform's: a route is taken while a collection by its name holds data.
	const collections = new Set<string>();
	if (!tenant) {
		((await mongoose.connection.db?.listCollections({}, { nameOnly: true }).toArray()) || []).forEach((c: any) =>
			collections.add(c.name.toLowerCase())
		);
		defs.forEach((d: any) => collections.add(d.collectionName.toLowerCase()));
	}

	const reasons: string[] = [];
	const nameFree = (name: string) => !names.has(name.toLowerCase());
	const routeFree = (route: string) => !routes.has(route) && !dynamicMounts.has(route);

	if (tenant) {
		// In a project the name and the address are numbered apart: only the
		// project's own models can take a name, so a `Customer` stays Customer
		// even though /customers is the project's sign-in customers (it gets
		// /customers2). The Mongoose name is T<projectId>_<name> either way.
		let name: string | null = null;
		let route: string | null = null;
		for (let n = 1; n < 200 && !name; n++) if (nameFree(n === 1 ? base : `${base}${n}`)) name = n === 1 ? base : `${base}${n}`;
		for (let n = 1; n < 200 && !route; n++) if (routeFree(n === 1 ? baseRoute : `${baseRoute}${n}`)) route = n === 1 ? baseRoute : `${baseRoute}${n}`;
		if (!name || !route) return null;
		if (name !== base) reasons.push(`This project already has a model named ${base}`);
		if (route !== baseRoute) reasons.push(`/${baseRoute} is one of the project's own addresses`);
		return { requested, name, route, collectionName: collectionOf(route), changed: name !== base || route !== baseRoute, reasons };
	}

	for (let n = 1; n < 200; n++) {
		const name = n === 1 ? base : `${base}${n}`;
		const route = n === 1 ? baseRoute : `${baseRoute}${n}`;
		const nameTaken = !nameFree(name);
		const routeTaken = routes.has(route) || dynamicMounts.has(route);
		const collectionTaken = collections.has(collectionOf(route).toLowerCase());
		if (!nameTaken && !routeTaken && !collectionTaken)
			return { requested, name, route, collectionName: collectionOf(route), changed: n > 1, reasons };
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

const codeCounterSlug = (name: string) => `model-${internalModelName(name)}`;
/** The Counter slug a built model's codes are numbered with (per project for tenants). */
export const counterSlugFor = codeCounterSlug;

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

/** A group's value with nothing in it: {}, or only blanks (empty text, empty lists, null). */
const isBlankGroup = (v: any) =>
	!!v &&
	typeof v === 'object' &&
	!Array.isArray(v) &&
	Object.values(typeof v.toObject === 'function' ? v.toObject() : v).every(
		x => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length)
	);

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
			case 'uid':
				// Made and checked on validate (uidHooks); always unique within the model.
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
			// A tenant's links name models of its own project, by their internal names — at any depth
			// (a link inside a component, CMS-03b).
			case 'reference':
				p = { type: Schema.Types.ObjectId, ref: f.ref && internalModelName(f.ref), set: idOnly };
				break;
			case 'references':
				p = { type: [{ type: Schema.Types.ObjectId, ref: f.ref && internalModelName(f.ref) }], set: idsOnly, default: undefined };
				break;
			case 'section':
				p = { type: new Schema(pathsOf(f.fields || []), { _id: false, minimize: false }), default: undefined };
				// A component left blank in the form is "not filled in", not a half-filled one its own required fields refuse (docs/cms D3).
				if (f.component) p.set = (v: any) => (isBlankGroup(v) ? undefined : v);
				break;
			case 'sectionlist': {
				p = { type: [new Schema(pathsOf(f.fields || []), { _id: false })], default: undefined };
				// A repeatable component's least and most (docs/cms D3).
				const lo = typeof f.min === 'number' ? f.min : undefined;
				const hi = typeof f.max === 'number' ? f.max : undefined;
				if (f.component && (lo !== undefined || hi !== undefined))
					p.validate = {
						validator: (v: any[]) => {
							const n = Array.isArray(v) ? v.length : 0;
							return (lo === undefined || n === 0 || n >= lo) && (hi === undefined || n <= hi);
						},
						message: `${label}: ${lo !== undefined && hi !== undefined ? `between ${lo} and ${hi}` : lo !== undefined ? `at least ${lo}` : `at most ${hi}`}`,
					};
				break;
			}
			case 'component':
				// Expanded before compiling (expandComponents); kept as it came if its component is unknown.
				p = { type: Schema.Types.Mixed };
				break;
			case 'blocks': {
				// Each item is one of the allowed components, told apart by `__component` (Mongoose embedded
				// discriminators, added in buildSchema), with a stable `_key`. docs/cms D4.
				const allowed = new Set(f.components || []);
				const lo = typeof f.min === 'number' ? f.min : undefined;
				const hi = typeof f.max === 'number' ? f.max : undefined;
				p = {
					type: [new Schema({ _key: { type: String, trim: true } }, { discriminatorKey: '__component', _id: false })],
					default: undefined,
					validate: [
						{
							validator: (v: any[]) => (Array.isArray(v) ? v : []).every(x => allowed.has(String(x?.__component || ''))),
							message: `${label}: each item must be one of ${[...allowed].join(', ') || 'its components'}`,
						},
						{
							validator: (v: any[]) => {
								const n = Array.isArray(v) ? v.length : 0;
								return (lo === undefined || n === 0 || n >= lo) && (hi === undefined || n <= hi);
							},
							message: `${label}: ${lo !== undefined && hi !== undefined ? `between ${lo} and ${hi} items` : lo !== undefined ? `at least ${lo} items` : `at most ${hi} items`}`,
						},
					],
				};
				break;
			}
			case 'password':
				// `secret` keeps the value out of history (secretFields.function.ts).
				p = { type: String, secret: true };
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
		if (f.unique || f.kind === 'uid') {
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

/**
 * A definition with its component fields filled in (docs/cms D3): each becomes
 * a section — or, repeatable, a section list — of its component's fields, as
 * this scope last loaded them (syncDynamicModels). A component that's gone
 * leaves an empty section rather than breaking the model.
 */
export const expandComponents = <T extends { fields: ModelFieldDef[] }>(def: T): T => {
	if (!def?.fields?.some(f => f.kind === 'component' || f.kind === 'blocks')) return def;
	const comps = reg().components;
	return { ...def, fields: def.fields.map(f => expandField(f, comps)) };
};

/**
 * One field with its components opened up: a component becomes a section (a
 * list of rows when repeatable) of the component's fields — and a component
 * inside that one the same, one level down (CMS-03b); content blocks learn
 * what each allowed component is.
 */
const expandField = (f: ModelFieldDef, comps: Map<string, any>, depth = 0): ModelFieldDef => {
	const inner = (fields: ModelFieldDef[] = []) => (depth < 2 ? fields.map(x => expandField(x, comps, depth + 1)) : fields);
	// Content blocks keep their kind and learn what each allowed component is (docs/cms D4).
	if (f.kind === 'blocks')
		return {
			...f,
			blockTypes: (f.components || [])
				.map(uid => comps.get(uid))
				.filter(Boolean)
				.map(c => ({ uid: c!.uid, title: c!.title, icon: c!.icon, description: c!.description, fields: inner(c!.fields) })),
		};
	if (f.kind !== 'component') return f;
	const c = comps.get(String(f.component || ''));
	return {
		...f,
		kind: f.repeatable ? 'sectionlist' : 'section',
		fields: inner((c?.fields || []) as ModelFieldDef[]),
		addLabel: f.addLabel || (f.repeatable ? `Add ${String(c?.title || 'item').toLowerCase()}` : undefined),
	} as ModelFieldDef;
};

/** The components this scope has, by uid (loaded with the models). */
export const scopeComponents = () => reg().components;

/**
 * A uid's form: lower case, words joined by dashes, accents off Latin letters;
 * other scripts' letters kept (a Bangla title makes a Bangla address).
 */
export const uidOf = (value: any) =>
	String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120)
		.replace(/-+$/, '');

/**
 * uid fields (docs/cms D2), on every save: one typed by hand is put in uid
 * form and must be free in this model; an empty one is made from its `from`
 * field, and gets -2, -3… when that's taken. Left empty with nothing to make
 * it from, the required check (if any) speaks.
 */
const uidHooks = (schema: Schema, def: ModelDef) => {
	const uids = def.fields.filter(f => f.kind === 'uid');
	if (!uids.length) return;
	schema.pre('validate', async function (this: any) {
		const Model: any = this.constructor;
		for (const f of uids) {
			const label = f.label || humanize(f.key);
			const typed = this.get(f.key);
			if (typed) {
				const v = uidOf(typed);
				if (v !== typed) this.set(f.key, v);
				if (!v) this.invalidate(f.key, `${label} needs letters or digits`);
				else if ((this.isNew || this.isModified(f.key)) && (await Model.exists({ [f.key]: v, _id: { $ne: this._id } })))
					this.invalidate(f.key, `${label} “${v}” is already used — pick another`);
				continue;
			}
			const base = f.from ? uidOf(this.get(f.from)) : '';
			if (!base) continue;
			let v = base;
			for (let n = 2; await Model.exists({ [f.key]: v, _id: { $ne: this._id } }); n++) v = `${base}-${n}`;
			this.set(f.key, v);
		}
	});
};

/**
 * Content blocks (docs/cms D4): each allowed component becomes a discriminator
 * of the field's items — validated, defaulted and stripped as that component —
 * and every item gets a `_key` that stays with it (the builder and the site
 * bind to it).
 */
const blockTypes = (schema: Schema, def: ModelDef) => {
	const zones = def.fields.filter(f => f.kind === 'blocks');
	if (!zones.length) return;
	for (const f of zones) {
		const arr: any = schema.path(f.key);
		for (const t of f.blockTypes || []) arr.discriminator(t.uid, new Schema(pathsOf(t.fields || []), { _id: false }));
	}
	schema.pre('validate', function (this: any) {
		for (const f of zones) {
			const items = this.get(f.key);
			if (!Array.isArray(items)) continue;
			for (const it of items) if (it && !it._key) it._key = Math.random().toString(36).slice(2, 10);
		}
	});
};

/** A single type (docs/cms D2) holds one record: a second is refused, however it's added. */
const singleHooks = (schema: Schema, def: ModelDef) => {
	const message = `${def.title} is a single type — it holds one record, which is already there. Edit that one.`;
	schema.pre('save', async function (this: any) {
		if (!this.isNew) return;
		const Model: any = this.constructor;
		if (await Model.exists({ _id: { $ne: this._id } })) throw Object.assign(new Error(message), { status: 400, name: 'SingleTypeError' });
	});
	schema.pre('insertMany', async function (this: any, next: any, docs: any) {
		const n = Array.isArray(docs) ? docs.length : 1;
		const Model: any = this;
		if (n > 1 || (await Model.exists({}))) return next(Object.assign(new Error(message), { status: 400, name: 'SingleTypeError' }));
		next();
	});
};

export const buildSchema = (input: ModelDef) => {
	const def = expandComponents(input);
	const paths = pathsOf(def.fields);

	if (def.code?.enabled) paths.code = { type: String, trim: true, unique: true, sparse: true };

	const restricted = !!def.access?.enabled;
	// Who owns and shares a record: the platform's admins, or in a tenant
	// project the organization's people (D19 — /access-users lists them).
	const people = currentScope() ? 'TenantUser' : 'Admin';
	if (restricted) {
		paths.privacy = {
			type: String,
			enum: { values: PRIVACY_VALUES, message: 'Privacy is only me, private or public' },
			default: PRIVACY_VALUES.includes(def.access?.default || '') ? def.access!.default : 'private',
		};
		paths.access = { type: [{ type: Schema.Types.ObjectId, ref: people }], set: idsOnly, default: undefined };
		paths.addedBy = { type: Schema.Types.ObjectId, ref: people, set: idOnly };
	}

	// A public API's records can belong to the project customer who made them
	// (owner-only). Not in the model's settings, so the panels' tables ignore it;
	// underscored so it never collides with a field of the model's own (an
	// order's `customer` link to the tenant's own Customers model).
	if (def.publicApi?.enabled) paths._customer = { type: Schema.Types.ObjectId, ref: 'ProjectCustomer', index: true };

	// Drafts and publishing (docs/cms D5, drafts.function.ts): the live snapshot, never sent unless asked for.
	if (def.draftAndPublish) {
		paths._published = { type: Schema.Types.Mixed, select: false };
		paths._publishedAt = { type: Date };
		paths._publishedFrom = { type: Date };
	}

	// Indexes are synced explicitly (syncIndexes) after a change, where a
	// failure — duplicates under a new unique field — can be reported back.
	const schema = new Schema<any>(paths, { timestamps: true, versionKey: false, autoIndex: false });

	uidHooks(schema, def);
	blockTypes(schema, def);
	if (def.kind === 'single') singleHooks(schema, def);

	if (restricted) {
		schema.index({ addedBy: 1 });
		schema.index({ access: 1 });
		// Who a record is shared with hears about it — an admin, or a project's people (WO-37).
		const scope = currentScope();
		schema.plugin(accessNotifications, {
			route: def.route,
			noun: humanize(def.name),
			displayField: displayFieldOf(def),
			...(scope?.project && { tenant: { organization: scope.organization, project: scope.project } }),
		});
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
export const generateSettings = (input: ModelDef, target: (ref?: string) => TargetInfo | null) => {
	const def = expandComponents(input);
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
		// A uid made from another field fills itself on save — like a default (docs/cms D2).
		const fillsItself = defaultOf(f) !== undefined || (f.kind === 'uid' && !!f.from);
		if (f.required && !fillsItself) s.required = true;
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
			case 'uid':
				// The slug input (docs/cms D2): filled from `from` as it's typed, until edited by hand.
				Object.assign(s, { type: 'string', trim: true, search: f.searchable ?? true, unique: true });
				s.schema.type = 'slug';
				s.schema.copy = true;
				if (f.from) s.schema.slugFrom = f.from;
				sortable(true);
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
				s.schema.dataModel = dataModelOf(f.fields, target);
				s.schema.tableType = 'section-object';
				s.schema.viewType = 'section-object';
				break;
			case 'sectionlist': {
				s.type = 'array-object';
				const dataModel = dataModelOf(f.fields, target);
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
			case 'blocks':
				// The blocks editor (docs/cms D4): add any allowed component, reorder, fill each in.
				s.type = 'array-object';
				s.schema.type = 'blocks';
				s.schema.blocks = (f.blockTypes || []).map(t => ({
					uid: t.uid,
					title: t.title,
					icon: t.icon || '',
					description: t.description || '',
					dataModel: dataModelOf(t.fields, target),
				}));
				if (typeof f.max === 'number') s.schema.limit = f.max;
				s.schema.tableType = 'data-array-count';
				s.schema.viewType = 'blocks';
				break;
			case 'password':
				// Dots in the table, form and detail page, with show and copy.
				Object.assign(s, { type: 'string', search: false, secret: true });
				s.schema.type = 'password';
				s.schema.tableType = 'password';
				s.schema.viewType = 'password';
				break;
		}

		// Links to records inside a component's fields (CMS-03b) come back with their names, like a top-level link.
		const inner = SECTION_KINDS.includes(f.kind) ? linksIn(f.key, f.fields, target) : f.kind === 'blocks' ? (f.blockTypes || []).flatMap(t => linksIn(f.key, t.fields, target)) : [];
		if (inner.length) s.populate = [...new Map(inner.map(x => [x.path, x])).values()];

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

	// Drafts and publishing (docs/cms D5): when it last went live — empty while a draft.
	if (def.draftAndPublish) {
		settings._publishedAt = {
			title: 'Published',
			type: 'date',
			sort: true,
			schema: { type: 'date', default: true, displayInTable: true, sort: true },
		};
		// Where each record stands (worked out per row by the list, CMS-07); the filter asks ?publishStatus=.
		settings._status = {
			title: 'Status',
			type: 'string',
			// Coloured like any choice (colorTags): Draft grey, Changes not published orange, Published green.
			schema: {
				type: 'text',
				default: true,
				displayInTable: true,
				tableType: 'tag',
				viewType: 'tag',
				colorTags: true,
				options: PUBLISH_STATUSES.map(([, label]) => ({ value: label, label })),
				optionColors: { Draft: 'gray', Published: 'green', 'Changes not published': 'orange' },
			},
			filter: {
				name: '_status',
				field: 'publishStatus',
				type: 'select',
				label: 'Status',
				title: 'Filter by status',
				options: PUBLISH_STATUSES.map(([value, label]) => ({ value, label })),
			},
		};
	}

	settings.createdAt = {
		title: 'Created',
		type: 'date',
		sort: true,
		schema: { type: 'date', default: true, displayInTable: true, sort: true },
	};

	return settings;
};

/** A drafts record's statuses, as lists show and filter them (docs/cms D5, CMS-07). */
export const PUBLISH_STATUSES = [
	['draft', 'Draft'],
	['published', 'Published'],
	['modified', 'Changes not published'],
] as const;

/** The input type a section's own field gets in the form. */
const SUB_INPUT: Partial<Record<FieldKind, string>> = {
	text: 'text',
	textarea: 'textarea',
	// A component's fields may also be these (COMPONENT_KINDS).
	editor: 'editor',
	images: 'image-array',
	files: 'file-array',
	video: 'video',
	tags: 'tag',
	multiselect: 'select-tag',
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

/** The populate options for the links among a group's fields, and its groups' (`items.author`, `hero.cta.page`). */
const linksIn = (prefix: string, fields: ModelFieldDef[] = [], target: (ref?: string) => TargetInfo | null): { path: string; select: string }[] =>
	fields.flatMap(x => {
		if (REFERENCE_KINDS.includes(x.kind)) {
			const display = target(x.ref)?.display || '_id';
			return [{ path: `${prefix}.${x.key}`, select: display === '_id' ? '_id' : display }];
		}
		return SECTION_KINDS.includes(x.kind) ? linksIn(`${prefix}.${x.key}`, x.fields, target) : [];
	});

/**
 * A section's fields as the form draws them (and formula.function.ts reads
 * them): `{ name, label, type, isRequired, options, formula }`.
 */
export const dataModelOf = (fields: ModelFieldDef[] = [], target?: (ref?: string) => TargetInfo | null): any[] =>
	fields.map(x => {
		// A component's group or list of rows (one level deep): the section inputs, with their own fields.
		if (x.kind === 'section')
			return { name: x.key, label: x.label || humanize(x.key), type: 'section-object', kind: x.kind, dataModel: dataModelOf(x.fields, target), ...(x.helper && { helper: x.helper }) };
		// A link to records inside a component (CMS-03b): the record picker, told which model and what names it.
		if (REFERENCE_KINDS.includes(x.kind)) {
			const t = target?.(x.ref);
			const display = t?.display || '_id';
			return {
				name: x.key,
				label: x.label || humanize(x.key),
				type: x.kind === 'reference' ? 'data-menu' : 'data-tag',
				kind: x.kind,
				model: t?.route || '',
				menuKey: display,
				labelKey: display,
				...(x.required && { isRequired: true }),
				...(x.helper && { helper: x.helper }),
			};
		}
		if (x.kind === 'sectionlist') {
			const texts = (x.fields || []).filter(y => ['text', 'email', 'url', 'select', 'textarea'].includes(y.kind));
			return {
				name: x.key,
				label: x.label || humanize(x.key),
				type: 'section-data-array',
				kind: x.kind,
				...(x.helper && { helper: x.helper }),
				section: {
					title: x.label || humanize(x.key),
					addBtnText: x.addLabel || 'Add row',
					display: { title: texts[0]?.key, description: texts[1]?.key, image: (x.fields || []).find(y => y.kind === 'image')?.key },
					dataModel: dataModelOf(x.fields, target),
				},
			};
		}
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
			helperText: currentScope() ? 'They can see and edit it.' : 'They can see and edit it, and get a notification.',
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
			// A project's people come from /access-users (getFilters), never the platform's admins.
			model: currentScope() ? 'access-users' : 'Admin',
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
		fields: [...code, ...keys, ...(restricted ? ACCESS_KEYS : []), ...(def.draftAndPublish ? ['_publishedAt'] : []), 'createdAt'],
		table: [
			...code,
			...def.fields.filter(f => f.showInTable !== false).map(f => f.key),
			...(restricted ? ['privacy', 'addedBy'] : []),
			...(def.draftAndPublish ? ['_status', '_publishedAt'] : []),
			'createdAt',
		],
		form: [{ sectionTitle: 'Details', fields: generateFormRows(def.fields) }, ...(restricted ? [ACCESS_FORM_SECTION] : [])],
		view: [
			{ title: 'Details', columns: 2, fields: [...code, ...keys, ...(def.draftAndPublish ? ['_publishedAt'] : []), 'createdAt'] },
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

type Compiled = { def: ModelDef; Model: mongoose.Model<any>; stamp: string; modelName: string };

/**
 * One registry per scope (docs/multi-tenancy WO-08): the super admin's, and
 * each tenant project's, keyed by `scopeKey()`. A project's registry is built
 * the first time one of its requests needs it, and dropped when the project
 * is deleted (`forgetProjectModels`).
 */
type Registry = {
	compiled: Map<string, Compiled>; // by plain model name
	components: Map<string, { uid: string; title: string; icon?: string; description?: string; fields: ModelFieldDef[]; version: number }>; // by uid
	failures: Map<string, string>; // by plain model name
	mounts: Map<string, any>; // route -> wrapper router
	checkedAt: number;
	running: Promise<void> | null;
};
const registries = new Map<string, Registry>();
const reg = (): Registry => {
	const key = scopeKey();
	let r = registries.get(key);
	if (!r) registries.set(key, (r = { compiled: new Map(), components: new Map(), failures: new Map(), mounts: new Map(), checkedAt: 0, running: null }));
	return r;
};
let appRef: any = null;

const stampOf = (def: any) => `${def.version || 0}:${new Date(def.updatedAt || 0).getTime()}:${def.active !== false}`;

/** The compile error for a definition, if its last compile failed. */
export const compileError = (name: string) => reg().failures.get(name) || null;
export const compiledModel = (name: string) => reg().compiled.get(name)?.Model || null;
export const isBuiltModel = (name: string) => reg().compiled.has(name);

/** A deleted tenant project: its models, routes and registry are forgotten. */
/**
 * Waits for the project's compiled models to finish building their indexes —
 * an index build still running after its collection is dropped makes the
 * collection again (docs/templates T-04, preview cleanup).
 */
export const settleProjectModels = async (projectId: any) => {
	const r = registries.get(`p:${projectId}`);
	if (r) await Promise.all([...r.compiled.values()].map(c => c.Model.init().catch(() => undefined)));
};

export const forgetProjectModels = (projectId: any) => {
	const key = `p:${projectId}`;
	const r = registries.get(key);
	if (r) for (const c of r.compiled.values()) dropCompiled(c.modelName);
	if (mongoose.models[baseNameOf(projectId)]) mongoose.deleteModel(baseNameOf(projectId));
	registries.delete(key);
	forgetScopeMounts(key);
};

/** What a reference to `modelName` needs: its admin route and display field. */
export const makeTargetLookup = (app: any, defs: ModelDef[]) => {
	const byName = new Map(defs.map(d => [d.name, d]));
	const codeRoutes = new Map<string, { route: string; Model: mongoose.Model<any>; title?: string }>();
	// Tenant models link only to their own project's models (D6).
	if (!currentScope())
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

/** Every model a field can link to: code models with an admin route, and built ones (a tenant: its project's). */
export const linkTargets = async (app: any) => {
	await syncDynamicModels({ app });
	const defs: ModelDef[] = (await ModelDefinition.find({}).lean()) as any;
	const lookup = makeTargetLookup(app, defs);
	const names = new Set<string>();
	if (!currentScope())
		for (const e of collectResourceRoutes(app)) if (e.source.Model?.modelName) names.add(e.source.Model.modelName);
	defs.forEach(d => names.add(d.name));
	return [...names]
		.map(name => ({ name, ...lookup(name)! }))
		.filter(t => t.route)
		.sort((a, b) => a.name.localeCompare(b.name));
};

/** A project's base model: no fields of its own, its discriminators are the project's models. */
const baseNameOf = (projectId: any) => `T${projectId}__Records`;
const projectBase = (projectId: any): mongoose.Model<any> =>
	mongoose.models[baseNameOf(projectId)] ||
	mongoose.model(
		baseNameOf(projectId),
		// The same options as buildSchema's: a discriminator can't differ from its base.
		new Schema<any>({}, { discriminatorKey: MODEL_KEY, timestamps: true, versionKey: false, autoIndex: false }),
		projectCollection(projectId)
	);

/** Unloads a compiled model — and, for a project's, its place on the base model. */
const dropCompiled = (modelName: string) => {
	const Model: any = mongoose.models[modelName];
	if (!Model) return;
	const base: any = Model.baseModelName && mongoose.models[Model.baseModelName];
	if (base?.discriminators) delete base.discriminators[modelName];
	if (base?.schema?.discriminators) delete base.schema.discriminators[modelName];
	mongoose.deleteModel(modelName);
};

/**
 * True when a tenant model keeps its records in its project's one collection
 * (D21). A project model created before WO-43 keeps its own collection until
 * scripts/migrateProjectCollections.js moves it.
 */
export const inProjectCollection = (def: Pick<ModelDef, 'collectionName'>) => {
	const s = currentScope();
	return !!s?.project && def.collectionName === projectCollection(s.project);
};

const compile = (def: ModelDef) => {
	const r = reg();
	const modelName = internalModelName(def.name);
	const existing = mongoose.models[modelName];
	if (existing && !r.compiled.has(def.name))
		throw new Error(`A model in code is already registered as ${def.name}`);
	if (existing) dropCompiled(modelName);
	// A tenant's references name models of its own project: pathsOf points them at their internal names.
	const Model = inProjectCollection(def)
		? projectBase(currentScope()!.project).discriminator(modelName, buildSchema(def), { value: def.name, overwriteModels: true })
		: mongoose.model(modelName, buildSchema(def), def.collectionName);
	r.compiled.set(def.name, { def, Model, stamp: stampOf(def), modelName });
	r.failures.delete(def.name);
	return Model;
};

/**
 * A tenant project's routes are already signed in and scoped by the project
 * router (routes-tenant/project.router.ts); their permissions are the
 * organization role's.
 */
const tenantAuth = { protect: (_req: any, _res: any, next: any) => next(), hasPermission: tenantPermissions };

const mount = (def: ModelDef, Model: mongoose.Model<any>, lookup: ReturnType<typeof makeTargetLookup>) => {
	const tenant = !!currentScope();
	const router = defineRoutes({
		Model,
		settings: generateSettings(def, lookup),
		permission: def.permission,
		frontendConfig: generateConfig(def),
		route: def.route,
		...(tenant && { auth: tenantAuth }),
		// Restricted records: only the owner, the people given access, or everyone when public.
		...(def.access?.enabled && { injectMiddleware: recordAccessMiddleware(Model) }),
	});
	const wrapper = express.Router();
	wrapper.use(`/${def.route}`, router);
	reg().mounts.set(def.route, wrapper);
	setDynamicMount(def.route, router);
	invalidateRoute(def.route);
};

const unmount = (route: string) => {
	const r = reg();
	if (!r.mounts.has(route) && !dynamicMounts.has(route)) return;
	r.mounts.delete(route);
	setDynamicMount(route, null);
	invalidateRoute(route);
};

/**
 * Brings this process's compiled models and routes in line with the
 * definitions — the super admin's, or (inside a tenant project's scope) that
 * project's. Cheap when nothing changed: one small query, at most every 10
 * seconds unless `force`.
 */
export const syncDynamicModels = async ({ app, force }: { app?: any; force?: boolean } = {}) => {
	if (app) appRef = app;
	const tenant = currentScope();
	// Organization-level tenant work has no models of its own.
	if (tenant && !tenant.project) return;

	const run = () => {
		const r = reg();
		if (r.running) return r.running;
		if (!force && Date.now() - r.checkedAt < TTL_MS) return;

		r.running = (async () => {
			try {
				const [found, comps]: any[] = await Promise.all([
					ModelDefinition.find({}).lean(),
					ComponentDefinition.find({}, { uid: 1, title: 1, icon: 1, description: 1, fields: 1, version: 1 }).lean(),
				]);
				const defs: ModelDef[] = found;
				r.components = new Map(
					comps.map((c: any) => [c.uid, { uid: c.uid, title: c.title, icon: c.icon, description: c.description, fields: c.fields || [], version: c.version || 1 }])
				);
				r.checkedAt = Date.now();
				let changed = false;

				// 1. Compile what's new or changed; a disabled model stays compiled so
				//    links to it still populate — it only loses its route.
				const live = new Set(defs.map(d => d.name));
				for (const def of defs) {
					if (r.compiled.get(def.name)?.stamp === stampOf(def)) continue;
					changed = true;
					try {
						compile(def);
					} catch (e: any) {
						r.failures.set(def.name, e.message);
						console.error(`Model builder: ${def.name} not compiled — ${e.message}`);
					}
				}
				for (const [name, c] of r.compiled)
					if (!live.has(name)) {
						changed = true;
						r.compiled.delete(name);
						dropCompiled(c.modelName);
						unmount(c.def.route);
					}

				// 2. Routes. Any change can alter another model's links (a target's
				//    display field or route), so every route is rebuilt together.
				if (changed || defs.some(d => d.active !== false && !r.mounts.has(d.route) && r.compiled.has(d.name))) {
					const lookup = makeTargetLookup(appRef, defs);
					for (const def of defs) {
						const c = r.compiled.get(def.name);
						if (c && def.active !== false) {
							try {
								mount(def, c.Model, lookup);
							} catch (e: any) {
								r.failures.set(def.name, e.message);
								unmount(def.route);
							}
						} else unmount(def.route);
					}
				}
			} finally {
				r.running = null;
			}
		})();
		return r.running;
	};

	// The super admin's registry runs without the caller's scope — a sync can
	// be triggered from inside a tenant request, whose scope would hide every
	// super-admin definition (and unmount its routes).
	return tenant ? run() : withoutScope(run);
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
	const wrapper = segment && reg().mounts.get(segment.toLowerCase());
	if (!wrapper) return next();
	return wrapper(req, res, next);
};

// A deleted tenant project's compiled models and routes go with it.
projectHooks.onRemoved(forgetProjectModels);
