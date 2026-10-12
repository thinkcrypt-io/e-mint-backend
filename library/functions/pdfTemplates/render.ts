import PDFDocument from 'pdfkit';
import { meets } from '../fieldLocks.function.js';
import { DocFonts, Face, Family, faceFor, runsOf } from './fonts.js';
import { ImageLoader } from './images.js';
import { Block, LIMITS, PAGE_SIZES, PdfSettingsData, PdfTemplateData } from './schema.js';
import { Scope, fill, valueOf } from './tokens.js';

/**
 * Draws a template (docs/pdf-templates D1): one PDF, each record starting on
 * a new page. Header and footer repeat on every page (`{{page}}` of
 * `{{pages}}` count the record's own pages); body blocks flow down the page
 * and move to the next one when they don't fit; a table in the body splits
 * between rows and repeats its heading row.
 *
 * Every block is laid out first (its height, and a `draw` for later), then
 * drawn — so "does it fit" is always answered by the same numbers that draw
 * it. Text is broken into lines here, not by pdfkit, because one line can
 * mix fonts (fonts.ts).
 */

export type RenderRecord = { roots: Record<string, any> };
export type RenderInput = {
	template: PdfTemplateData;
	records: RenderRecord[];
	settings: PdfSettingsData;
	tz: string;
};

type Laid = { height: number; draw: (x: number, y: number) => void };
type Ctx = { doc: PDFKit.PDFDocument; fonts: DocFonts; template: PdfTemplateData; images: Map<string, Buffer | null>; scope: Scope };

const NOTHING: Laid = { height: 0, draw: () => {} };
const HAIRLINE = '#e5e7eb';
const ZEBRA = '#f6f7f9';
const SKEW = 0.2;

/* ------------------------------------------------------------------ text */

type TextStyle = {
	family: Family;
	weight: number;
	italic: boolean;
	size: number;
	color: string;
	align: 'left' | 'center' | 'right';
	lineHeight: number;
	spacing: number;
	upper?: boolean;
};

/** A run of one face; `gap` is the space before it. */
type Piece = { text: string; face: Face; width: number; bold: boolean; gap: number };
type Line = { pieces: Piece[]; width: number };

/** `**bold**` turns bold on and off. */
const boldParts = (para: string): { text: string; bold: boolean }[] => {
	const out: { text: string; bold: boolean }[] = [];
	para.split('**').forEach((t, i) => t && out.push({ text: t, bold: i % 2 === 1 }));
	return out;
};

