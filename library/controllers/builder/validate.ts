import Joi from 'joi';
import mongoose from 'mongoose';
import { ACCESS_KEYS, isAccessRestricted } from '../../functions/recordAccess.function.js';
import { settingsToData } from '../../functions/routeRegistry.function.js';
import { FieldInfo, checkFormula, format, parse } from '../../functions/formula.function.js';
import { rulesSchema } from '../../functions/formRules.function.js';

/**
 * What a draft may contain, and the safety rules that keep a published
 * settings file from widening what the API exposes.
 *
 * Published settings drive the admin API — `edit` is the allowlist of
 * writable fields, `exclude` hides a field from every read, `populate` pulls
 * in other collections — so a careless or malicious publish could make a
 * password writable or readable. These rules make that impossible rather than
 * merely discouraged.
 */

/** Routes whose settings stay exactly as the code has them. */
export const PROTECTED_ROUTES = new Set(['admins', 'adminroles', 'permissions', 'roles', 'builder']);

const SENSITIVE_FIELD = /pass(word)?|token|secret|api_?key|apikey|private|otp|salt|hash/i;

const FIELD_TYPES = [
	'string',
	'email',
	'uri',
	'date',
	'text',
	'number',
	'boolean',
	'object',
	'array',
	'array-string',
	'array-number',
	'array-object',
	'date-only',
	'tag',
	// In use by a settings file; buildValidator treats both as a string.
	'mixed',
	'profit',
];

const fieldSchema = Joi.object({
	key: Joi.string().trim().min(1).required(),
	title: Joi.string().allow(''),
	type: Joi.string().valid(...FIELD_TYPES),
	sort: Joi.boolean(),
	search: Joi.boolean(),
	edit: Joi.boolean(),
	unique: Joi.boolean(),
	required: Joi.boolean(),
	trim: Joi.boolean(),
	allowNull: Joi.boolean(),
	insertOnly: Joi.boolean(),
	exclude: Joi.boolean(),
	min: Joi.number(),
	max: Joi.number(),
	populate: Joi.alternatives(Joi.string(), Joi.object()),
	// Presentation for the admin (label, input type, table cell, options…) —
	// free-form, as it is in the settings files.
	schema: Joi.object().unknown(true),
}).unknown(true);

export const settingsDraftSchema = Joi.object({
	fields: Joi.array().items(fieldSchema).required(),
});

const optionSchema = Joi.object({ value: Joi.any(), label: Joi.any() }).unknown(true);

const filterSchema = Joi.object({
	name: Joi.string().trim().required(),
	field: Joi.string().allow(''),
	type: Joi.string().valid('text', 'select', 'multi-select', 'boolean', 'range', 'date').required(),
	label: Joi.string().allow(''),
	title: Joi.string().allow(''),
	roles: Joi.array().items(Joi.string()),
	category: Joi.string().valid('default', 'model', 'distinct'),
	key: Joi.string().allow(''),
	model: Joi.string().allow(''),
	options: Joi.array().items(optionSchema),
});

const formSectionSchema = Joi.object({
	sectionTitle: Joi.string().allow(''),
	description: Joi.string().allow(''),
	fields: Joi.array().items(Joi.alternatives(Joi.string(), Joi.array().items(Joi.string()))),
}).unknown(true);

// A view section's items: an own field, fields of a referenced record, or a
// list of records in another route that reference this one.
const viewItemSchema = Joi.alternatives(
	Joi.string(),
	Joi.object({
		field: Joi.string().required(),
		show: Joi.array().items(Joi.string()).min(1).required(),
		label: Joi.string().allow(''),
	}),
	Joi.object({
		related: Joi.string().required(),
		foreignField: Joi.string().required(),
		title: Joi.string().allow(''),
		columns: Joi.array().items(Joi.string()).min(1).required(),
		limit: Joi.number().integer().min(1).max(50),
	})
);

const viewSectionSchema = Joi.object({
	title: Joi.string().allow(''),
	description: Joi.string().allow(''),
	columns: Joi.number().integer().min(1).max(3),
	fields: Joi.array().items(viewItemSchema).required(),
});

