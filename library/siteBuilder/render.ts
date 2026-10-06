import crypto from 'crypto';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import Organization from '../models/tenancy/organization.model.js';
import { loadSite, siteOrigin, siteTags } from '../functions/siteConfig.function.js';
import { publicWidgets } from '../functions/widgets.function.js';
import { manifestVersion } from './manifest.js';

/**
 * What the renderer asks for (docs/site-builder D8, "Render API"):
 * GET /public/api/:slug/render?path= → one answer with everything one page
 * of the live site needs. Published copies only — drafts never leave the
 * tenant API. Runs inside the project's scope (the public router sets it).
 * SB-03 serves static pages; bindings and template pages come with SB-09.
 */

export class NotFound extends Error {}

/**
 * The renderer (mint-sites) itself: it sends `x-mint-renderer` with the shared
 * SITE_REVALIDATE_SECRET. One server draws every tenant's site, so its calls
 * skip the per-IP limit of the public API.
 */
export const isRenderer = (req: any) => {
	const secret = process.env.SITE_REVALIDATE_SECRET;
	const sent = req.headers?.['x-mint-renderer'];
	if (!secret || typeof sent !== 'string' || sent.length !== secret.length) return false;
	return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(secret));
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** '/About/' → '/About' ; '' → '/' ; drops the query and the hash. */
export const normalizePath = (raw: unknown) => {
	let p = String(raw ?? '/').split(/[?#]/)[0].trim() || '/';
	if (!p.startsWith('/')) p = `/${p}`;
	p = p.replace(/\/{2,}/g, '/');
	if (p.length > 1) p = p.replace(/\/+$/, '');
	return p.slice(0, 500);
};

/**
 * The site's tags for the page head: search-engine verification metas
 * (server-rendered, so Google sees them) and the tracker script, which loads
 * the pixels and the tenant's own code tags exactly as on a code-built site
 * (it skips what's already on the page).
 */
const headTags = (apiBase: string, project: any, doc: any) => {
	const t: any = siteTags(doc);
	const parts: string[] = [];
	if (t.googleVerification) parts.push(`<meta name="google-site-verification" content="${esc(t.googleVerification)}">`);
	if (t.bingVerification) parts.push(`<meta name="msvalidate.01" content="${esc(t.bingVerification)}">`);
	const anything = t.mintAnalytics !== false || Object.entries(t).some(([k, v]) => typeof v === 'string' && v && !['favicon', 'googleVerification', 'bingVerification'].includes(k));
	if (anything) parts.push(`<script src="${esc(apiBase)}/public/track.js" data-project="${esc(project.publicSlug)}" defer></script>`);
	return { head: parts.join('\n'), bodyStart: '', bodyEnd: '' };
};

const MENU_FIELDS = { 'published.name': 1, 'published.path': 1, 'published.menuLabel': 1, 'published.priority': 1 };

export const renderPage = async ({ project, path: raw, apiBase }: { project: any; path: unknown; apiBase: string }) => {
	if (project.type !== 'website') throw new NotFound();
	const path = normalizePath(raw);
	const doc: any = await loadSite(project, { cached: true });

	const redirect = (doc.redirects || []).find((r: any) => normalizePath(r.from) === path);
	if (redirect) return { projectId: String(project._id), redirect: { to: redirect.to, status: redirect.permanent === false ? 307 : 308 } };

	const design: any = await SiteDesign.findOne({}, { published: 1 }).lean();
	const live = design?.published;
	if (!live) throw new NotFound();

	const [page, menuPages, links, widgets]: any = await Promise.all([
		SitePage.findOne({ 'published.path': path, 'published.kind': { $ne: 'template' } }, { published: 1 }).lean(),
		SitePage.find({ 'published.showInMenu': true, 'published.kind': { $ne: 'template' } }, MENU_FIELDS).lean(),
		SitePage.find({ published: { $ne: null }, 'published.kind': { $ne: 'template' } }, { 'published.path': 1 }).lean(),
		publicWidgets(project).catch(() => ({ widgets: {} })),
	]);
	if (!page?.published) throw new NotFound();
	const pub = page.published;

	const layoutKey = pub.layout || 'default';
	const layout = layoutKey === 'none' ? null : live.layouts?.[layoutKey] || live.layouts?.default || null;
	const identity = doc.identity || {};
	const siteSeo = doc.seo || {};
	const origin = siteOrigin(project, doc);
	const name = identity.siteName || project.name;
	const seo = pub.seo || {};

	return {
		projectId: String(project._id),
		version: live.version,
		manifestVersion: manifestVersion(),
		site: {
			name,
			tagline: identity.tagline || '',
			logo: identity.logo || '',
			favicon: identity.favicon || '',
			locale: identity.locale || 'en',
			contact: doc.contact || {},
			social: doc.social || {},
			colorScheme: live.colorScheme || 'light',
			origin,
		},
		design: { theme: live.theme, tokens: live.tokens || {}, colorScheme: live.colorScheme || 'light' },
		layout: layout ? { header: layout.header || [], footer: layout.footer || [] } : null,
		page: {
			id: String(page._id),
			path: pub.path,
			name: pub.name,
			tree: pub.tree || [],
			seo: {
				title: seo.title || (pub.isHome ? siteSeo.metaTitle || name : pub.name),
				titleTemplate: siteSeo.titleTemplate || '',
				description: seo.description || siteSeo.metaDescription || '',
				image: seo.image || siteSeo.ogImage || '',
				noIndex: !!seo.noIndex || siteSeo.indexing === false,
				canonical: seo.canonical || (origin ? `${origin}${pub.path === '/' ? '' : pub.path}` : ''),
				keywords: seo.keywords?.length ? seo.keywords : siteSeo.keywords || [],
			},
		},
		data: { nodes: {}, contents: {} },
		menu: (menuPages as any[])
			.map(p => p.published)
			.sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name)))
			.map(p => ({ label: p.menuLabel || p.name, path: p.path })),
		/** page id → live path, for buttons and links that point at a page ({ type: 'page' }) */
		links: Object.fromEntries((links as any[]).map(p => [String(p._id), p.published.path])),
		tags: headTags(apiBase, project, doc),
		widgets: { enabled: Object.keys(widgets.widgets || {}), apiBase },
	};
};

