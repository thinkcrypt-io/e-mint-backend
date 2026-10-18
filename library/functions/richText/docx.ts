import {
	AlignmentType,
	BorderStyle,
	Document,
	ExternalHyperlink,
	HeadingLevel,
	ImageRun,
	LevelFormat,
	Packer,
	Paragraph,
	ShadingType,
	TextRun,
} from 'docx';
import { sanitizeRichText } from './sanitize.js';
import { El, Img, Node, isBlock, loadImages, parse, textOf } from './tree.js';

/**
 * A rich-text field as a Word file (row menu → "Download DOCX", and the
 * download beside the field on a record page). The field is cleaned to what a
 * site's text block keeps first (sanitize.ts), so the file has what the site
 * shows: headings, bold / italic / underline / strike, sub/superscript, links,
 * nested bullet and numbered lists, quotes, code, rules, alignment and images.
 * Images (fetched safely, tree.ts) are scaled to the page; one that can't be
 * fetched leaves its alt text. The PDF made from a field is pdf.ts.
 */

type Run = TextRun | ExternalHyperlink | ImageRun;
type RunStyle = { bold?: boolean; italics?: boolean; underline?: {}; strike?: boolean; subScript?: boolean; superScript?: boolean; font?: string; color?: string; shading?: any; style?: string };

const HEADING: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = { h2: HeadingLevel.HEADING_1, h3: HeadingLevel.HEADING_2, h4: HeadingLevel.HEADING_3 };
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const MONO = 'Courier New';
const CODE_SHADING = { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' };
/** The page's text width at 96 dpi (A4/Letter with 1" margins is about 6.3"). */
const MAX_WIDTH = 600;

class Writer {
	/** Numbered lists so far: each gets its own Word list, so each starts at 1. */
	ol = 0;
	constructor(private images: Map<string, Img>) {}

	private image(el: El, style: RunStyle): Run[] {
		const img = this.images.get(el.attrs.src);
		if (!img) return el.attrs.alt ? [new TextRun({ ...style, text: `[${el.attrs.alt}]`, italics: true })] : [];
		const wanted = Number(el.attrs.width) || img.width;
		const width = Math.max(1, Math.min(wanted, MAX_WIDTH));
		const height = Math.max(1, Math.round((img.height * width) / img.width));
		return [new ImageRun({ type: img.type, data: img.data, transformation: { width, height }, altText: { name: el.attrs.alt || 'image', description: el.attrs.alt || '', title: el.attrs.alt || '' } })];
	}

	/** Inline content as runs, with the marks it sits in. */
	runs(nodes: Node[], style: RunStyle = {}): Run[] {
		const out: Run[] = [];
		for (const n of nodes) {
			if (typeof n === 'string') {
				if (n) out.push(new TextRun({ ...style, text: n }));
				continue;
			}
			switch (n.tag) {
				case 'strong':
					out.push(...this.runs(n.children, { ...style, bold: true }));
					break;
				case 'em':
					out.push(...this.runs(n.children, { ...style, italics: true }));
					break;
				case 'u':
					out.push(...this.runs(n.children, { ...style, underline: {} }));
					break;
				case 's':
					out.push(...this.runs(n.children, { ...style, strike: true }));
					break;
				case 'sub':
					out.push(...this.runs(n.children, { ...style, subScript: true }));
					break;
				case 'sup':
					out.push(...this.runs(n.children, { ...style, superScript: true }));
					break;
				case 'code':
					out.push(...this.runs(n.children, { ...style, font: MONO, shading: CODE_SHADING }));
					break;
				case 'br':
					out.push(new TextRun({ ...style, text: '', break: 1 }));
					break;
				case 'img':
					out.push(...this.image(n, style));
					break;
				case 'a': {
					const href = n.attrs.href || '';
					// Word opens web, mail and phone links; a path on the site stays words.
					if (/^(https?:|mailto:|tel:)/i.test(href)) {
						const inner = this.runs(n.children, { ...style, style: 'Hyperlink' }).filter((r): r is TextRun | ImageRun => !(r instanceof ExternalHyperlink));
						out.push(new ExternalHyperlink({ link: href, children: inner }));
					} else out.push(...this.runs(n.children, { ...style, underline: {} }));
					break;
				}
				default:
					out.push(...this.runs(n.children, style));
			}
		}
		return out;
	}

	/** A list and the lists inside its items, one level deeper each (Word's numbering). */
	private list(el: El, level: number, quote: boolean): Paragraph[] {
		const ordered = el.tag === 'ol';
		const reference = ordered ? `mint-ol-${++this.ol}` : 'mint-ul';
		const out: Paragraph[] = [];
		for (const li of el.children) {
			if (typeof li === 'string' || li.tag !== 'li') continue;
			const inline = li.children.filter(c => !(typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol')));
			out.push(
				new Paragraph({
					children: this.runs(inline, quote ? { color: '595959' } : {}),
					numbering: { reference, level: Math.min(level, 8) },
					alignment: ALIGN[li.attrs['data-align']],
				})
			);
			for (const c of li.children) if (typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol')) out.push(...this.list(c, level + 1, quote));
		}
		return out;
	}

	/** Block content as paragraphs; loose inline content (no <p> around it) becomes one paragraph. */
	blocks(nodes: Node[], quote = false): Paragraph[] {
		const out: Paragraph[] = [];
		const quoted = quote ? { indent: { left: 720 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } } } : {};
		const runStyle: RunStyle = quote ? { color: '595959' } : {};
		let loose: Node[] = [];
		const flush = () => {
			if (loose.some(n => typeof n !== 'string' || n.trim())) out.push(new Paragraph({ ...quoted, children: this.runs(loose, runStyle) }));
			loose = [];
		};
		for (const n of nodes) {
			if (!isBlock(n)) {
				loose.push(n);
				continue;
			}
			flush();
			const el = n as El;
			const alignment = ALIGN[el.attrs['data-align']];
			switch (el.tag) {
				case 'p':
					out.push(new Paragraph({ ...quoted, alignment, children: this.runs(el.children, runStyle) }));
					break;
				case 'h2':
				case 'h3':
				case 'h4':
					out.push(new Paragraph({ heading: HEADING[el.tag], alignment, children: this.runs(el.children) }));
					break;
				case 'ul':
				case 'ol':
					out.push(...this.list(el, 0, quote));
					break;
				case 'li':
					out.push(new Paragraph({ ...quoted, children: this.runs(el.children, runStyle) }));
					break;
				case 'blockquote':
					out.push(...this.blocks(el.children, true));
					break;
				case 'pre': {
					const lines = textOf(el.children).replace(/\n$/, '').split('\n');
					out.push(
						new Paragraph({
							shading: CODE_SHADING,
							spacing: { before: 120, after: 120 },
							children: lines.map((text, i) => new TextRun({ text, font: MONO, size: 20, ...(i > 0 && { break: 1 }) })),
						})
					);
					break;
				}
				case 'hr':
					out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 1 } }, children: [] }));
					break;
			}
		}
		flush();
		return out;
	}
}