export const layoutText = (ctx: Ctx, raw: string, style: TextStyle, width: number): Laid & { lines: Line[] } => {
	const { fonts } = ctx;
	const text = style.upper ? raw.toUpperCase() : raw;
	const base = faceFor(style.family, style.weight, style.italic);
	const boldFace = faceFor(style.family, Math.max(style.weight, 700), style.italic);
	const lines: Line[] = [];
	const max = Math.max(4, width);

	for (const para of text.replace(/\r/g, '').split('\n')) {
		// Words: runs of pieces between spaces.
		const words: { pieces: Piece[]; width: number }[] = [];
		let word: { pieces: Piece[]; width: number } | null = null;
		const spaceAfter: number[] = [];
		for (const part of boldParts(para)) {
			for (const chunk of part.text.split(/( +)/)) {
				if (!chunk) continue;
				if (/^ +$/.test(chunk)) {
					if (word) {
						words.push(word);
						spaceAfter.push(fonts.width(' ', part.bold ? boldFace : base, style.size, style.spacing) * chunk.length);
						word = null;
					} else if (words.length) spaceAfter[spaceAfter.length - 1] += fonts.width(' ', base, style.size, style.spacing) * chunk.length;
					continue;
				}
				word = word || { pieces: [], width: 0 };
				for (const run of runsOf(chunk, part.bold ? boldFace : base, part.bold || style.weight >= 600)) {
					const w = fonts.width(run.text, run.face, style.size, style.spacing);
					word.pieces.push({ text: run.text, face: run.face, width: w, bold: part.bold, gap: 0 });
					word.width += w;
				}
			}
		}
		if (word) {
			words.push(word);
			spaceAfter.push(0);
		}

		let line: Line = { pieces: [], width: 0 };
		let pendingSpace = 0;
		const push = () => {
			lines.push(line);
			line = { pieces: [], width: 0 };
		};
		const measure = (t: string, f: Face) => fonts.width(t, f, style.size, style.spacing);
		words.forEach((w, i) => {
			if (line.pieces.length && line.width + pendingSpace + w.width > max) push();
			let gap = line.pieces.length ? pendingSpace : 0;
			if (w.width <= max) {
				w.pieces.forEach((p, j) => line.pieces.push({ ...p, gap: j === 0 ? gap : 0 }));
				line.width += gap + w.width;
			} else {
				// One word wider than the line: break it between characters.
				for (const p of w.pieces) {
					let cur = '';
					for (const ch of p.text) {
						const next = cur + ch;
						if (line.width + gap + measure(next, p.face) > max && (cur || line.pieces.length)) {
							if (cur) {
								const cw = measure(cur, p.face);
								line.pieces.push({ ...p, text: cur, width: cw, gap });
								line.width += gap + cw;
							}
							push();
							gap = 0;
							cur = ch;
						} else cur = next;
					}
					if (cur) {
						const cw = measure(cur, p.face);
						line.pieces.push({ ...p, text: cur, width: cw, gap });
						line.width += gap + cw;
						gap = 0;
					}
				}
			}
			pendingSpace = spaceAfter[i] || 0;
		});
		push();
	}

	const lineH = style.size * style.lineHeight;
	const { ascent, descent } = fonts.vertical(base, style.size);
	const lead = (lineH - (ascent - descent)) / 2;
	return {
		lines,
		height: lines.length * lineH,
		draw: (x, y) => {
			const { doc } = ctx;
			doc.fillColor(style.color);
			lines.forEach((l, i) => {
				const baseline = y + i * lineH + lead + ascent;
				let cx = style.align === 'center' ? x + (width - l.width) / 2 : style.align === 'right' ? x + width - l.width : x;
				for (const p of l.pieces) {
					cx += p.gap;
					fonts.use(p.face, style.size);
					const fake = style.italic && p.face.fakeItalic;
					if (fake) {
						doc.save();
						doc.transform(1, 0, -SKEW, 1, SKEW * baseline, 0);
					}
					doc.text(p.text, cx, baseline, { lineBreak: false, baseline: 'alphabetic', characterSpacing: style.spacing } as any);
					if (fake) doc.restore();
					cx += p.width;
				}
			});
		},
	};
};

/* ---------------------------------------------------------------- blocks */

const visible = (b: Block, scope: Scope) => !b.showIf?.length || meets(scope.roots, b.showIf, b.showMatch === 'any' ? 'any' : 'all');

const styleFor = (ctx: Ctx, b: any, over: Partial<TextStyle> = {}): TextStyle => ({
	family: ctx.template.style.font as Family,
	weight: b.weight ?? 400,
	italic: !!b.italic,
	size: b.size ?? ctx.template.style.size,
	color: b.color ?? ctx.template.style.color,
	align: b.align ?? 'left',
	lineHeight: b.lineHeight ?? ctx.template.style.lineHeight,
	spacing: b.spacing ?? 0,
	upper: !!b.upper,
	...over,
});

/** Blocks one under another. */
const stack = (ctx: Ctx, blocks: Block[], width: number): Laid => {
	const parts: { mt: number; laid: Laid; mb: number }[] = [];
	for (const b of blocks || []) {
		if (b.type === 'pageBreak' || !visible(b, ctx.scope)) continue;
		parts.push({ mt: b.mt || 0, laid: layoutBlock(ctx, b, width), mb: b.mb || 0 });
	}
	return {
		height: parts.reduce((h, p) => h + p.mt + p.laid.height + p.mb, 0),
		draw: (x, y) => {
			let cy = y;
			for (const p of parts) {
				cy += p.mt;
				p.laid.draw(x, cy);
				cy += p.laid.height + p.mb;
			}
		},
	};
};

