import sharp from 'sharp';
import { ImageLoader } from '../pdfTemplates/images.js';

/**
 * A rich-text field's cleaned HTML (sanitize.ts) as a tree, and the images
 * it shows, for the files made from it: Word (docx.ts) and PDF (pdf.ts).
 * Images are fetched the way PDF templates fetch theirs (ImageLoader: http(s)
 * only, no inside addresses, 5 s, 5 MB; WebP, GIF, SVG… turned into PNG).
 */

export type El = { tag: string; attrs: Record<string, string>; children: Node[] };
export type Node = El | string;
export type Img = { data: Buffer; type: 'png' | 'jpg'; width: number; height: number };

const VOID = new Set(['br', 'hr', 'img']);
const BLOCK = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr']);

const decode = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&amp;/g, '&');

/** Cleaned HTML (balanced, known tags, quoted attributes) as a tree. */
export const parse = (html: string): Node[] => {
	const root: El = { tag: '', attrs: {}, children: [] };
	const stack: El[] = [root];
	const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		const top = stack[stack.length - 1];
		if (m[4] !== undefined) {
			top.children.push(decode(m[4]));
			continue;
		}
		const tag = m[2].toLowerCase();
		if (m[1]) {
			const at = stack.map(e => e.tag).lastIndexOf(tag);
			if (at > 0) stack.length = at;
			continue;
		}
		const attrs: Record<string, string> = {};
		for (const a of m[3].matchAll(/([a-z-]+)="([^"]*)"/gi)) attrs[a[1].toLowerCase()] = decode(a[2]);
		const el: El = { tag, attrs, children: [] };
		top.children.push(el);
		if (!VOID.has(tag)) stack.push(el);
	}
	return root.children;
};

export const textOf = (nodes: Node[]): string => nodes.map(n => (typeof n === 'string' ? n : n.tag === 'br' ? '\n' : textOf(n.children))).join('');

export const isBlock = (n: Node) => typeof n !== 'string' && BLOCK.has(n.tag);

const sources = (nodes: Node[], out: string[] = []) => {
	for (const n of nodes) if (typeof n !== 'string') n.tag === 'img' ? n.attrs.src && out.push(n.attrs.src) : sources(n.children, out);
	return out;
};

/** Every image the text shows, fetched once, with its size in pixels. */
export const loadImages = async (nodes: Node[]): Promise<Map<string, Img>> => {
	const loader = new ImageLoader();
	const srcs = [...new Set(sources(nodes))].slice(0, 40);
	srcs.forEach(s => loader.load(s));
	const fetched = await loader.ready();
	const out = new Map<string, Img>();
	for (const [src, data] of fetched) {
		if (!data) continue;
		try {
			const meta = await sharp(data).metadata();
			if (!meta.width || !meta.height) continue;
			out.set(src, { data, type: meta.format === 'jpeg' ? 'jpg' : 'png', width: meta.width, height: meta.height });
		} catch {
			// not an image after all — its alt text stands in
		}
	}
	return out;
};
