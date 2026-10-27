import { EMPTY_SEO, vseoToPage, withSiteDefaults } from '../siteBuilder/seo.js';
import { siteOrigin } from './siteConfig.function.js';

/**
 * The head answer (docs/site-connect SC-02, D3): one page's SEO, by its
 * address, for a website built anywhere — track.js `data-seo` applies it in
 * the browser, a site's own server prints it (`format=html`).
 *
 * The page is the kit's Pages record at that path (published); its SEO is the
 * kit's SEO record for it, with Site setup → SEO under it the way the builder's
 * renderer does it (render.ts, mint-sites metadata.ts). Every tag says where it
 * came from: `set` = this page's own SEO (replaces what the page has), `fill` =
 * a site default or a guess (only used where the page has none of its own, D4).
 * A path with no SEO record here answers `found: false` and no tags: the page
 * keeps its own SEO (the user's rule — Mint only takes over pages added to SEO).
 */

export type HeadMode = 'set' | 'fill';
export type HeadTag =
	| { tag: 'title'; content: string; mode: HeadMode }
	| { tag: 'meta'; name?: string; property?: string; content: string; mode: HeadMode }
	| { tag: 'link'; rel: 'canonical'; content: string; mode: HeadMode };

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const OG_TYPES = new Set(['website', 'article', 'book', 'profile']);

/** /about/, /about.html, /about/index.html → the addresses a page may be saved under. */
export const pathCandidates = (raw: unknown) => {
	let p = str(raw).split(/[?#]/)[0] || '/';
	try {
		p = decodeURI(p);
	} catch {
		/* keep it as sent */
	}
	if (!p.startsWith('/')) p = '/' + p;
	p = p.replace(/\/{2,}/g, '/');
	const out = new Set<string>([p]);
	const bare = p.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '');
	out.add(bare);
	const trimmed = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
	out.add(trimmed || '/');
	if (trimmed !== '/') out.add(trimmed + '/');
	return { path: trimmed || '/', candidates: [...out].slice(0, 6) };
};

const absolute = (url: string, origin: string) => {
	if (!url) return '';
	if (/^https?:\/\//i.test(url)) return url;
	return origin && url.startsWith('/') ? origin + url : '';
};

/** The kit SEO record as a page's SEO: its editor object, with the plain six where the editor left them empty. */
const recordSeo = (rec: any) => {
	if (!isObj(rec)) return { ...EMPTY_SEO };
	const p: any = { ...EMPTY_SEO, ...(isObj(rec.seo) ? vseoToPage(rec.seo) : {}) };
	if (!p.title) p.title = str(rec.title);
	if (!p.description) p.description = str(rec.description);
	if (!p.image) p.image = typeof rec.image === 'string' ? rec.image : str(rec.image?.url);
	if (!p.canonical) p.canonical = str(rec.canonical);
	if (!p.keywords?.length && Array.isArray(rec.keywords)) p.keywords = rec.keywords.filter((k: unknown) => typeof k === 'string');
	if (rec.noIndex === true) p.noIndex = true;
	return p;
};

const customSchema = (raw: string) => {
	if (!raw?.trim()) return null;
	try {
		const v = JSON.parse(raw);
		return isObj(v) ? v : null;
	} catch {
		return null;
	}
};
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));

type Models = { pages?: any; seo?: any };

