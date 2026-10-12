import { integerToWords } from '../../../lib/numberToWords.js';

/**
 * Tokens in a template's text (docs/pdf-templates D4): `{{invoice.total |
 * money}}` — a path from one of the roots (the record by its alias, `item`
 * in a table row, `business`, a declared list, `today`, `page`…), then
 * filters, each with an optional argument (`date:'D MMM YYYY'`, `sum:amount`,
 * `minus:invoice.paid`).
 *
 * A path through a list maps over it (`invoice.items.name` is every item's
 * name), so `join` and `sum` work on it. A token that can't be resolved
 * prints nothing — a template never fails on missing data.
 */

export type Settings = {
	currency: { symbol: string; code: string; name: string; decimals: number; position: 'before' | 'after'; grouping: 'standard' | 'indian' };
	dateFormat: string;
};

export type Scope = { roots: Record<string, any>; settings: Settings; tz: string };

type Filter = { name: string; arg?: string };
type Parsed = { path: string; filters: Filter[] };

export const FILTERS: Record<string, string> = {
	money: 'Amount with the currency: money, or money:$ for another symbol',
	number: 'Number with thousands separators: number, or number:2 for two decimals',
	percent: 'Adds %: percent, or percent:1 for one decimal',
	date: "Date in the settings' format, or date:'DD/MM/YYYY'",
	datetime: 'Date and time',
	upper: 'UPPER CASE',
	lower: 'lower case',
	title: 'Title Case',
	words: 'Amount in words: “One Thousand Taka Only”',
	default: "Text to show when empty: default:'—'",
	count: 'How many items a list has',
	sum: 'Adds up a list: sum:amount',
	join: "Joins a list: join, or join:' / '",
	yesno: 'Yes or No',
	first: 'The first of a list',
	last: 'The last of a list',
	plus: 'Adds a number or a field: plus:invoice.shipping',
	minus: 'Takes away a number or a field: minus:invoice.paid',
	times: 'Multiplies: times:item.quantity',
	divide: 'Divides: divide:100',
};

const PATH = /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/;
const TOKEN = /\{\{([\s\S]*?)\}\}/g;

/** Splits on `sep` outside quotes. */
const splitOutside = (s: string, sep: string): string[] => {
	const out: string[] = [];
	let cur = '';
	let quote = '';
	for (const ch of s) {
		if (quote) {
			if (ch === quote) quote = '';
			cur += ch;
		} else if (ch === "'" || ch === '"') {
			quote = ch;
			cur += ch;
		} else if (ch === sep) {
			out.push(cur);
			cur = '';
		} else cur += ch;
	}
	out.push(cur);
	return out;
};

const unquote = (s: string) => {
	const t = s.trim();
	return (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')) ? t.slice(1, -1) : t;
};

const parseCache = new Map<string, Parsed | string>();

/** A token's inside, parsed — or what's wrong with it. */
export const parseToken = (expr: string): Parsed | string => {
	const hit = parseCache.get(expr);
	if (hit) return hit;
	const [head, ...rest] = splitOutside(expr, '|');
	const path = head.trim();
	let out: Parsed | string;
	if (!PATH.test(path)) out = `“{{${expr.trim()}}}” — start with a field, like {{record.total}}`;
	else {
		const filters: Filter[] = [];
		let bad = '';
		for (const f of rest) {
			const i = f.indexOf(':');
			const name = (i < 0 ? f : f.slice(0, i)).trim();
			if (!FILTERS[name]) {
				bad = `“${name}” isn't a filter (${Object.keys(FILTERS).join(', ')})`;
				break;
			}
			filters.push(i < 0 ? { name } : { name, arg: unquote(f.slice(i + 1)) });
		}
		out = bad || { path, filters };
	}
	if (parseCache.size > 5000) parseCache.clear();
	parseCache.set(expr, out);
	return out;
};

/** The first problem with a text's tokens, or ''. */
export const checkTokens = (text: string): string => {
	if (!text) return '';
	const opens = (text.match(/\{\{/g) || []).length;
	const closes = (text.match(/\}\}/g) || []).length;
	if (opens !== closes) return 'a {{ without its }}';
	for (const m of text.matchAll(TOKEN)) {
		const p = parseToken(m[1]);
		if (typeof p === 'string') return p;
	}
	return '';
};

/** Every path a text's tokens read (filters' field arguments included). */
export const tokenPaths = (text: string): string[] => {
	const out: string[] = [];
	if (!text) return out;
	for (const m of text.matchAll(TOKEN)) {
		const p = parseToken(m[1]);
		if (typeof p === 'string') continue;
		out.push(p.path);
		for (const f of p.filters) if (f.arg && PATH.test(f.arg) && /[A-Za-z_]/.test(f.arg[0]) && f.arg.includes('.')) out.push(f.arg);
	}
	return out;
};

/* ------------------------------------------------------------ values */

const isBlank = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
const isId = (v: any) => v && typeof v === 'object' && typeof v.toHexString === 'function';

/** A path from the roots; through a list it maps over the items. */
export const resolve = (path: string, roots: Record<string, any>): any => {
	const [root, ...keys] = path.split('.');
	let v: any = roots[root];
	for (const k of keys) {
		if (v == null) return undefined;
		if (Array.isArray(v) && !/^\d+$/.test(k)) v = v.map(x => (x == null ? x : x[k])).flat();
		else v = v[k];
	}
	return v;
};

const toNumber = (v: any): number | null => {
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
	if (v && typeof v === 'object' && typeof v.toString === 'function' && v._bsontype === 'Decimal128') return Number(v.toString());
	return null;
};

const toDate = (v: any): { date: Date; utc: boolean } | null => {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { date: v, utc: false };
	if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
		const d = new Date(v);
		// A bare date ("2026-10-13") is that day wherever it's printed.
		return Number.isNaN(d.getTime()) ? null : { date: d, utc: v.length === 10 };
	}
	if (typeof v === 'number' && v > 1e11) return { date: new Date(v), utc: false };
	return null;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const zoneParts = (d: Date, tz: string) => {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: tz || 'UTC',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			weekday: 'short',
			hourCycle: 'h23',
		}).formatToParts(d);
		const get = (t: string) => parts.find(p => p.type === t)?.value || '';
		const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
		return { Y: Number(get('year')), M: Number(get('month')), D: Number(get('day')), h: Number(get('hour')) % 24, m: Number(get('minute')), wd };
	} catch {
		return { Y: d.getUTCFullYear(), M: d.getUTCMonth() + 1, D: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), wd: d.getUTCDay() };
	}
};

