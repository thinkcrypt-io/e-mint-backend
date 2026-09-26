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
 * - over a list of rows (a custom section list, like an invoice's items):
 *   sum(items.total), avg(items.total) and count(items) — a row's value
 *   can't be used on its own, only through these;
 * - a list's rows can have formula fields of their own, from the other
 *   values in the same row (`total = quantity * rate`) — calculated before
 *   the record's, so `sum(items.total)` sees them;
 * - an empty or non-numeric field counts as 0; dividing by 0 leaves the
 *   result empty (null) rather than infinite;
 * - results are rounded to 10 decimals so 0.1 + 0.2 is 0.3.
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
	| { t: 'agg'; name: AggName; key: string; at: number };

export type FormulaError = { message: string; at?: number };

export const FUNCTIONS = {
	round: { min: 1, max: 2, hint: 'round(x) or round(x, digits)' },
	floor: { min: 1, max: 1, hint: 'floor(x) — down to a whole number' },
	ceil: { min: 1, max: 1, hint: 'ceil(x) — up to a whole number' },
	abs: { min: 1, max: 1, hint: 'abs(x) — without its sign' },
	min: { min: 2, max: 20, hint: 'min(a, b, …) — the smallest' },
	max: { min: 2, max: 20, hint: 'max(a, b, …) — the largest' },
} as const;
type FnName = keyof typeof FUNCTIONS;

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

type Token = { k: 'num' | 'id' | 'op' | ',' | 'end'; v: string; at: number };

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
		if (t.k === 'id') {
			if (peek().k === 'op' && peek().v === '(') {
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
				if (!(name in FUNCTIONS)) throw new ParseError(`There's no function “${t.v}”`, t.at);
				next();
				const args: Node[] = [];
				if (!(peek().k === 'op' && peek().v === ')')) {
					args.push(expr());
					while (peek().k === ',') {
						next();
						args.push(expr());
					}
				}
				expectOp(')', '“)” to close the function');
				const spec = FUNCTIONS[name as FnName];
				if (args.length < spec.min || args.length > spec.max)
					throw new ParseError(`${spec.hint}`, t.at);
				if (name === 'round' && args[1] && (args[1].t !== 'num' || !Number.isInteger(args[1].v) || args[1].v < 0 || args[1].v > 20))
					throw new ParseError('round’s digits must be a whole number from 0 to 20', t.at);
				return { t: 'fn', name: name as FnName, args, at: t.at };
			}
			return { t: 'ref', key: t.v, at: t.at };
		}
		if (t.k === 'op' && t.v === '(') {
			const e = expr();
			expectOp(')', '“)”');
			return e;
		}
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

	if (peek().k === 'end') throw new ParseError('The formula is empty', 0);
	const tree = expr();
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
	return out;
};

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

