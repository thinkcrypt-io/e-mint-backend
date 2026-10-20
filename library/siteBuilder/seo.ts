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
