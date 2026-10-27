import { PART_SIZE, extraPaths, indexXml, sitemapResponse, urlsetXml } from '../../functions/sitemap.function';

// docs/seo SEO-08: the sitemap's XML, its numbered parts past PART_SIZE, and Site setup's extra addresses.
describe('sitemap (SEO-08)', () => {
	const many = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `/blog/post-${String(i).padStart(6, '0')}`, updatedAt: new Date(Date.UTC(2026, 0, 1 + (i % 300))) }));

	it('writes the date, priority, change frequency and image of each address, escaped', () => {
		const xml = urlsetXml('https://a.com', [
			{ path: '/', priority: 1, changeFrequency: 'weekly', image: '/logo.png' },
			{ path: '/blog/a%26b', updatedAt: '2026-10-27T10:00:00Z', image: 'https://cdn.x.com/a.jpg?w=1&h=2' },
			{ path: '/x', priority: 5, changeFrequency: 'often', updatedAt: 'not a date' },
		]);
		expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
		expect(xml).toContain('<loc>https://a.com/</loc><changefreq>weekly</changefreq><priority>1.0</priority><image:image><image:loc>https://a.com/logo.png</image:loc></image:image>');
		expect(xml).toContain('<lastmod>2026-10-27</lastmod><image:image><image:loc>https://cdn.x.com/a.jpg?w=1&amp;h=2</image:loc>');
		expect(xml).toContain('<loc>https://a.com/x</loc></url>');
	});

	it('answers one sitemap up to PART_SIZE addresses, part 1 being the same', () => {
		const entries = many(PART_SIZE);
		const all = sitemapResponse('https://a.com', entries);
		expect(all).toContain('<urlset');
		expect(all?.match(/<url>/g)?.length).toBe(PART_SIZE);
		expect(sitemapResponse('https://a.com', entries, '1')).toBe(all);
		expect(sitemapResponse('https://a.com', entries, '2')).toBeNull();
	});

	it('past PART_SIZE: an index of numbered parts, each with its newest date', () => {
		const entries = many(PART_SIZE * 2 + 1);
		const index = sitemapResponse('https://a.com', entries) || '';
		expect(index).toContain('<sitemapindex');
		expect(index.match(/<sitemap>/g)?.length).toBe(3);
		expect(index).toContain('<loc>https://a.com/sitemap.xml?part=3</loc>');
		expect(index).toBe(indexXml('https://a.com', entries));
		expect(index).toMatch(/part=1<\/loc><lastmod>2026-10-27<\/lastmod>/);
		expect(sitemapResponse('https://a.com', entries, '2')?.match(/<url>/g)?.length).toBe(PART_SIZE);
		expect(sitemapResponse('https://a.com', entries, 3)?.match(/<url>/g)?.length).toBe(1);
		expect(sitemapResponse('https://a.com', entries, '4')).toBeNull();
		expect(sitemapResponse('https://a.com', entries, '0')).toBeNull();
		expect(sitemapResponse('https://a.com', entries, 'x')).toBeNull();
	});

	it('an empty site still answers part 1', () => {
		expect(sitemapResponse('https://a.com', [], '1')).toContain('<urlset');
	});

	it('keeps extra addresses on the site: paths, and full addresses on its own domain (www or not)', () => {
		expect(extraPaths(['/old', ' /old ', 'https://www.a.com/x?y=1', 'https://a.com/z', 'https://other.com/no', '//evil.com/x', 'nope', '', 42], 'https://a.com')).toEqual([
			'/old',
			'/x?y=1',
			'/z',
		]);
		expect(extraPaths(undefined, 'https://a.com')).toEqual([]);
	});
});
