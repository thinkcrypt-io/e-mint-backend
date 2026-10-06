import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import SiteRelease from '../models/siteBuilder/siteRelease.model.js';
import { projectHooks } from '../functions/projectHooks.function.js';
import { loadSite } from '../functions/siteConfig.function.js';
import { runInScope, runUnscoped } from '../functions/tenantScope.function.js';
import { DEFAULT_THEME, presetTree } from './manifest.js';
import { treeIds, validateDesign, validateTree, type Problem } from './validate.js';
import { dataProblems } from './resolve.js';

/**
 * A website project's builder site (docs/site-builder SB-03): what a new one
 * starts with, how pages and the design are shown to the editor, and what
 * Publish would change. Every function here runs inside the project's scope.
 */

/** What blocks show from Website settings (name, logo, contact, social) — the editor's canvas gets it with the pages (SB-08). */
export const siteInfo = async (project: any) => {
	const doc: any = await loadSite(project, { cached: true });
	const identity = doc.identity || {};
	return { name: identity.siteName || project.name, tagline: identity.tagline || '', logo: identity.logo || '', contact: doc.contact || {}, social: doc.social || {} };
};

export const EMPTY_SEO = { title: '', description: '', image: '', noIndex: false, canonical: '', keywords: [] as string[] };

/** A new site: the Studio theme, a header and footer, and a home page with a hero. */
const starterDesign = () => ({
	theme: DEFAULT_THEME,
	tokens: {},
	colorScheme: 'light',
	layouts: { default: { header: presetTree('header-simple'), footer: presetTree('footer-simple') } },
	sections: {},
	rev: 1,
});

/**
 * Makes sure the project has a design and a home page — for new website
 * projects (projectHooks) and, the first time the editor opens, for ones made
 * before the builder existed. Safe to call twice at once.
 */
export const ensureSite = async () => {
	const design: any = await SiteDesign.findOne({}).lean();
	if (!design) {
		try {
			await SiteDesign.create({ draft: starterDesign() });
		} catch (e: any) {
			if (e?.code !== 11000) throw e;
		}
	}
	const pages = await SitePage.countDocuments({ deletedAt: null });
	if (!pages) {
		try {
			await SitePage.create({ name: 'Home', path: '/', isHome: true, draft: { tree: presetTree('hero-centered'), seo: { ...EMPTY_SEO }, rev: 1 } });
		} catch (e: any) {
			if (e?.code !== 11000) throw e;
		}
	}
};

projectHooks.onCreated(async (_req: any, project: any) => {
	if (project.type !== 'website') return;
	await runInScope({ organization: project.organization, project: project._id }, ensureSite);
});

// The project's documents are gone by now, apart from these shared collections.
projectHooks.onRemoved(async (projectId: any) => {
	await runUnscoped(async () => {
		await SitePage.deleteMany({ project: projectId });
		await SiteDesign.deleteMany({ project: projectId });
		await SiteRelease.deleteMany({ project: projectId });
	});
});

/* ------------------------------------------------------------ views */

/** Changed since the last Publish (an unpublished page never counts). */
export const pageChanged = (p: any) => p.status !== 'unpublished' && (!p.published || p.published.rev !== p.draft?.rev);

export const pageSummary = (p: any) => ({
	id: String(p._id),
	name: p.name,
	path: p.path,
	kind: p.kind || 'static',
	status: p.status,
	isHome: !!p.isHome,
	showInMenu: !!p.showInMenu,
	menuLabel: p.menuLabel || '',
	priority: p.priority || 0,
	layout: p.layout || 'default',
	changed: pageChanged(p),
	rev: p.draft?.rev || 1,
	updatedAt: p.draft?.updatedAt || p.updatedAt,
	publishedAt: p.published?.publishedAt || null,
});

export const pageView = (p: any) => ({
	...pageSummary(p),
	source: p.source || null,
	draft: { tree: p.draft?.tree || [], seo: { ...EMPTY_SEO, ...(p.draft?.seo || {}) }, rev: p.draft?.rev || 1, updatedAt: p.draft?.updatedAt || null },
	published: p.published
		? { tree: p.published.tree, seo: p.published.seo, path: p.published.path, version: p.published.version, publishedAt: p.published.publishedAt }
		: null,
});

export const designView = (d: any) => {
	const { _id, organization, project, __v, ...rest } = d || {};
	return {
		draft: rest.draft,
		published: rest.published ? { version: rest.published.version, publishedAt: rest.published.publishedAt, theme: rest.published.theme } : null,
		changed: !rest.published || rest.published.rev !== rest.draft?.rev,
	};
};

