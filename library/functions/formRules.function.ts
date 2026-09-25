import Joi from 'joi';

/**
 * Conditional form fields: a field shown only when others hold certain values
 * — "Company name" when Type is Business, "VAT number" when Company name is
 * filled in. Rules chain: a hidden field counts as empty, so whatever depends
 * on it hides too (if A then B, if B then C…).
 *
 * A route's rules come from its config's `formRules` ({ field: rule }, set in
 * the builder's Form tab) over its settings' `schema.renderIf` (the older,
 * single-condition form — still honoured). The admin shows and hides inputs by
 * them; the server applies the same rules on save: a hidden field's value is
 * dropped, and a hidden field isn't required.
 *
 * Kept in step with the admin's copy (components/library/functions/formRules.ts).
 */

export const OPERATORS = ['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty', 'true', 'false'] as const;
export type Operator = (typeof OPERATORS)[number];

export type Condition = { field: string; operator: Operator; value?: any };
export type Rule = Condition | { all: Rule[] } | { any: Rule[] };
export type Rules = Record<string, Rule>;

const conditionSchema = Joi.object({
	field: Joi.string().required(),
	operator: Joi.string()
		.valid(...OPERATORS)
		.required(),
	value: Joi.any(),
});
export const ruleSchema: Joi.Schema = Joi.alternatives(
	conditionSchema,
	Joi.object({ all: Joi.array().items(Joi.link('#rule')).min(1).required() }),
	Joi.object({ any: Joi.array().items(Joi.link('#rule')).min(1).required() })
).id('rule');
export const rulesSchema = Joi.object().pattern(Joi.string(), ruleSchema);

const isEmpty = (v: any) =>
	v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !v._id && !Object.keys(v).length);

/** A picked record compares by its id. */
const plain = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) && v._id ? String(v._id) : v);
const same = (a: any, b: any) => String(plain(a)) === String(plain(b));
const isTrue = (v: any) => v === true || v === 'true' || v === 1 || v === '1';

const conditionMatches = (c: Condition, get: (field: string) => any) => {
	const v = get(c.field);
	const list = Array.isArray(c.value) ? c.value : [c.value];
	switch (c.operator) {
		case 'eq':
			return Array.isArray(v) ? v.some(x => same(x, c.value)) : !isEmpty(v) && same(v, c.value);
		case 'neq':
			return Array.isArray(v) ? !v.some(x => same(x, c.value)) : isEmpty(v) || !same(v, c.value);
		case 'in':
			return Array.isArray(v) ? v.some(x => list.some(y => same(x, y))) : !isEmpty(v) && list.some(y => same(v, y));
		case 'notIn':
			return Array.isArray(v) ? !v.some(x => list.some(y => same(x, y))) : isEmpty(v) || !list.some(y => same(v, y));
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte': {
			if (isEmpty(v) || isEmpty(c.value)) return false;
			const a = Number(v);
			const b = Number(c.value);
			if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
			return c.operator === 'gt' ? a > b : c.operator === 'gte' ? a >= b : c.operator === 'lt' ? a < b : a <= b;
		}
		case 'empty':
			return isEmpty(v);
		case 'notEmpty':
			return !isEmpty(v);
		case 'true':
			return isTrue(v);
		case 'false':
			return !isTrue(v);
		default:
			return true;
	}
};

export const ruleMatches = (rule: Rule | undefined, get: (field: string) => any): boolean => {
	if (!rule) return true;
	if ('all' in rule) return rule.all.every(r => ruleMatches(r, get));
	if ('any' in rule) return rule.any.some(r => ruleMatches(r, get));
	return conditionMatches(rule as Condition, get);
};

export const fieldsOfRule = (rule: Rule | undefined, out = new Set<string>()): Set<string> => {
	if (!rule) return out;
	if ('all' in rule) rule.all.forEach(r => fieldsOfRule(r, out));
	else if ('any' in rule) rule.any.forEach(r => fieldsOfRule(r, out));
	else out.add((rule as Condition).field);
	return out;
};

const valueAt = (values: any, key: string) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), values);

/**
 * The fields hidden by the rules for these values. A rule reads a field that
 * is itself hidden as empty — that's what makes rules chain. A field caught in
 * a loop of rules stays shown rather than vanishing.
 */
export const hiddenFields = (rules: Rules | undefined, values: any): string[] => {
	if (!rules) return [];
	const state = new Map<string, boolean>();
	const visiting = new Set<string>();
	const shown = (key: string): boolean => {
		if (state.has(key)) return state.get(key)!;
		const rule = rules[key];
		if (!rule) return true;
		if (visiting.has(key)) return true;
		visiting.add(key);
		const ok = ruleMatches(rule, f => (shown(f) ? valueAt(values, f) : undefined));
		visiting.delete(key);
		state.set(key, ok);
		return ok;
	};
	return Object.keys(rules).filter(k => !shown(k));
};

/** A route's rules: its settings' `schema.renderIf`, with its config's `formRules` over them. */
export const rulesOf = (settings: Record<string, any> | undefined, config: any): Rules => {
	const out: Rules = {};
	for (const [key, f] of Object.entries(settings || {})) {
		const r = f?.schema?.renderIf;
		if (r && typeof r === 'object' && typeof r.field === 'string') out[key] = r as Rule;
	}
	const extra = config?.formRules;
	if (extra && typeof extra === 'object') for (const [key, r] of Object.entries(extra)) if (r) out[key] = r as Rule;
	return out;
};

/** The schema map with each field's rule as `renderIf` — what the admin's forms read. */
export const withRenderIf = (schema: Record<string, any>, rules: Rules) => {
	if (!Object.keys(rules).length) return schema;
	const out: Record<string, any> = { ...schema };
	for (const [key, rule] of Object.entries(rules)) if (out[key]) out[key] = { ...out[key], renderIf: rule };
	return out;
};
