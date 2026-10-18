import mongoose from 'mongoose';

/**
 * Formula fields: a number field whose value is calculated from the record's
 * other number fields — `due = total - paid` — and never typed in.
 *
 * A formula is a small arithmetic expression:
 *
 *   total - paid
 *   round((price * qty) * (1 - discount / 100), 2)
 *   max(total - paid, 0)
 *   sum(items.total) + shipping
 *
 * - field keys (dotted for nested: `payment.amount`), numbers, `+ - * / %`,
 *   brackets, and round(x[, digits]) floor ceil abs min max;
 * - a number of a linked record, through the link: `tax.amount` (tax links
 *   to a Tax record) reads that record's amount when the formula is
 *   calculated (linkedValues) — a link not picked counts as 0; a change to
 *   the linked record recalculates the records reading it
 *   (formulaDependents.function.ts);
 * - a field can be used any number of times: `price * qty + price`;
 * - over a list of rows (a custom section list, like an invoice's items):
 *   sum(items.total), avg(items.total) and count(items) — a row's value
 *   can't be used on its own, only through these;
 * - a list's rows can have formula fields of their own, from the other
 *   values in the same row (`total = quantity * rate`) — calculated before
 *   the record's, so `sum(items.total)` sees them;
 * - conditions: if(condition, then, otherwise) — the other part isn't
 *   worked out — with comparisons = != < <= > >=, and / or / not(…), text
 *   in quotes and true / false:
 *     if(discountType = "percentage", subtotal * discount / 100, flatDiscount)
 *   A comparison of two numbers (an empty field counts as 0, and text that
 *   is a number counts as one) compares them as numbers; anything else as text, ignoring case and spaces at the ends. A
 *   field that isn't a number (a choice, a yes / no, a text) can be used only
 *   in a comparison or as a condition, where it counts when it's filled in,
 *   yes, or not 0. A comparison is 1 when it holds and 0 when not;
 * - an empty or non-numeric field counts as 0; dividing by 0 leaves the
 *   result empty (null) rather than infinite;
 * - results are rounded to 10 decimals so 0.1 + 0.2 is 0.3;
 * - dates (docs/date-formulas): today(), addDays / addWeeks / addMonths /
 *   addYears(date, n), add(date, n, unit) with the unit as text or a field
 *   ("days", "months"…), latest / earliest(a, b, …) and daysBetween(a, b);
 *   date fields compare with each other and with today(). Inside, a date is
 *   its milliseconds, so if / comparisons work on dates as they do on
 *   numbers; an empty date stays empty (null), never 1970. Months and years
 *   are calendar ones in UTC — 31 January + 1 month is the end of February,
 *   as MongoDB's $dateAdd has it. A Date formula field (`returns: 'date'`)
 *   works out a date; a number formula can use dates only through
 *   daysBetween() or in a comparison.
 *
 * Parsed once, a formula is evaluated in JS for one record (create, update)
 * or compiled to a MongoDB aggregation expression to recalculate many at once
 * (bulk edits, and every record when a formula is published). Both follow the
 * same rules, including round-half-to-even, which is what MongoDB's $round does.
 *
 * Kept in step with the admin's copy (components/library/functions/formula.ts),
 * which checks formulas as they're typed and shows the result live in forms.
 */

export type Node =
	| { t: 'num'; v: number }
	| { t: 'ref'; key: string; at: number }
	| { t: 'neg'; a: Node }
	| { t: 'bin'; op: '+' | '-' | '*' | '/' | '%'; a: Node; b: Node }
	| { t: 'fn'; name: FnName; args: Node[]; at: number }
	| { t: 'agg'; name: AggName; key: string; at: number }
	| { t: 'str'; v: string; at: number }
	| { t: 'bool'; v: boolean }
	| { t: 'cmp'; op: CmpOp; a: Node; b: Node }
	| { t: 'logic'; op: 'and' | 'or'; a: Node; b: Node };

export type FormulaError = { message: string; at?: number };

export const FUNCTIONS = {
	round: { min: 1, max: 2, hint: 'round(x) or round(x, digits)' },
	floor: { min: 1, max: 1, hint: 'floor(x) — down to a whole number' },
	ceil: { min: 1, max: 1, hint: 'ceil(x) — up to a whole number' },
	abs: { min: 1, max: 1, hint: 'abs(x) — without its sign' },
	min: { min: 2, max: 20, hint: 'min(a, b, …) — the smallest' },
	max: { min: 2, max: 20, hint: 'max(a, b, …) — the largest' },
	if: { min: 3, max: 3, hint: 'if(condition, then, otherwise) — if(discountType = "percentage", subtotal * discount / 100, flatDiscount)' },
	not: { min: 1, max: 1, hint: 'not(condition) — when the condition doesn’t hold' },
	today: { min: 0, max: 0, hint: 'today() — now, when the record is saved' },
	addDays: { min: 2, max: 2, hint: 'addDays(date, n) — n days later (earlier when n is below 0)' },
	addWeeks: { min: 2, max: 2, hint: 'addWeeks(date, n) — n weeks later' },
	addMonths: { min: 2, max: 2, hint: 'addMonths(date, n) — n months later; 31 Jan + 1 month is the end of February' },
	addYears: { min: 2, max: 2, hint: 'addYears(date, n) — n years later' },
	add: {
		min: 3,
		max: 3,
		hint: 'add(date, n, unit) — the unit is "days", "weeks", "months" or "years", or a field holding one: add(startDate, plan.length, plan.unit)',
	},
	latest: { min: 1, max: 20, hint: 'latest(a, b, …) — the latest date (empty ones left out): latest(expiresAt, today())' },
	earliest: { min: 1, max: 20, hint: 'earliest(a, b, …) — the earliest date (empty ones left out)' },
	daysBetween: { min: 2, max: 2, hint: 'daysBetween(from, to) — whole days from one date to the other: daysBetween(today(), expiresAt)' },
} as const;
type FnName = keyof typeof FUNCTIONS;
/** A function's own name, however it's typed: `adddays` → addDays. */
const FN_NAMES: Record<string, FnName> = Object.fromEntries(Object.keys(FUNCTIONS).map(k => [k.toLowerCase(), k as FnName]));

/** Functions that work out a date. */
export const DATE_FUNCTIONS = new Set<string>(['today', 'addDays', 'addWeeks', 'addMonths', 'addYears', 'add', 'latest', 'earliest']);
type Unit = 'day' | 'week' | 'month' | 'year';
/** What add()'s unit may be, as typed or held by a field (any case, spaces at the ends trimmed). */
export const DATE_UNITS: Record<string, Unit> = { day: 'day', days: 'day', week: 'week', weeks: 'week', month: 'month', months: 'month', year: 'year', years: 'year' };
const DAY = 86_400_000;

