import crypto from 'crypto';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import Organization from '../models/tenancy/organization.model.js';
import { codeOf, loadSite, siteOrigin, siteTags } from '../functions/siteConfig.function.js';
import { EMPTY_SEO, withSiteDefaults } from './seo.js';
import { publicWidgets } from '../functions/widgets.function.js';
import { manifestVersion } from './manifest.js';
import { sectionRefs } from './site.js';
import { findTemplateRecord, resolveCollections, templatePattern } from './resolve.js';
import { resolveContents } from './kit.js';
import { asText, interpolate, type Scope } from './bind.js';
import { loadShop } from '../functions/shop.function.js';
import { mediaFor } from '../functions/mediaDetails.function.js';

/**
 * What the renderer asks for (docs/site-builder D8, "Render API"):
 * GET /public/api/:slug/render?path= (the renderer only, by its secret header) → one answer with everything one page
 * of the live site needs. Published copies only — drafts never leave the
 * tenant API. Runs inside the project's scope (the public router sets it).
 * Static pages by path first, then template pages (`/blog/[slug]`) whose
 * record exists; `data` holds what the page's bindings need (SB-09).
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
 * The site's tags. Structured for the renderer — search-engine verification
 * (rendered as metadata, so Google sees it server-side) and the tracker
 * script, which loads the pixels — and the same as HTML in `head` for
 * anything that just prints it. `code` is the tenant's own scripts (Site setup
 * → Add script, SB-30): the renderer prints them into the page's HTML and
 * tells the tracker (`noCode`, its `data-no-code`) not to add them again.
 */
const headTags = (apiBase: string, project: any, doc: any) => {
	const t: any = siteTags(doc);
	const verification = { google: t.googleVerification || '', bing: t.bingVerification || '' };
	const code = codeOf(doc);
	const anything =
		t.mintAnalytics !== false || Object.entries(t).some(([k, v]) => typeof v === 'string' && v && !['favicon', 'googleVerification', 'bingVerification', 'head', 'bodyStart', 'bodyEnd', 'visitorIp'].includes(k));
	// The project key names the project to track.js (docs/api-builder D14).
	const tracker = anything ? { src: `${apiBase}/public/track.js`, key: project.apiKey || '', noCode: true } : null;
	const parts: string[] = [];
	if (verification.google) parts.push(`<meta name="google-site-verification" content="${esc(verification.google)}">`);
	if (verification.bing) parts.push(`<meta name="msvalidate.01" content="${esc(verification.bing)}">`);
	if (tracker) parts.push(`<script src="${esc(tracker.src)}" data-key="${esc(tracker.key)}" data-no-code defer></script>`);
	if (code.head) parts.push(code.head);
	return { head: parts.join('\n'), bodyStart: code.bodyStart, bodyEnd: code.bodyEnd, verification, tracker, code };
};

/** The pages above `path` that exist, home first, this page last (the breadcrumbs block). */
export const crumbsFor = (path: string, pages: { published?: { path: string; name: string; seo?: { breadcrumbTitle?: string } } }[]) => {
	// A page's own breadcrumb label (SEO → Structured data, SB-31) wins over its name.
	const byPath = new Map(pages.filter(p => p.published).map(p => [p.published!.path, p.published!.seo?.breadcrumbTitle?.trim() || p.published!.name]));
	const parts = path.split('/').filter(Boolean);
	const paths = ['/', ...parts.map((_, i) => `/${parts.slice(0, i + 1).join('/')}`)];
	return paths.filter(p => byPath.has(p)).map(p => ({ label: byPath.get(p)!, path: p }));
};

const MENU_FIELDS = { 'published.name': 1, 'published.path': 1, 'published.menuLabel': 1, 'published.priority': 1 };

const PAGE_FIELDS = { published: 1 };

/** A template page whose path matches and whose record exists, with that record. */
const templateMatch = async (path: string) => {
	const templates: any[] = await SitePage.find({ 'published.kind': 'template' }, PAGE_FIELDS).sort({ 'published.priority': -1, _id: 1 }).lean();
	for (const t of templates) {
		const pattern = templatePattern(t.published.path);
		const m = pattern?.regex.exec(path);
		if (!m) continue;
		let value = m[1];
		try {
			value = decodeURIComponent(value);
		} catch {
			continue;
		}
		const record = await findTemplateRecord(t.published.source, value);
		if (record) return { page: t, record };
	}
	return null;
};

/** The SEO a template page shows: its text with {{record.…}} filled in. */
const fillSeo = (seo: any, scope: Scope) =>
	Object.fromEntries(Object.entries<any>(seo || {}).map(([k, v]) => [k, typeof v === 'string' ? interpolate(v, scope) : Array.isArray(v) ? v.map(x => (typeof x === 'string' ? interpolate(x, scope) : x)) : v]));