/** The saved sections (section-ref blocks) a tree places, by id. */
export const sectionRefs = (tree: unknown, out = new Set<string>()): Set<string> => {
	if (!Array.isArray(tree)) return out;
	for (const n of tree) {
		if (!n || typeof n !== 'object') continue;
		if (n.type === 'section-ref' && typeof n.props?.section === 'string' && n.props.section) out.add(n.props.section);
		sectionRefs(n.children, out);
		if (n.slots && typeof n.slots === 'object') Object.values(n.slots).forEach(s => sectionRefs(s, out));
	}
	return out;
};

/** Where each saved section is used: page drafts and layouts (the editor warns before changing a shared one). */
export const sectionUsage = (design: any, pages: any[]) => {
	const usage: Record<string, { pages: { id: string; name: string }[]; layouts: string[] }> = {};
	const at = (id: string) => (usage[id] ||= { pages: [], layouts: [] });
	for (const p of pages) for (const id of sectionRefs(p.draft?.tree)) at(id).pages.push({ id: String(p._id), name: p.name });
	for (const [key, l] of Object.entries<any>(design?.draft?.layouts || {}))
		for (const id of sectionRefs([...(l?.header || []), ...(l?.footer || [])])) at(id).layouts.push(key);
	return usage;
};

export const livePages = () => SitePage.find({ deletedAt: null }).sort({ isHome: -1, priority: -1, name: 1 }).lean();

/* ---------------------------------------------------------- checking */

export type SiteProblem = Problem & { page?: string; pageName?: string; part: 'page' | 'design' };

/** Every problem in the site's drafts: each live page against its layout, and the design. */
export const siteProblems = async (pages?: any[], design?: any): Promise<SiteProblem[]> => {
	pages = pages || (await livePages());
	design = design || (await SiteDesign.findOne({}).lean());
	const pageIds = new Set(pages.map(p => String(p._id)));
	const draft = design?.draft || {};
	const out: SiteProblem[] = validateDesign(draft, { pageIds }).problems.map(p => ({ ...p, part: 'design' as const }));
	for (const p of pages) {
		if (p.status === 'unpublished') continue;
		const layout = p.layout === 'none' ? null : draft.layouts?.[p.layout || 'default'];
		if (p.layout && p.layout !== 'none' && !layout)
			out.push({ level: 'publish', path: 'layout', message: `The layout “${p.layout}” doesn’t exist any more`, page: String(p._id), pageName: p.name, part: 'page' });
		const externalIds = layout ? treeIds(layout.header, treeIds(layout.footer)) : undefined;
		const r = validateTree(p.draft?.tree, { pageIds, externalIds, sectionIds: new Set(Object.keys(draft.sections || {})) });
		out.push(...r.problems.map(x => ({ ...x, page: String(p._id), pageName: p.name, part: 'page' as const })));
	}
	// Lists and template pages: their models must be readable by the site (SB-09).
	out.push(...((await dataProblems(pages, design)) as SiteProblem[]));
	return out;
};

/** What Publish would change (GET /changes). */
export const siteChanges = async () => {
	const [pages, design, removed, last] = await Promise.all([
		livePages(),
		SiteDesign.findOne({}).lean(),
		SitePage.find({ deletedAt: { $ne: null }, published: { $ne: null } }, { name: 1, published: 1 }).lean(),
		SiteRelease.findOne({}, { version: 1, publishedAt: 1 }).sort({ version: -1 }).lean(),
	]);
	const short = (p: any) => ({ id: String(p._id), name: p.name, path: p.path });
	const problems = await siteProblems(pages, design);
	const changes = {
		added: pages.filter((p: any) => p.status !== 'unpublished' && !p.published).map(short),
		changed: pages.filter((p: any) => p.published && pageChanged(p)).map(short),
		removed: (removed as any[]).map(p => ({ id: String(p._id), name: p.name, path: p.published.path })),
		unpublished: pages.filter((p: any) => p.status === 'unpublished').map(short),
	};
	const designChanged = !(design as any)?.published || (design as any).published.rev !== (design as any).draft?.rev;
	return {
		pages: changes,
		design: designChanged,
		any: designChanged || !!(changes.added.length || changes.changed.length || changes.removed.length),
		problems,
		canPublish: !problems.some(p => p.level !== 'warning'),
		live: last ? { version: (last as any).version, publishedAt: (last as any).publishedAt } : null,
	};
};
