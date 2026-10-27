import { CRAWLERS, buildRobots, robotsProblems, robotsSettings } from '../../functions/robots.function';

// docs/seo SEO-09: robots.txt built for you (with crawlers to block) or written in full, and the mistakes it checks for.
describe('robots.txt (SEO-09)', () => {
	const built = (seo: any = {}) => buildRobots(robotsSettings(seo), 'https://a.com');

	it('built: allows all, extra rules under *, a group per blocked crawler, then the sitemap', () => {
		expect(built()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://a.com/sitemap.xml\n');
		const t = built({ robots: 'Disallow: /private', robotsBlock: ['gptbot', 'claudebot', 'nope'] });
		expect(t).toBe(
			'User-agent: *\nAllow: /\n\nDisallow: /private\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nSitemap: https://a.com/sitemap.xml\n'
		);
		expect(robotsProblems(t, { indexing: true, sitemap: true })).toEqual([]);
	});

	it('built with indexing off: everything blocked, no crawler groups or sitemap; no problems reported', () => {
		const t = built({ indexing: false, robotsBlock: ['gptbot'] });
		expect(t).toBe('User-agent: *\nDisallow: /\n');
		expect(robotsProblems(t, { indexing: false, sitemap: true })).toEqual([]);
	});

	it('built with no address: no Sitemap line', () => {
		expect(buildRobots(robotsSettings({}), '')).toBe('User-agent: *\nAllow: /\n');
	});

	it('custom: exactly what was written (a final newline added), whatever the other settings say', () => {
		const file = 'User-agent: *\nDisallow: /admin\n\nSitemap: https://a.com/sitemap.xml';
		expect(built({ robotsMode: 'custom', robotsFile: file, robotsBlock: ['gptbot'], robots: 'Disallow: /x' })).toBe(`${file}\n`);
		expect(built({ robotsMode: 'custom', robotsFile: '' })).toBe('');
	});

	it('finds the usual mistakes', () => {
		const on = { indexing: true, sitemap: true };
		const msg = (t: string) => robotsProblems(t, on).map(p => p.message);
		expect(msg('User-agent: *\nDisallow: /\nSitemap: https://a.com/s.xml').some(m => /whole site/.test(m))).toBe(true);
		expect(msg('User-agent: *\nDisallow: /\nAllow: /blog\nSitemap: https://a.com/s.xml').some(m => /whole site/.test(m))).toBe(false);
		expect(msg('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://a.com/s.xml')).toEqual([expect.stringMatching(/blocks Googlebot/)]);
		expect(msg('User-agent: *\nAllow: /')).toEqual([expect.stringMatching(/No Sitemap line/)]);
		expect(msg('User-agent: *\nAllow: /\nSitemap: /sitemap.xml')).toEqual([expect.stringMatching(/full address/)]);
		const odd = robotsProblems('Disallow: /x\nUser-agent: *\nNoindex: /y\nblah\nCrawl-delay: 5\nWhatever: 1\nSitemap: https://a.com/s.xml', on);
		expect(odd.map(p => p.line)).toEqual([1, 3, 4, 6]);
		expect(msg('# only a comment')).toEqual([expect.stringMatching(/No Sitemap line/)]);
		expect(msg('Sitemap: https://a.com/s.xml\nhello')).toEqual(expect.arrayContaining([expect.stringMatching(/No User-agent line/)]));
		// A group naming several agents, one of them blocked.
		expect(msg('User-agent: Bingbot\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://a.com/s.xml')).toEqual([expect.stringMatching(/blocks Bingbot/)]);
	});

	it('names ten crawlers, search ones first', () => {
		expect(CRAWLERS.length).toBe(10);
		expect(CRAWLERS.slice(0, 2).every(c => c.kind === 'search')).toBe(true);
	});
});