/** The formula written out tidily: `total-paid` → `total - paid`. */
export const format = (n: Node, parent = 0, right = false): string => {
	switch (n.t) {
		case 'num':
			return String(n.v);
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
};

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
export const checkFormula = (src: string, fields: FieldInfo[], self?: string): Checked => {
	let tree: Node;
	try {
		tree = parse(src);
	} catch (e: any) {
		return { ok: false, errors: [{ message: e.message, at: e.at }], refs: [] };
	}
	const byKey = new Map(fields.map(f => [f.key, f]));
	const errors: FormulaError[] = [];
	const refs = [...refsOf(tree)];
	const walk = (n: Node) => {
		if (n.t === 'ref') {
			const f = byKey.get(n.key);
			if (n.key === self) errors.push({ message: `“${n.key}” is this field — a formula can't use itself`, at: n.at });
			else if (!f) errors.push({ message: `There's no field “${n.key}”`, at: n.at });
			else if (f.list) errors.push({ message: `“${n.key}” is a list — count(${n.key}) counts its rows`, at: n.at });
			else if (f.inList)
				errors.push({ message: `“${n.key}” is in every row of ${f.inList} — use sum(${n.key}) or avg(${n.key})`, at: n.at });
			else if (!f.numeric) errors.push({ message: `“${n.key}” isn't a number field`, at: n.at });
		} else if (n.t === 'agg') {
			const f = byKey.get(n.key);
			if (n.name === 'count') {
				if (!f?.list) errors.push({ message: `count() takes a list — “${n.key}” isn't one`, at: n.at });
			} else if (!f) errors.push({ message: `There's no field “${n.key}”`, at: n.at });
			else if (!f.inList) errors.push({ message: `${n.name}() takes a value in a list's rows, like items.total — “${n.key}” isn't one`, at: n.at });
			else if (!f.numeric) errors.push({ message: `“${n.key}” isn't a number field`, at: n.at });
		} else if (n.t === 'neg') walk(n.a);
		else if (n.t === 'bin') (walk(n.a), walk(n.b));
		else if (n.t === 'fn') n.args.forEach(walk);
	};
	walk(tree);

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

const ev = (n: Node, doc: any): number | null => {
	switch (n.t) {
		case 'num':
			return n.v;
		case 'ref':
			return numberOf(valueAt(doc, n.key));
		case 'neg': {
			const a = ev(n.a, doc);
			return a === null ? null : -a;
		}
		case 'bin': {
			const a = ev(n.a, doc);
			const b = ev(n.b, doc);
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
			const args = n.args.map(a => ev(a, doc));
			if (n.name === 'min' || n.name === 'max') {
				const xs = args.filter((x): x is number => x !== null);
				return xs.length ? Math[n.name](...xs) : null;
			}
			const x = args[0];
			if (x === null) return null;
			if (n.name === 'round') return roundTo(x, (n.args[1] as any)?.v ?? 0);
			return Math[n.name](x);
		}
		case 'agg': {
			if (n.name === 'count') return rowCount(doc, n.key);
			const xs = listNumbers(doc, n.key);
			if (n.name === 'sum') return xs.reduce((a, b) => a + b, 0);
			return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
		}
	}
};

/** A formula's value for one record (a plain object or a Mongoose document). */
export const evaluate = (tree: Node, doc: any): number | null => {
	const v = ev(tree, doc);
	return v === null || !Number.isFinite(v) ? null : roundTo(v, 10);
};

/* ---------- MongoDB ---------- */

/** `x` when it's a list, otherwise an empty one. */
const listOr = (x: any) => ({ $cond: [{ $isArray: x }, x, []] });
const toDouble = (x: any) => ({ $convert: { input: x, to: 'double', onError: 0, onNull: 0 } });

/** `base` is what a field key is read from: `$` for the record, `$$row.` inside a list's row. */
const mongo = (n: Node, base = '$'): any => {
	switch (n.t) {
		case 'num':
			return { $literal: n.v };
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

/* ---------- a route's formula fields ---------- */

/**
 * One formula to calculate. `key` is the record path it changes: the formula
 * field — or, with `sub`, the list whose rows each get `sub` calculated from
 * the row's own values.
 */
export type Formula = { key: string; tree: Node; refs: string[]; sub?: string };

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
		if (tree) top.set(key, { key, tree, refs: [...refsOf(tree)] });

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

/** Sets every formula field on a document (or plain object) from its other fields. */
export const applyFormulas = (doc: any, formulas: Formula[] = []) => {
	for (const f of formulas) {
		if (f.sub) {
			const rows = valueAt(doc, f.key);
			if (Array.isArray(rows)) for (const row of rows) if (row && typeof row === 'object') setOn(row, f.sub, evaluate(f.tree, row));
			continue;
		}
		setOn(doc, f.key, evaluate(f.tree, doc));
	}
	return doc;
};

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
			: { $set: { [f.key]: toMongo(f.tree) } }
	);

/** Removes formula fields from an incoming body: they're calculated, never sent. A list's rows are kept — only their formula values are recalculated. */
export const stripFormulaKeys = (body: any, formulas: Formula[] = []) => {
	if (body && typeof body === 'object') for (const f of formulas) if (!f.sub) delete body[f.key];
	return body;
};