/** Comparisons and joining words for conditions — `status = "paid" and due > 0`. */
export const CONDITIONS = {
	'=': 'is — discountType = "percentage"',
	'!=': 'is not — status != "void"',
	'<': 'less than',
	'<=': 'at most',
	'>': 'more than',
	'>=': 'at least',
	and: 'both hold — status = "due" and total > 0',
	or: 'either holds — type = "a" or type = "b"',
} as const;
type CmpOp = '=' | '!=' | '<' | '<=' | '>' | '>=';
const CMP_OPS = new Set(['=', '!=', '<', '<=', '>', '>=']);

/** Over the rows of a list: the one argument is `list.field` (or the list, for count). */
export const AGGREGATES = {
	sum: { hint: 'sum(items.total) — a number in every row of a list, added up' },
	avg: { hint: 'avg(items.total) — the average of a number in every row (empty with no rows)' },
	count: { hint: 'count(items) — how many rows a list has' },
} as const;
type AggName = keyof typeof AGGREGATES;

export const OPERATORS = ['+', '-', '*', '/', '%', '(', ')'] as const;

class ParseError extends Error {
	constructor(message: string, public at: number) {
		super(message);
	}
}

type Token = { k: 'num' | 'id' | 'op' | 'str' | ',' | 'end'; v: string; at: number };

/** Each opening quote and the one that closes it. */
const QUOTES: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’', '”': '”' };

/** Two-character operators, and what each is read as. */
const PAIRS: Record<string, string> = { '==': '=', '!=': '!=', '<>': '!=', '<=': '<=', '>=': '>=', '&&': 'and', '||': 'or' };
const SINGLES: Record<string, string> = { '=': '=', '<': '<', '>': '>', '≠': '!=', '≤': '<=', '≥': '>=' };

const tokenize = (src: string): Token[] => {
	const out: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (/[0-9.]/.test(c)) {
			const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
			if (!m) throw new ParseError(`“${c}” isn't a number`, i);
			out.push({ k: 'num', v: m[0], at: i });
			i += m[0].length;
			continue;
		}
		if (/[A-Za-z_]/.test(c)) {
			const m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i))!;
			out.push({ k: 'id', v: m[0], at: i });
			i += m[0].length;
			continue;
		}
		if (c in QUOTES) {
			const end = src.indexOf(QUOTES[c], i + 1);
			if (end < 0) throw new ParseError('The text has no closing quote', i);
			out.push({ k: 'str', v: src.slice(i + 1, end), at: i });
			i = end + 1;
			continue;
		}
		const pair = src.slice(i, i + 2);
		if (pair in PAIRS) {
			out.push({ k: 'op', v: PAIRS[pair], at: i });
			i += 2;
			continue;
		}
		if (c in SINGLES) {
			out.push({ k: 'op', v: SINGLES[c], at: i });
			i++;
			continue;
		}
		if ('+-*/%()'.includes(c)) {
			out.push({ k: 'op', v: c, at: i });
			i++;
			continue;
		}
		if (c === ',') {
			out.push({ k: ',', v: c, at: i });
			i++;
			continue;
		}
		if (c === '×') { out.push({ k: 'op', v: '*', at: i }); i++; continue; } // prettier-ignore
		if (c === '÷') { out.push({ k: 'op', v: '/', at: i }); i++; continue; } // prettier-ignore
		if (c === '−') { out.push({ k: 'op', v: '-', at: i }); i++; continue; } // prettier-ignore
		throw new ParseError(`“${c}” can't be used in a formula`, i);
	}
	out.push({ k: 'end', v: '', at: src.length });
	return out;
};

/** Parses a formula; throws ParseError with where it went wrong. */
const parseTokens = (tokens: Token[]): Node => {
	let p = 0;
	const peek = () => tokens[p];
	const next = () => tokens[p++];
	const expectOp = (v: string, what: string) => {
		const t = next();
		if (t.k !== 'op' || t.v !== v) throw new ParseError(`Expected ${what}`, t.at);
	};

	const primary = (): Node => {
		const t = next();
		if (t.k === 'num') {
			const v = Number(t.v);
			if (!Number.isFinite(v)) throw new ParseError(`“${t.v}” isn't a number`, t.at);
			return { t: 'num', v };
		}
		if (t.k === 'str') return { t: 'str', v: t.v, at: t.at };
		if (t.k === 'id') {
			const word = t.v.toLowerCase();
			const call = peek().k === 'op' && peek().v === '(';
			if (!call && (word === 'true' || word === 'false')) return { t: 'bool', v: word === 'true' };
			if (!call && (word === 'and' || word === 'or')) throw new ParseError(`“${t.v}” joins two conditions — it needs one before it`, t.at);
			if (call) {
				const name = t.v.toLowerCase();
				if (name in AGGREGATES) {
					next();
					const arg = next();
					const hint = AGGREGATES[name as AggName].hint;
					if (arg.k !== 'id') throw new ParseError(hint, arg.at);
					const close = next();
					if (close.k !== 'op' || close.v !== ')') throw new ParseError(`${name}() takes one field — ${hint}`, close.at);
					return { t: 'agg', name: name as AggName, key: arg.v, at: arg.at };
				}
				const fn = FN_NAMES[name];
				if (!fn) throw new ParseError(`There's no function “${t.v}”`, t.at);
				next();
				const args: Node[] = [];
				if (!(peek().k === 'op' && peek().v === ')')) {
					args.push(either());
					while (peek().k === ',') {
						next();
						args.push(either());
					}
				}
				expectOp(')', '“)” to close the function');
				const spec = FUNCTIONS[fn];
				if (args.length < spec.min || args.length > spec.max)
					throw new ParseError(`${spec.hint}`, t.at);
				if (fn === 'round' && args[1] && (args[1].t !== 'num' || !Number.isInteger(args[1].v) || args[1].v < 0 || args[1].v > 20))
					throw new ParseError('round’s digits must be a whole number from 0 to 20', t.at);
				return { t: 'fn', name: fn, args, at: t.at };
			}
			return { t: 'ref', key: t.v, at: t.at };
		}
		if (t.k === 'op' && t.v === '(') {
			const e = either();
			expectOp(')', '“)”');
			return e;
		}
		if (t.k === 'op' && (CMP_OPS.has(t.v) || t.v === 'and' || t.v === 'or'))
			throw new ParseError(`“${t.v}” needs something on each side`, t.at);
		if (t.k === 'end') throw new ParseError('The formula ends too early', t.at);
		throw new ParseError(`“${t.v}” is out of place`, t.at);
	};

	const unary = (): Node => {
		const t = peek();
		if (t.k === 'op' && (t.v === '-' || t.v === '+')) {
			next();
			const a = unary();
			return t.v === '-' ? { t: 'neg', a } : a;
		}
		return primary();
	};

	const term = (): Node => {
		let a = unary();
		while (peek().k === 'op' && '*/%'.includes(peek().v)) {
			const op = next().v as '*' | '/' | '%';
			a = { t: 'bin', op, a, b: unary() };
		}
		return a;
	};

	const expr = (): Node => {
		let a = term();
		while (peek().k === 'op' && '+-'.includes(peek().v)) {
			const op = next().v as '+' | '-';
			a = { t: 'bin', op, a, b: term() };
		}
		return a;
	};

	// Below the arithmetic: a comparison of two sums, then and, then or.
	const isWord = (t: Token, w: string) => (t.k === 'op' || t.k === 'id') && t.v.toLowerCase() === w;
	const comparison = (): Node => {
		const a = expr();
		const t = peek();
		if (!(t.k === 'op' && CMP_OPS.has(t.v))) return a;
		next();
		const b = expr();
		const more = peek();
		if (more.k === 'op' && CMP_OPS.has(more.v))
			throw new ParseError('Compare two things at a time — join comparisons with and / or', more.at);
		return { t: 'cmp', op: t.v as CmpOp, a, b };
	};
	const both = (): Node => {
		let a = comparison();
		while (isWord(peek(), 'and')) {
			next();
			a = { t: 'logic', op: 'and', a, b: comparison() };
		}
		return a;
	};
	const either = (): Node => {
		let a = both();
		while (isWord(peek(), 'or')) {
			next();
			a = { t: 'logic', op: 'or', a, b: both() };
		}
		return a;
	};

	if (peek().k === 'end') throw new ParseError('The formula is empty', 0);
	const tree = either();
	const rest = peek();
	if (rest.k !== 'end') throw new ParseError(`“${rest.v}” is out of place — an operator missing?`, rest.at);
	return tree;
};