const imageSize = (ctx: Ctx, buf: Buffer, b: any, width: number) => {
	let nat: { width: number; height: number };
	try {
		nat = (ctx.doc as any).openImage(buf);
	} catch {
		return null;
	}
	const ratio = nat.height / Math.max(1, nat.width);
	let w: number, h: number;
	if (b.width && b.height) [w, h] = [b.width, b.height];
	else if (b.width) [w, h] = [b.width, b.width * ratio];
	else if (b.height) [w, h] = [b.height / ratio, b.height];
	else [w, h] = [nat.width * 0.75, nat.height * 0.75];
	if (w > width) [w, h] = [width, (h * width) / w];
	return { w, h };
};

const layoutImage = (ctx: Ctx, b: any, width: number): Laid => {
	const src = valueOf(b.src || '', ctx.scope);
	const buf = typeof src === 'string' ? ctx.images.get(src.trim()) : null;
	if (!buf) return NOTHING;
	const size = imageSize(ctx, buf, b, width);
	if (!size) return NOTHING;
	return {
		height: size.h,
		draw: (x, y) => {
			const left = b.align === 'center' ? x + (width - size.w) / 2 : b.align === 'right' ? x + width - size.w : x;
			try {
				ctx.doc.image(buf, left, y, { fit: [size.w, size.h], align: 'center', valign: 'center' } as any);
			} catch {
				/* a broken image prints nothing */
			}
		},
	};
};

const layoutColumns = (ctx: Ctx, b: any, width: number): Laid => {
	const cols: any[] = b.columns || [];
	if (!cols.length) return NOTHING;
	const gap = b.gap ?? 16;
	const total = cols.reduce((t, c) => t + (c.width || 1), 0);
	const free = Math.max(0, width - gap * (cols.length - 1));
	const laid = cols.map(c => {
		const w = (free * (c.width || 1)) / total;
		return { w, valign: c.valign, laid: stack(ctx, c.blocks, w) };
	});
	const height = Math.max(0, ...laid.map(l => l.laid.height));
	return {
		height,
		draw: (x, y) => {
			let cx = x;
			for (const l of laid) {
				const off = l.valign === 'middle' ? (height - l.laid.height) / 2 : l.valign === 'bottom' ? height - l.laid.height : 0;
				l.laid.draw(cx, y + off);
				cx += l.w + gap;
			}
		},
	};
};

const layoutBox = (ctx: Ctx, b: any, width: number): Laid => {
	const pad = b.pad ?? 10;
	const border = b.border || 0;
	const inner = stack(ctx, b.blocks, Math.max(4, width - 2 * (pad + border)));
	const height = inner.height + 2 * (pad + border);
	return {
		height,
		draw: (x, y) => {
			const { doc } = ctx;
			const r = b.radius || 0;
			if (b.bg) {
				doc.save();
				(r ? doc.roundedRect(x, y, width, height, r) : doc.rect(x, y, width, height)).fill(b.bg);
				doc.restore();
			}
			if (border) {
				doc.save();
				const h = border / 2;
				(r ? doc.roundedRect(x + h, y + h, width - border, height - border, r) : doc.rect(x + h, y + h, width - border, height - border))
					.lineWidth(border)
					.stroke(b.borderColor || HAIRLINE);
				doc.restore();
			}
			inner.draw(x + pad + border, y + pad + border);
		},
	};
};

const layoutDivider = (ctx: Ctx, b: any, width: number): Laid => {
	const t = b.thickness ?? 0.75;
	return {
		height: t,
		draw: (x, y) => {
			const { doc } = ctx;
			doc.save();
			doc.moveTo(x, y + t / 2).lineTo(x + width, y + t / 2).lineWidth(t);
			if (b.dashed) doc.dash(t * 3, { space: t * 2 });
			doc.stroke(b.color || HAIRLINE);
			doc.restore();
		},
	};
};

