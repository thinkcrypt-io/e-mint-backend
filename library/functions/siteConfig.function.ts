import Joi from 'joi';

/**
 * A website project's configuration (docs/multi-tenancy WO-34): what a site
 * needs besides its contents — tracking tags, code for <head> and <body>,
 * search-engine settings, redirects and response headers. Kept on the
 * project (`TenantProject.site`), not in a built model, so the model builder
 * can't break it; edited on the panel's Site setup page or by the MCP.
 *
 * The site reads it from the site API: `/site` (all of it), `/site/tags`
 * (what /public/track.js injects, so tags change with no deploy),
 * `/site/robots.txt` and `/site/sitemap.xml`.
 */

const id = (pattern: RegExp, example: string) =>
	Joi.string()
		.trim()
		.allow('')
		.pattern(pattern)
		.messages({ 'string.pattern.base': `{#label} looks like ${example}` });

const code = Joi.string().allow('').max(20000);
const path = Joi.string()
	.trim()
	.max(500)
	.pattern(/^\/[^\s]*$/)
	.messages({ 'string.pattern.base': '{#label} starts with / (e.g. /old-page)' });
const target = Joi.string()
	.trim()
	.max(1000)
	.pattern(/^(\/[^\s]*|https?:\/\/[^\s]+)$/)
	.messages({ 'string.pattern.base': '{#label} is a path (/new-page) or a full URL' });

export const SITE_CONFIG = Joi.object({
	tracking: Joi.object({
		mintAnalytics: Joi.boolean(),
		ga4: id(/^G-[A-Z0-9]{4,15}$/, 'G-XXXXXXXXXX').label('Google Analytics ID'),
		gtm: id(/^GTM-[A-Z0-9]{4,12}$/, 'GTM-XXXXXXX').label('Tag Manager ID'),
		googleAds: id(/^AW-\d{6,15}$/, 'AW-123456789').label('Google Ads ID'),
		metaPixel: id(/^\d{6,20}$/, '1234567890123456').label('Meta Pixel ID'),
		tiktokPixel: id(/^[A-Z0-9]{10,30}$/, 'C1234567890ABCDEFGHI').label('TikTok Pixel ID'),
		linkedinPartner: id(/^\d{3,12}$/, '1234567').label('LinkedIn Partner ID'),
		clarity: id(/^[a-z0-9]{6,20}$/, 'abcd1234ef').label('Clarity project ID'),
		hotjar: id(/^\d{5,10}$/, '1234567').label('Hotjar site ID'),
	}),
	code: Joi.object({
		head: code.label('Head code'),
		bodyStart: code.label('Body start code'),
		bodyEnd: code.label('Body end code'),
	}),
	seo: Joi.object({
		indexing: Joi.boolean(),
		sitemap: Joi.boolean(),
		robots: Joi.string().allow('').max(5000).label('Extra robots.txt rules'),
		canonicalDomain: Joi.string()
			.trim()
			.lowercase()
			.allow('')
			.max(253)
			.pattern(/^([a-z0-9-]+\.)+[a-z]{2,}$/)
			.messages({ 'string.pattern.base': 'The main domain looks like example.com' }),
		googleVerification: Joi.string().trim().allow('').max(200).label('Google verification'),
		bingVerification: Joi.string().trim().allow('').max(200).label('Bing verification'),
	}),
	redirects: Joi.array()
		.max(200)
		.items(
			Joi.object({
				from: path.required().label('From'),
				to: target.required().label('To'),
				permanent: Joi.boolean().default(true),
			})
		),
	headers: Joi.array()
		.max(30)
		.items(
			Joi.object({
				source: path.default('/(.*)').label('Path'),
				name: Joi.string()
					.trim()
					.max(80)
					.pattern(/^[A-Za-z0-9-]+$/)
					.required()
					.messages({ 'string.pattern.base': 'A header name has letters, digits and dashes' })
					.label('Header'),
				value: Joi.string()
					.trim()
					.max(2000)
					.pattern(/^[^\r\n]*$/)
					.required()
					.label('Value'),
			})
		),
});

export type SiteConfig = {
	tracking: Record<string, any>;
	code: { head: string; bodyStart: string; bodyEnd: string };
	seo: { indexing: boolean; sitemap: boolean; robots: string; canonicalDomain: string; googleVerification: string; bingVerification: string };
	redirects: { from: string; to: string; permanent: boolean }[];
	headers: { source: string; name: string; value: string }[];
};

