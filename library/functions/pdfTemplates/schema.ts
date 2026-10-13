import crypto from 'crypto';
import { LOCK_OPS } from '../fieldLocks.function.js';
import { checkTokens } from './tokens.js';

/**
 * PDF templates (docs/pdf-templates): what a template is, and the one check
 * every way in goes through — the designer's save, the gallery, AI, the MCP.
 *
 * A template is blocks, not HTML (D2): known properties only, each clamped
 * to what the renderer can draw; anything else is dropped. Problems a person
 * has to fix ("pick the list this table shows") come back as `errors`, each
 * naming the block; the rest is quietly made sensible.
 */

export const PAGE_SIZES: Record<string, [number, number]> = {
	A4: [595.28, 841.89],
	Letter: [612, 792],
	Legal: [612, 1008],
	A5: [419.53, 595.28],
};
export const FONTS = ['sans', 'mono', 'helvetica', 'times', 'courier'] as const;
/** The built-in categories (D21) — the list itself is data (PdfCategory), seeded with these. */
export const KINDS = ['invoice', 'receipt', 'quotation'] as const;
/** Old kinds → today's category keys. */
const OLD_KINDS: Record<string, string> = { quote: 'quotation', bill: 'invoice' };
/** A category key: lower-case letters, digits and dashes (D21). */
export const categoryKey = (v: any): string => {
	const k = String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return OLD_KINDS[k] || k;
};
export const BLOCK_TYPES = ['text', 'image', 'columns', 'box', 'table', 'fields', 'divider', 'spacer', 'pageBreak'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;
export const WEIGHTS = [400, 500, 600, 700] as const;
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
export type Align = (typeof ALIGNS)[number];
export type Condition = { field: string; op: string; value?: any };

export type Block = {
	id: string;
	type: BlockType;
	showIf?: Condition[];
	showMatch?: 'all' | 'any';
	/** Space above / below, pt. */
	mt?: number;
	mb?: number;
	[key: string]: any;
};

export type TemplateList = { name: string; route: string; foreignField: string; sort?: string; limit?: number };

export type Slot = { token: string; label: string; type: 'text' | 'number' | 'date' | 'image' | 'list'; of?: Slot[] };

export type PdfTemplateData = {
	name: string;
	description: string;
	/** The gallery category's key (D21). */
	kind: string;
	route: string;
	alias: string;
	page: { size: keyof typeof PAGE_SIZES; orientation: 'portrait' | 'landscape'; margin: [number, number, number, number] };
	style: { font: (typeof FONTS)[number]; size: number; color: string; muted: string; accent: string; lineHeight: number };
	lists: TemplateList[];
	header: Block[];
	body: Block[];
	footer: Block[];
	slots?: Slot[];
	sample?: Record<string, any>;
};

export const LIMITS = { blocks: 300, depth: 4, columns: 6, tableColumns: 12, fieldRows: 30, lists: 6, text: 4000, records: 200, rows: 2000, pages: 40 };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH = /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/;
const ROUTE = /^[A-Za-z0-9][\w\-/]*$/;

const str = (v: any, max: number, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : fallback);
const num = (v: any, min: number, max: number, fallback: number) => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};
const oneOf = <T extends readonly any[]>(v: any, list: T, fallback: T[number]): T[number] => (list.includes(v) ? v : fallback);
const color = (v: any, fallback?: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);
const bool = (v: any) => v === true || v === 'true';
export const newBlockId = () => `b_${crypto.randomBytes(5).toString('hex')}`;

/** "invoice" from "Invoices", "billPayment" from "Bill payments" — a token root. */
export const aliasOf = (name: string) => {
	const words = String(name || '')
		.replace(/[^A-Za-z0-9 ]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!words.length) return 'record';
	const last = words.length - 1;
	words[last] = words[last].replace(/ies$/i, 'y').replace(/(ss|sh|ch|x)es$/i, '$1').replace(/([^s])s$/i, '$1');
	const camel = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
	return /^[A-Za-z_]/.test(camel) ? camel : `r${camel}`;
};

const RESERVED_ROOTS = new Set(['item', 'index', 'business', 'texts', 'today', 'now', 'page', 'pages', 'template', 'record']);

/** Shared by every block of a template: its errors and how many blocks there are. */
type Ctx = { errors: string[]; counter: { n: number }; where: string };