export const parse = (src: string): Node => parseTokens(tokenize(String(src ?? '')));

export const refsOf = (n: Node, out = new Set<string>()): Set<string> => {
	if (n.t === 'ref') out.add(n.key);
	else if (n.t === 'neg') refsOf(n.a, out);
	else if (n.t === 'bin') (refsOf(n.a, out), refsOf(n.b, out));
	else if (n.t === 'fn') n.args.forEach(a => refsOf(a, out));
	else if (n.t === 'agg') out.add(n.key);
	else if (n.t === 'cmp' || n.t === 'logic') (refsOf(n.a, out), refsOf(n.b, out));
	return out;
};

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

/** The formula written out tidily: `total-paid` → `total - paid`. */
export const format = (n: Node, parent = -3, right = false): string => {
	switch (n.t) {
		case 'num':
			return String(n.v);
		case 'str':
			return n.v.includes('"') ? `'${n.v}'` : `"${n.v}"`;
		case 'bool':
			return String(n.v);
		case 'cmp': {
			const s = `${format(n.a, 0.5)} ${n.op} ${format(n.b, 0.5)}`;
			return parent > 0 ? `(${s})` : s;
		}
		case 'logic': {
			const p = n.op === 'or' ? -2 : -1;
			const s = `${format(n.a, p)} ${n.op} ${format(n.b, p, true)}`;
			return p < parent || (right && p === parent) ? `(${s})` : s;
		}
		case 'ref':
			return n.key;
		case 'neg':
			return `-${format(n.a, 3)}`;
		case 'fn':
			return `${n.name}(${n.args.map(a => format(a)).join(', ')})`;
		case 'agg':
			return `${n.name}(${n.key})`;
		case 'bin': {
			const p = PREC[n.op];
			const s = `${format(n.a, p)} ${n.op} ${format(n.b, p, true)}`;
			return p < parent || (right && p === parent) ? `(${s})` : s;
		}
	}
};

export type FieldInfo = {
	key: string;
	label?: string;
	numeric: boolean;
	formula?: string;
	/** A list of rows (custom section list): only count() takes it. */
	list?: boolean;
	/** A value in each row of this list (`items.total` → 'items'): only sum() and avg() take it. */
	inList?: string;
	/** A number of the record a link picks (`tax.amount` → 'tax'), read when the formula is calculated. */
	linked?: string;
	/** A choice field's options — offered as the value to compare it with (the block editor). */
	options?: { value: any; label?: any }[];
	/** A yes / no field: compared with true / false. */
	yesNo?: boolean;
	/** A date: a date field, a Date formula, a linked record's date. */
	date?: boolean;
	/** Of a kind not known here (a linked record's field before the linked model is at hand): any use is let through, the server checks it. */
	any?: boolean;
};

/** Whether a formula works out a date, from its shape alone: a date function, or an if() with one as an answer. */
export const isDateNode = (n: Node): boolean =>
	n.t === 'fn' && (DATE_FUNCTIONS.has(n.name) || (n.name === 'if' && (isDateNode(n.args[1]) || isDateNode(n.args[2]))));

export type Checked = {
	ok: boolean;
	errors: FormulaError[];
	refs: string[];
	/** The tidied formula, when it parses. */
	formatted?: string;
	tree?: Node;
};

/**
 * Checks a formula for field `self` against the fields it may use: that it
 * parses, that every name is a field, that the field holds a number, and that
 * it doesn't depend on itself (directly, or through other formula fields).
 */