/* ----------------------------------------------------- host → site */

const RESOLVE_TTL = 60_000;
const MISS_TTL = 10_000;
const resolved = new Map<string, { at: number; value: { slug: string; projectId: string } | null }>();

/** Forget cached hosts (a project's domains or slug changed). */
export const forgetResolved = () => resolved.clear();

const websiteBySlug = (slug: string) =>
	/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) ? TenantProject.findOne({ publicSlug: slug, type: 'website' }, { publicSlug: 1, organization: 1, isActive: 1 }).lean() : null;

/**
 * Which site a request's host is (GET /public/sites/resolve?host=):
 * `<publicSlug>.<SITES_ROOT_DOMAIN>`, any project's own domain, and in
 * development `<publicSlug>.localhost[:port]`. Cached a minute.
 */
export const resolveHost = async (raw: unknown) => {
	const host = String(raw || '')
		.trim()
		.toLowerCase()
		.replace(/\.$/, '');
	if (!/^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(host)) return null;
	const hit = resolved.get(host);
	if (hit && Date.now() - hit.at < (hit.value ? RESOLVE_TTL : MISS_TTL)) return hit.value;

	const hostname = host.replace(/:\d+$/, '');
	const root = String(process.env.SITES_ROOT_DOMAIN || '').toLowerCase();
	let project: any = null;
	if (root && hostname.endsWith(`.${root}`)) project = await websiteBySlug(hostname.slice(0, -root.length - 1));
	if (!project && process.env.NODE_ENV !== 'production' && hostname.endsWith('.localhost')) project = await websiteBySlug(hostname.slice(0, -'.localhost'.length));
	if (!project) project = await TenantProject.findOne({ type: 'website', domains: { $in: [host, hostname] } }, { publicSlug: 1, organization: 1, isActive: 1 }).lean();

	let value: { slug: string; projectId: string } | null = null;
	if (project && project.isActive !== false) {
		const org: any = await Organization.findById(project.organization, { isActive: 1 }).lean();
		if (org && org.isActive !== false) value = { slug: project.publicSlug, projectId: String(project._id) };
	}
	if (resolved.size > 5000) resolved.clear();
	resolved.set(host, { at: Date.now(), value });
	return value;
};