const conditions = (list: any): Condition[] | undefined => {
	if (!Array.isArray(list)) return undefined;
	const out = list
		.slice(0, 10)
		.filter((c: any) => c && typeof c.field === 'string' && PATH.test(c.field.trim()) && (LOCK_OPS as readonly string[]).includes(c.op))
		.map((c: any) => ({
			field: c.field.trim(),
			op: c.op,
			...(c.op !== 'empty' && c.op !== 'filled' && { value: Array.isArray(c.value) ? c.value.slice(0, 50).map((x: any) => str(x, 200)) : typeof c.value === 'number' || typeof c.value === 'boolean' ? c.value : str(c.value, 200) }),
		}));
	return out.length ? out : undefined;
};

const textOf = (v: any, ctx: Ctx, what: string) => {
	const text = str(v, LIMITS.text);
	const bad = checkTokens(text);
	if (bad) ctx.errors.push(`${ctx.where}: ${what} — ${bad}`);
	return text;
};

/** Text styling shared by text blocks, table cells and field rows. */
const textStyle = (b: any) => ({
	...(b.size !== undefined && { size: num(b.size, 5, 72, 10) }),
	...(b.weight !== undefined && { weight: oneOf(Number(b.weight), WEIGHTS, 400) }),
	...(bool(b.italic) && { italic: true }),
	...(color(b.color) && { color: color(b.color) }),
});

const blocksOf = (list: any, ctx: Ctx, depth: number, where: string): Block[] => {
	if (!Array.isArray(list)) return [];
	const out: Block[] = [];
	list.forEach((raw: any, i: number) => {
		const block = blockOf(raw, { ...ctx, where: `${where} block ${i + 1}` }, depth);
		if (block) out.push(block);
	});
	return out;
};

