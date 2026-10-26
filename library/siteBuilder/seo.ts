/**
 * A page's SEO (SB-31: the AGS VSeo's fields). The first six are the ones the
 * kit's SEO record holds too; the rest live on the page only. Empty strings
 * mean "use the fallback": the meta title / description / share image for the
 * social ones, the site's defaults for those.
 */
export const EMPTY_SEO = {
	title: '',
	description: '',
	image: '',
	noIndex: false,
	canonical: '',
	keywords: [] as string[],
	focusKeyword: '',
	ogTitle: '',
	ogDescription: '',
	/** '' = website */
	ogType: '',
	ogImageAlt: '',
	/** '' = summary_large_image when there's an image */
	twitterCard: '',
	twitterTitle: '',
	twitterDescription: '',
	twitterImage: '',
	noFollow: false,
	noArchive: false,
	noImageIndex: false,
	/** -1 lets Google choose, 0 hides the snippet */
	maxSnippet: -1,
	maxImagePreview: 'large',
	/** 'auto' | 'none' | a schema.org type */
	schemaType: 'auto',
	/** a JSON object merged over the generated schema */
	schemaJson: '',
	breadcrumbTitle: '',
	sitemapInclude: true,
	sitemapPriority: 0.7,
	sitemapChangeFrequency: 'weekly',
};