// A tab on the detail page, after Overview: another route's records that
// reference this one (e.g. an author's blogs), paged.
const viewTabSchema = Joi.object({
	related: Joi.string().required(),
	// Linked either way: their field points at this record, or this record's field holds them.
	foreignField: Joi.string(),
	localField: Joi.string(),
	title: Joi.string().allow(''),
	description: Joi.string().allow('').max(300),
	display: Joi.string().valid('table', 'cards'),
	columns: Joi.array().items(Joi.string()).min(1).required(),
	pageSize: Joi.number().integer().min(5).max(100),
}).xor('foreignField', 'localField');

export const configDraftSchema = Joi.object({
	fields: Joi.array().items(Joi.string()),
	table: Joi.array().items(Joi.string()),
	form: Joi.array().items(formSectionSchema),
	// Title, buttons, export, row menu, bulk menu… — the same free-form object
	// as a config file's `route`.
	route: Joi.object().unknown(true),
	view: Joi.array().items(viewSectionSchema),
	viewTabs: Joi.array().items(viewTabSchema),
	// Conditional form fields: { field: rule } — shown only while the rule holds.
	formRules: rulesSchema,
	filters: Joi.array().items(filterSchema),
});

/** Keys a settings field may use: what the code declares plus the model's paths. */
const allowedKeys = (model: mongoose.Model<any> | undefined, codeSettings: Record<string, any>) => {
	const keys = new Set(Object.keys(codeSettings || {}));
	model?.schema.eachPath((path: string) => keys.add(path));
	Object.keys((model?.schema as any)?.virtuals || {}).forEach(v => keys.add(v));
	return keys;
};

/**
 * System fields, generated and read-only: when the record was created, and on
 * an access-restricted model its owner, privacy and access list. The history,
 * the default sort and access control depend on them, so they're always
 * exactly as the code (or the model builder) generates them — a draft can't
 * change or remove them. `withSystemFields` puts them back rather than
 * refusing the draft; `checkSettings` is the safety net behind it.
 */
export const LOCKED_PROPS = ['type', 'required', 'unique', 'edit', 'exclude', 'populate'];
export const LOCKED_SCHEMA_PROPS = ['type', 'model', 'renderIf', 'options', 'menuKey', 'labelKey', 'modelAddOn', 'tableKey', 'tableType', 'viewType', 'viewKey'];

export const lockedKeys = (model: mongoose.Model<any> | undefined, codeSettings: Record<string, any>) => [
	...(model?.schema?.path('createdAt') && codeSettings?.createdAt ? ['createdAt'] : []),
	...(isAccessRestricted(model) ? ACCESS_KEYS.filter(k => codeSettings?.[k]) : []),
];
/** Kept for callers that ask which fields can't be removed: the same fields. */
export const keptKeys = lockedKeys;

const isFormula = (f: any) => f?.schema?.type === 'formula';

/** A formula written out tidily (`total-paid` → `total - paid`) — as typed when it doesn't parse, so checkSettings can say why. */
const tidy = (src: any) => {
	const text = typeof src === 'string' ? src.trim() : '';
	try {
		return text ? format(parse(text)) : '';
	} catch {
		return text;
	}
};

/**
 * A formula field is calculated, never typed: stored as a number, not
 * editable, not required, and drawn as a number in tables and views.
 */
export const withFormulaFields = (data: any) => {
	if (!Array.isArray(data?.fields) || !data.fields.some(isFormula)) return data;
	return {
		...data,
		fields: data.fields.map((f: any) =>
			isFormula(f)
				? {
						...f,
						type: 'number',
						edit: false,
						required: false,
						schema: {
							...f.schema,
							formula: tidy(f.schema.formula),
							isRequired: false,
							tableType: 'number',
							viewType: 'number',
						},
				  }
				: f
		),
	};
};

/** What a formula may use: the other fields, and whether each holds a number. */
export const formulaFieldInfo = (fields: any[], model?: mongoose.Model<any>): FieldInfo[] =>
	fields.map((f: any) => {
		const path: any = model?.schema?.path(f.key);
		const numeric = isFormula(f) || f.type === 'number' || path?.instance === 'Number';
		return { key: f.key, label: f.title, numeric, ...(isFormula(f) && { formula: f.schema?.formula }) };
	});