const blockOf = (b: any, ctx: Ctx, depth: number): Block | null => {
	if (!b || typeof b !== 'object') return null;
	const type = b.type;
	if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
		ctx.errors.push(`${ctx.where}: “${str(type, 30) || 'nothing'}” isn't a kind of block`);
		return null;
	}
	if (++ctx.counter.n > LIMITS.blocks) {
		if (ctx.counter.n === LIMITS.blocks + 1) ctx.errors.push(`A template can have at most ${LIMITS.blocks} blocks`);
		return null;
	}
	const where = `${ctx.where} (${type})`;
	const c: Ctx = { ...ctx, where };
	const out: Block = {
		id: typeof b.id === 'string' && /^[\w-]{1,40}$/.test(b.id) ? b.id : newBlockId(),
		type,
		...(b.mt !== undefined && { mt: num(b.mt, 0, 200, 0) }),
		...(b.mb !== undefined && { mb: num(b.mb, 0, 200, 0) }),
		// D19: fill the free space (a share), or a fixed width in a row (pt).
		...(Number(b.grow) > 0 && { grow: num(b.grow, 0.1, 12, 1) }),
		...(Number(b.basis) > 0 && { basis: num(b.basis, 4, 1200, 100) }),
	};
	const showIf = conditions(b.showIf);
	if (showIf) {
		out.showIf = showIf;
		if (b.showMatch === 'any') out.showMatch = 'any';
	}
	const nested = (list: any, what: string) => {
		if (depth >= LIMITS.depth) {
			c.errors.push(`${where}: blocks can sit at most ${LIMITS.depth} deep`);
			return [];
		}
		return blocksOf(list, c, depth + 1, `${where} ${what}`);
	};

	switch (type) {
		case 'text':
			return {
				...out,
				text: textOf(b.text, c, 'text'),
				...textStyle(b),
				align: oneOf(b.align, ALIGNS, 'left'),
				...(bool(b.upper) && { upper: true }),
				...(b.spacing !== undefined && { spacing: num(b.spacing, -2, 20, 0) }),
				...(b.lineHeight !== undefined && { lineHeight: num(b.lineHeight, 0.8, 3, 1.35) }),
			};
		case 'image':
			return {
				...out,
				src: textOf(b.src, c, 'image'),
				...(b.width !== undefined && { width: num(b.width, 4, 1200, 120) }),
				...(b.height !== undefined && { height: num(b.height, 4, 1600, 60) }),
				align: oneOf(b.align, ALIGNS, 'left'),
			};
		case 'columns': {
			const cols = (Array.isArray(b.columns) ? b.columns : []).slice(0, LIMITS.columns).map((col: any, i: number) => ({
				width: num(col?.width, 0.1, 12, 1),
				valign: oneOf(col?.valign, ['top', 'middle', 'bottom'] as const, 'top'),
				// A column's blocks one under another (default) or side by side (PT-28).
				...(col?.direction === 'row' && { direction: 'row' }),
				...(col?.gap !== undefined && { gap: num(col.gap, 0, 120, 8) }),
				blocks: nested(col?.blocks, `column ${i + 1}`),
			}));
			if (!cols.length) c.errors.push(`${where}: add at least one column`);
			return { ...out, columns: cols, gap: num(b.gap, 0, 120, 16) };
		}
		case 'box':
			return {
				...out,
				blocks: nested(b.blocks, 'inside'),
				pad: num(b.pad, 0, 80, 10),
				...(color(b.bg) && { bg: color(b.bg) }),
				...(b.border !== undefined && { border: num(b.border, 0, 8, 0) }),
				...(color(b.borderColor) && { borderColor: color(b.borderColor) }),
				...(b.radius !== undefined && { radius: num(b.radius, 0, 40, 0) }),
				// D19: a stack (default) or a row, like flexbox.
				...(b.direction === 'row' && { direction: 'row' }),
				...(b.gap !== undefined && { gap: num(b.gap, 0, 120, 0) }),
				...(b.valign !== undefined && b.valign !== 'top' && { valign: oneOf(b.valign, ['top', 'middle', 'bottom', 'stretch'] as const, 'top') }),
				...(b.justify !== undefined && b.justify !== 'start' && { justify: oneOf(b.justify, ['start', 'center', 'end', 'between'] as const, 'start') }),
				...(Number(b.height) > 0 && { height: num(b.height, 4, 1600, 40) }),
				// PT-27: the background runs to the page's edges (a box directly in the header, body or footer).
				...(bool(b.bleed) && { bleed: true }),
				// PT-30: padding top-bottom / left-right over `pad`, and the border on some sides only.
				...(b.padX !== undefined && b.padX !== null && b.padX !== '' && { padX: num(b.padX, 0, 80, 10) }),
				...(b.padY !== undefined && b.padY !== null && b.padY !== '' && { padY: num(b.padY, 0, 80, 10) }),
				...(Array.isArray(b.borderSides) && b.borderSides.length && b.borderSides.length < 4 && { borderSides: SIDES.filter(k => b.borderSides.includes(k)) }),
			};
		case 'table': {
			const rows = str(b.rows, 120).trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
			if (!rows || !PATH.test(rows)) c.errors.push(`${where}: pick the list this table shows`);
			const columns = (Array.isArray(b.columns) ? b.columns : []).slice(0, LIMITS.tableColumns).map((col: any, i: number) => ({
				header: textOf(col?.header, c, `column ${i + 1} heading`),
				value: textOf(col?.value, c, `column ${i + 1}`),
				width: num(col?.width, 0.1, 12, 1),
				align: oneOf(col?.align, ALIGNS, 'left'),
			}));
			if (!columns.length) c.errors.push(`${where}: add at least one column`);
			return {
				...out,
				rows,
				columns,
				...textStyle(b),
				...(color(b.headerBg) && { headerBg: color(b.headerBg) }),
				...(color(b.headerColor) && { headerColor: color(b.headerColor) }),
				...(b.zebra !== undefined && { zebra: bool(b.zebra) }),
				lines: oneOf(b.lines, ['none', 'rows', 'grid'] as const, 'rows'),
				...(b.emptyText !== undefined && { emptyText: textOf(b.emptyText, c, 'empty text') }),
				...(b.pad !== undefined && { pad: num(b.pad, 0, 20, 5) }),
			};
		}
		case 'fields': {
			const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, LIMITS.fieldRows).map((r: any, i: number) => ({
				label: textOf(r?.label, c, `row ${i + 1} label`),
				value: textOf(r?.value, c, `row ${i + 1} value`),
				...(bool(r?.bold) && { bold: true }),
				...(bool(r?.big) && { big: true }),
				...(bool(r?.bar) && { bar: true }),
				...(bool(r?.line) && { line: true }),
			}));
			if (!rows.length) c.errors.push(`${where}: add at least one row`);
			return {
				...out,
				rows,
				...textStyle(b),
				labelWidth: num(b.labelWidth, 0.1, 0.9, 0.5),
				align: oneOf(b.align, ['left', 'right'] as const, 'left'),
				...(b.hideEmpty !== undefined && { hideEmpty: bool(b.hideEmpty) }),
				...(b.gap !== undefined && { gap: num(b.gap, 0, 20, 3) }),
			};
		}
		case 'divider':
			return {
				...out,
				...(color(b.color) && { color: color(b.color) }),
				thickness: num(b.thickness, 0.25, 12, 0.75),
				...(bool(b.dashed) && { dashed: true }),
			};
		case 'spacer':
			return { ...out, height: num(b.height, 1, 400, 12) };
		case 'pageBreak':
			return out;
	}
	return null;
};