export const checkFormula = (src: string, fields: FieldInfo[], self?: string, returns: 'number' | 'date' = 'number'): Checked => {
	let tree: Node;
	try {
		tree = parse(src);
	} catch (e: any) {
		return { ok: false, errors: [{ message: e.message, at: e.at }], refs: [] };
	}
	const byKey = new Map(fields.map(f => [f.key, f]));
	const errors: FormulaError[] = [];
	const refs = [...refsOf(tree)];
	const say = (message: string, at?: number) => errors.push({ message, at });
	const atOf = (n: Node): number | undefined => ('at' in n ? n.at : undefined);

	/** What a part works out: a date, a number, or something only to compare (text, a choice). */
	const kindOf = (n: Node): 'date' | 'num' | 'other' => {
		if (n.t === 'ref') {
			const f = byKey.get(n.key);
			if (f?.any) return returns === 'date' ? 'date' : 'num';
			return f?.date ? 'date' : f && !f.numeric ? 'other' : 'num';
		}
		if (n.t === 'str' || n.t === 'bool') return 'other';
		if (n.t === 'fn' && n.name === 'if') return kindOf(n.args[1]) === 'date' || kindOf(n.args[2]) === 'date' ? 'date' : 'num';
		if (n.t === 'fn' && DATE_FUNCTIONS.has(n.name)) return 'date';
		return 'num';
	};
	const wantDate = (n: Node) => say('A date is wanted here — a date field, today() or addDays(…)', atOf(n));
	const UNIT_HINT = 'The unit is text — "days", "weeks", "months" or "years" — or a field holding one';

	// `ctx`: what the part must be — a number, a date, compared, a condition, or add()'s unit.
	type Ctx = 'num' | 'date' | 'cmp' | 'cond' | 'unit';
	const walk = (n: Node, ctx: Ctx = 'num'): void => {
		if (n.t === 'ref') {
			const f = byKey.get(n.key);
			if (n.key === self) say(`“${n.key}” is this field — a formula can't use itself`, n.at);
			else if (!f) say(`There's no field “${n.key}”`, n.at);
			else if (f.list) say(`“${n.key}” is a list — count(${n.key}) counts its rows`, n.at);
			else if (f.inList) say(`“${n.key}” is in every row of ${f.inList} — use sum(${n.key}) or avg(${n.key})`, n.at);
			else if (f.any) return;
			else if (ctx === 'date' && !f.date) say(`“${n.key}” isn't a date`, n.at);
			else if (ctx === 'num' && f.date) say(`“${n.key}” is a date — daysBetween(${n.key}, today()) gives a number of days`, n.at);
			else if (ctx === 'num' && !f.numeric) say(`“${n.key}” isn't a number field — it can be compared: if(${n.key} = "…", …, …)`, n.at);
			return;
		}
		if (n.t === 'str') {
			if (ctx === 'unit') {
				if (!DATE_UNITS[n.v.trim().toLowerCase()]) say(`“${n.v}” isn't a unit — "days", "weeks", "months" or "years"`, n.at);
			} else if (ctx === 'date') wantDate(n);
			else if (ctx !== 'cmp') say(`Text can only be compared — like status = "${n.v}"`, n.at);
			return;
		}
		if (n.t === 'num' || n.t === 'bool') {
			if (ctx === 'date') wantDate(n);
			else if (ctx === 'unit') say(UNIT_HINT);
			return;
		}
		if (n.t === 'cmp') return (walk(n.a, 'cmp'), walk(n.b, 'cmp'));
		if (n.t === 'logic') return (walk(n.a, 'cond'), walk(n.b, 'cond'));
		if (ctx === 'unit') return void say(UNIT_HINT, atOf(n));
		if (n.t === 'agg') {
			if (ctx === 'date') return void wantDate(n);
			const f = byKey.get(n.key);
			if (n.name === 'count') {
				if (!f?.list) say(`count() takes a list — “${n.key}” isn't one`, n.at);
			} else if (!f) say(`There's no field “${n.key}”`, n.at);
			else if (!f.inList) say(`${n.name}() takes a value in a list's rows, like items.total — “${n.key}” isn't one`, n.at);
			else if (!f.numeric) say(`“${n.key}” isn't a number field`, n.at);
			return;
		}
		if (n.t === 'neg' || n.t === 'bin') {
			if (ctx === 'date') return void say('Dates move with addDays(date, n), addMonths(date, n)… — not with + − × ÷');
			return n.t === 'neg' ? walk(n.a) : (walk(n.a), walk(n.b));
		}
		// A function.
		if (n.name === 'if') {
			const answers = ctx === 'date' || ctx === 'num' ? ctx : kindOf(n) === 'date' ? 'date' : 'num';
			walk(n.args[0], 'cond');
			walk(n.args[1], answers);
			walk(n.args[2], answers);
			return;
		}
		if (n.name === 'not') return walk(n.args[0], 'cond');
		const isDate = DATE_FUNCTIONS.has(n.name);
		if (ctx === 'num' && isDate) return void say(`${n.name}() works out a date — a number is wanted here`, n.at);
		if (ctx === 'date' && !isDate) return void say(`${n.name}() works out a number — a date is wanted here`, n.at);
		const kinds: Ctx[] =
			n.name === 'add'
				? ['date', 'num', 'unit']
				: n.name.startsWith('add')
					? ['date', 'num']
					: n.name === 'latest' || n.name === 'earliest' || n.name === 'daysBetween'
						? n.args.map(() => 'date')
						: n.args.map(() => 'num');
		n.args.forEach((a, i) => walk(a, kinds[i] || 'num'));
	};
	const result = kindOf(tree);
	if (returns === 'number' && result === 'date') say('This works out a date — use a Date formula field, or daysBetween(…) for a number of days');
	else if (returns === 'date' && result !== 'date') say('A date formula works out a date — like addDays(startDate, 30) or a date field');
	else walk(tree, returns === 'date' ? 'date' : 'num');

	// Through other formula fields back to this one.
	if (self && !errors.length) {
		const seen = new Set<string>();
		const loops = (key: string, path: string[]): string[] | null => {
			const f = byKey.get(key);
			if (!f?.formula) return null;
			if (seen.has(key)) return null;
			seen.add(key);
			let inner: Node;
			try {
				inner = parse(f.formula);
			} catch {
				return null;
			}
			for (const r of refsOf(inner)) {
				if (r === self) return [...path, key, self];
				const found = loops(r, [...path, key]);
				if (found) return found;
			}
			return null;
		};
		for (const r of refs) {
			const loop = loops(r, [self]);
			if (loop) {
				errors.push({ message: `It goes round in a circle: ${loop.join(' → ')}` });
				break;
			}
		}
	}

	return { ok: !errors.length, errors, refs, formatted: format(tree), tree };
};

/* ---------- evaluating ---------- */

/** Round half to even, as MongoDB's $round does. */
const roundTo = (x: number, digits: number) => {
	const f = 10 ** digits;
	const y = x * f;
	// Past 2^52 a double has no fractional digits left to round.
	if (!Number.isFinite(y) || Math.abs(y) > 2 ** 52) return x;
	const down = Math.floor(y);
	const r = Math.abs(y - down - 0.5) < 1e-9 ? (down % 2 === 0 ? down : down + 1) : Math.round(y);
	return r / f;
};

const numberOf = (v: any): number => {
	if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
	if (v === null || v === undefined || v === '') return 0;
	if (v instanceof Date) return v.getTime();
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
};

const valueAt = (doc: any, key: string) => {
	if (!doc) return undefined;
	if (typeof doc.get === 'function') return doc.get(key);
	return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
};

/** Every value at `segs` under `v`, through any lists on the way; a row without the value adds nothing. */
const collect = (v: any, segs: string[]): any[] => {
	if (v === undefined || v === null) return segs.length ? [] : v === null ? [null] : [];
	if (!segs.length) return [v];
	if (Array.isArray(v)) return v.flatMap(x => collect(x, segs));
	if (typeof v !== 'object') return [];
	const [head, ...rest] = segs;
	return collect(typeof v.get === 'function' ? v.get(head) : v[head], rest);
};

const isPlain = (doc: any) => doc && typeof doc === 'object' && typeof doc.get !== 'function';

/**
 * The numbers `sum(key)` / `avg(key)` run over. A plain object may carry the
 * key as is — the builder's "Try it" does, with the rows' values typed as
 * `5, 3, 2`.
 */
const listNumbers = (doc: any, key: string): number[] => {
	if (isPlain(doc) && Object.prototype.hasOwnProperty.call(doc, key)) {
		const v = doc[key];
		return (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : [v])
			.filter((x: any) => String(x ?? '').trim() !== '')
			.map(numberOf);
	}
	return collect(doc, key.split('.')).map(numberOf);
};

const rowCount = (doc: any, key: string): number => {
	if (isPlain(doc) && Object.prototype.hasOwnProperty.call(doc, key) && !Array.isArray(doc[key])) return numberOf(doc[key]);
	return collect(doc, key.split('.')).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
};

type Linked = Record<string, any> | undefined;