const pad = (n: number) => String(n).padStart(2, '0');

/** `D MMM YYYY`, `DD/MM/YYYY`, `dddd, MMMM D`, `h:mm A`… — text in [brackets] stays as it is. */
export const formatDate = (value: any, format: string, tz: string): string => {
	const parsed = toDate(value);
	if (!parsed) return value == null ? '' : String(value);
	const p = zoneParts(parsed.date, parsed.utc ? 'UTC' : tz);
	return (format || 'D MMM YYYY').replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|A/g, (t, lit) => {
		if (lit !== undefined) return lit;
		switch (t) {
			case 'YYYY': return String(p.Y);
			case 'YY': return String(p.Y).slice(-2);
			case 'MMMM': return MONTHS[p.M - 1];
			case 'MMM': return MONTHS[p.M - 1].slice(0, 3);
			case 'MM': return pad(p.M);
			case 'M': return String(p.M);
			case 'DD': return pad(p.D);
			case 'D': return String(p.D);
			case 'dddd': return DAYS[p.wd] || '';
			case 'ddd': return (DAYS[p.wd] || '').slice(0, 3);
			case 'HH': return pad(p.h);
			case 'H': return String(p.h);
			case 'hh': return pad(p.h % 12 || 12);
			case 'h': return String(p.h % 12 || 12);
			case 'mm': return pad(p.m);
			case 'A': return p.h < 12 ? 'AM' : 'PM';
		}
		return t;
	});
};

/** 1,234,567.50 — or 12,34,567.50 with Indian grouping. */
export const formatNumber = (n: number, decimals: number | null, grouping: 'standard' | 'indian' = 'standard'): string => {
	const neg = n < 0;
	const abs = Math.abs(n);
	const fixed = decimals === null ? String(Number(abs.toFixed(4))) : abs.toFixed(decimals);
	const [int, frac] = fixed.split('.');
	let grouped: string;
	if (grouping === 'indian' && int.length > 3) {
		const last = int.slice(-3);
		grouped = `${int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last}`;
	} else grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
};

/** A linked record, printed: its name, title or code. */
const labelOf = (o: any): string => {
	for (const k of ['name', 'title', 'fullName', 'label', 'code', 'email']) if (typeof o?.[k] === 'string' && o[k]) return o[k];
	if (o?._id != null) return String(o._id);
	return '';
};

/** A value as text when no filter says otherwise. */
export const display = (v: any, scope: Scope): string => {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toFixed(6))) : '';
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	if (v instanceof Date) return formatDate(v, scope.settings.dateFormat, scope.tz);
	if (isId(v)) return v.toHexString();
	if (Array.isArray(v)) return v.map(x => display(x, scope)).filter(Boolean).join(', ');
	if (typeof v === 'object') return labelOf(v);
	return String(v);
};

