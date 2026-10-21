import { validatePageFields } from '../validate';
import { EMPTY_SEO, flatFromVseo, pageToVseo, parseSchemaJson, vseoToPage } from '../seo';
import { sitemapXml } from '../../functions/siteConfig.function';

// SB-31: a page's SEO is the AGS VSeo's — these are the fields past the first six.
describe('page SEO (SB-31)', () => {
	it('accepts every field of the editor at its defaults and filled in', () => {
		expect(validatePageFields({ seo: { ...EMPTY_SEO } }).ok).toBe(true);
		const full = {
			...EMPTY_SEO,
			title: 'Study in the UK from Dhaka | AGS',
			focusKeyword: 'study in the uk',
			ogType: 'article',
			twitterCard: 'summary',
			twitterImage: 'https://cdn.example.com/x.jpg',
			noFollow: true,
			maxSnippet: 0,
			maxImagePreview: 'standard',
			schemaType: 'Service',
			schemaJson: '{ "@type": "Service", "areaServed": "BD" }',
			sitemapPriority: 0.9,
			sitemapChangeFrequency: 'monthly',
		};
		expect(validatePageFields({ seo: full }).problems).toEqual([]);
	});

	it('refuses bad values with the field named', () => {
		const r = validatePageFields({
			seo: { ogType: 'video', twitterCard: 'big', maxSnippet: -2, sitemapPriority: 2, schemaJson: '[1,2]', maxImagePreview: 'huge', noArchive: 'yes', schemaType: 'not a type' },
		});
		expect(r.problems.map(p => p.path).sort()).toEqual(
			['seo.maxImagePreview', 'seo.maxSnippet', 'seo.noArchive', 'seo.ogType', 'seo.schemaJson', 'seo.schemaType', 'seo.sitemapPriority', 'seo.twitterCard'].sort()
		);
	});

	it('reads custom JSON-LD without ever throwing', () => {
		expect(parseSchemaJson('{"a":1}')).toEqual({ a: 1 });
		expect(parseSchemaJson('{oops')).toBeNull();
		expect(parseSchemaJson('"text"')).toBeNull();
		expect(parseSchemaJson('')).toBeNull();
	});

	it('names a page in the breadcrumbs by its breadcrumb label', () => {
		const { crumbsFor } = require('../render');
		const pages = [
			{ published: { path: '/', name: 'Home' } },
			{ published: { path: '/services', name: 'Our services in Dhaka and Sylhet', seo: { breadcrumbTitle: 'Services' } } },
		];
		expect(crumbsFor('/services', pages)).toEqual([
			{ label: 'Home', path: '/' },
			{ label: 'Services', path: '/services' },
		]);
	});

	it('writes priority and change frequency into the sitemap', () => {
		const xml = sitemapXml('https://a.com', [{ path: '/', priority: 1, changeFrequency: 'weekly' }, { path: '/x', priority: 5, changeFrequency: 'often' }]);
		expect(xml).toContain('<loc>https://a.com/</loc><changefreq>weekly</changefreq><priority>1.0</priority>');
		expect(xml).toContain('<loc>https://a.com/x</loc></url>');
	});
});

// SB-32: the panel's SEO records are edited with the SEO editor (AGS VSeo shape) — the two shapes turn into each other.
describe('the panel SEO editor’s object (SB-32)', () => {
	const page = {
		...EMPTY_SEO,
		title: 'Study in the UK | AGS',
		description: 'Counselling, applications and visas.',
		image: 'https://cdn.example.com/og.jpg',
		keywords: ['uk', 'visa'],
		canonical: 'https://ags.test/',
		noIndex: true,
		ogTitle: 'Share title',
		ogType: 'article',
		twitterCard: 'summary',
		noFollow: true,
		noArchive: true,
		maxSnippet: 120,
		maxImagePreview: 'standard',
		schemaType: 'LocalBusiness',
		schemaJson: '{ "areaServed": "BD" }',
		breadcrumbTitle: 'Home',
		sitemapInclude: false,
		sitemapPriority: 0.9,
		sitemapChangeFrequency: 'daily',
	};

	it('round-trips a page’s SEO through the editor’s object', () => {
		expect(vseoToPage(pageToVseo(page))).toEqual(page);
	});

	it('reads the editor’s robots and sitemap groups', () => {
		const v = pageToVseo(page);
		expect(v.robots).toMatchObject({ index: false, follow: false, noArchive: true, maxSnippet: 120 });
		expect(v.sitemap).toEqual({ include: false, priority: 0.9, changeFrequency: 'daily' });
	});

	it('fills the record’s six plain fields from it, and falls back on bad or missing values', () => {
		expect(flatFromVseo(pageToVseo(page))).toEqual({ title: page.title, description: page.description, image: page.image, keywords: page.keywords, canonical: page.canonical, noIndex: true });
		const empty = vseoToPage({ ogType: 'video', twitterCard: 'nope', robots: { maxImagePreview: 'huge' }, ogImage: { url: 'https://cdn.example.com/a.jpg' } });
		expect(empty).toMatchObject({ ogType: '', twitterCard: '', maxImagePreview: 'large', image: 'https://cdn.example.com/a.jpg', noIndex: false, sitemapInclude: true, schemaType: 'auto' });
		expect(vseoToPage(null)).toEqual({ ...EMPTY_SEO });
	});
});
