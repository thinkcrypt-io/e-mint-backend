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
type Ctx = { doc: PDFKit.PDFDocument; fonts: DocFonts; template: PdfTemplateData; images: Map<string, Buffer | null>; scope: Scope; page?: { w: number; h: number } };

/** A full-width box's reach (PT-27): it sits directly in a part; the header's first goes up to the top edge, the footer's last down to the bottom edge. */
type Bleed = { up?: boolean; down?: boolean };

const NOTHING: Laid = { height: 0, draw: () => {} };
const HAIRLINE = '#e5e7eb';
const ZEBRA = '#f6f7f9';
const SKEW = 0.2;
/** Rounding room when asking whether a block fits — a block filled to the page bottom (D19) fits exactly. */
const FIT = 0.5;

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

/** How much of the free space a block takes (D19); 0 = none. */
const growOf = (b: Block) => (Number(b.grow) > 0 ? Number(b.grow) : 0);

/**
 * Blocks one under another. With `minHeight` taller than they are, the
 * blocks set to fill share the spare height: a box grows to it, anything
 * else gets it as room below.
 */
const stack = (ctx: Ctx, blocks: Block[], width: number, minHeight = 0): Laid => {
	const parts: { b: Block; mt: number; laid: Laid; mb: number }[] = [];
	for (const b of blocks || []) {
		if (b.type === 'pageBreak' || !visible(b, ctx.scope)) continue;
		parts.push({ b, mt: b.mt || 0, laid: layoutBlock(ctx, b, width), mb: b.mb || 0 });
	}
	const natural = parts.reduce((h, p) => h + p.mt + p.laid.height + p.mb, 0);
	const growth = parts.reduce((g, p) => g + growOf(p.b), 0);
	if (minHeight > natural && growth) {
		const free = minHeight - natural;
		for (const p of parts) {
			const g = growOf(p.b);
			if (!g) continue;
			const h = p.laid.height + (free * g) / growth;
			p.laid = p.b.type === 'box' ? layoutBox(ctx, p.b, width, h) : { height: h, draw: p.laid.draw };
		}
	}
	return {
		height: Math.max(minHeight, parts.reduce((h, p) => h + p.mt + p.laid.height + p.mb, 0)),
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

/** Blocks with no width of their own: in a row they fill unless given one. */
const FILLERS = new Set(['fields', 'table', 'divider', 'columns']);

/** A block's share of a row's free space: its own `grow`, or 1 for a filler with no fixed width. */
const rowGrow = (b: Block) => growOf(b) || (!b.basis && FILLERS.has(b.type) ? 1 : 0);

/**
 * How wide a block wants to be in a row, at most `max`: text its widest
 * line, an image its size, a space its size, a box its contents.
 */
const naturalWidth = (ctx: Ctx, b: Block, max: number): number => {
	if (b.basis) return Math.min(b.basis, max);
	switch (b.type) {
		case 'text': {
			const t = layoutText(ctx, fill(b.text || '', ctx.scope), styleFor(ctx, b), max);
			return Math.min(max, Math.max(0, ...t.lines.map(l => l.width)) + 0.5);
		}
		case 'image': {
			const src = valueOf(b.src || '', ctx.scope);
			const buf = typeof src === 'string' ? ctx.images.get(src.trim()) : null;
			const size = buf ? imageSize(ctx, buf, b, max) : null;
			return size ? size.w : 0;
		}
		case 'spacer':
			return Math.min(max, b.height ?? 12);
		case 'box': {
			const be = boxEdges(b);
			const edge = be.l + be.r;
			const inner = Math.max(4, max - edge);
			const kids = (b.blocks || []).filter((k: Block) => k.type !== 'pageBreak' && visible(k, ctx.scope));
			const widths = kids.map((k: Block) => naturalWidth(ctx, k, inner));
			const content = b.direction === 'row' ? widths.reduce((t: number, w: number) => t + w, 0) + (b.gap ?? 8) * Math.max(0, kids.length - 1) : Math.max(0, ...widths);
			return Math.min(max, content + edge);
		}
		case 'pageBreak':
			return 0;
	}
	return max;
};

/**
 * A row (D19), like flexbox: fixed widths, then content widths (shrunk when
 * they don't fit), then the free space shared by the blocks that fill — or,
 * when none does, spread by `justify`. Height: the tallest, or `minHeight`.
 */
const row = (ctx: Ctx, b: any, width: number, minHeight = 0): Laid => {
	const kids: Block[] = (b.blocks || []).filter((k: Block) => k.type !== 'pageBreak' && visible(k, ctx.scope));
	if (!kids.length) return { height: minHeight, draw: () => {} };
	let gap = b.gap ?? 8;
	const avail = Math.max(0, width - gap * (kids.length - 1));
	const grows = kids.map(rowGrow);
	const widths = kids.map((k, i) => (grows[i] ? 0 : naturalWidth(ctx, k, avail)));
	let used = widths.reduce((t, w) => t + w, 0);
	if (used > avail) {
		// Too wide: content widths give way first, fixed ones only if that isn't enough.
		const auto = kids.map((k, i) => !grows[i] && !k.basis);
		const autoSum = widths.reduce((t, w, i) => t + (auto[i] ? w : 0), 0);
		const k1 = autoSum ? Math.max(0, autoSum - (used - avail)) / autoSum : 1;
		widths.forEach((w, i) => auto[i] && (widths[i] = w * k1));
		used = widths.reduce((t, w) => t + w, 0);
		if (used > avail) widths.forEach((w, i) => (widths[i] = (w * avail) / used));
		used = Math.min(used, avail);
	}
	const free = Math.max(0, avail - used);
	const growth = grows.reduce((t, g) => t + g, 0);
	let lead = 0;
	if (growth) widths.forEach((w, i) => (widths[i] = w + (free * grows[i]) / growth));
	else if (b.justify === 'center') lead = free / 2;
	else if (b.justify === 'end') lead = free;
	else if (b.justify === 'between' && kids.length > 1) gap += free / (kids.length - 1);

	let laid = kids.map((k, i) => layoutBlock(ctx, k, Math.max(1, widths[i]), 'row'));
	const outer = (i: number) => (kids[i].mt || 0) + laid[i].height + (kids[i].mb || 0);
	const height = Math.max(minHeight, ...kids.map((_, i) => outer(i)));
	// Stretch: boxes take the row's height.
	if (b.valign === 'stretch') laid = laid.map((l, i) => (kids[i].type === 'box' ? layoutBox(ctx, kids[i], Math.max(1, widths[i]), height - (kids[i].mt || 0) - (kids[i].mb || 0)) : l));
	return {
		height,
		draw: (x, y) => {
			let cx = x + lead;
			kids.forEach((k, i) => {
				const room = height - outer(i);
				const off = b.valign === 'middle' ? room / 2 : b.valign === 'bottom' ? room : 0;
				laid[i].draw(cx, y + off + (k.mt || 0));
				cx += widths[i] + gap;
			});
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
		// Side by side (PT-28): a row, its blocks aligned like the column.
		const inner = c.direction === 'row' ? row(ctx, { blocks: c.blocks, gap: c.gap, valign: c.valign }, w) : stack(ctx, c.blocks, w);
		return { w, valign: c.valign, laid: inner };
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

/** A box: a stack, or a row (D19); at least its own `height` or `minHeight` tall. */
/**
 * A box's room around its contents: padding (all sides, or top-bottom /
 * left-right — PT-30) plus the border on the sides that have one.
 */
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export const boxEdges = (b: any) => {
	const pad = b.pad ?? 10;
	const px = b.padX ?? pad;
	const py = b.padY ?? pad;
	const bw = b.border || 0;
	const sides: Set<string> | null = Array.isArray(b.borderSides) && b.borderSides.length ? new Set(b.borderSides) : null;
	const has = (k: string) => bw > 0 && (!sides || sides.has(k));
	return { t: py + (has('top') ? bw : 0), r: px + (has('right') ? bw : 0), b: py + (has('bottom') ? bw : 0), l: px + (has('left') ? bw : 0), bw, sides, has };
};

/** A box: a stack, or a row (D19); at least its own `height` or `minHeight` tall. */
const layoutBox = (ctx: Ctx, b: any, width: number, minHeight = 0): Laid => {
	const e = boxEdges(b);
	const innerW = Math.max(4, width - e.l - e.r);
	const innerMin = Math.max(0, Math.max(b.height || 0, minHeight) - e.t - e.b);
	const inner = b.direction === 'row' ? row(ctx, b, innerW, innerMin) : withGap(ctx, b, innerW, innerMin);
	const height = inner.height + e.t + e.b;
	const bleed: Bleed | undefined = b._bleed;
	return {
		height,
		draw: (x, y) => {
			const { doc } = ctx;
			// Corners round only a box with a border all round (or none).
			const r = e.sides ? 0 : b.radius || 0;
			if (b.bg && bleed && ctx.page) {
				// Full width: the background from edge to edge (and up / down to the page's edge); the contents stay inside the margins.
				const top = bleed.up ? 0 : y;
				const bottom = bleed.down ? ctx.page.h : y + height;
				doc.save();
				doc.rect(0, top, ctx.page.w, bottom - top).fill(b.bg);
				doc.restore();
			} else if (b.bg) {
				doc.save();
				(r ? doc.roundedRect(x, y, width, height, r) : doc.rect(x, y, width, height)).fill(b.bg);
				doc.restore();
			}
			if (e.bw && !e.sides) {
				doc.save();
				const h = e.bw / 2;
				(r ? doc.roundedRect(x + h, y + h, width - e.bw, height - e.bw, r) : doc.rect(x + h, y + h, width - e.bw, height - e.bw))
					.lineWidth(e.bw)
					.stroke(b.borderColor || HAIRLINE);
				doc.restore();
			} else if (e.bw) {
				// Lines on some sides only — a rule above and below, a bar on the left.
				const h = e.bw / 2;
				const ends: Record<string, [number, number, number, number]> = {
					top: [x, y + h, x + width, y + h],
					bottom: [x, y + height - h, x + width, y + height - h],
					left: [x + h, y, x + h, y + height],
					right: [x + width - h, y, x + width - h, y + height],
				};
				doc.save();
				for (const k of SIDES) {
					if (!e.has(k)) continue;
					const [x1, y1, x2, y2] = ends[k];
					doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(e.bw).stroke(b.borderColor || HAIRLINE);
				}
				doc.restore();
			}
			inner.draw(x + e.l, y + e.t);
		},
	};
};

/** A stacked box's blocks with its `gap` between them (as space above each but the first). */
const withGap = (ctx: Ctx, b: any, width: number, minHeight: number): Laid => {
	const gap = b.gap || 0;
	if (!gap) return stack(ctx, b.blocks, width, minHeight);
	let first = true;
	const spaced = (b.blocks || []).map((k: Block) => {
		if (k.type === 'pageBreak' || !visible(k, ctx.scope)) return k;
		const out = first ? k : { ...k, mt: (k.mt || 0) + gap };
		first = false;
		return out;
	});
	return stack(ctx, spaced, width, minHeight);
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

/** `flow`: the direction of the list it sits in — a Space is a height in a stack and a width in a row. */
const layoutBlock = (ctx: Ctx, b: Block, width: number, flow: 'column' | 'row' = 'column'): Laid => {
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
			return { height: flow === 'row' ? 0 : b.height ?? 12, draw: () => {} };
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

/** Whether a free block (D22) goes on this page of a record: the first (default), every one, or the last. */
const onPage = (b: Block, i: number, count: number) => (b.pages === 'all' ? true : b.pages === 'last' ? i === count - 1 : i === 0);

/** A free block at its place: turned about its middle, see-through by its opacity. */
const drawFree = (ctx: Ctx, b: Block) => {
	if (!visible(b, ctx.scope)) return;
	const laid = layoutBlock(ctx, b, b.w || 160);
	const { doc } = ctx;
	doc.save();
	if (b.opacity && b.opacity < 1) doc.opacity(b.opacity);
	if (b.rotate) doc.rotate(b.rotate, { origin: [b.x + (b.w || 160) / 2, b.y + laid.height / 2] });
	laid.draw(b.x, b.y);
	doc.restore();
};

export const pageSize = (t: PdfTemplateData): [number, number] => {
	const [w, h] = PAGE_SIZES[t.page.size] || PAGE_SIZES.A4;
	return t.page.orientation === 'landscape' ? [h, w] : [w, h];
};

/** The part's own boxes set to full width get their reach (PT-27); boxes further in keep their place. */
const markBleed = (blocks: Block[], part: 'header' | 'body' | 'footer'): Block[] =>
	(blocks || []).map((b, i, all) =>
		b.type === 'box' && b.bleed ? { ...b, _bleed: { up: part === 'header' && i === 0, down: part === 'footer' && i === all.length - 1 } as Bleed } : b
	);

export const renderPdf = async ({ template: raw, records, settings, tz }: RenderInput): Promise<Buffer> => {
	const template: PdfTemplateData = { ...raw, header: markBleed(raw.header, 'header'), body: markBleed(raw.body, 'body'), footer: markBleed(raw.footer, 'footer') };
	const [pw, ph] = pageSize(template);
	const [mt, mr, mb, ml] = template.page.margin;
	const width = pw - ml - mr;

	// Images first: drawing is synchronous.
	const loader = new ImageLoader();
	const scopes: Scope[] = records.map(r => ({ roots: r.roots, settings, tz }));
	for (const scope of scopes) {
		const srcs = new Set<string>();
		for (const part of [template.header, template.body, template.footer, template.free || []]) imageSources(part, { ...scope, roots: { ...scope.roots, page: 1, pages: 1 } }, srcs);
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
		const ctx: Ctx = { doc, fonts, template, images, scope, page: { w: pw, h: ph } };
		// Header and footer heights, measured with this record (page numbers as placeholders).
		const measureScope = { ...scope, roots: { ...scope.roots, page: 1, pages: 1 } };
		const headerH = stack({ ...ctx, scope: measureScope }, template.header, width).height;
		const footerH = stack({ ...ctx, scope: measureScope }, template.footer, width).height;
		const top = mt + headerH + (headerH ? 12 : 0);
		const bottom = ph - mb - footerH - (footerH ? 12 : 0);
		const start = pageCount;
		let pagesHere = 0;
		let y = top;
		const behind = (template.free || []).filter(b => b.behind && b.pages !== 'last');
		const newPage = () => {
			if (pagesHere >= LIMITS.pages) return false;
			doc.addPage({ size: [pw, ph], margin: 0 });
			pageCount++;
			pagesHere++;
			y = top;
			// Free blocks behind the content go down first (D22); a last-page one can't be known yet — it's drawn on top.
			const pageScope: Scope = { ...scope, roots: { ...scope.roots, page: pagesHere, pages: pagesHere } };
			for (const b of behind) if (b.pages === 'all' || pagesHere === 1) drawFree({ ...ctx, scope: pageScope }, b);
			return true;
		};
		newPage();
		let full = false;

		/** What the body blocks from `from` up to the next page break need, the filling ones at their own size (D19). */
		const restOf = (from: number) => {
			let h = 0;
			let growth = 0;
			for (let i = from; i < template.body.length; i++) {
				const k = template.body[i];
				if (!visible(k, scope)) continue;
				if (k.type === 'pageBreak') break;
				growth += growOf(k);
				h += (k.mt || 0) + (k.mb || 0);
				if (k.type === 'table') {
					const t = layoutTableRows(ctx, k, width);
					h += t.header.height + t.rows.reduce((s, r) => s + r.height, 0);
				} else h += layoutBlock(ctx, k, width).height;
			}
			return { h, growth };
		};

		for (const [bi, b] of template.body.entries()) {
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
				if (y + t.header.height + first > bottom + FIT && y > top && !newPage()) {
					full = true;
					break;
				}
				t.header.draw(ml, y);
				y += t.header.height;
				for (const r of t.rows) {
					if (y + r.height > bottom + FIT && y > top + t.header.height) {
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
				let laid = layoutBlock(ctx, b, width);
				const g = growOf(b);
				if (g) {
					// Fill: the room left on this page once everything after it (to the next page break) is in.
					const rest = restOf(bi);
					const free = bottom - (y - (b.mt || 0)) - rest.h;
					if (free > 0) {
						const h = laid.height + (free * g) / rest.growth;
						laid = b.type === 'box' ? layoutBox(ctx, b, width, h) : { height: h, draw: laid.draw };
					}
				}
				if (y + laid.height > bottom + FIT && y > top && !newPage()) {
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
			const ctx: Ctx = { doc, fonts, template, images, scope, page: { w: pw, h: ph } };
			if (template.header.length) stack(ctx, template.header, width).draw(ml, mt);
			if (template.footer.length) {
				const f = stack(ctx, template.footer, width);
				f.draw(ml, ph - mb - f.height);
			}
			// Free blocks over everything (D22).
			for (const b of template.free || []) if ((!b.behind || b.pages === 'last') && onPage(b, i, span.count)) drawFree(ctx, b);
		}
	}

	if (!pageCount) doc.addPage({ size: [pw, ph], margin: 0 });
	doc.end();
	return done;
};
