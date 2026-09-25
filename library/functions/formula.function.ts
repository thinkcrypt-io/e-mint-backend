/**
 * Formula fields: a number field whose value is calculated from the record's
 * other number fields — `due = total - paid` — and never typed in.
 *
 * A formula is a small arithmetic expression:
 *
 *   total - paid
 *   round((price * qty) * (1 - discount / 100), 2)
 *   max(total - paid, 0)
 *
 * - field keys (dotted for nested: `payment.amount`), numbers, `+ - * / %`,
 *   brackets, and round(x[, digits]) floor ceil abs min max;
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
	| { t: 'fn'; name: FnName; args: Node[]; at: number };

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
		case 'bin': {
			const p = PREC[n.op];
			const s = `${format(n.a, p)} ${n.op} ${format(n.b, p, true)}`;
			return p < parent || (right && p === parent) ? `(${s})` : s;
		}
	}
};

export type FieldInfo = { key: string; label?: string; numeric: boolean; formula?: string };

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
	}
};

/** A formula's value for one record (a plain object or a Mongoose document). */
export const evaluate = (tree: Node, doc: any): number | null => {
	const v = ev(tree, doc);
	return v === null || !Number.isFinite(v) ? null : roundTo(v, 10);
};

/* ---------- MongoDB ---------- */

const mongo = (n: Node): any => {
	switch (n.t) {
		case 'num':
			return { $literal: n.v };
		case 'ref':
			return { $convert: { input: `$${n.key}`, to: 'double', onError: 0, onNull: 0 } };
		case 'neg':
			return { $multiply: [-1, mongo(n.a)] };
		case 'bin': {
			const a = mongo(n.a);
			const b = mongo(n.b);
			if (n.op === '+') return { $add: [a, b] };
			if (n.op === '-') return { $subtract: [a, b] };
			if (n.op === '*') return { $multiply: [a, b] };
			const op = n.op === '/' ? '$divide' : '$mod';
			return { $cond: [{ $eq: [b, 0] }, null, { [op]: [a, b] }] };
		}
		case 'fn': {
			const args = n.args.map(mongo);
			if (n.name === 'min') return { $min: args };
			if (n.name === 'max') return { $max: args };
			if (n.name === 'round') return { $round: [args[0], (n.args[1] as any)?.v ?? 0] };
			return { [`$${n.name}`]: args[0] };
		}
	}
};

/** The same calculation as an aggregation expression, for pipeline updates. */
export const toMongo = (tree: Node) => ({ $round: [mongo(tree), 10] });

/* ---------- a route's formula fields ---------- */

export type Formula = { key: string; tree: Node; refs: string[] };

const compiledCache = new WeakMap<object, Formula[]>();

/**
 * A route's formula fields, from its (resolved) settings, in the order they
 * must be calculated — a formula that uses another formula field comes after
 * it. Fields whose formula doesn't parse, or that go round in a circle, are
 * left out (the builder refuses to publish them anyway).
 */
export const formulasOf = (settings: Record<string, any> | undefined): Formula[] => {
	if (!settings) return [];
	const hit = compiledCache.get(settings);
	if (hit) return hit;

	const all = new Map<string, Formula>();
	for (const [key, f] of Object.entries(settings)) {
		const src = f?.schema?.type === 'formula' ? f?.schema?.formula : undefined;
		if (typeof src !== 'string' || !src.trim()) continue;
		try {
			const tree = parse(src);
			all.set(key, { key, tree, refs: [...refsOf(tree)] });
		} catch {
			/* skipped */
		}
	}
	const ordered: Formula[] = [];
	const state = new Map<string, 'visiting' | 'done' | 'bad'>();
	const visit = (key: string): boolean => {
		const s = state.get(key);
		if (s === 'done') return true;
		if (s === 'visiting' || s === 'bad') return false;
		state.set(key, 'visiting');
		const f = all.get(key)!;
		for (const r of f.refs) if (all.has(r) && !visit(r)) return (state.set(key, 'bad'), false);
		state.set(key, 'done');
		ordered.push(f);
		return true;
	};
	for (const key of all.keys()) visit(key);

	compiledCache.set(settings, ordered);
	return ordered;
};

/** Sets every formula field on a document (or plain object) from its other fields. */
export const applyFormulas = (doc: any, formulas: Formula[] = []) => {
	for (const f of formulas) {
		const v = evaluate(f.tree, doc);
		if (typeof doc?.set === 'function') doc.set(f.key, v);
		else if (doc) doc[f.key] = v;
	}
	return doc;
};

/** Pipeline stages that recalculate the formula fields of every matched record, in order. */
export const formulaPipeline = (formulas: Formula[] = []) => formulas.map(f => ({ $set: { [f.key]: toMongo(f.tree) } }));

/** Removes formula fields from an incoming body: they're calculated, never sent. */
export const stripFormulaKeys = (body: any, formulas: Formula[] = []) => {
	if (body && typeof body === 'object') for (const f of formulas) delete body[f.key];
	return body;
};