/** Label : value rows — a record's details, or the totals. */
const layoutFields = (ctx: Ctx, b: any, width: number): Laid => {
	const { style } = ctx.template;
	const gap = b.gap ?? 3;
	const rows: { laid: Laid; h: number; bar: boolean; line: boolean }[] = [];
	for (const r of b.rows || []) {
		const value = fill(r.value || '', ctx.scope);
		if (b.hideEmpty && !value.trim()) continue;
		const label = fill(r.label || '', ctx.scope);
		const big = !!r.big;
		const size = (b.size ?? style.size) * (big ? 1.3 : 1);
		const bold = r.bold || big || r.bar;
		const color = r.bar ? '#ffffff' : b.color ?? style.color;
		const padX = r.bar ? 8 : 0;
		const padY = r.bar ? 6 : 0;
		const inner = Math.max(8, width - 2 * padX);
		const labelW = Math.max(4, inner * (b.labelWidth ?? 0.5) - 3);
		const valueW = Math.max(4, inner - labelW - 6);
		const l = layoutText(ctx, label, styleFor(ctx, b, { size, weight: bold ? 600 : b.weight ?? 400, color: r.bar ? '#ffffff' : bold ? b.color ?? style.color : style.muted, align: 'left', upper: false, spacing: 0 }), labelW);
		const v = layoutText(ctx, value, styleFor(ctx, b, { size, weight: bold ? 700 : b.weight ?? 400, color, align: b.align === 'right' ? 'right' : 'left', upper: false, spacing: 0 }), valueW);
		const h = Math.max(l.height, v.height) + 2 * padY;
		rows.push({
			h,
			bar: !!r.bar,
			line: !!r.line,
			laid: {
				height: h,
				draw: (x, y) => {
					const { doc } = ctx;
					if (r.bar) {
						doc.save();
						doc.rect(x, y, width, h).fill(style.accent);
						doc.restore();
					}
					l.draw(x + padX, y + padY);
					v.draw(x + padX + labelW + 6, y + padY);
				},
			},
		});
	}
	const height = rows.reduce((t, r, i) => t + r.h + (i ? gap : 0) + (r.line ? 6 : 0), 0);
	return {
		height,
		draw: (x, y) => {
			let cy = y;
			rows.forEach((r, i) => {
				if (i) cy += gap;
				if (r.line) {
					layoutDivider(ctx, { thickness: 0.75, color: style.color }, width).draw(x, cy + 2);
					cy += 6;
				}
				r.laid.draw(x, cy);
				cy += r.h;
			});
		},
	};
};

/* ---------------------------------------------------------------- tables */

type TableRows = { header: Laid; rows: Laid[] };

