import { siteOrigin } from './siteConfig.function.js';

/**
 * The site's SEO problems across its pages (docs/seo SEO-03): what only shows
 * when the pages are looked at together — the same title or focus keyword on
 * two pages, a hidden page in the menu, a canonical pointing nowhere — and the
 * gaps on each page. Website → SEO's health card shows them; SEO-02's table and
 * SEO-19's MCP tool are meant to reuse this (docs/seo WORK_ORDERS, shared code).
 *
 * Reads the kit's Pages and SEO records (each record's six plain fields, filled
 * from its SEO editor on save, else the editor's own object) and Site setup.
 * Only published pages count.
 */

export type SeoIssueLevel = 'error' | 'warning' | 'notice';
export type SeoIssuePage = { path: string; name: string; page: string; seo?: string; detail?: string };
export type SeoIssueGroup = { key: string; level: SeoIssueLevel; label: string; advice: string; pages: SeoIssuePage[] };
export type SeoHealth = { checked: number; counts: Record<SeoIssueLevel, number>; groups: SeoIssueGroup[] };

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const plainPath = (raw: string) => {
	const p = (raw.split(/[?#]/)[0] || '/').replace(/\/(index\.html?)?$/, '') || '/';
	return p.replace(/\.html?$/, '') || '/';
};
/** A template page (one page per record: /blog/[slug]) or a title filled per record — not compared with others. */
const isTemplate = (path: string, title: string) => /\[|\{\{/.test(path) || /\{\{/.test(title);

/** One page's SEO as the site shows it. */
const seoOf = (rec: any) => {
	const v = rec?.seo && typeof rec.seo === 'object' ? rec.seo : {};
	return {
		title: str(rec?.title) || str(v.metaTitle),
		description: str(rec?.description) || str(v.metaDescription),
		image: str(typeof rec?.image === 'string' ? rec.image : rec?.image?.url) || str(v.ogImage),
		noIndex: rec?.noIndex === true || v.robots?.index === false,
		canonical: str(rec?.canonical) || str(v.canonicalUrl),
		keyword: str(v.focusKeyword),
	};
};

export const seoIssues = ({ project, doc, pages, records }: { project: any; doc: any; pages: any[]; records: any[] }): SeoHealth => {
	const live = pages.filter(p => p.status === 'published' && str(p.path));
	const byPage = new Map(records.map(r => [String(r.page?._id || r.page), r]));
	const rows = live.map(p => {
		const rec = byPage.get(String(p._id));
		return { p, rec, seo: rec ? seoOf(rec) : null, ref: { path: str(p.path), name: str(p.name) || str(p.path), page: String(p._id), ...(rec && { seo: String(rec._id) }) } };
	});
	const withSeo = rows.filter(r => r.seo) as (typeof rows[number] & { seo: ReturnType<typeof seoOf> })[];
	const siteImage = !!str(doc?.seo?.ogImage);
	const groups: SeoIssueGroup[] = [];
	const add = (key: string, level: SeoIssueLevel, label: string, advice: string, pages: SeoIssuePage[]) => {
		if (pages.length || key === 'site-hidden') groups.push({ key, level, label, advice, pages });
	};

	// Pages sharing one value: each set listed together, the value as the detail.
	const sameAs = (pick: (r: (typeof withSeo)[number]) => string) => {
		const sets = new Map<string, (typeof withSeo)[number][]>();
		for (const r of withSeo) {
			const v = pick(r);
			if (!v || isTemplate(r.ref.path, r.seo.title)) continue;
			sets.set(norm(v), [...(sets.get(norm(v)) || []), r]);
		}
		return [...sets.values()].filter(s => s.length > 1).flatMap(s => s.map(r => ({ ...r.ref, detail: pick(r) })));
	};

	if (doc?.seo?.indexing === false)
		add('site-hidden', 'error', 'The whole site is hidden from search engines', 'Site setup → SEO → Indexing is off, so no page can be found. Turn it on when the site is ready.', []);

	// A canonical on the site's own domain that isn't one of its published pages.
	const origin = siteOrigin(project, doc);
	const hosts = new Set([origin, ...(doc?.domains || []), ...(project?.domains || [])].filter(Boolean).map((h: string) => h.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase()));
	const paths = new Set(live.map(p => plainPath(str(p.path))));
	add(
		'canonical-nowhere',
		'error',
		'Canonical URL points to a page that isn’t on the site',
		'Search engines follow the canonical and drop this page. Point it at a published page, or clear it if the page isn’t a copy of another.',
		withSeo
			.filter(r => {
				if (!r.seo.canonical) return false;
				try {
					const u = new URL(r.seo.canonical);
					return hosts.has(u.host.replace(/^www\./, '').toLowerCase()) && !paths.has(plainPath(u.pathname));
				} catch {
					return true;
				}
			})
			.map(r => ({ ...r.ref, detail: r.seo.canonical }))
	);
	add(
		'hidden-in-menu',
		'warning',
		'Hidden from search engines, but in the menu',
		'Visitors can reach these from every page, yet search engines are told to skip them. Allow indexing, or take them out of the menu.',
		withSeo.filter(r => r.seo.noIndex && r.p.showInMenu).map(r => r.ref)
	);
	add('same-title', 'warning', 'Pages with the same title', 'Search engines can’t tell them apart and may show the wrong one. Give each page its own title.', sameAs(r => r.seo.title));
	add('same-description', 'warning', 'Pages with the same description', 'Write one for each page that says what that page offers.', sameAs(r => r.seo.description));
	add('same-keyword', 'warning', 'Pages with the same focus keyword', 'Two pages after one phrase both rank lower. Give each page its own phrase.', sameAs(r => r.seo.keyword));
	add('no-title', 'warning', 'No title of their own', 'These show the page’s name in search results. Write a title of 30–60 characters.', withSeo.filter(r => !r.seo.title).map(r => r.ref));
	add('no-description', 'warning', 'No description', 'Search engines pick a sentence from the page instead. Write 70–160 characters about what a visitor gets.', withSeo.filter(r => !r.seo.description).map(r => r.ref));
	add(
		'long-title',
		'notice',
		`Titles over ${TITLE_MAX} characters`,
		'The end gets cut off in search results. Put what matters first.',
		withSeo.filter(r => r.seo.title.length > TITLE_MAX && !isTemplate(r.ref.path, r.seo.title)).map(r => ({ ...r.ref, detail: `${r.seo.title.length} characters` }))
	);
	add(
		'long-description',
		'notice',
		`Descriptions over ${DESCRIPTION_MAX} characters`,
		'Google shows about 160 characters.',
		withSeo.filter(r => r.seo.description.length > DESCRIPTION_MAX && !isTemplate(r.ref.path, r.seo.title)).map(r => ({ ...r.ref, detail: `${r.seo.description.length} characters` }))
	);
	add(
		'no-image',
		siteImage ? 'notice' : 'warning',
		siteImage ? 'Shared with the site’s image' : 'No share image',
		siteImage
			? 'Links to these pages show the site’s image. A picture of the page itself gets more clicks.'
			: 'Links to these pages on Facebook, WhatsApp and X show no picture. Add one to each page, or a default in Site setup → SEO.',
		withSeo.filter(r => !r.seo.image).map(r => r.ref)
	);
	add('hidden', 'notice', 'Hidden from search engines', 'Check these are meant to be hidden: they can’t be found in search.', withSeo.filter(r => r.seo.noIndex && !r.p.showInMenu).map(r => r.ref));
	add('no-seo', 'notice', 'Published pages with no SEO here', 'These keep the SEO they have on your site. Add them on Website → SEO to set it here.', rows.filter(r => !r.seo).map(r => r.ref));

	const order: Record<SeoIssueLevel, number> = { error: 0, warning: 1, notice: 2 };
	groups.sort((a, b) => order[a.level] - order[b.level]);
	const counts = { error: 0, warning: 0, notice: 0 };
	for (const g of groups) counts[g.level] += 1;
	return { checked: live.length, counts, groups };
};