const TRACKERS = ['ga4', 'gtm', 'googleAds', 'metaPixel', 'tiktokPixel', 'linkedinPartner', 'clarity', 'hotjar'];

/** The project's configuration with every default filled in. */
export const siteConfigOf = (project: any): SiteConfig => {
	const s = project?.site || {};
	return {
		tracking: { mintAnalytics: s.tracking?.mintAnalytics !== false, ...Object.fromEntries(TRACKERS.map(k => [k, s.tracking?.[k] || ''])) },
		code: { head: s.code?.head || '', bodyStart: s.code?.bodyStart || '', bodyEnd: s.code?.bodyEnd || '' },
		seo: {
			indexing: s.seo?.indexing !== false,
			sitemap: s.seo?.sitemap !== false,
			robots: s.seo?.robots || '',
			canonicalDomain: s.seo?.canonicalDomain || '',
			googleVerification: s.seo?.googleVerification || '',
			bingVerification: s.seo?.bingVerification || '',
		},
		redirects: Array.isArray(s.redirects) ? s.redirects : [],
		headers: Array.isArray(s.headers) ? s.headers : [],
	};
};

/**
 * A change merged over what's saved: each section sent replaces only the keys
 * it names (lists are replaced whole). Throws the first problem as a message.
 */
export const mergeSiteConfig = (project: any, patch: any): SiteConfig => {
	const { value, error } = SITE_CONFIG.validate(patch || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw Object.assign(new Error(error.details[0].message.replace(/"/g, '')), { status: 400 });
	const current = siteConfigOf(project);
	return {
		tracking: { ...current.tracking, ...(value.tracking || {}) },
		code: { ...current.code, ...(value.code || {}) },
		seo: { ...current.seo, ...(value.seo || {}) },
		redirects: value.redirects ?? current.redirects,
		headers: value.headers ?? current.headers,
	};
};

/** The site's address for absolute URLs: the main domain, else the first domain. */
export const siteOrigin = (project: any, config = siteConfigOf(project)) => {
	const domain = config.seo.canonicalDomain || (project.domains || []).find((d: string) => !d.startsWith('localhost')) || '';
	return domain ? `https://${domain}` : '';
};

export const robotsTxt = (project: any) => {
	const config = siteConfigOf(project);
	const origin = siteOrigin(project, config);
	const lines = ['User-agent: *', config.seo.indexing ? 'Allow: /' : 'Disallow: /'];
	if (config.seo.robots.trim()) lines.push('', config.seo.robots.trim());
	if (config.seo.indexing && config.seo.sitemap && origin) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
	return `${lines.join('\n')}\n`;
};

const xml = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

/** Published pages (not hidden from search) as a sitemap; `origin` is the site's address. */
export const sitemapXml = (origin: string, pages: { path: string; updatedAt?: any }[]) =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
		.map(
			p =>
				`  <url><loc>${xml(`${origin}${p.path === '/' ? '/' : p.path}`)}</loc>${p.updatedAt ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
		)
		.join('\n')}\n</urlset>\n`;

/** What the tracker injects on the site: the tags and the custom code. */
export const siteTags = (project: any) => {
	const c = siteConfigOf(project);
	return {
		...c.tracking,
		head: c.code.head,
		bodyStart: c.code.bodyStart,
		bodyEnd: c.code.bodyEnd,
		googleVerification: c.seo.googleVerification,
		bingVerification: c.seo.bingVerification,
		noindex: !c.seo.indexing,
	};
};

/** How much of the setup is done — for the website overview. */
export const setupChecklist = (project: any, settings: any, pages: { total: number; published: number; withSeo: number }) => {
	const c = siteConfigOf(project);
	return [
		{ key: 'name', label: 'Site name', done: !!settings?.siteName },
		{ key: 'logo', label: 'Logo', done: !!settings?.logo },
		{ key: 'favicon', label: 'Favicon', done: !!settings?.favicon },
		{ key: 'seo', label: 'Default SEO', done: !!(settings?.metaTitle && settings?.metaDescription) },
		{ key: 'pages', label: 'A published page', done: pages.published > 0 },
		{ key: 'page-seo', label: 'SEO on every published page', done: pages.published > 0 && pages.withSeo >= pages.published },
		{ key: 'domain', label: 'Domain', done: (project.domains || []).length > 0 },
		{ key: 'tracking', label: 'Tracking', done: c.tracking.mintAnalytics || TRACKERS.some(k => c.tracking[k]) },
	];
};
