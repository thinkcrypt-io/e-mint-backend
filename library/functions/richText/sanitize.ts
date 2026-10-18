// A copy of mint-sites' src/render/sanitize.ts (docs/rich-text RT-00): the
// allowlist a site's text block keeps, so a rich-text field turns into a Word
// file (docx.ts) the way the site shows it. The panels hold the same file at
// components/library/utils/richText.ts — keep all three the same until RT-02's
// shared package replaces them.
//
// Rich text and URLs from page data. Rich text keeps only the allowlist in the
// README (p, h2–h4, strong, em, u, s, sub, sup, a, ul, ol, li, br, hr,
// blockquote, code, pre, img, and simple tables: table, thead, tbody, tr, th,
// td — no merged cells) and comes out balanced, so it can't close the element
// it's drawn in. Records written in the panel's Quill editor before
// docs/rich-text RT-00 hold Quill's own markup; `fromQuill` reads it first.

const ALLOWED = new Set(['p', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'ul', 'ol', 'li', 'br', 'hr', 'blockquote', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
// Headings the text block doesn't have become the nearest it does, so they keep their line.
const ALIAS: Record<string, string> = { b: 'strong', i: 'em', h1: 'h2', h5: 'h4', h6: 'h4', del: 's', strike: 's', ins: 'u' };
const VOID = new Set(['br', 'hr', 'img']);
// Elements whose alignment is kept, as `data-align` (never a class or style).
const ALIGNABLE = new Set(['p', 'h2', 'h3', 'h4', 'li', 'th', 'td']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

/** Relative paths, anchors, http(s), mailto and tel — never javascript: or data:. */
export function isSafeHref(href: unknown): href is string {
	if (typeof href !== 'string') return false;
	const h = href.trim();
	if (!h || h.length > 2048 || /[\u0000-\u001f\s]/.test(h)) return false;
	if (h.startsWith('/') && !h.startsWith('//')) return true;
	if (h.startsWith('#') || h.startsWith('?')) return true;
	return /^(https?:\/\/[^/]|mailto:|tel:)/i.test(h);
}

/** An image address: http(s) or a path on the site — never data:, javascript: or protocol-relative. */
const isSafeSrc = (src: string) => isSafeHref(src) && (/^https?:\/\//i.test(src) || src.startsWith('/'));

export const escapeHtml = (s: string) =>
	s.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const attrValue = (attrs: string, name: string) => {
	const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
	return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const decodeEntities = (s: string) =>
	s
		.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&colon;/gi, ':')
		.replace(/&tab;|&newline;/gi, '')
		.replace(/&amp;/gi, '&');

/** left/center/right/justify from Quill's class, `data-align` or `text-align`. */
const alignOf = (attrs: string): string | null => {
	const cls = attrValue(attrs, 'class') || '';
	const m =
		cls.match(/\bql-align-(center|right|justify)\b/) ||
		(attrValue(attrs, 'data-align') || '').match(/^(center|right|justify)$/) ||
		(attrValue(attrs, 'style') || '').match(/text-align\s*:\s*(center|right|justify)/i);
	return m ? m[1].toLowerCase() : null;
};

/** A pixel size from `width="300"`, `width="300px"` or `style="width: 300px"`. */
const sizeOf = (attrs: string, name: 'width' | 'height'): string | null => {
	const attr = (attrValue(attrs, name) || '').match(/^(\d{1,4})(px)?$/);
	if (attr) return attr[1];
	const style = (attrValue(attrs, 'style') || '').match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*(\\d{1,4})px`, 'i'));
	return style ? style[1] : null;
};

const QUILL_LIST = /<ol\b[^>]*>((?:(?!<\/?ol\b)[\s\S])*?data-list=[\s\S]*?)<\/ol>/gi;
const QUILL_ITEM = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
const QUILL_CODE = /<div\b[^>]*\bql-code-block-container\b[^>]*>((?:\s*<div\b[^>]*\bql-code-block\b[^>]*>[\s\S]*?<\/div>)*)\s*<\/div>/gi;
const QUILL_CODE_LINE = /<div\b[^>]*\bql-code-block\b[^>]*>([\s\S]*?)<\/div>/gi;

/**
 * Quill 2's own markup → plain HTML. Quill keeps every list as one flat
 * `<ol>` of `<li data-list="bullet|ordered" class="ql-indent-N">`, and code
 * blocks as one `<div>` per line; this rebuilds real nested `<ul>`/`<ol>` and
 * `<pre>`, as Quill's getSemanticHTML() does.
 */
export function fromQuill(html: string): string {
	if (!/data-list=|ql-code-block|ql-ui/.test(html)) return html;
	return html
		.replace(/<span\b[^>]*\bql-ui\b[^>]*>\s*<\/span>/gi, '')
		.replace(QUILL_CODE, (_, inner: string) => {
			const lines = [...inner.matchAll(QUILL_CODE_LINE)].map(l => (/^\s*<br\s*\/?>\s*$/i.test(l[1]) ? '' : l[1]));
			return `<pre>${lines.join('\n')}</pre>`;
		})
		.replace(QUILL_LIST, (_, inner: string) => {
			const stack: string[] = [];
			let out = '';
			for (const [, attrs, body] of inner.matchAll(QUILL_ITEM)) {
				const tag = /data-list\s*=\s*["']?ordered/i.test(attrs) ? 'ol' : 'ul';
				// One level deeper at most: a jump from 0 to 3 nests once.
				const indent = Math.min(Number(((attrValue(attrs, 'class') || '').match(/\bql-indent-(\d+)\b/) || [])[1] || 0), stack.length);
				while (stack.length > indent + 1) out += `</li></${stack.pop()}>`;
				if (stack.length === indent + 1) {
					if (stack[stack.length - 1] === tag) out += '</li>';
					else {
						out += `</li></${stack.pop()}><${tag}>`;
						stack.push(tag);
					}
				} else {
					out += `<${tag}>`;
					stack.push(tag);
				}
				const align = alignOf(attrs);
				out += `<li${align ? ` class="ql-align-${align}"` : ''}>${body}`;
			}
			while (stack.length) out += `</li></${stack.pop()}>`;
			return out;
		});
}

export function sanitizeRichText(input: unknown): string {
	if (typeof input !== 'string' || !input) return '';
	const html = fromQuill(input.slice(0, 100_000).replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, ''));
	const out: string[] = [];
	const open: string[] = [];
	const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|<|[^<]+/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		const token = m[0];
		if (!m[1]) {
			out.push(escapeHtml(token));
			continue;
		}
		const raw = m[1].toLowerCase();
		const tag = ALIAS[raw] || raw;
		if (!ALLOWED.has(tag)) continue;
		if (token.startsWith('</')) {
			const at = open.lastIndexOf(tag);
			if (at === -1) continue;
			while (open.length > at) out.push(`</${open.pop()}>`);
			continue;
		}
		const attrs = m[2];
		if (tag === 'img') {
			const src = decodeEntities(attrValue(attrs, 'src') ?? '').trim();
			if (!isSafeSrc(src)) continue;
			const alt = decodeEntities(attrValue(attrs, 'alt') ?? '');
			const width = sizeOf(attrs, 'width');
			const height = sizeOf(attrs, 'height');
			out.push(
				`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''} loading="lazy" decoding="async">`
			);
			continue;
		}
		if (VOID.has(tag)) {
			out.push(`<${tag}>`);
			continue;
		}
		if (tag === 'a') {
			const href = attrValue(attrs, 'href');
			const decoded = href === null ? null : decodeEntities(href);
			const safe = decoded !== null && isSafeHref(decoded);
			const external = safe && /^https?:/i.test(decoded!);
			out.push(
				safe ? `<a href="${escapeHtml(decoded!)}"${external ? ' rel="noopener noreferrer" target="_blank"' : ''}>` : '<a>'
			);
		} else {
			const align = ALIGNABLE.has(tag) ? alignOf(attrs) : null;
			out.push(align ? `<${tag} data-align="${align}">` : `<${tag}>`);
		}
		open.push(tag);
	}
	while (open.length) out.push(`</${open.pop()}>`);
	return out.join('');
}