export const renderPage = async ({ project, path: raw, apiBase, query = {} }: { project: any; path: unknown; apiBase: string; query?: { page?: unknown } }) => {
	if (project.type !== 'website') throw new NotFound();
	const path = normalizePath(raw);
	const doc: any = await loadSite(project, { cached: true });

	const redirect = (doc.redirects || []).find((r: any) => normalizePath(r.from) === path);
	if (redirect) return { projectId: String(project._id), redirect: { to: redirect.to, status: redirect.permanent === false ? 307 : 308 } };

	const design: any = await SiteDesign.findOne({}, { published: 1 }).lean();
	const live = design?.published;
	if (!live) throw new NotFound();

	const [page, menuPages, links, widgets]: any = await Promise.all([
		SitePage.findOne({ 'published.path': path, 'published.kind': { $ne: 'template' } }, PAGE_FIELDS).lean(),
		SitePage.find({ 'published.showInMenu': true, 'published.kind': { $ne: 'template' } }, MENU_FIELDS).lean(),
		SitePage.find({ published: { $ne: null }, 'published.kind': { $ne: 'template' } }, { 'published.path': 1, 'published.name': 1, 'published.seo.breadcrumbTitle': 1 }).lean(),
		publicWidgets(project).catch(() => ({ widgets: {} })),
	]);
	let found = page?.published ? { page, record: null as any } : null;
	if (!found && path !== '/') found = await templateMatch(path);
	if (!found) throw new NotFound();
	const pub = found.page.published;
	const record = found.record;

	const layoutKey = pub.layout || 'default';
	const layout = layoutKey === 'none' ? null : live.layouts?.[layoutKey] || live.layouts?.default || null;
	const identity = doc.identity || {};
	const siteSeo = doc.seo || {};
	const origin = siteOrigin(project, doc);
	const name = identity.siteName || project.name;
	// Only the saved sections this page and its layout place.
	const used = sectionRefs([...(pub.tree || []), ...(layout?.header || []), ...(layout?.footer || [])]);
	const sections = Object.fromEntries([...used].filter(id => Object.prototype.hasOwnProperty.call(live.sections || {}, id)).map(id => [id, live.sections[id]]));

	// The data the bindings need: collections' records, the Contents records they name, the page's record.
	const trees = [pub.tree || [], layout?.header || [], layout?.footer || [], ...Object.values<any>(sections).map(x => x?.tree || [])];
	const [nodes, contents, shop] = await Promise.all([
		resolveCollections(trees, { page: Number(query.page) || 1 }),
		resolveContents(trees),
		loadShop(project).catch(() => null),
	]);
	const currency = shop?.currency || '';
	const scope: Scope = { record, site: { name: identity.siteName || project.name, tagline: identity.tagline || '', ...(doc.contact || {}) }, content: contents, currency, locale: identity.locale || 'en' };
	const seo: any = record ? fillSeo(pub.seo, scope) : pub.seo || {};
	// Site setup's Default SEO under the page's own (SB-33): settings for every page, copy for the home page.
	const extras: any = withSiteDefaults(seo, siteSeo.defaults, { isHome: !!pub.isHome && !record, ownImage: !!seo.image });
	// The library's alt text and focal points for the pictures it draws (docs/cms D12, CMS-13).
	const media = await mediaFor({ trees, nodes, contents, record, logo: identity.logo }).catch(() => ({}));

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
		design: { theme: live.theme, tokens: live.tokens || {}, colorScheme: live.colorScheme || 'light', sections },
		layout: layout ? { header: layout.header || [], footer: layout.footer || [] } : null,
		page: {
			id: String(found.page._id),
			// a template page answers at the visitor's path (/blog/hello), not its pattern
			path: record ? path : pub.path,
			kind: pub.kind || 'static',
			name: pub.name,
			tree: pub.tree || [],
			seo: {
				title: seo.title || (pub.isHome ? siteSeo.metaTitle || name : record ? asText(record.title ?? record.name) || pub.name : pub.name),
				titleTemplate: siteSeo.titleTemplate || '',
				description: seo.description || siteSeo.metaDescription || '',
				image: seo.image || siteSeo.ogImage || '',
				noIndex: !!seo.noIndex || siteSeo.indexing === false,
				canonical: seo.canonical || (pub.isHome && extras.canonical) || (origin ? `${origin}${path === '/' ? '' : path}` : ''),
				keywords: seo.keywords?.length ? seo.keywords : siteSeo.keywords || [],
				// The rest of the page's SEO (SB-31), over Site setup's Default SEO (SB-33); empty strings fall back in the renderer.
				...Object.fromEntries(Object.keys(EMPTY_SEO).filter(k => !['title', 'description', 'image', 'noIndex', 'canonical', 'keywords'].includes(k)).map(k => [k, extras[k] ?? (EMPTY_SEO as any)[k]])),
			},
		},
		data: { nodes, contents, ...(record && { record }), currency },
		/** url → { alt, focal } for library pictures on the page that have them */
		media,
		menu: (menuPages as any[])
			.map(p => p.published)
			.sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name)))
			.map(p => ({ label: p.menuLabel || p.name, path: p.path })),
		crumbs: crumbsFor(record ? path : pub.path, links as any[]),
		/** page id → live path, for buttons and links that point at a page ({ type: 'page' }) */
		links: Object.fromEntries((links as any[]).map(p => [String(p._id), p.published.path])),
		tags: headTags(apiBase, project, doc),
		widgets: { enabled: Object.keys(widgets.widgets || {}), apiBase, key: project.apiKey || '' },
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