const layoutTableRows = (ctx: Ctx, b: any, width: number): TableRows => {
	const { style } = ctx.template;
	const cols: any[] = b.columns || [];
	const total = cols.reduce((t, c) => t + (c.width || 1), 0) || 1;
	const widths = cols.map(c => (width * (c.width || 1)) / total);
	const pad = b.pad ?? 5;
	const size = b.size ?? style.size;
	const grid = b.lines === 'grid';
	const lines = b.lines !== 'none';

	const row = (cells: string[], opts: { header?: boolean; zebra?: boolean }): Laid => {
		const laid = cells.map((text, i) =>
			layoutText(
				ctx,
				text,
				styleFor(ctx, b, {
					size,
					weight: opts.header ? 600 : b.weight ?? 400,
					color: opts.header ? b.headerColor ?? style.color : b.color ?? style.color,
					align: cols[i]?.align || 'left',
					upper: false,
					spacing: 0,
				}),
				Math.max(4, widths[i] - 2 * pad)
			)
		);
		const h = Math.max(size * style.lineHeight, ...laid.map(l => l.height)) + 2 * pad;
		return {
			height: h,
			draw: (x, y) => {
				const { doc } = ctx;
				const bg = opts.header ? b.headerBg : opts.zebra ? ZEBRA : null;
				if (bg) {
					doc.save();
					doc.rect(x, y, width, h).fill(bg);
					doc.restore();
				}
				let cx = x;
				laid.forEach((l, i) => {
					l.draw(cx + pad, y + pad);
					if (grid) {
						doc.save();
						doc.rect(cx, y, widths[i], h).lineWidth(0.5).stroke(HAIRLINE);
						doc.restore();
					}
					cx += widths[i];
				});
				if (lines && !grid) {
					doc.save();
					doc.moveTo(x, y + h).lineTo(x + width, y + h).lineWidth(opts.header ? 0.75 : 0.5).stroke(opts.header ? style.color : HAIRLINE);
					doc.restore();
				}
			},
		};
	};

	const header = cols.some(c => c.header) ? row(cols.map(c => fill(c.header || '', ctx.scope)), { header: true }) : NOTHING;
	let items = valueOf(b.rows || '', ctx.scope);
	if (items == null || items === '') items = [];
	if (!Array.isArray(items)) items = [items];
	items = items.slice(0, LIMITS.rows);
	const zebra = b.zebra === true;
	const rows: Laid[] = items.map((item: any, i: number) => {
		const scope: Scope = { ...ctx.scope, roots: { ...ctx.scope.roots, item, index: i + 1 } };
		const sub = { ...ctx, scope };
		return row(cols.map(c => fill(c.value || '', sub.scope)), { zebra: zebra && i % 2 === 1 });
	});
	if (!rows.length && b.emptyText) {
		const t = layoutText(ctx, fill(b.emptyText, ctx.scope), styleFor(ctx, b, { size, color: style.muted, align: 'center', upper: false, spacing: 0 }), width - 2 * pad);
		rows.push({ height: t.height + 2 * pad, draw: (x, y) => t.draw(x + pad, y + pad) });
	}
	return { header, rows };
};

const layoutTable = (ctx: Ctx, b: any, width: number): Laid => {
	const t = layoutTableRows(ctx, b, width);
	return {
		height: t.header.height + t.rows.reduce((h, r) => h + r.height, 0),
		draw: (x, y) => {
			t.header.draw(x, y);
			let cy = y + t.header.height;
			for (const r of t.rows) {
				r.draw(x, cy);
				cy += r.height;
			}
		},
	};
};

const layoutBlock = (ctx: Ctx, b: Block, width: number): Laid => {
	switch (b.type) {
		case 'text':
			return layoutText(ctx, fill(b.text || '', ctx.scope), styleFor(ctx, b), width);
		case 'image':
			return layoutImage(ctx, b, width);
		case 'columns':
			return layoutColumns(ctx, b, width);
		case 'box':
			return layoutBox(ctx, b, width);
		case 'table':
			return layoutTable(ctx, b, width);
		case 'fields':
			return layoutFields(ctx, b, width);
		case 'divider':
			return layoutDivider(ctx, b, width);
		case 'spacer':
			return { height: b.height ?? 12, draw: () => {} };
	}
	return NOTHING;
};

/* ------------------------------------------------------------------ pages */

/** Every image source a record's blocks could print, to fetch before drawing. */
const imageSources = (blocks: Block[], scope: Scope, out: Set<string>) => {
	for (const b of blocks || []) {
		if (b.type === 'image') {
			const v = valueOf(b.src || '', scope);
			if (typeof v === 'string' && v.trim()) out.add(v.trim());
		}
		if (b.type === 'columns') for (const c of b.columns || []) imageSources(c.blocks, scope, out);
		if (b.type === 'box') imageSources(b.blocks, scope, out);
	}
};

export const pageSize = (t: PdfTemplateData): [number, number] => {
	const [w, h] = PAGE_SIZES[t.page.size] || PAGE_SIZES.A4;
	return t.page.orientation === 'landscape' ? [h, w] : [w, h];
};

