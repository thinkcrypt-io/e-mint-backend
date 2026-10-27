import SitePage from '../models/siteBuilder/sitePage.model.js';
import { KIT_ROUTES, kitModel } from '../siteBuilder/kit.js';
import { fetchPage } from './siteCheck.function.js';
import { siteOrigin } from './siteConfig.function.js';

/**
 * A page's words for the SEO editor's score (docs/seo SEO-01): what the page
 * says, its first headings, and the focus keywords the site's other pages
 * already use. The score itself runs in the tenant panel's SEO editor
 * (mint-tenant VSeo, seoScore.ts); this only gathers what the editor can't see.
 *
 *   builder  a site builder page: its draft tree and its Contents
 *   live     a page built elsewhere: the site's server HTML (fetchPage — private addresses refused)
 *   none     neither: the editor scores what it has
 */

export const TEXT_KEYS = new Set(['text', 'heading', 'title', 'subtitle', 'eyebrow', 'label', 'body', 'caption', 'description', 'question', 'answer', 'quote', 'content', 'subContent', 'buttonLabel']);
// A block's `heading`; `title` too only where a page has no heading (cards and buttons have titles).
const HEADING_KEYS = { heading: new Set(['heading']), title: new Set(['title']) };

const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Not addresses, bindings or ids ("home-numbers-3").
const isWords = (s: string) => !/^(https?:|\/|#|\{\{)/.test(s) && !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s.trim());

/** The words in a tree or a record, in order, without markup. */
export const wordsIn = (v: any, out: string[], key = '', depth = 0) => {
	if (v == null || depth > 20 || out.length > 300) return;
	if (typeof v === 'string') {
		if (TEXT_KEYS.has(key) && isWords(v)) {
			const t = plain(v);
			if (t) out.push(t);
		}
		return;
	}
	if (Array.isArray(v)) v.forEach(x => wordsIn(x, out, key, depth + 1));
	else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) wordsIn(x, out, k, depth + 1);
};

/** The headings, in order. */
const headingsIn = (v: any, out: string[], keys: Set<string>, key = '', depth = 0) => {
	if (v == null || depth > 20 || out.length >= 5) return;
	if (typeof v === 'string') {
		if (keys.has(key) && isWords(v)) {
			const t = plain(v);
			if (t) out.push(t);
		}
		return;
	}
	if (Array.isArray(v)) v.forEach(x => headingsIn(x, out, keys, key, depth + 1));
	else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) headingsIn(x, out, keys, k, depth + 1);
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m));

/** A server's HTML → its <h1>s (then <h2>s) and the words in <body>. */
export const fromHtml = (html: string) => {
	const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html).replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
	const tagged = (tag: string) => [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map(m => decode(plain(m[1]))).filter(Boolean);
	const headings = [...tagged('h1'), ...tagged('h2')].slice(0, 5);
	const text = decode(plain(body.replace(/<\/(p|div|li|h[1-6]|section|article|br)>/gi, '. ')));
	return { headings, h1: tagged('h1').length, text };
};

const normalPath = (raw: unknown) => {
	let p = String(raw ?? '').trim().split(/[?#]/)[0] || '/';
	if (!p.startsWith('/')) p = `/${p}`;
	return p.length > 1 ? p.replace(/\/+$/, '') : p;
};

export type SeoPageContext = {
	path: string;
	source: 'builder' | 'live' | 'none';
	/** Why there are no words (source none, or the live page couldn't be read). */
	note?: string;
	headings: string[];
	/** How many <h1>s the live page has (live only). */
	h1?: number;
	text: string;
	/** Other pages' focus keywords. */
	keywords: { path: string; keyword: string }[];
};

/** By `path`, or by `page` (a Pages record's id — what an SEO record's form holds). */
export const seoPageContext = async (project: any, doc: any, { path: rawPath, page: pageId }: { path?: unknown; page?: unknown }): Promise<SeoPageContext> => {
	const [Pages, Seo, Contents] = await Promise.all([kitModel(KIT_ROUTES.pages), kitModel(KIT_ROUTES.seo), kitModel(KIT_ROUTES.contents)]);
	const byId: any = Pages && /^[a-f0-9]{24}$/i.test(String(pageId || '')) ? await Pages.Model.findOne({ _id: String(pageId) }, { path: 1 }).lean() : null;
	const path = normalPath(byId?.path ?? rawPath);

	// The site's other pages' focus keywords: one phrase should have one page.
	const recs: any[] = Seo ? await Seo.Model.find({ archivedAt: null, 'seo.focusKeyword': { $nin: [null, ''] } }, { page: 1, 'seo.focusKeyword': 1 }).limit(2000).lean() : [];
	const kitPages: any[] = Pages && recs.length ? await Pages.Model.find({ _id: { $in: recs.map(r => r.page) } }, { path: 1 }).lean() : [];
	const pathOf = new Map(kitPages.map(p => [String(p._id), normalPath(p.path)]));
	const keywords = recs
		.map(r => ({ path: pathOf.get(String(r.page)) || '', keyword: String(r.seo?.focusKeyword || '').trim() }))
		.filter(k => k.path && k.keyword && k.path !== path);

	const built: any = await SitePage.findOne({ path, deletedAt: null }, { 'draft.tree': 1 }).lean();
	if (built) {
		const words: string[] = [];
		const page: any = Pages ? await Pages.Model.findOne({ path, archivedAt: null }, { _id: 1 }).lean() : null;
		const rows: any[] = page && Contents ? await Contents.Model.find({ archivedAt: null, page: page._id }, { block: 1 }).sort({ order: 1 }).limit(200).lean() : [];
		const all = [built.draft?.tree || [], ...rows.map(r => r.block)];
		for (const v of all) wordsIn(v, words);
		const headingsBy = (keys: Set<string>) => {
			const out: string[] = [];
			for (const v of all) headingsIn(v, out, keys);
			return [...new Set(out)].slice(0, 5);
		};
		const headings = headingsBy(HEADING_KEYS.heading);
		return { path, source: 'builder', headings: headings.length ? headings : headingsBy(HEADING_KEYS.title), text: [...new Set(words)].join('. ').slice(0, 20000), keywords };
	}

	const origin = siteOrigin(project, doc);
	if (!origin) return { path, source: 'none', note: 'The site has no address yet, so its words can’t be read.', headings: [], text: '', keywords };
	const got = await fetchPage(`${origin}${path === '/' ? '/' : path}`);
	if (typeof got === 'string') return { path, source: 'none', note: got, headings: [], text: '', keywords };
	if (got.status !== 200) return { path, source: 'none', note: `${origin}${path} answered ${got.status}.`, headings: [], text: '', keywords };
	const { headings, h1, text } = fromHtml(got.html);
	return { path, source: 'live', headings, h1, text: text.slice(0, 20000), keywords };
};