/** A field's value as stored (a choice's text, yes / no), for comparing; anything else as its number. */
const raw = (n: Node, doc: any, linked?: Linked): any => {
	if (n.t === 'ref') return linked && Object.prototype.hasOwnProperty.call(linked, n.key) ? linked[n.key] : valueAt(doc, n.key);
	if (n.t === 'str' || n.t === 'bool') return n.v;
	return ev(n, doc, linked);
};

/** Whether a condition holds: filled in, yes, not 0 — as MongoDB's $cond decides it (see truthyMongo). */
const truthy = (v: any) =>
	!(v === null || v === undefined || v === false || v === 0 || v === '' || (typeof v === 'number' && Number.isNaN(v)) || (Array.isArray(v) && !v.length));

/** Text to compare: trimmed, lower case; a date as its ISO time; a list or record as nothing. */
const textOf = (v: any): string => {
	if (v === null || v === undefined) return '';
	if (v instanceof Date) return v.toISOString();
	if (typeof v === 'object') return typeof v.toHexString === 'function' ? v.toHexString() : '';
	return String(v).trim().toLowerCase();
};

/** Compared as a number: a number, nothing, or text that is one ("200", as a form holds it while typing). */
const numericLike = (x: any) =>
	x === null || x === undefined || typeof x === 'number' || (typeof x === 'string' && (!x.trim() || Number.isFinite(Number(x))));

/** A date as its milliseconds — a Date, or text that is an ISO date (as a form holds it) — or null. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const timeOf = (v: any): number | null => {
	if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string' && ISO_DATE.test(v.trim())) {
		const t = Date.parse(v.trim());
		return Number.isFinite(t) ? t : null;
	}
	return null;
};
/** A date compares as its milliseconds — with today(), and with other dates. */
const comparable = (v: any) => (v instanceof Date || (typeof v === 'string' && ISO_DATE.test(v.trim())) ? timeOf(v) : v);

const compare = (op: CmpOp, a: any, b: any): number => {
	const numeric = numericLike;
	a = comparable(a);
	b = comparable(b);
	const [x, y]: [any, any] = numeric(a) && numeric(b) ? [numberOf(a), numberOf(b)] : [textOf(a), textOf(b)];
	switch (op) {
		case '=': return x === y ? 1 : 0; // prettier-ignore
		case '!=': return x !== y ? 1 : 0; // prettier-ignore
		case '<': return x < y ? 1 : 0; // prettier-ignore
		case '<=': return x <= y ? 1 : 0; // prettier-ignore
		case '>': return x > y ? 1 : 0; // prettier-ignore
		case '>=': return x >= y ? 1 : 0; // prettier-ignore
	}
};

const holds = (n: Node, doc: any, linked?: Linked) => truthy(raw(n, doc, linked));

/** A date part as its milliseconds; an empty date field is null (not 0, which would be 1970). */
const dv = (n: Node, doc: any, linked?: Linked): number | null => {
	if (n.t === 'ref') return timeOf(raw(n, doc, linked));
	if (n.t === 'fn' && n.name === 'if') return dv(holds(n.args[0], doc, linked) ? n.args[1] : n.args[2], doc, linked);
	return ev(n, doc, linked);
};

/** Calendar months later in UTC, the day kept or the month's last: 31 Jan + 1 → 28 / 29 Feb. */
const addMonthsTo = (t: number, months: number) => {
	const d = new Date(t);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth() + months;
	const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
	return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
};
/** A date moved by n whole units (n's fraction dropped, as $dateAdd needs). */
const moveDate = (t: number | null, n: number | null, unit: Unit | undefined): number | null => {
	if (t === null || n === null || !unit) return null;
	const k = Math.trunc(n);
	if (unit === 'day') return t + k * DAY;
	if (unit === 'week') return t + k * 7 * DAY;
	return addMonthsTo(t, unit === 'month' ? k : k * 12);
};
const unitOf = (v: any): Unit | undefined => DATE_UNITS[String(v ?? '').trim().toLowerCase()];
/** addDays → day, addMonths → month… */
const FIXED_UNIT: Record<string, Unit> = { addDays: 'day', addWeeks: 'week', addMonths: 'month', addYears: 'year' };

const ev = (n: Node, doc: any, linked?: Linked): number | null => {
	switch (n.t) {
		case 'num':
			return n.v;
		case 'str':
			return numberOf(n.v);
		case 'bool':
			return n.v ? 1 : 0;
		case 'cmp':
			return compare(n.op, raw(n.a, doc, linked), raw(n.b, doc, linked));
		case 'logic':
			return (n.op === 'and' ? holds(n.a, doc, linked) && holds(n.b, doc, linked) : holds(n.a, doc, linked) || holds(n.b, doc, linked)) ? 1 : 0;
		case 'ref':
			return numberOf(linked && Object.prototype.hasOwnProperty.call(linked, n.key) ? linked[n.key] : valueAt(doc, n.key));
		case 'neg': {
			const a = ev(n.a, doc, linked);
			return a === null ? null : -a;
		}
		case 'bin': {
			const a = ev(n.a, doc, linked);
			const b = ev(n.b, doc, linked);
			if (a === null || b === null) return null;
			switch (n.op) {
				case '+': return a + b; // prettier-ignore
				case '-': return a - b; // prettier-ignore
				case '*': return a * b; // prettier-ignore
				case '/': return b === 0 ? null : a / b; // prettier-ignore
				case '%': return b === 0 ? null : a % b; // prettier-ignore
			}
		}
		case 'fn': {
			// Only the part the condition picks is worked out.
			if (n.name === 'if') return ev(holds(n.args[0], doc, linked) ? n.args[1] : n.args[2], doc, linked);
			if (n.name === 'not') return holds(n.args[0], doc, linked) ? 0 : 1;
			if (n.name === 'today') return Date.now();
			if (n.name === 'add') return moveDate(dv(n.args[0], doc, linked), ev(n.args[1], doc, linked), unitOf(raw(n.args[2], doc, linked)));
			if (FIXED_UNIT[n.name]) return moveDate(dv(n.args[0], doc, linked), ev(n.args[1], doc, linked), FIXED_UNIT[n.name]);
			if (n.name === 'latest' || n.name === 'earliest') {
				const ts = n.args.map(a => dv(a, doc, linked)).filter((x): x is number => x !== null);
				return ts.length ? Math[n.name === 'latest' ? 'max' : 'min'](...ts) : null;
			}
			if (n.name === 'daysBetween') {
				const a = dv(n.args[0], doc, linked);
				const b = dv(n.args[1], doc, linked);
				return a === null || b === null ? null : Math.trunc((b - a) / DAY);
			}
			const args = n.args.map(a => ev(a, doc, linked));
			if (n.name === 'min' || n.name === 'max') {
				const xs = args.filter((x): x is number => x !== null);
				return xs.length ? Math[n.name](...xs) : null;
			}
			const x = args[0];
			if (x === null) return null;
			if (n.name === 'round') return roundTo(x, (n.args[1] as any)?.v ?? 0);
			return Math[n.name as 'floor' | 'ceil' | 'abs'](x);
		}
		case 'agg': {
			if (n.name === 'count') return rowCount(doc, n.key);
			const xs = listNumbers(doc, n.key);
			if (n.name === 'sum') return xs.reduce((a, b) => a + b, 0);
			return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
		}
	}
};