const listsOf = (list: any, errors: string[]): TemplateList[] => {
	if (!Array.isArray(list)) return [];
	const seen = new Set<string>();
	const out: TemplateList[] = [];
	for (const [i, l] of list.slice(0, LIMITS.lists).entries()) {
		const name = str(l?.name, 40).trim();
		const route = str(l?.route, 80).trim().replace(/^\/+|\/+$/g, '');
		const foreignField = str(l?.foreignField, 80).trim();
		if (!NAME.test(name) || RESERVED_ROOTS.has(name) || seen.has(name)) {
			errors.push(`List ${i + 1}: give it a short name of letters (not ${[...RESERVED_ROOTS].join(', ')})`);
			continue;
		}
		if (!ROUTE.test(route) || !PATH.test(foreignField)) {
			errors.push(`List “${name}”: pick the page it comes from and the field there that points at this record`);
			continue;
		}
		seen.add(name);
		const sort = str(l?.sort, 60).trim();
		out.push({ name, route, foreignField, ...(/^-?[\w.]+$/.test(sort) && { sort }), limit: num(l?.limit, 1, LIMITS.rows, 500) });
	}
	return out;
};

const slotsOf = (list: any, depth = 0): Slot[] | undefined => {
	if (!Array.isArray(list)) return undefined;
	return list
		.slice(0, 60)
		.filter((s: any) => s && typeof s.token === 'string' && PATH.test(s.token))
		.map((s: any) => ({
			token: s.token,
			label: str(s.label, 80) || s.token,
			type: oneOf(s.type, ['text', 'number', 'date', 'image', 'list'] as const, 'text'),
			...(s.type === 'list' && depth === 0 && { of: slotsOf(s.of, 1) || [] }),
		}));
};

/** The page and the look every block starts from. */
const pageOf = (p: any): PdfTemplateData['page'] => {
	const m = Array.isArray(p?.margin) ? p.margin : [p?.margin, p?.margin, p?.margin, p?.margin];
	return {
		size: oneOf(p?.size, Object.keys(PAGE_SIZES), 'A4') as any,
		orientation: p?.orientation === 'landscape' ? 'landscape' : 'portrait',
		margin: [0, 1, 2, 3].map(i => num(m[i], 0, 200, 40)) as any,
	};
};
const styleOf = (s: any): PdfTemplateData['style'] => ({
	font: oneOf(s?.font, FONTS, 'sans'),
	size: num(s?.size, 6, 24, 10),
	color: color(s?.color, '#111111')!,
	muted: color(s?.muted, '#6b7280')!,
	accent: color(s?.accent, '#2563eb')!,
	lineHeight: num(s?.lineHeight, 1, 2.5, 1.35),
});

/**
 * A template as stored: everything checked, ids on every block. `errors` are
 * for the person — the template is still returned so the designer can keep
 * what they did.
 */
