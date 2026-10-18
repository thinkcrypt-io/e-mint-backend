import PDFDocument from 'pdfkit';
import { DocFonts, Run, faceFor, runsOf } from '../pdfTemplates/fonts.js';
import { sanitizeRichText } from './sanitize.js';
import { El, Img, Node, isBlock, loadImages, parse, tableRows, textOf } from './tree.js';

/**
 * A rich-text field as a PDF (the full-page editor's Export → PDF). The same
 * cleaned HTML as the Word file (docx.ts), set on A4 in Inter with pdfkit:
 * headings, bold / italic / underline / strike, links you can click, nested
 * bullet and numbered lists, quotes, code, rules, alignment and images. Text
 * a face can't print (Bangla, ৳) falls back character by character the way
 * PDF templates do (fonts.ts runsOf). Page numbers go at the foot once the
 * text runs past one page.
 */

/** Paper the editor offers (its page size); anything else — "infinite" too — prints on A4. */
export type PageSize = 'a4' | 'letter' | 'legal' | 'a5';
const PAPER: Record<PageSize, { w: number; h: number; m: number }> = {
	a4: { w: 595.28, h: 841.89, m: 68 },
	letter: { w: 612, h: 792, m: 68 },
	legal: { w: 612, h: 1008, m: 68 },
	a5: { w: 419.53, h: 595.28, m: 44 },
};
export const paperOf = (size: unknown): PageSize => (typeof size === 'string' && size in PAPER ? (size as PageSize) : 'a4');
const INK = '#1f2328';
const MUTED = '#59636e';
const LINK = '#0b5fcc';
const RULE = '#d0d7de';
const CODE_BG = '#f3f4f6';
const BODY = 11;
const LINE_GAP = 3.5;
const PARA_GAP = 7;
const INDENT = 24;
const HEADINGS: Record<string, { size: number; weight: number }> = { h2: { size: 20, weight: 700 }, h3: { size: 16, weight: 700 }, h4: { size: 13, weight: 600 } };
const ALIGN: Record<string, 'center' | 'right' | 'justify'> = { center: 'center', right: 'right', justify: 'justify' };

type Mark = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; mono?: boolean; small?: boolean; link?: string };
type Text = { text: string; mark: Mark };
type Piece = Text | { img: El };
/** Where text goes and how it looks. */
type Box = { x: number; width: number; color: string; size: number; weight: number; align?: 'center' | 'right' | 'justify' };

