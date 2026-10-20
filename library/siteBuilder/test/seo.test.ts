import { validatePageFields } from '../validate';
import { EMPTY_SEO, parseSchemaJson } from '../seo';
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