export const renderPdf = async ({ template, records, settings, tz }: RenderInput): Promise<Buffer> => {
	const [pw, ph] = pageSize(template);
	const [mt, mr, mb, ml] = template.page.margin;
	const width = pw - ml - mr;

	// Images first: drawing is synchronous.
	const loader = new ImageLoader();
	const scopes: Scope[] = records.map(r => ({ roots: r.roots, settings, tz }));
	for (const scope of scopes) {
		const srcs = new Set<string>();
		for (const part of [template.header, template.body, template.footer]) imageSources(part, { ...scope, roots: { ...scope.roots, page: 1, pages: 1 } }, srcs);
		srcs.forEach(s => loader.load(s));
	}
	const images = await loader.ready();

	const doc = new PDFDocument({
		size: [pw, ph],
		margin: 0,
		autoFirstPage: false,
		bufferPages: true,
		info: { Title: template.name || 'Document', Creator: 'Mint', Producer: 'Mint' } as any,
	});
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));
	const fonts = new DocFonts(doc);

	const spans: { start: number; count: number; scope: Scope }[] = [];
	let pageCount = 0;

	for (const scope of scopes) {
		const ctx: Ctx = { doc, fonts, template, images, scope };
		// Header and footer heights, measured with this record (page numbers as placeholders).
		const measureScope = { ...scope, roots: { ...scope.roots, page: 1, pages: 1 } };
		const headerH = stack({ ...ctx, scope: measureScope }, template.header, width).height;
		const footerH = stack({ ...ctx, scope: measureScope }, template.footer, width).height;
		const top = mt + headerH + (headerH ? 12 : 0);
		const bottom = ph - mb - footerH - (footerH ? 12 : 0);
		const start = pageCount;
		let pagesHere = 0;
		let y = top;
		const newPage = () => {
			if (pagesHere >= LIMITS.pages) return false;
			doc.addPage({ size: [pw, ph], margin: 0 });
			pageCount++;
			pagesHere++;
			y = top;
			return true;
		};
		newPage();
		let full = false;

		for (const b of template.body) {
			if (full) break;
			if (!visible(b, scope)) continue;
			if (b.type === 'pageBreak') {
				if (!newPage()) full = true;
				continue;
			}
			y += b.mt || 0;
			if (b.type === 'table') {
				const t = layoutTableRows(ctx, b, width);
				const first = t.rows[0]?.height || 0;
				if (y + t.header.height + first > bottom && y > top && !newPage()) {
					full = true;
					break;
				}
				t.header.draw(ml, y);
				y += t.header.height;
				for (const r of t.rows) {
					if (y + r.height > bottom && y > top + t.header.height) {
						if (!newPage()) {
							full = true;
							break;
						}
						t.header.draw(ml, y);
						y += t.header.height;
					}
					r.draw(ml, y);
					y += r.height;
				}
			} else {
				const laid = layoutBlock(ctx, b, width);
				if (y + laid.height > bottom && y > top && !newPage()) {
					full = true;
					break;
				}
				laid.draw(ml, y);
				y += laid.height;
			}
			y += b.mb || 0;
		}
		spans.push({ start, count: pagesHere, scope });
	}

	// Header and footer on every page, now that each record's page count is known.
	for (const span of spans) {
		for (let i = 0; i < span.count; i++) {
			doc.switchToPage(span.start + i);
			const scope: Scope = { ...span.scope, roots: { ...span.scope.roots, page: i + 1, pages: span.count } };
			const ctx: Ctx = { doc, fonts, template, images, scope };
			if (template.header.length) stack(ctx, template.header, width).draw(ml, mt);
			if (template.footer.length) {
				const f = stack(ctx, template.footer, width);
				f.draw(ml, ph - mb - f.height);
			}
		}
	}

	if (!pageCount) doc.addPage({ size: [pw, ph], margin: 0 });
	doc.end();
	return done;
};
