import { sanitizeRichText } from './sanitize.js';
import { El, Node, isBlock, parse, textOf } from './tree.js';

/**
 * A rich-text field as Markdown (.md) or plain text (.txt) — two of the
 * download formats beside Word (docx.ts) and PDF (pdf.ts). The same cleaned
 * HTML as those. Markdown keeps headings, bold / italic / strike, code,
 * links, images, nested lists, quotes and rules (underline and sub/superscript
 * have no Markdown, so their words stay plain); plain text keeps the words,
 * the list markers and the indents, with a link's address after its words.
 */

type Mode = 'md' | 'txt';

const letters = (n: number): string => (n > 26 ? letters(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(97 + ((n - 1) % 26));

/** Markdown's own characters in words, so they print as written. */
const escapeMd = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

const inline = (nodes: Node[], mode: Mode): string => {
	let out = '';
	for (const n of nodes) {
		if (typeof n === 'string') {
			const t = n.replace(/\s+/g, ' ');
			out += mode === 'md' ? escapeMd(t) : t;
			continue;
		}
		const inner = () => inline(n.children, mode);
		// Marks hug their words: "** bold **" isn't bold in Markdown.
		const wrap = (mark: string) => {
			const t = inner();
			const m = t.match(/^(\s*)(.*?)(\s*)$/s)!;
			return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : t;
		};
		switch (n.tag) {
			case 'strong':
				out += mode === 'md' ? wrap('**') : inner();
				break;
			case 'em':
				out += mode === 'md' ? wrap('*') : inner();
				break;
			case 's':
				out += mode === 'md' ? wrap('~~') : inner();
				break;
			case 'code': {
				const t = textOf(n.children);
				out += mode === 'md' ? (t.includes('`') ? `\`\` ${t} \`\`` : `\`${t}\``) : t;
				break;
			}
			case 'br':
				out += mode === 'md' ? '  \n' : '\n';
				break;
			case 'img': {
				const { src = '', alt = '' } = n.attrs;
				out += mode === 'md' ? `![${escapeMd(alt)}](${src})` : alt ? `[${alt}]` : '';
				break;
			}
			case 'a': {
				const href = n.attrs.href || '';
				const t = inner();
				if (!href) out += t;
				else if (mode === 'md') out += `[${t}](${href.replace(/[()\s]/g, c => encodeURIComponent(c))})`;
				else out += t.trim() && t.trim() !== href ? `${t} (${href})` : href;
				break;
			}
			default:
				out += inner();
		}
	}
	return out;
};

/** Lines prefixed for a quote or a list item's follow-on lines. */
const indent = (text: string, first: string, rest: string) =>
	text
		.split('\n')
		.map((l, i) => (i ? rest : first) + l)
		.join('\n');

const list = (el: El, mode: Mode, level: number): string => {
	const ordered = el.tag === 'ol';
	const items: string[] = [];
	let n = 0;
	for (const li of el.children) {
		if (typeof li === 'string' || li.tag !== 'li') continue;
		n++;
		// Markdown numbers every level 1. 2. 3.; plain text goes 1. → a. → 1. as the page shows it.
		const marker = ordered ? (mode === 'txt' && level % 2 ? `${letters(n)}.` : `${n}.`) : mode === 'md' ? '-' : ['•', '◦', '▪'][level % 3];
		const nested = li.children.filter((c): c is El => typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol'));
		const words = inline(
			li.children.filter(c => !nested.includes(c as El)),
			mode
		).trim();
		const pad = ' '.repeat(marker.length + 1);
		let item = indent(words, `${marker} `, pad);
		for (const c of nested) item += `\n${indent(list(c, mode, level + 1), pad, pad)}`;
		items.push(item);
	}
	return items.join('\n');
};

const blocks = (nodes: Node[], mode: Mode): string[] => {
	const out: string[] = [];
	let loose: Node[] = [];
	const flush = () => {
		const t = inline(loose, mode).trim();
		if (t) out.push(t);
		loose = [];
	};
	for (const n of nodes) {
		if (!isBlock(n)) {
			loose.push(n);
			continue;
		}
		flush();
		const el = n as El;
		switch (el.tag) {
			case 'p':
			case 'li': {
				const t = inline(el.children, mode).trim();
				if (t) out.push(t);
				break;
			}
			case 'h2':
			case 'h3':
			case 'h4': {
				const t = inline(el.children, mode).trim();
				if (t) out.push(mode === 'md' ? `${'#'.repeat(Number(el.tag[1]))} ${t}` : t);
				break;
			}
			case 'ul':
			case 'ol':
				out.push(list(el, mode, 0));
				break;
			case 'blockquote': {
				const t = blocks(el.children, mode).join('\n\n');
				if (t) out.push(indent(t, mode === 'md' ? '> ' : '    ', mode === 'md' ? '> ' : '    ').replace(/^> $/gm, '>'));
				break;
			}
			case 'pre': {
				const t = textOf(el.children).replace(/\n$/, '');
				const fence = t.includes('```') ? '~~~' : '```';
				out.push(mode === 'md' ? `${fence}\n${t}\n${fence}` : indent(t, '    ', '    '));
				break;
			}
			case 'hr':
				out.push(mode === 'md' ? '---' : '* * *');
				break;
		}
	}
	flush();
	return out;
};

const render = (html: unknown, mode: Mode) => {
	const body = blocks(parse(sanitizeRichText(html)), mode).join('\n\n');
	return body ? `${body}\n` : '';
};

/** The field's HTML as a Markdown file. */
export const richTextToMarkdown = async ({ html }: { html: unknown; title?: string }): Promise<Buffer> => Buffer.from(render(html, 'md'), 'utf8');

/** The field's HTML as a plain-text file. */
export const richTextToText = async ({ html }: { html: unknown; title?: string }): Promise<Buffer> => Buffer.from(render(html, 'txt'), 'utf8');