/** A settings draft with its system fields exactly as generated — changed ones restored, missing ones added back. */
export const withSystemFields = (dataIn: any, model: mongoose.Model<any> | undefined, codeSettings: Record<string, any>) => {
	const data = withFormulaFields(dataIn);
	const keys = lockedKeys(model, codeSettings);
	if (!keys.length || !Array.isArray(data?.fields)) return data;
	const generated = new Map(settingsToData(codeSettings).fields.map((f: any) => [f.key, f]));
	const fields = data.fields.map((f: any) => (keys.includes(f?.key) ? generated.get(f.key) : f));
	for (const k of keys) if (!fields.some((f: any) => f?.key === k)) fields.push(generated.get(k));
	return { ...data, fields };
};

const BOOLEAN_PROPS = new Set(['required', 'unique', 'edit', 'exclude']);
const norm = (prop: string, v: any) => (BOOLEAN_PROPS.has(prop) ? !!v : v === undefined || v === '' ? null : v);
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

/** How a locked field in a draft differs from how it's fixed — empty when it doesn't. */
export const lockedChanges = (field: any, code: any): string[] => {
	const changed = LOCKED_PROPS.filter(p => !same(norm(p, field?.[p] ?? (p === 'type' ? 'string' : undefined)), norm(p, code?.[p] ?? (p === 'type' ? 'string' : undefined))));
	const schemaChanged = LOCKED_SCHEMA_PROPS.filter(p => !same(norm(p, field?.schema?.[p]), norm(p, code?.schema?.[p])));
	return [...changed, ...schemaChanged.map(p => (p === 'type' ? 'input' : p))];
};

/**
 * Problems with a settings draft, compared with the route's code settings.
 * An empty list means it's safe to save or publish.
 */
export const checkSettings = ({
	route,
	data,
	model,
	codeSettings,
}: {
	route: string;
	data: any;
	model?: mongoose.Model<any>;
	codeSettings: Record<string, any>;
}): string[] => {
	const problems: string[] = [];

	if (PROTECTED_ROUTES.has(route)) {
		problems.push(`Settings for '${route}' can't be changed from the builder — it controls access.`);
		return problems;
	}

	const allowed = allowedKeys(model, codeSettings);
	const seen = new Set<string>();
	const locked = lockedKeys(model, codeSettings);
	const present = new Set((data?.fields || []).map((f: any) => f?.key));
	for (const key of locked) if (!present.has(key)) problems.push(`'${key}' is a system field and can't be removed.`);

	for (const field of data?.fields || []) {
		const { key } = field;
		if (seen.has(key)) problems.push(`'${key}' is listed twice.`);
		seen.add(key);

		if (!allowed.has(key)) problems.push(`'${key}' is not a field of this model.`);

		const code = codeSettings?.[key] || {};
		if (locked.includes(key)) {
			const changed = lockedChanges(field, code);
			if (changed.length) problems.push(`'${key}' is a system field: its ${changed.join(', ')} can't change.`);
		}
		if (SENSITIVE_FIELD.test(key)) {
			if (field.edit && !code.edit) problems.push(`'${key}' is sensitive and can't be made editable.`);
			if (code.exclude && !field.exclude) problems.push(`'${key}' is sensitive and must stay excluded.`);
			if (field.search && !code.search) problems.push(`'${key}' is sensitive and can't be made searchable.`);
		}

		if (isFormula(field)) {
			const path: any = model?.schema?.path(key);
			if (path && path.instance !== 'Number')
				problems.push(`'${key}' can't be a formula: the model stores it as ${String(path.instance).toLowerCase()}, not a number.`);
			if (locked.includes(key)) problems.push(`'${key}' is a system field and can't be a formula.`);
			const checked = checkFormula(field.schema?.formula || '', formulaFieldInfo(data.fields, model), key);
			if (!checked.ok) problems.push(`'${key}' formula: ${checked.errors.map(e => e.message).join('; ')}`);
		}

		// '+field' in a populate select forces a `select: false` field (a
		// password) out of the other collection.
		const select = typeof field.populate === 'object' ? field.populate?.select : undefined;
		if (typeof select === 'string' && /(^|\s)\+/.test(select))
			problems.push(`'${key}' populate can't force hidden fields ('+…') into the result.`);
	}

	return problems;
};

export const validateDraft = (kind: 'settings' | 'config', draft: any) => {
	const schema = kind === 'settings' ? settingsDraftSchema : configDraftSchema;
	const { error, value } = schema.validate(draft, { abortEarly: false });
	return { error: error?.details.map(d => d.message) || null, value };
};
