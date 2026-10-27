/**
 * The site's robots.txt (docs/seo SEO-09): built for you from Site setup → SEO
 * (indexing, extra rules, crawlers to block, the sitemap line), or the whole
 * file as written. `robotsProblems` checks either for the usual mistakes; the
 * panel shows both through POST /site-config/robots-preview.
 *
 * No imports: siteConfig.function.ts builds the served file with this.
 */

export type RobotsMode = 'built' | 'custom';
export type RobotsSettings = {
	indexing: boolean;
	sitemap: boolean;
	/** Extra rules added after the defaults (built mode). */
	robots: string;
	robotsMode: RobotsMode;
	/** The whole file (custom mode), served exactly. */
	robotsFile: string;
	/** Crawlers to block, by id (CRAWLERS). */
	robotsBlock: string[];
};
export type RobotsProblem = { level: 'error' | 'warning'; message: string; line?: number };

/** The crawlers with a switch, by id: the name they go by in robots.txt, and what they're for. */
export const CRAWLERS = [
	{ id: 'googlebot', agent: 'Googlebot', owner: 'Google', kind: 'search', about: 'Google Search' },
	{ id: 'bingbot', agent: 'Bingbot', owner: 'Microsoft', kind: 'search', about: 'Bing, and the search behind Copilot and DuckDuckGo' },
	{ id: 'google-extended', agent: 'Google-Extended', owner: 'Google', kind: 'ai', about: 'Training Gemini; doesn’t affect Google Search' },
	{ id: 'gptbot', agent: 'GPTBot', owner: 'OpenAI', kind: 'ai', about: 'Training OpenAI’s models' },
	{ id: 'chatgpt-user', agent: 'ChatGPT-User', owner: 'OpenAI', kind: 'ai', about: 'ChatGPT opening a page when someone asks it to' },
	{ id: 'claudebot', agent: 'ClaudeBot', owner: 'Anthropic', kind: 'ai', about: 'Training Anthropic’s models' },
	{ id: 'perplexitybot', agent: 'PerplexityBot', owner: 'Perplexity', kind: 'ai', about: 'Perplexity’s answer engine' },
	{ id: 'ccbot', agent: 'CCBot', owner: 'Common Crawl', kind: 'ai', about: 'An open web archive many AI models are trained on' },
	{ id: 'bytespider', agent: 'Bytespider', owner: 'ByteDance', kind: 'ai', about: 'Training ByteDance’s models (TikTok’s owner)' },
	{ id: 'applebot-extended', agent: 'Applebot-Extended', owner: 'Apple', kind: 'ai', about: 'Training Apple’s models; doesn’t affect Siri or Spotlight' },
] as const;
export const CRAWLER_IDS: string[] = CRAWLERS.map(c => c.id);

/** The settings as stored, with their defaults. */
export const robotsSettings = (seo: any): RobotsSettings => ({
	indexing: seo?.indexing !== false,
	sitemap: seo?.sitemap !== false,
	robots: typeof seo?.robots === 'string' ? seo.robots : '',
	robotsMode: seo?.robotsMode === 'custom' ? 'custom' : 'built',
	robotsFile: typeof seo?.robotsFile === 'string' ? seo.robotsFile : '',
	robotsBlock: Array.isArray(seo?.robotsBlock) ? seo.robotsBlock.filter((id: any) => CRAWLER_IDS.includes(id)) : [],
});

/** The file the site serves. `origin` names the sitemap (none: no Sitemap line). */
export const buildRobots = (s: RobotsSettings, origin: string) => {
	if (s.robotsMode === 'custom') return s.robotsFile.endsWith('\n') || !s.robotsFile ? s.robotsFile : `${s.robotsFile}\n`;
	const lines = ['User-agent: *', s.indexing ? 'Allow: /' : 'Disallow: /'];
	// Extra rules stay right under the * group they were written for; each blocked crawler gets its own group after.
	if (s.robots.trim()) lines.push('', s.robots.trim());
	if (s.indexing)
		for (const c of CRAWLERS.filter(x => s.robotsBlock.includes(x.id))) lines.push('', `User-agent: ${c.agent}`, 'Disallow: /');
	if (s.indexing && s.sitemap && origin) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
	return `${lines.join('\n')}\n`;
};