/**
 * A formula's value for one record (a plain object or a Mongoose document).
 * `linked`: values read through links (`tax.amount` → 12), from linkedValues.
 */
export const evaluate = (tree: Node, doc: any, linked?: Linked): number | null => {
	const v = ev(tree, doc, linked);
	return v === null || !Number.isFinite(v) ? null : roundTo(v, 10);
};

/** A date formula's value: a Date, or null when it works out nothing (an empty date in it). */
export const evaluateDate = (tree: Node, doc: any, linked?: Linked): Date | null => {
	const v = dv(tree, doc, linked);
	return v === null || !Number.isFinite(v) ? null : new Date(Math.round(v));
};

/** A number — or a Date, when the formula works out one (isDateNode): what a Linked Relationships rule sets. */
export const evaluateValue = (tree: Node, doc: any, linked?: Linked): number | Date | null =>
	isDateNode(tree) ? evaluateDate(tree, doc, linked) : evaluate(tree, doc, linked);

/* ---------- MongoDB ---------- */

/** `x` when it's a list, otherwise an empty one. */
const listOr = (x: any) => ({ $cond: [{ $isArray: x }, x, []] });
const toDouble = (x: any) => ({ $convert: { input: x, to: 'double', onError: 0, onNull: 0 } });

/** A value as stored, for comparing — raw() in JS. */
const rawMongo = (n: Node, base: string): any =>
	n.t === 'ref' ? `${base}${n.key}` : n.t === 'str' || n.t === 'bool' ? { $literal: n.v } : mongo(n, base);
/** comparable() in JS: a stored date compares as its milliseconds. */
const comparableMongo = (x: any) => ({ $cond: [{ $eq: [{ $type: x }, 'date'] }, { $toDouble: x }, x] });
/** dv() in JS: a date part as milliseconds, an empty date field null. */
const dateMongo = (n: Node, base: string): any => {
	if (n.t === 'ref') return { $convert: { input: `${base}${n.key}`, to: 'double', onError: null, onNull: null } };
	if (n.t === 'fn' && n.name === 'if') return { $cond: [truthyMongo(rawMongo(n.args[0], base)), dateMongo(n.args[1], base), dateMongo(n.args[2], base)] };
	return mongo(n, base);
};
/** moveDate() in JS: days and weeks as milliseconds, months and years with $dateAdd (which keeps the month's last day). */
const moveMongo = (date: any, n: any, unit: Unit) => {
	const k = { $trunc: n };
	if (unit === 'day' || unit === 'week') return { $add: [date, { $multiply: [k, unit === 'day' ? DAY : 7 * DAY] }] };
	return { $toDouble: { $dateAdd: { startDate: { $toDate: date }, unit, amount: { $toLong: k } } } };
};
/** truthy() in JS: empty, no, 0, '' and an empty list don't hold. */
const truthyMongo = (x: any) => ({ $not: [{ $in: [{ $ifNull: [x, null] }, [null, false, 0, '', []]] }] });
/** textOf() in JS. */
const textMongo = (x: any) => ({ $toLower: { $trim: { input: { $convert: { input: x, to: 'string', onError: '', onNull: '' } } } } });
/** numericLike() in JS. */
const isNumeric = (x: any) => ({
	$cond: [
		{ $eq: [{ $type: x }, 'string'] },
		// $toString: a literal number would otherwise be folded into $trim and refused (aggregate's optimizer).
		{ $or: [{ $eq: [{ $trim: { input: { $toString: x } } }, ''] }, { $ne: [{ $convert: { input: { $trim: { input: { $toString: x } } }, to: 'double', onError: null, onNull: null } }, null] }] },
		{ $in: [{ $type: x }, ['double', 'int', 'long', 'decimal', 'null', 'missing']] },
	],
});
const CMP_MONGO: Record<CmpOp, string> = { '=': '$eq', '!=': '$ne', '<': '$lt', '<=': '$lte', '>': '$gt', '>=': '$gte' };

/** `base` is what a field key is read from: `$` for the record, `$$row.` inside a list's row. */
const mongo = (n: Node, base = '$'): any => {
	switch (n.t) {
		case 'num':
			return { $literal: n.v };
		case 'str':
			return toDouble({ $literal: n.v });
		case 'bool':
			return { $literal: n.v ? 1 : 0 };
		case 'cmp': {
			// A stored date compares as milliseconds (a literal stays one: the optimizer would fold it into $trim).
			const a = n.a.t === 'ref' ? comparableMongo(rawMongo(n.a, base)) : rawMongo(n.a, base);
			const b = n.b.t === 'ref' ? comparableMongo(rawMongo(n.b, base)) : rawMongo(n.b, base);
			const op = CMP_MONGO[n.op];
			return {
				$cond: [{ $cond: [{ $and: [isNumeric(a), isNumeric(b)] }, { [op]: [toDouble(a), toDouble(b)] }, { [op]: [textMongo(a), textMongo(b)] }] }, 1, 0],
			};
		}
		case 'logic': {
			const a = truthyMongo(rawMongo(n.a, base));
			const b = truthyMongo(rawMongo(n.b, base));
			return { $cond: [n.op === 'and' ? { $and: [a, b] } : { $or: [a, b] }, 1, 0] };
		}
		case 'ref':
			return toDouble(`${base}${n.key}`);
		case 'neg':
			return { $multiply: [-1, mongo(n.a, base)] };
		case 'bin': {
			const a = mongo(n.a, base);
			const b = mongo(n.b, base);
			if (n.op === '+') return { $add: [a, b] };
			if (n.op === '-') return { $subtract: [a, b] };
			if (n.op === '*') return { $multiply: [a, b] };
			const op = n.op === '/' ? '$divide' : '$mod';
			return { $cond: [{ $eq: [b, 0] }, null, { [op]: [a, b] }] };
		}
		case 'fn': {
			if (n.name === 'if') return { $cond: [truthyMongo(rawMongo(n.args[0], base)), mongo(n.args[1], base), mongo(n.args[2], base)] };
			if (n.name === 'not') return { $cond: [truthyMongo(rawMongo(n.args[0], base)), 0, 1] };
			if (n.name === 'today') return { $toDouble: '$$NOW' };
			if (FIXED_UNIT[n.name]) return moveMongo(dateMongo(n.args[0], base), mongo(n.args[1], base), FIXED_UNIT[n.name]);
			if (n.name === 'add') {
				const date = dateMongo(n.args[0], base);
				const k = mongo(n.args[1], base);
				const unit = textMongo(rawMongo(n.args[2], base));
				const is = (u: Unit) => ({ $in: [unit, Object.keys(DATE_UNITS).filter(w => DATE_UNITS[w] === u)] });
				return {
					$switch: {
						branches: (['day', 'week', 'month', 'year'] as Unit[]).map(u => ({ case: is(u), then: moveMongo(date, k, u) })),
						default: null,
					},
				};
			}
			if (n.name === 'latest' || n.name === 'earliest') return { [n.name === 'latest' ? '$max' : '$min']: n.args.map(a => dateMongo(a, base)) };
			if (n.name === 'daysBetween')
				return { $trunc: { $divide: [{ $subtract: [dateMongo(n.args[1], base), dateMongo(n.args[0], base)] }, DAY] } };
			const args = n.args.map(a => mongo(a, base));
			if (n.name === 'min') return { $min: args };
			if (n.name === 'max') return { $max: args };
			if (n.name === 'round') return { $round: [args[0], (n.args[1] as any)?.v ?? 0] };
			return { [`$${n.name}`]: args[0] };
		}
		case 'agg': {
			// `$items.total` is already the list of every row's total (rows without one left out, as in JS).
			if (n.name === 'count') return { $size: listOr(`${base}${n.key}`) };
			const values = { $map: { input: listOr(`${base}${n.key}`), as: 'v', in: toDouble('$$v') } };
			return n.name === 'sum' ? { $sum: values } : { $avg: values };
		}
	}
};