/** Word's nine list levels, each indented one step further. */
const levels = (format: (level: number) => (typeof LevelFormat)[keyof typeof LevelFormat], text: (level: number) => string) =>
	Array.from({ length: 9 }, (_, level) => ({
		level,
		format: format(level),
		text: text(level),
		alignment: AlignmentType.START,
		style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
	}));

const OL_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
const BULLETS = ['•', '◦', '▪'];

/** The field's HTML as a .docx file. */
export const richTextToDocx = async ({ html, title }: { html: unknown; title?: string }): Promise<Buffer> => {
	const nodes = parse(sanitizeRichText(html));
	const writer = new Writer(await loadImages(nodes));
	const children = writer.blocks(nodes);
	const doc = new Document({
		creator: 'MINT',
		title: title || 'Document',
		styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 120, line: 276 } } } } },
		numbering: {
			config: [
				// 1. → a. → i. and • → ◦ → ▪, repeating deeper down.
				...Array.from({ length: writer.ol }, (_, i) => ({ reference: `mint-ol-${i + 1}`, levels: levels(l => OL_FORMATS[l % 3], l => `%${l + 1}.`) })),
				{ reference: 'mint-ul', levels: levels(() => LevelFormat.BULLET, l => BULLETS[l % 3]) },
			],
		},
		sections: [{ children: children.length ? children : [new Paragraph({ children: [] })] }],
	});
	return Packer.toBuffer(doc);
};