/** A filter's argument: a number, a field's value, or text. */
const argValue = (arg: string | undefined, scope: Scope): any => {
	if (arg === undefined) return undefined;
	const n = toNumber(arg);
	if (n !== null) return n;
	if (PATH.test(arg) && arg.includes('.')) return resolve(arg, scope.roots);
	return arg;
};

const applyFilter = (v: any, f: Filter, scope: Scope): any => {
	const { currency } = scope.settings;
	switch (f.name) {
		case 'money': {
			const n = toNumber(Array.isArray(v) ? undefined : v);
			if (n === null) return isBlank(v) ? '' : display(v, scope);
			const symbol = f.arg ?? currency.symbol;
			const amount = formatNumber(Math.abs(n), currency.decimals, currency.grouping);
			const sign = n < 0 ? '-' : '';
			if (!symbol) return `${sign}${amount}`;
			return currency.position === 'after' ? `${sign}${amount} ${symbol}` : `${sign}${symbol}${amount}`;
		}
		case 'number': {
			const n = toNumber(v);
			if (n === null) return isBlank(v) ? '' : display(v, scope);
			const d = f.arg !== undefined && Number.isFinite(Number(f.arg)) ? Math.min(6, Math.max(0, Number(f.arg))) : null;
			return formatNumber(n, d, currency.grouping);
		}
		case 'percent': {
			const n = toNumber(v);
			if (n === null) return isBlank(v) ? '' : display(v, scope);
			const d = f.arg !== undefined && Number.isFinite(Number(f.arg)) ? Number(f.arg) : null;
			return `${formatNumber(n, d)}%`;
		}
		case 'date':
			return isBlank(v) ? '' : formatDate(v, f.arg || scope.settings.dateFormat, scope.tz);
		case 'datetime':
			return isBlank(v) ? '' : formatDate(v, f.arg || `${scope.settings.dateFormat}, h:mm A`, scope.tz);
		case 'upper':
			return display(v, scope).toUpperCase();
		case 'lower':
			return display(v, scope).toLowerCase();
		case 'title':
			return display(v, scope).toLowerCase().replace(/(^|[\s-])(\S)/g, (_m, a, b) => a + b.toUpperCase());
		case 'words': {
			const n = toNumber(v);
			if (n === null) return '';
			const name = f.arg ?? currency.name;
			return `${n < 0 ? 'Minus ' : ''}${integerToWords(Math.floor(Math.abs(n)))}${name ? ` ${name}` : ''} Only`;
		}
		case 'default':
			return isBlank(v) || (typeof v === 'string' && !v.trim()) ? f.arg ?? '' : v;
		case 'count':
			return Array.isArray(v) ? v.length : isBlank(v) ? 0 : 1;
		case 'sum': {
			const list = Array.isArray(v) ? v : isBlank(v) ? [] : [v];
			// sum:amount reads each item's amount (sum:product.price goes further in).
			return list.reduce((t, x) => t + (toNumber(f.arg ? resolve(f.arg, x ?? {}) : x) ?? 0), 0);
		}
		case 'join':
			return Array.isArray(v) ? v.map(x => display(x, scope)).filter(Boolean).join(f.arg ?? ', ') : display(v, scope);
		case 'yesno':
			return v === true || v === 'true' || v === 'yes' ? 'Yes' : isBlank(v) ? '' : 'No';
		case 'first':
			return Array.isArray(v) ? v[0] : v;
		case 'last':
			return Array.isArray(v) ? v[v.length - 1] : v;
		case 'plus':
		case 'minus':
		case 'times':
		case 'divide': {
			const a = toNumber(v) ?? (isBlank(v) ? 0 : null);
			const b = toNumber(argValue(f.arg, scope)) ?? 0;
			if (a === null) return v;
			if (f.name === 'plus') return a + b;
			if (f.name === 'minus') return a - b;
			if (f.name === 'times') return a * b;
			return b === 0 ? '' : a / b;
		}
	}
	return v;
};

/** A token's value after its filters — a list stays a list (for tables and images). */
export const evaluate = (expr: string, scope: Scope): any => {
	const p = parseToken(expr);
	if (typeof p === 'string') return undefined;
	let v = resolve(p.path, scope.roots);
	for (const f of p.filters) v = applyFilter(v, f, scope);
	return v;
};

/** A text with its tokens filled in. */
export const fill = (text: string, scope: Scope): string =>
	!text || !text.includes('{{') ? text || '' : text.replace(TOKEN, (_m, expr) => display(evaluate(expr, scope), scope));

/** A table's rows / an image's source: a bare path or one token. */
export const valueOf = (text: string, scope: Scope): any => {
	const t = (text || '').trim();
	const m = /^\{\{([\s\S]*)\}\}$/.exec(t);
	if (m && !m[1].includes('}}')) return evaluate(m[1], scope);
	if (PATH.test(t)) return resolve(t, scope.roots);
	return fill(t, scope);
};