/** The same calculation as an aggregation expression, for pipeline updates. */
export const toMongo = (tree: Node, base = '$') => ({ $round: [mongo(tree, base), 10] });

/** A date formula as an aggregation expression: a date, or null. */
export const toMongoDate = (tree: Node, base = '$') => ({ $convert: { input: { $round: [dateMongo(tree, base), 0] }, to: 'date', onError: null, onNull: null } });

/* ---------- a route's formula fields ---------- */

/**
 * One formula to calculate. `key` is the record path it changes: the formula
 * field — or, with `sub`, the list whose rows each get `sub` calculated from
 * the row's own values.
 */
export type Formula = {
	key: string;
	tree: Node;
	refs: string[];
	sub?: string;
	/** A Date formula field (`schema.returns: 'date'`): stored as a date. */
	date?: boolean;
	/** Worked out only while it's empty (`schema.calc: 'once'`): when the record is added, then kept. */
	once?: boolean;
};

const compiledCache = new WeakMap<object, Formula[]>();

/** Formulas in the order they must run: one that uses another comes after it; loops are left out. */
const ordered = (all: Map<string, Formula>, depOf: (ref: string) => string = r => r): Formula[] => {
	const out: Formula[] = [];
	const state = new Map<string, 'visiting' | 'done' | 'bad'>();
	const visit = (id: string): boolean => {
		const s = state.get(id);
		if (s === 'done') return true;
		if (s === 'visiting' || s === 'bad') return false;
		state.set(id, 'visiting');
		const f = all.get(id)!;
		for (const r of f.refs) {
			const dep = depOf(r);
			if (all.has(dep) && !visit(dep)) return (state.set(id, 'bad'), false);
		}
		state.set(id, 'done');
		out.push(f);
		return true;
	};
	for (const id of all.keys()) visit(id);
	return out;
};

const parsed = (src: any): Node | null => {
	if (typeof src !== 'string' || !src.trim()) return null;
	try {
		return parse(src);
	} catch {
		return null;
	}
};

/** The sub-fields of a custom section (list) field, as its settings describe them. */
export const subFieldsOf = (f: any): any[] => {
	const list = f?.schema?.section?.dataModel ?? f?.schema?.dataModel;
	return Array.isArray(list) ? list.filter((x: any) => x && typeof x.name === 'string') : [];
};

/** A settings field whose value is a list of rows with sub-fields (section-data-array). */
export const isRowList = (f: any) => f?.schema?.type === 'section-data-array';

/**
 * What a formula may use from a section field (settings form): a list gives
 * itself (for count) and each row value (`items.total`, for sum / avg); a
 * single section gives its values as `address.zip`. Empty for any other field.
 */
export const sectionFieldInfo = (key: string, f: any): FieldInfo[] => {
	const subs = subFieldsOf(f);
	if (!subs.length) return [];
	const numeric = (x: any) => x.type === 'number' || x.type === 'formula';
	if (isRowList(f))
		return [
			{ key, label: f?.title, numeric: false, list: true },
			...subs.map(x => ({ key: `${key}.${x.name}`, label: x.label, numeric: numeric(x), inList: key })),
		];
	return subs.map(x => ({ key: `${key}.${x.name}`, label: x.label, numeric: numeric(x) }));
};

/**
 * A route's formula fields, from its (resolved) settings, in the order they
 * must be calculated: every list's row formulas first (each row from its own
 * values), then the record's — a formula that uses another formula field
 * comes after it. Fields whose formula doesn't parse, or that go round in a
 * circle, are left out (the builder refuses to publish them anyway).
 */
export const formulasOf = (settings: Record<string, any> | undefined): Formula[] => {
	if (!settings) return [];
	const hit = compiledCache.get(settings);
	if (hit) return hit;

	const rows: Formula[] = [];
	const top = new Map<string, Formula>();
	for (const [key, f] of Object.entries(settings)) {
		const tree = f?.schema?.type === 'formula' ? parsed(f?.schema?.formula) : null;
		if (tree)
			top.set(key, {
				key,
				tree,
				refs: [...refsOf(tree)],
				...(f?.schema?.returns === 'date' && { date: true }),
				...(f?.schema?.calc === 'once' && { once: true }),
			});

		// A list's or a section's own formula fields.
		const subs = subFieldsOf(f).filter((x: any) => x.type === 'formula');
		if (!subs.length) continue;
		const inRow = new Map<string, Formula>();
		for (const x of subs) {
			const t = parsed(x.formula);
			if (t) inRow.set(x.name, { key, sub: x.name, tree: t, refs: [...refsOf(t)] });
		}
		if (isRowList(f)) rows.push(...ordered(inRow));
		// A single section's are record formulas under its key: `sec.total` from `sec.qty`.
		else
			for (const r of ordered(inRow)) {
				const tree = prefixRefs(r.tree, `${key}.`);
				top.set(`${key}.${r.sub}`, { key: `${key}.${r.sub}`, tree, refs: [...refsOf(tree)] });
			}
	}

	const all = [...rows, ...ordered(top)];
	compiledCache.set(settings, all);
	return all;
};

/** The same formula reading its fields under `prefix`. */
export const prefixRefs = (n: Node, prefix: string): Node => {
	switch (n.t) {
		case 'num':
			return n;
		case 'ref':
			return { ...n, key: `${prefix}${n.key}` };
		case 'agg':
			return { ...n, key: `${prefix}${n.key}` };
		case 'neg':
			return { ...n, a: prefixRefs(n.a, prefix) };
		case 'bin':
			return { ...n, a: prefixRefs(n.a, prefix), b: prefixRefs(n.b, prefix) };
		case 'fn':
			return { ...n, args: n.args.map(a => prefixRefs(a, prefix)) };
		case 'str':
		case 'bool':
			return n;
		case 'cmp':
		case 'logic':
			return { ...n, a: prefixRefs(n.a, prefix), b: prefixRefs(n.b, prefix) };
	}
};