export const OG_TYPES = ['website', 'article', 'book', 'profile'];
export const TWITTER_CARDS = ['summary', 'summary_large_image', 'app', 'player'];
export const IMAGE_PREVIEWS = ['none', 'standard', 'large'];
export const CHANGE_FREQUENCIES = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
export const SCHEMA_TYPES = ['auto', 'none', 'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'Article', 'BlogPosting', 'Product', 'Service', 'Organization', 'LocalBusiness', 'FAQPage', 'Event', 'Course', 'JobPosting', 'Place'];

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string';

/** Checks the SB-31 fields of a page's SEO (the first six are checked in validate.ts). */
export const validateSeoExtras = (seo: Record<string, any>, add: (path: string, message: string) => void, isUrl: (v: unknown) => boolean) => {
	const text = (k: string, max: number, label: string) => {
		if (seo[k] !== undefined && !(str(seo[k]) && seo[k].length <= max)) add(`seo.${k}`, `${label} is at most ${max} characters`);
	};
	const oneOf = (k: string, list: string[], label: string) => {
		if (seo[k] !== undefined && !(seo[k] === '' || list.includes(seo[k]))) add(`seo.${k}`, `${label} is one of ${list.join(', ')}`);
	};
	const bool = (k: string) => {
		if (seo[k] !== undefined && typeof seo[k] !== 'boolean') add(`seo.${k}`, `${k} is true or false`);
	};
	text('focusKeyword', 100, 'The focus keyword');
	text('ogTitle', 200, 'The Open Graph title');
	text('ogDescription', 500, 'The Open Graph description');
	text('ogImageAlt', 200, 'The image alt text');
	text('twitterTitle', 200, 'The Twitter title');
	text('twitterDescription', 500, 'The Twitter description');
	text('breadcrumbTitle', 80, 'The breadcrumb label');
	oneOf('ogType', OG_TYPES, 'The Open Graph type');
	oneOf('twitterCard', TWITTER_CARDS, 'The Twitter card');
	oneOf('maxImagePreview', IMAGE_PREVIEWS, 'Max image preview');
	oneOf('sitemapChangeFrequency', CHANGE_FREQUENCIES, 'The change frequency');
	if (seo.schemaType !== undefined && !(str(seo.schemaType) && (SCHEMA_TYPES.includes(seo.schemaType) || /^[A-Z][A-Za-z]{1,40}$/.test(seo.schemaType))))
		add('seo.schemaType', 'The schema type is auto, none or a schema.org type like WebPage');
	if (seo.twitterImage !== undefined && !(seo.twitterImage === '' || isUrl(seo.twitterImage))) add('seo.twitterImage', 'The Twitter image is an image address');
	for (const k of ['noFollow', 'noArchive', 'noImageIndex', 'sitemapInclude']) bool(k);
	if (seo.maxSnippet !== undefined && !(Number.isInteger(seo.maxSnippet) && seo.maxSnippet >= -1 && seo.maxSnippet <= 10000)) add('seo.maxSnippet', 'Max snippet length is -1 or a whole number of characters');
	if (seo.sitemapPriority !== undefined && !(typeof seo.sitemapPriority === 'number' && seo.sitemapPriority >= 0 && seo.sitemapPriority <= 1)) add('seo.sitemapPriority', 'The sitemap priority is between 0 and 1');
	if (seo.schemaJson !== undefined) {
		if (!str(seo.schemaJson) || seo.schemaJson.length > 20000) add('seo.schemaJson', 'Custom JSON-LD is at most 20,000 characters');
		else if (seo.schemaJson.trim()) {
			let ok = false;
			try {
				ok = isObj(JSON.parse(seo.schemaJson));
			} catch {
				ok = false;
			}
			if (!ok) add('seo.schemaJson', 'Custom JSON-LD must be one JSON object, like { "@type": "Service" }');
		}
	}
};

/** Custom JSON-LD as an object, or null when it's empty or not valid — never throws. */
export const parseSchemaJson = (raw: unknown) => {
	if (typeof raw !== 'string' || !raw.trim()) return null;
	try {
		const v = JSON.parse(raw);
		return isObj(v) ? v : null;
	} catch {
		return null;
	}
};

/* ------------------------------------------------ the panel's SEO editor */

/**
 * The panel's SEO editor (the AGS VSeo, field kind `seo`) keeps one object
 * shaped the AGS way — metaTitle, ogImage, robots { index, follow… },
 * sitemap { include… }. The kit's SEO records (SB-32) hold it as `seo`, beside
 * the six plain fields the site, public API and templates read. These two turn
 * one shape into the other; empty values stay empty (= use the fallback).
 */
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const imageUrl = (v: any) => (typeof v === 'string' ? v : s(v?.url));

/** A VSeo object as a page's SEO (EMPTY_SEO's keys). */
export const vseoToPage = (v: any) => {
	const o = isObj(v) ? v : {};
	const robots = isObj(o.robots) ? o.robots : {};
	const map = isObj(o.sitemap) ? o.sitemap : {};
	return {
		title: s(o.metaTitle),
		description: s(o.metaDescription),
		image: imageUrl(o.ogImage),
		keywords: Array.isArray(o.keywords) ? o.keywords.filter(str) : [],
		canonical: s(o.canonicalUrl),
		noIndex: robots.index === false,
		focusKeyword: s(o.focusKeyword),
		ogTitle: s(o.ogTitle),
		ogDescription: s(o.ogDescription),
		ogType: OG_TYPES.includes(o.ogType) ? o.ogType : '',
		ogImageAlt: s(o.ogImageAlt),
		twitterCard: TWITTER_CARDS.includes(o.twitterCard) ? o.twitterCard : '',
		twitterTitle: s(o.twitterTitle),
		twitterDescription: s(o.twitterDescription),
		twitterImage: imageUrl(o.twitterImage),
		noFollow: robots.follow === false,
		noArchive: robots.noArchive === true,
		noImageIndex: robots.noImageIndex === true,
		maxSnippet: Number.isInteger(robots.maxSnippet) ? robots.maxSnippet : EMPTY_SEO.maxSnippet,
		maxImagePreview: IMAGE_PREVIEWS.includes(robots.maxImagePreview) ? robots.maxImagePreview : EMPTY_SEO.maxImagePreview,
		schemaType: s(o.schemaType) || EMPTY_SEO.schemaType,
		schemaJson: s(o.schemaJson),
		breadcrumbTitle: s(o.breadcrumbTitle),
		sitemapInclude: map.include !== false,
		sitemapPriority: typeof map.priority === 'number' ? map.priority : EMPTY_SEO.sitemapPriority,
		sitemapChangeFrequency: CHANGE_FREQUENCIES.includes(map.changeFrequency) ? map.changeFrequency : EMPTY_SEO.sitemapChangeFrequency,
	};
};

/** A page's SEO as a VSeo object, for the panel's editor. */
export const pageToVseo = (p: any) => {
	const seo = { ...EMPTY_SEO, ...(isObj(p) ? p : {}) };
	return {
		metaTitle: s(seo.title),
		metaDescription: s(seo.description),
		focusKeyword: s(seo.focusKeyword),
		canonicalUrl: s(seo.canonical),
		keywords: Array.isArray(seo.keywords) ? seo.keywords : [],
		ogTitle: s(seo.ogTitle),
		ogDescription: s(seo.ogDescription),
		ogType: s(seo.ogType),
		ogImage: s(seo.image),
		ogImageAlt: s(seo.ogImageAlt),
		twitterCard: s(seo.twitterCard),
		twitterTitle: s(seo.twitterTitle),
		twitterDescription: s(seo.twitterDescription),
		twitterImage: s(seo.twitterImage),
		robots: {
			index: !seo.noIndex,
			follow: !seo.noFollow,
			noArchive: !!seo.noArchive,
			noImageIndex: !!seo.noImageIndex,
			maxSnippet: seo.maxSnippet,
			maxImagePreview: seo.maxImagePreview,
		},
		schemaType: s(seo.schemaType) || 'auto',
		schemaJson: s(seo.schemaJson),
		breadcrumbTitle: s(seo.breadcrumbTitle),
		sitemap: { include: seo.sitemapInclude !== false, priority: seo.sitemapPriority, changeFrequency: seo.sitemapChangeFrequency },
	};
};

/** The record's six plain fields, from its VSeo object (what a panel save writes through). */
export const flatFromVseo = (v: any) => {
	const p = vseoToPage(v);
	return { title: p.title, description: p.description, image: p.image, keywords: p.keywords, canonical: p.canonical, noIndex: p.noIndex };
};

/**
 * The kit's SEO model's fields (SB-32): the SEO editor's object (`seo`) is what
 * the panel edits; the six plain fields are filled from it on every save
 * (dynamicModels kitSeoHooks) for the site, the public API and templates.
 */
export const PAGE_SEO_FIELDS = () => [
	{ key: 'page', label: 'Page', kind: 'reference', ref: 'WebPage', required: true },
	{ key: 'seo', label: 'SEO', kind: 'seo' },
	{ key: 'title', label: 'Title', kind: 'text', max: 120, searchable: true, helper: 'From the SEO editor’s meta title' },
	{ key: 'description', label: 'Description', kind: 'textarea', max: 320, helper: 'From the SEO editor’s meta description' },
	{ key: 'image', label: 'Share image', kind: 'image', helper: 'From the SEO editor’s share image' },
	{ key: 'keywords', label: 'Keywords', kind: 'tags' },
	{ key: 'tags', label: 'Tags', kind: 'tags' },
	{ key: 'canonical', label: 'Canonical URL', kind: 'url' },
	{ key: 'noIndex', label: 'Hide from search engines', kind: 'boolean', default: false },
];

export const PAGE_SEO_FORM = () => [
	{ sectionTitle: 'Page', fields: ['page'] },
	{ sectionTitle: 'SEO', fields: ['seo'] },
	{ sectionTitle: 'Tags', fields: ['tags'] },
];

/* ------------------------------------------- the site's Default SEO (SB-33) */

/**
 * Site setup → SEO's Default SEO is the same editor (SB-33). Its meta title,
 * description, share image and keywords stay where they were (`seo.metaTitle`…);
 * the rest of the editor's object is `seo.defaults`, normalised here (the AGS
 * shape, without those four).
 */
export const siteSeoDefaults = (v: any) => {
	const { metaTitle, metaDescription, ogImage, keywords, ...rest } = pageToVseo(vseoToPage(v));
	return rest;
};

/** Copy for one page — the site's only stands in on the home page, or every page would share it. */
const HOME_ONLY = ['ogTitle', 'ogDescription', 'twitterTitle', 'twitterDescription', 'focusKeyword', 'breadcrumbTitle', 'schemaJson'] as const;
/** How every page behaves unless it says otherwise. */
const ALL_PAGES_TEXT = ['ogType', 'twitterCard', 'twitterImage'] as const;
const ALL_PAGES_FLAGS = ['noFollow', 'noArchive', 'noImageIndex'] as const;

/**
 * A page's SEO past the first six (EMPTY_SEO's keys), with the site's Default
 * SEO under it: what the page sets wins; else the site's — settings for every
 * page, copy for the home page only. `ownImage` = the page has its own share
 * image (the site's image alt text only fits the site's image).
 */
export const withSiteDefaults = (page: Record<string, any>, siteDefaults: any, { isHome, ownImage }: { isHome: boolean; ownImage: boolean }) => {
	const p: any = { ...EMPTY_SEO, ...(isObj(page) ? page : {}) };
	if (!isObj(siteDefaults) || !Object.keys(siteDefaults).length) return p;
	const s: any = vseoToPage(siteDefaults);
	for (const k of ALL_PAGES_TEXT) if (!p[k]) p[k] = s[k];
	for (const k of ALL_PAGES_FLAGS) p[k] = !!p[k] || !!s[k];
	if (!p.ogImageAlt && !ownImage) p.ogImageAlt = s.ogImageAlt;
	if (p.maxSnippet === EMPTY_SEO.maxSnippet) p.maxSnippet = s.maxSnippet;
	if (p.maxImagePreview === EMPTY_SEO.maxImagePreview) p.maxImagePreview = s.maxImagePreview;
	if (p.sitemapPriority === EMPTY_SEO.sitemapPriority) p.sitemapPriority = s.sitemapPriority;
	if (p.sitemapChangeFrequency === EMPTY_SEO.sitemapChangeFrequency) p.sitemapChangeFrequency = s.sitemapChangeFrequency;
	if (isHome) {
		for (const k of HOME_ONLY) if (!p[k]) p[k] = s[k];
		if (!p.schemaType || p.schemaType === 'auto') p.schemaType = s.schemaType;
		if (!p.canonical) p.canonical = s.canonical;
	}
	return p;
};

/** Problems with the Default SEO's editor fields, for the Site setup save (the page checks, SB-31). */
export const siteDefaultsProblems = (v: any) => {
	const problems: string[] = [];
	validateSeoExtras(vseoToPage(v), (_path, message) => problems.push(message), (u: unknown) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u));
	return problems;
};