export const normalizeTemplate = (raw: any): { template: PdfTemplateData; errors: string[] } => {
	const errors: string[] = [];
	const ctx: Ctx = { errors, counter: { n: 0 }, where: '' };
	const name = str(raw?.name, 120).trim();
	if (!name) errors.push('Give the template a name');
	const alias = str(raw?.alias, 40).trim();
	const template: PdfTemplateData = {
		name,
		description: str(raw?.description, 500).trim(),
		kind: categoryKey(raw?.kind) || 'other',
		route: str(raw?.route, 80).trim().replace(/^\/+|\/+$/g, ''),
		alias: NAME.test(alias) && !RESERVED_ROOTS.has(alias) ? alias : 'record',
		page: pageOf(raw?.page),
		style: styleOf(raw?.style),
		lists: listsOf(raw?.lists, errors),
		// One block count across the three parts.
		header: blocksOf(raw?.header, ctx, 0, 'Header'),
		body: blocksOf(raw?.body, ctx, 0, 'Body'),
		footer: blocksOf(raw?.footer, ctx, 0, 'Footer'),
	};
	if (template.route && !ROUTE.test(template.route)) errors.push('That page address isn’t valid');
	const slots = slotsOf(raw?.slots);
	if (slots?.length) template.slots = slots;
	if (raw?.sample && typeof raw.sample === 'object' && !Array.isArray(raw.sample)) {
		const json = JSON.stringify(raw.sample);
		if (json.length <= 50_000) template.sample = JSON.parse(json);
		else errors.push('The sample data is too big');
	}
	return { template, errors: [...new Set(errors)] };
};

/* ------------------------------------------------------------ settings */

export type PdfSettingsData = {
	business: { name: string; logo: string; address: string; phone: string; email: string; website: string; taxId: string; note: string };
	currency: { symbol: string; code: string; name: string; decimals: number; position: 'before' | 'after'; grouping: 'standard' | 'indian' };
	dateFormat: string;
	timezone: string;
	/** Saved texts — terms and conditions, a return policy — printed as {{texts.<key>}}. */
	texts: SavedText[];
};

export type SavedText = { key: string; label: string; text: string };

export const DEFAULT_SETTINGS: PdfSettingsData = {
	business: { name: '', logo: '', address: '', phone: '', email: '', website: '', taxId: '', note: '' },
	currency: { symbol: '', code: '', name: '', decimals: 2, position: 'before', grouping: 'standard' },
	dateFormat: 'D MMM YYYY',
	timezone: '',
	texts: [],
};

/** "Terms & conditions" → terms_conditions: what a saved text is called in {{texts.…}}. */
export const textKey = (v: string) =>
	String(v || '')
		.trim()
		.toLowerCase()
		.replace(/&/g, ' ')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/^(\d)/, 't$1')
		.slice(0, 40);

/** Saved texts: named, unique keys, at most 30 of 5,000 characters. */
const savedTexts = (list: any): SavedText[] => {
	const seen = new Set<string>();
	const out: SavedText[] = [];
	for (const x of Array.isArray(list) ? list.slice(0, 30) : []) {
		const label = str(x?.label, 80).trim();
		const key = textKey(str(x?.key, 40) || label);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push({ key, label: label || key, text: str(x?.text, 5000).replace(/\r/g, '') });
	}
	return out;
};

/** {{texts.<key>}}'s root: each saved text by its key. */
export const textsRoot = (s: Pick<PdfSettingsData, 'texts'>): Record<string, string> => Object.fromEntries((s.texts || []).map(t => [t.key, t.text]));

const validZone = (tz: string) => {
	if (!tz) return '';
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return tz;
	} catch {
		return '';
	}
};

export const normalizeSettings = (raw: any): PdfSettingsData => {
	const b = raw?.business || {};
	const c = raw?.currency || {};
	return {
		business: {
			name: str(b.name, 160).trim(),
			logo: str(b.logo, 1000).trim(),
			address: str(b.address, 600).trim(),
			phone: str(b.phone, 60).trim(),
			email: str(b.email, 160).trim(),
			website: str(b.website, 200).trim(),
			taxId: str(b.taxId, 80).trim(),
			note: str(b.note, 1000).trim(),
		},
		currency: {
			symbol: str(c.symbol, 8).trim(),
			code: str(c.code, 8).trim().toUpperCase(),
			name: str(c.name, 40).trim(),
			decimals: num(c.decimals, 0, 4, 2),
			position: c.position === 'after' ? 'after' : 'before',
			grouping: c.grouping === 'indian' ? 'indian' : 'standard',
		},
		dateFormat: str(raw?.dateFormat, 40).trim() || DEFAULT_SETTINGS.dateFormat,
		timezone: validZone(str(raw?.timezone, 60).trim()),
		texts: savedTexts(raw?.texts),
	};
};