const letters = (n: number): string => (n > 26 ? letters(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(97 + ((n - 1) % 26));
const roman = (n: number): string => {
	let out = '';
	for (const [v, s] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']] as const)
		while (n >= v) {
			out += s;
			n -= v;
		}
	return out;
};
/** 1. → a. → i., repeating deeper down — as the Word file numbers them. */
const numberOf = (n: number, level: number) => `${[String(n), letters(n), roman(n)][level % 3]}.`;

class Writer {
	private fonts: DocFonts;
	constructor(
		private doc: PDFKit.PDFDocument,
		private images: Map<string, Img>,
		private PAGE: { w: number; h: number },
		private M: { top: number; bottom: number; left: number; right: number }
	) {
		this.fonts = new DocFonts(doc);
	}

	private get bottom() {
		return this.PAGE.h - this.M.bottom;
	}

	/** The page being written (the last one: earlier pages are only revisited to finish a quote's bar). */
	private page() {
		const r = this.doc.bufferedPageRange();
		return r.start + r.count - 1;
	}

	/** Room for `h` more points on this page, or on to the next. */
	private room(h: number) {
		if (this.doc.y + h > this.bottom && this.doc.y > this.M.top + 1) this.doc.addPage();
	}

	/** Inline content as text pieces with their marks, whitespace as a browser shows it. */
	private pieces(nodes: Node[], mark: Mark = {}, out: Piece[] = []): Piece[] {
		for (const n of nodes) {
			if (typeof n === 'string') {
				if (n) out.push({ text: n.replace(/\s+/g, ' '), mark });
				continue;
			}
			switch (n.tag) {
				case 'strong':
					this.pieces(n.children, { ...mark, bold: true }, out);
					break;
				case 'em':
					this.pieces(n.children, { ...mark, italic: true }, out);
					break;
				case 'u':
					this.pieces(n.children, { ...mark, underline: true }, out);
					break;
				case 's':
					this.pieces(n.children, { ...mark, strike: true }, out);
					break;
				case 'sub':
				case 'sup':
					this.pieces(n.children, { ...mark, small: true }, out);
					break;
				case 'code':
					this.pieces(n.children, { ...mark, mono: true }, out);
					break;
				case 'br':
					out.push({ text: '\n', mark });
					break;
				case 'img':
					out.push({ img: n });
					break;
				case 'a': {
					const href = n.attrs.href || '';
					// Web, mail and phone links open; a path on the site stays underlined words.
					this.pieces(n.children, { ...mark, underline: true, ...(/^(https?:|mailto:|tel:)/i.test(href) && { link: href }) }, out);
					break;
				}
				default:
					this.pieces(n.children, mark, out);
			}
		}
		return out;
	}

	/** Text wrapped in the box from where the page is; false when there was nothing to write. */
	private write(texts: Text[], box: Box): boolean {
		// A line doesn't start or end with a space, and two in a row are one.
		const out: Text[] = [];
		let afterSpace = true;
		const trimLast = () => {
			while (out.length && out[out.length - 1].text !== '\n' && !(out[out.length - 1].text = out[out.length - 1].text.replace(/ +$/, ''))) out.pop();
		};
		for (const p of texts) {
			if (p.text === '\n') {
				trimLast();
				out.push(p);
				afterSpace = true;
				continue;
			}
			const text: string = afterSpace ? p.text.replace(/^ +/, '') : p.text;
			if (!text) continue;
			afterSpace = text.endsWith(' ');
			out.push({ ...p, text });
		}
		trimLast();
		while (out.length && out[out.length - 1].text === '\n') out.pop();
		if (!out.length) return false;

		const runs = out.flatMap(p => {
			const bold = !!p.mark.bold || box.weight >= 600;
			const face = faceFor(p.mark.mono ? 'mono' : 'inter', p.mark.bold ? 700 : box.weight, !!p.mark.italic);
			const size = box.size * (p.mark.small ? 0.72 : p.mark.mono ? 0.9 : 1);
			return runsOf(p.text, face, bold).map(r => ({ ...r, size, mark: p.mark }));
		});
		if (box.align) {
			this.aligned(runs, box);
			return true;
		}
		const doc = this.doc;
		runs.forEach((r, i) => {
			this.fonts.use(r.face, r.size);
			doc.fillColor(r.mark.link ? LINK : box.color);
			// pdfkit carries a continued line's options on — so every mark is set, on or off.
			const opts: any = {
				width: box.width,
				align: box.align || 'left',
				lineGap: LINE_GAP,
				continued: i < runs.length - 1,
				underline: !!r.mark.underline,
				strike: !!r.mark.strike,
				link: r.mark.link || null,
				oblique: r.face.fakeItalic && r.mark.italic ? 10 : false,
			};
			if (i === 0) doc.text(r.text, box.x, doc.y, opts);
			else doc.text(r.text, opts);
		});
		doc.x = this.M.left;
		return true;
	}

	/**
	 * Centred, right-aligned and justified text, broken into lines here: pdfkit
	 * aligns each piece of a continued line on its own, so "Centred **bold**"
	 * would print on top of itself. Words go down one at a time on a shared
	 * baseline.
	 */
	private aligned(runs: (Run & { size: number; mark: Mark })[], box: Box) {
		type Tok = { text: string; run: (typeof runs)[number]; width: number; space: boolean };
		const lines: Tok[][] = [];
		let line: Tok[] = [];
		let used = 0;
		const end = () => {
			while (line.length && line[line.length - 1].space) line.pop();
			lines.push(line);
			line = [];
			used = 0;
		};
		for (const run of runs)
			for (const part of run.text.split(/(\n| +)/)) {
				if (!part) continue;
				if (part === '\n') {
					end();
					continue;
				}
				const space = part.startsWith(' ');
				if (space && !line.length) continue;
				const width = this.fonts.width(part, run.face, run.size);
				if (!space && line.some(t => !t.space) && used + width > box.width) end();
				line.push({ text: part, run, width, space });
				used += width;
			}
		end();

		lines.forEach((toks, i) => {
			if (!toks.length) {
				this.doc.y += box.size * 1.2 + LINE_GAP;
				return;
			}
			let height = 0;
			let ascent = 0;
			for (const t of toks) {
				this.fonts.use(t.run.face, t.run.size);
				height = Math.max(height, this.doc.currentLineHeight(true));
				ascent = Math.max(ascent, this.fonts.vertical(t.run.face, t.run.size).ascent);
			}
			this.room(height + LINE_GAP);
			const y = this.doc.y;
			const width = toks.reduce((s, t) => s + t.width, 0);
			const gaps = toks.filter(t => t.space).length;
			const stretch = box.align === 'justify' && i < lines.length - 1 && gaps ? (box.width - width) / gaps : 0;
			let x = box.x + (box.align === 'center' ? (box.width - width) / 2 : box.align === 'right' ? box.width - width : 0);
			toks.forEach((t, j) => {
				const w = t.width + (t.space ? stretch : 0);
				const { mark } = t.run;
				// A space is underlined (or a link) only between words that are.
				const next = toks[j + 1]?.run.mark;
				if (!t.space || (next && next === mark && (mark.underline || mark.strike))) {
					this.fonts.use(t.run.face, t.run.size);
					this.doc.fillColor(mark.link ? LINK : box.color);
					this.doc.text(t.text, x, y + ascent - this.fonts.vertical(t.run.face, t.run.size).ascent, {
						lineBreak: false,
						width: w,
						underline: !!mark.underline,
						strike: !!mark.strike,
						link: mark.link || null,
						oblique: t.run.face.fakeItalic && mark.italic ? 10 : false,
					} as any);
				}
				x += w;
			});
			this.doc.x = this.M.left;
			this.doc.y = y + height + LINE_GAP;
		});
	}

	private image(el: El, box: Box) {
		const img = this.images.get(el.attrs.src);
		if (!img) {
			if (el.attrs.alt) this.write([{ text: `[${el.attrs.alt}]`, mark: { italic: true } }], { ...box, color: MUTED });
			return;
		}
		// Pixels as a browser shows them (96 to the inch), never wider than the text, never taller than a page.
		let w = Math.min((Number(el.attrs.width) || img.width) * 0.75, box.width);
		let h = (img.height * w) / img.width;
		const most = this.bottom - this.M.top;
		if (h > most) {
			w = (w * most) / h;
			h = most;
		}
		this.room(h);
		const x = box.align === 'center' ? box.x + (box.width - w) / 2 : box.align === 'right' ? box.x + box.width - w : box.x;
		this.doc.image(img.data, x, this.doc.y, { width: w, height: h });
		this.doc.y += h + 4;
	}

	/** A paragraph's inline content; an image in it stands on its own line. */
	private inline(nodes: Node[], box: Box) {
		let texts: Text[] = [];
		let drew = false;
		const flush = () => {
			if (texts.length && this.write(texts, box)) drew = true;
			texts = [];
		};
		for (const p of this.pieces(nodes)) {
			if ('img' in p) {
				flush();
				this.image(p.img, box);
				drew = true;
			} else texts.push(p);
		}
		flush();
		// An empty paragraph keeps its line, as it does on the site.
		if (!drew) this.doc.y += box.size * 1.2 + LINE_GAP;
	}

	private para(nodes: Node[], box: Box) {
		this.room(box.size * 1.5);
		this.inline(nodes, box);
		this.doc.y += PARA_GAP;
	}

	private heading(el: El, box: Box) {
		const h = HEADINGS[el.tag];
		if (this.doc.y > this.M.top + 1) this.doc.y += h.size * 0.5;
		// Kept with the lines after it.
		this.room(h.size * 1.3 + BODY * 3);
		this.inline(el.children, { ...box, size: h.size, weight: h.weight, color: box.color === MUTED ? MUTED : INK });
		this.doc.y += 3;
	}

	private list(el: El, level: number, base: Box) {
		const ordered = el.tag === 'ol';
		let n = 0;
		for (const li of el.children) {
			if (typeof li === 'string' || li.tag !== 'li') continue;
			n++;
			const x = base.x + INDENT * (level + 1);
			const box: Box = { ...base, x, width: base.width - INDENT * (level + 1), align: ALIGN[li.attrs['data-align']] };
			this.room(base.size * 1.5);
			const y = this.doc.y;
			const face = faceFor('inter', base.weight, false);
			this.fonts.use(face, base.size);
			this.doc.fillColor(base.color);
			if (ordered) {
				this.doc.text(numberOf(n, level), x - INDENT, y, { width: INDENT - 6, align: 'right', lineBreak: false });
			} else {
				// Drawn, not typed: • ◦ ▪ print the same whatever the font has.
				const cy = y + this.fonts.vertical(face, base.size).ascent - base.size * 0.32;
				const cx = x - 10;
				const shape = level % 3;
				this.doc.save();
				if (shape === 0) this.doc.circle(cx, cy, 2.1).fill(base.color);
				else if (shape === 1) this.doc.circle(cx, cy, 2).lineWidth(0.8).stroke(base.color);
				else this.doc.rect(cx - 1.9, cy - 1.9, 3.8, 3.8).fill(base.color);
				this.doc.restore();
			}
			this.doc.y = y;
			this.inline(
				li.children.filter(c => !(typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol'))),
				box
			);
			this.doc.y += 2.5;
			for (const c of li.children) if (typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol')) this.list(c, level + 1, base);
		}
	}

	/** Indented, in muted ink, with a bar down its left on every page it runs over. */
	private quote(el: El, base: Box) {
		const box: Box = { ...base, x: base.x + 14, width: base.width - 14, color: MUTED };
		this.room(base.size * 1.5);
		const start = { page: this.page(), y: this.doc.y };
		this.blocks(el.children, box);
		const end = { page: this.page(), y: this.doc.y - PARA_GAP };
		for (let p = start.page; p <= end.page; p++) {
			this.doc.switchToPage(p);
			const y1 = p === start.page ? start.y : this.M.top;
			const y2 = p === end.page ? end.y : this.bottom;
			if (y2 > y1) this.doc.save().moveTo(base.x + 2, y1).lineTo(base.x + 2, y2).lineWidth(2.5).strokeColor(RULE).stroke().restore();
		}
		this.doc.switchToPage(end.page);
		this.doc.x = this.M.left;
		this.doc.y = end.y + PARA_GAP;
	}

	/** A code block: its lines as written, in mono on a grey panel that breaks with the page. */
	private pre(el: El, base: Box) {
		const lines = textOf(el.children).replace(/\n$/, '').split('\n');
		const face = faceFor('mono', 400, false);
		const size = base.size * 0.86;
		const pad = 8;
		const inner = base.width - 2 * 10;
		lines.forEach((line, i) => {
			this.fonts.use(face, size);
			const text = line || ' ';
			const h = this.doc.heightOfString(text, { width: inner, lineGap: 2 });
			const top = i === 0 ? pad : 0;
			const below = i === lines.length - 1 ? pad : 0;
			this.room(h + top + below);
			const y = this.doc.y;
			this.doc.save().rect(base.x, y, base.width, h + top + below).fill(CODE_BG).restore();
			this.fonts.use(face, size);
			this.doc.fillColor(INK).text(text, base.x + 10, y + top, { width: inner, lineGap: 2 });
			this.doc.x = this.M.left;
			this.doc.y = y + top + h + below;
		});
		this.doc.y += PARA_GAP + 2;
	}

	/** A simple table across the text: equal columns, ruled cells, a header row bold on grey; rows move whole to the next page. */
	private table(el: El, base: Box) {
		const rows = tableRows(el);
		const cols = Math.max(0, ...rows.map(r => r.cells.length));
		if (!rows.length || !cols) return;
		const colW = base.width / cols;
		const pad = 5;
		const size = base.size * 0.92;
		this.doc.y += 2;
		for (const row of rows) {
			let h = 0;
			for (const cell of row.cells) {
				this.fonts.use(faceFor('inter', cell.tag === 'th' ? 700 : 400, false), size);
				h = Math.max(h, this.doc.heightOfString(textOf(cell.children) || ' ', { width: colW - 2 * pad, lineGap: LINE_GAP }));
			}
			h += 2 * pad;
			this.room(h);
			const top = this.doc.y;
			if (row.head) this.doc.save().rect(base.x, top, base.width, h).fill(CODE_BG).restore();
			let bottom = top + h;
			row.cells.forEach((cell, c) => {
				if (!textOf(cell.children).trim() && !cell.children.some(n => typeof n !== 'string' && n.tag === 'img')) return;
				this.doc.y = top + pad;
				this.inline(cell.children, {
					...base,
					x: base.x + c * colW + pad,
					width: colW - 2 * pad,
					size,
					weight: cell.tag === 'th' ? 700 : base.weight,
					align: ALIGN[cell.attrs['data-align']],
				});
				bottom = Math.max(bottom, this.doc.y + pad);
			});
			for (let c = 0; c < cols; c++) this.doc.save().lineWidth(0.6).strokeColor(RULE).rect(base.x + c * colW, top, colW, bottom - top).stroke().restore();
			this.doc.x = this.M.left;
			this.doc.y = bottom;
		}
		this.doc.y += PARA_GAP;
	}

	private hr(base: Box) {
		this.room(18);
		const y = this.doc.y + 6;
		this.doc.save().moveTo(base.x, y).lineTo(base.x + base.width, y).lineWidth(0.8).strokeColor(RULE).stroke().restore();
		this.doc.y = y + 12;
	}

	/** Block content in order; loose inline content (no <p> round it) is one paragraph. */
	blocks(nodes: Node[], box: Box) {
		let loose: Node[] = [];
		const flush = () => {
			if (loose.some(n => typeof n !== 'string' || n.trim())) this.para(loose, box);
			loose = [];
		};
		for (const n of nodes) {
			if (!isBlock(n)) {
				loose.push(n);
				continue;
			}
			flush();
			const el = n as El;
			const align = ALIGN[el.attrs['data-align']];
			switch (el.tag) {
				case 'p':
					this.para(el.children, { ...box, align });
					break;
				case 'h2':
				case 'h3':
				case 'h4':
					this.heading(el, { ...box, align });
					break;
				case 'ul':
				case 'ol':
					this.list(el, 0, box);
					this.doc.y += PARA_GAP - 2.5;
					break;
				case 'li':
					this.para(el.children, box);
					break;
				case 'blockquote':
					this.quote(el, box);
					break;
				case 'pre':
					this.pre(el, box);
					break;
				case 'hr':
					this.hr(box);
					break;
				case 'table':
					this.table(el, box);
					break;
			}
		}
		flush();
	}

	/** "2 / 5" at the foot of each page, when there's more than one. */
	numberPages() {
		const { start, count } = this.doc.bufferedPageRange();
		if (count < 2) return;
		const face = faceFor('inter', 400, false);
		for (let i = 0; i < count; i++) {
			this.doc.switchToPage(start + i);
			const margins = this.doc.page.margins;
			this.doc.page.margins = { ...margins, bottom: 0 };
			this.fonts.use(face, 8.5);
			this.doc.fillColor(MUTED).text(`${i + 1} / ${count}`, 0, this.PAGE.h - 44, { width: this.PAGE.w, align: 'center', lineBreak: false });
			this.doc.page.margins = margins;
		}
	}
}

/** The field's HTML as a PDF file. */
export const richTextToPdf = async ({ html, title, pageSize }: { html: unknown; title?: string; pageSize?: unknown }): Promise<Buffer> => {
	const paper = PAPER[paperOf(pageSize)];
	const PAGE = { w: paper.w, h: paper.h };
	const M = { top: paper.m + 4, bottom: paper.m + 4, left: paper.m, right: paper.m };
	const nodes = parse(sanitizeRichText(html));
	const images = await loadImages(nodes);
	const doc = new PDFDocument({
		size: [PAGE.w, PAGE.h],
		margins: M,
		bufferPages: true,
		info: { Title: title || 'Document', Creator: 'MINT', Producer: 'MINT' } as any,
	});
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
	});
	const writer = new Writer(doc, images, PAGE, M);
	writer.blocks(nodes, { x: M.left, width: PAGE.w - M.left - M.right, color: INK, size: BODY, weight: 400 });
	writer.numberPages();
	doc.end();
	return done;
};