const FIELDS = ['user-agent', 'allow', 'disallow', 'sitemap', 'crawl-delay', 'host', 'clean-param'];

/** Common mistakes in a robots.txt: the whole site blocked, a crawler that matters blocked, no sitemap line, lines that aren't rules. */
export const robotsProblems = (text: string, { indexing, sitemap }: { indexing: boolean; sitemap: boolean }): RobotsProblem[] => {
	const out: RobotsProblem[] = [];
	// The groups: user agents and their rules.
	const groups: { agents: string[]; rules: { field: string; value: string }[] }[] = [];
	let group: (typeof groups)[number] | null = null;
	let lastWasAgent = false;
	let sitemaps = 0;
	text.split(/\r?\n/).forEach((raw, i) => {
		const line = raw.replace(/#.*$/, '').trim();
		if (!line) return;
		const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
		const n = i + 1;
		if (!m) {
			out.push({ level: 'warning', line: n, message: `Line ${n} isn’t a rule (they look like “Disallow: /private”), so crawlers skip it` });
			return;
		}
		const field = m[1].toLowerCase();
		const value = m[2].trim();
		if (field === 'noindex') {
			out.push({ level: 'warning', line: n, message: `Line ${n}: search engines ignore Noindex in robots.txt. Hide pages from search in their SEO instead` });
			return;
		}
		if (!FIELDS.includes(field)) {
			out.push({ level: 'warning', line: n, message: `Line ${n}: “${m[1]}” isn’t something crawlers understand` });
			return;
		}
		if (field === 'sitemap') {
			sitemaps++;
			if (!/^https?:\/\/\S+$/.test(value)) out.push({ level: 'warning', line: n, message: `Line ${n}: a Sitemap line needs a full address, like https://example.com/sitemap.xml` });
			return;
		}
		if (field === 'user-agent') {
			if (!group || !lastWasAgent) groups.push((group = { agents: [], rules: [] }));
			group.agents.push(value.toLowerCase());
			lastWasAgent = true;
			return;
		}
		lastWasAgent = false;
		if (!group) {
			out.push({ level: 'warning', line: n, message: `Line ${n} comes before any User-agent line, so it applies to no one` });
			return;
		}
		group.rules.push({ field, value });
	});

	// Blocked: a group whose only effect is Disallow: / (no Allow to let anything back in).
	const blocks = (g: (typeof groups)[number]) => g.rules.some(r => r.field === 'disallow' && r.value === '/') && !g.rules.some(r => r.field === 'allow' && r.value && r.value !== '');
	const groupFor = (agent: string) => groups.find(g => g.agents.includes(agent)) || groups.find(g => g.agents.includes('*'));
	if (indexing) {
		const all = groups.find(g => g.agents.includes('*'));
		if (all && blocks(all)) out.push({ level: 'error', message: 'It blocks the whole site for every search engine (User-agent: * with Disallow: /)' });
		for (const c of CRAWLERS.filter(x => x.kind === 'search')) {
			const g = groupFor(c.agent.toLowerCase());
			if (g && blocks(g) && !g.agents.includes('*')) out.push({ level: 'warning', message: `It blocks ${c.agent}, so the site drops out of ${c.about}` });
		}
		if (sitemap && !sitemaps) out.push({ level: 'warning', message: 'No Sitemap line: add one so search engines find every page' });
	}
	if (!groups.length && text.split(/\r?\n/).some(l => l.replace(/#.*$/, '').trim())) out.push({ level: 'warning', message: 'No User-agent line: crawlers treat the file as allowing everything' });
	return out;
};