export const siteHead = async (project: any, doc: any, models: Models, rawPath: unknown) => {
	const { path, candidates } = pathCandidates(rawPath);
	const isHome = path === '/';
	const page: any = models.pages ? await models.pages.findOne({ path: { $in: candidates }, status: 'published' }).lean() : null;
	const rec: any = page && models.seo ? await models.seo.findOne({ page: page._id }).lean() : null;
	// Only a page added to Website → SEO is Mint's; any other keeps the SEO it has (user, 2026-10-27).
	if (!rec) return { path, found: false, page: page ? { name: str(page.name), path: page.path } : null, seo: null, tags: [] as HeadTag[], jsonLd: [] as Record<string, unknown>[] };
	const own: any = recordSeo(rec);

	const siteSeo = doc?.seo || {};
	const identity = doc?.identity || {};
	const origin = siteOrigin(project, doc);
	const siteName = str(identity.siteName) || str(project?.name);
	const x: any = withSiteDefaults(own, siteSeo.defaults, { isHome, ownImage: !!own.image });

	const tags: HeadTag[] = [];
	const add = (t: HeadTag) => {
		if (t.content) tags.push(t);
	};
	const meta = (key: string, content: string, mode: HeadMode, attr: 'name' | 'property' = 'name') =>
		add(attr === 'name' ? { tag: 'meta', name: key, content, mode } : { tag: 'meta', property: key, content, mode });

	// Title: the page's own, the home page's default title, else the page's name (a guess) — with the template off the home page.
	const template = str(siteSeo.titleTemplate).includes('%s') ? str(siteSeo.titleTemplate) : '';
	const titled = (t: string) => (!isHome && template ? template.replace('%s', t) : t);
	const [rawTitle, titleMode]: [string, HeadMode] = own.title
		? [own.title, 'set']
		: isHome && str(siteSeo.metaTitle)
			? [str(siteSeo.metaTitle), 'set']
			: page?.name
				? [str(page.name), 'fill']
				: isHome
					? [siteName, 'fill']
					: ['', 'fill'];
	const title = rawTitle ? titled(rawTitle) : '';
	add({ tag: 'title', content: title, mode: titleMode });

	const [description, descMode]: [string, HeadMode] = own.description
		? [own.description, 'set']
		: isHome && str(siteSeo.metaDescription)
			? [str(siteSeo.metaDescription), 'set']
			: [str(siteSeo.metaDescription), 'fill'];
	meta('description', description, descMode);

	const keywords: string[] = own.keywords?.length ? own.keywords : Array.isArray(siteSeo.keywords) ? siteSeo.keywords : [];
	meta('keywords', keywords.join(', '), own.keywords?.length ? 'set' : 'fill');

	const canonical = own.canonical || (isHome && x.canonical) || (origin ? origin + (isHome ? '' : path) : '');
	add({ tag: 'link', rel: 'canonical', content: canonical, mode: own.canonical ? 'set' : 'fill' });

	// robots — only when something is set; the default (index, follow) needs no tag.
	const noIndex = !!own.noIndex || siteSeo.indexing === false;
	const noFollow = !!x.noFollow;
	const custom = noIndex || noFollow || x.noArchive || x.noImageIndex || x.maxSnippet !== EMPTY_SEO.maxSnippet || x.maxImagePreview !== EMPTY_SEO.maxImagePreview;
	if (custom) {
		const robots = [
			noIndex ? 'noindex' : 'index',
			noFollow || noIndex ? 'nofollow' : 'follow',
			x.noArchive && 'noarchive',
			x.noImageIndex && 'noimageindex',
			`max-snippet:${x.maxSnippet ?? -1}`,
			`max-image-preview:${x.maxImagePreview || 'large'}`,
		].filter(Boolean);
		meta('robots', robots.join(', '), 'set');
	}

	// Open Graph and Twitter — the page's own wins; else what the title / description / image above are.
	const image = absolute(own.image, origin) || absolute(str(siteSeo.ogImage), origin);
	const imageMode: HeadMode = own.image ? 'set' : 'fill';
	const ogTitle = x.ogTitle || title;
	const ogDescription = x.ogDescription || description;
	meta('og:title', ogTitle, x.ogTitle ? 'set' : titleMode, 'property');
	meta('og:description', ogDescription, x.ogDescription ? 'set' : descMode, 'property');
	meta('og:type', OG_TYPES.has(x.ogType) ? x.ogType : 'website', x.ogType ? 'set' : 'fill', 'property');
	meta('og:url', canonical, own.canonical ? 'set' : 'fill', 'property');
	meta('og:site_name', siteName, 'fill', 'property');
	meta('og:locale', str(identity.locale), 'fill', 'property');
	meta('og:image', image, imageMode, 'property');
	if (image) meta('og:image:alt', x.ogImageAlt || ogTitle, x.ogImageAlt ? 'set' : 'fill', 'property');
	const twitterImage = absolute(x.twitterImage, origin) || image;
	meta('twitter:card', x.twitterCard || (twitterImage ? 'summary_large_image' : 'summary'), x.twitterCard ? 'set' : 'fill');
	meta('twitter:title', x.twitterTitle || ogTitle, x.twitterTitle ? 'set' : titleMode);
	meta('twitter:description', x.twitterDescription || ogDescription, x.twitterDescription ? 'set' : descMode);
	meta('twitter:image', twitterImage, x.twitterImage ? 'set' : imageMode);

	// Structured data, as the builder's renderer writes it (JsonLd.tsx): the page's schema, and on the home page the site.
	const jsonLd: Record<string, unknown>[] = [];
	const type = x.schemaType || 'auto';
	if (page && type !== 'none') {
		const generated = clean({
			'@context': 'https://schema.org',
			'@type': type === 'auto' ? 'WebPage' : type,
			name: title,
			description,
			url: canonical,
			image,
			...(origin && { isPartOf: { '@id': `${origin}/#website` } }),
		});
		jsonLd.push({ ...generated, ...(customSchema(x.schemaJson) || {}) });
	}
	if (isHome && origin) {
		const social = doc?.social || {};
		const sameAs = Object.values(social).filter(v => typeof v === 'string' && /^https?:\/\//.test(v));
		jsonLd.push(clean({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${origin}/#website`, name: siteName, url: origin }));
		jsonLd.push(clean({ '@context': 'https://schema.org', '@type': 'Organization', '@id': `${origin}/#organization`, name: siteName, url: origin, logo: absolute(str(identity.logo), origin), sameAs }));
	}

	return {
		path,
		/** this page is added to SEO here (else the answer is empty and the page keeps its own) */
		found: true,
		page: page ? { name: str(page.name), path: page.path } : null,
		/** everything resolved, for a server that builds its own head (Next.js generateMetadata) */
		seo: {
			title,
			description,
			keywords,
			canonical,
			image,
			noIndex,
			noFollow,
			ogTitle,
			ogDescription,
			ogType: OG_TYPES.has(x.ogType) ? x.ogType : 'website',
			ogImageAlt: image ? x.ogImageAlt || ogTitle : '',
			twitterCard: x.twitterCard || (twitterImage ? 'summary_large_image' : 'summary'),
			twitterTitle: x.twitterTitle || ogTitle,
			twitterDescription: x.twitterDescription || ogDescription,
			twitterImage,
			siteName,
		},
		tags,
		jsonLd,
	};
};

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The answer as `<head>` tags, for a server to print (PHP include, Express) — every tag, own and default. */
export const headHtml = (head: Awaited<ReturnType<typeof siteHead>>) => {
	const lines = head.tags.map(t => {
		if (t.tag === 'title') return `<title>${esc(t.content)}</title>`;
		if (t.tag === 'link') return `<link rel="canonical" href="${esc(t.content)}">`;
		return t.name ? `<meta name="${esc(t.name)}" content="${esc(t.content)}">` : `<meta property="${esc(t.property!)}" content="${esc(t.content)}">`;
	});
	// `<` escaped, so nothing in the JSON can close the script tag.
	for (const s of head.jsonLd) lines.push(`<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`);
	return lines.length ? lines.join('\n') + '\n' : '';
};