const setOn = (target: any, key: string, v: any) => {
	if (!target) return;
	if (typeof target.set === 'function') return target.set(key, v);
	const segs = key.split('.');
	const last = segs.pop()!;
	const parent = segs.reduce((o, k) => (o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {})), target);
	parent[last] = v;
};

/**
 * Sets every formula field on a document (or plain object) from its other
 * fields. `linked`: the values read through links (linkedValues) — without
 * them a linked number counts as 0, so pass them wherever the model has links
 * (applyFormulasLinked does both).
 */
export const applyFormulas = (doc: any, formulas: Formula[] = [], linked?: Linked) => {
	for (const f of formulas) {
		if (f.sub) {
			const rows = valueAt(doc, f.key);
			if (Array.isArray(rows)) for (const row of rows) if (row && typeof row === 'object') setOn(row, f.sub, evaluate(f.tree, row));
			continue;
		}
		// Once: kept as soon as it holds something.
		if (f.once && !isEmpty(valueAt(doc, f.key))) continue;
		setOn(doc, f.key, f.date ? evaluateDate(f.tree, doc, linked) : evaluate(f.tree, doc, linked));
	}
	return doc;
};

/* ---------- numbers of linked records (`tax.amount`) ---------- */

/** The model a single link (`tax`) of `model` picks from, or null when the path isn't one. */
export const linkedModelOf = (model: mongoose.Model<any> | undefined, key: string): mongoose.Model<any> | null => {
	const path: any = model?.schema?.path?.(key);
	const ref = path?.instance === 'ObjectId' ? path.options?.ref : null;
	if (!ref || typeof ref !== 'string') return null;
	return (mongoose.models[ref] as any) || (model as any)?.db?.models?.[ref] || null;
};

/** A link and the paths a model's formulas read through it: `tax.amount` → tax: [amount]. */
const linkedReads = (formulas: Formula[], model?: mongoose.Model<any>) => {
	const out = new Map<string, { Linked: mongoose.Model<any>; paths: Set<string> }>();
	for (const f of formulas) {
		if (f.sub) continue; // a row reads only its own values
		for (const r of f.refs) {
			const dot = r.indexOf('.');
			if (dot < 1) continue;
			const head = r.slice(0, dot);
			const Linked = linkedModelOf(model, head);
			if (!Linked) continue;
			if (!out.has(head)) out.set(head, { Linked, paths: new Set() });
			out.get(head)!.paths.add(r.slice(dot + 1));
		}
	}
	return out;
};

/** Whether any of a model's formulas reads a linked record. */
export const usesLinks = (formulas: Formula[] = [], model?: mongoose.Model<any>) => linkedReads(formulas, model).size > 0;

const idOf = (v: any) => (v && typeof v === 'object' && v._id ? v._id : v);

/**
 * The values a record's formulas read through its links, by formula key
 * (`{ 'tax.amount': 12 }`): one lookup per link picked. A link not picked, or
 * to a record that's gone, reads as empty (0).
 */
export const linkedValues = async (
	doc: any,
	formulas: Formula[] = [],
	model?: mongoose.Model<any>,
	/** Linked records already looked up, by link and id — many records picking the same one (recalculateFormulas). */
	cache?: Map<string, any>
): Promise<Record<string, any>> => {
	const out: Record<string, any> = {};
	for (const [head, { Linked, paths }] of linkedReads(formulas, model)) {
		for (const p of paths) out[`${head}.${p}`] = null;
		const id = idOf(valueAt(doc, head));
		if (!id || !mongoose.isValidObjectId(id)) continue;
		const at = `${head}|${id}`;
		const rec: any = cache?.has(at) ? cache.get(at) : await Linked.findById(id).select([...paths].join(' ')).lean();
		cache?.set(at, rec);
		if (rec) for (const p of paths) out[`${head}.${p}`] = valueAt(rec, p);
	}
	return out;
};

/** The links of a model's formulas, and the fields each reads through it: tax → [amount]. */
export const linksRead = (formulas: Formula[] = [], model?: mongoose.Model<any>) =>
	new Map([...linkedReads(formulas, model)].map(([head, { Linked, paths }]) => [head, { Linked, paths: [...paths] }]));

/** applyFormulas with the values read through links looked up first. `model`: the document's own, by default. */
export const applyFormulasLinked = async (doc: any, formulas: Formula[] = [], model: mongoose.Model<any> | undefined = doc?.constructor?.schema ? doc.constructor : undefined) =>
	applyFormulas(doc, formulas, usesLinks(formulas, model) ? await linkedValues(doc, formulas, model) : undefined);

/**
 * Recalculates the formula fields of every record `filter` matches: in the
 * database (formulaPipeline) — or, when a formula reads a linked record
 * (which an update pipeline can't look up), record by record. Returns how
 * many records changed.
 */
export const recalculateFormulas = async (model: mongoose.Model<any>, filter: any, formulas: Formula[] = []): Promise<number> => {
	if (!formulas.length) return 0;
	if (!usesLinks(formulas, model)) return (await model.updateMany(filter, formulaPipeline(formulas))).modifiedCount;
	let changed = 0;
	let ops: any[] = [];
	const cache = new Map<string, any>();
	const flush = async () => {
		if (ops.length) changed += (await model.bulkWrite(ops)).modifiedCount;
		ops = [];
	};
	for await (const raw of model.find(filter).lean().cursor()) {
		const doc: any = { ...raw };
		applyFormulas(doc, formulas, await linkedValues(doc, formulas, model, cache));
		const set: Record<string, any> = {};
		for (const f of formulas) set[f.key] = valueAt(doc, f.key);
		ops.push({ updateOne: { filter: { _id: raw._id }, update: { $set: set } } });
		if (ops.length >= 500) await flush();
	}
	await flush();
	return changed;
};

const isEmpty = (v: any) => v === null || v === undefined || v === '';
/** A once formula keeps what it holds: only an empty one is worked out. */
const once = (f: Formula, expr: any) => (f.once ? { $ifNull: [`$${f.key}`, expr] } : expr);

/** Pipeline stages that recalculate the formula fields of every matched record, in order. */
export const formulaPipeline = (formulas: Formula[] = []) =>
	formulas.map(f =>
		f.sub
			? {
					$set: {
						[f.key]: {
							$cond: [
								{ $isArray: `$${f.key}` },
								{
									$map: {
										input: `$${f.key}`,
										as: 'row',
										in: { $mergeObjects: ['$$row', { [f.sub]: toMongo(f.tree, '$$row.') }] },
									},
								},
								`$${f.key}`,
							],
						},
					},
			  }
			: { $set: { [f.key]: once(f, f.date ? toMongoDate(f.tree) : toMongo(f.tree)) } }
	);

/** Removes formula fields from an incoming body: they're calculated, never sent. A list's rows are kept — only their formula values are recalculated. */
export const stripFormulaKeys = (body: any, formulas: Formula[] = []) => {
	if (body && typeof body === 'object') for (const f of formulas) if (!f.sub) delete body[f.key];
	return body;
};
