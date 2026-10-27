import SitePage from '../models/siteBuilder/sitePage.model.js';
import { compiledModel } from './dynamicModels.function.js';
import { publicDefs } from './publicRecords.function.js';
import { siteReach } from './apiEndpoints.function.js';
import { liveFind } from './drafts.function.js';
import { publicProblem, templatePattern } from '../siteBuilder/resolve.js';
import { interpolate } from '../siteBuilder/bind.js';
import { withSiteDefaults } from '../siteBuilder/seo.js';

/**
 * The site's sitemap (docs/seo SEO-08): what `GET /site/sitemap.xml` lists.
 *
 * - Published pages not hidden from search: the kit's Pages, and the site
 *   builder's static pages (their own priority and change frequency, SB-31).
 * - Every record a template page shows (`/blog/[slug]` → `/blog/my-post`): the
 *   records the site may read (the model's public API, published only), each
 *   with its updated date. A record hidden from search stays out.
 * - Site setup's extra addresses (pages Mint doesn't know).
 * - Each address's main image as an image entry.
 *
 * Over PART_SIZE addresses it's a sitemap index of numbered parts
 * (`/sitemap.xml?part=2`).
 */

export type SitemapEntry = { path: string; updatedAt?: any; priority?: number; changeFrequency?: string; image?: string };

export const PART_SIZE = 5000;
/** Records read per template page, and addresses in all — enough for any site here, small enough to answer fast. */
const MAX_ITEMS = 50000;
const MAX_URLS = 100000;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** An image field's value as a URL: a string, `{ url }`, or the first of a list. */
const imageOf = (v: any): string => (Array.isArray(v) ? imageOf(v[0]) : typeof v === 'string' ? v.trim() : str(v?.url));
const isTemplatePath = (path: string) => /\[|\{\{/.test(path);

/** A record hidden from search by its own SEO: a `noIndex` switch, or an SEO editor's object saying so. */
const recordHidden = (rec: any) => rec?.noIndex === true || rec?.seo?.noIndex === true || rec?.seo?.robots?.index === false;

/** Site setup's extra addresses as paths on this site: '/old-page', or a full address on the site's own domain. */
export const extraPaths = (lines: unknown, origin: string): string[] => {
	const host = (() => {
		try {
			return new URL(origin).host.replace(/^www\./, '');
		} catch {
			return '';
		}
	})();
	const out = new Set<string>();
	for (const raw of Array.isArray(lines) ? lines : []) {
		const line = str(raw);
		if (!line) continue;
		if (line.startsWith('/') && !line.startsWith('//')) {
			out.add(line);
			continue;
		}
		try {
			const u = new URL(line);
			if (host && u.host.replace(/^www\./, '') === host) out.add(`${u.pathname}${u.search}`);
		} catch {
			/* not an address */
		}
	}
	return [...out];
};

/** One template page's records as addresses. */
const templateEntries = async (pub: any, extra: (pub: any) => Partial<SitemapEntry>, defs: Map<string, any>): Promise<SitemapEntry[]> => {
	const pattern = templatePattern(pub.path);
	const source = pub.source;
	const def = typeof source?.model === 'string' ? defs.get(source.model) : null;
	if (!pattern || !def || publicProblem(def, 'get')) return [];
	const Model = compiledModel(def.name);
	if (!Model) return [];
	const field = str(source.match?.field) || 'slug';
	if (field !== '_id' && !def.fields.some((f: any) => f.key === field)) return [];

	// What the site may read of a record, and which records (its public API's rules).
	const reach = await siteReach(def, 'get');
	const readable = (k: string) => def.fields.some((f: any) => f.key === k) && reach.keys.includes(k);

	// The page's share image: a {{record.…}} binding filled per record, else the model's first image field the site may read.
	const seoImage = str(pub.seo?.image);
	const imageField = def.fields.find((f: any) => (f.kind === 'image' || f.kind === 'images') && reach.keys.includes(f.key))?.key;
	const has = (k: string) => def.fields.some((f: any) => f.key === k);
	const keys = [field, 'updatedAt', ...(imageField ? [imageField] : []), ...(has('noIndex') ? ['noIndex'] : []), ...(has('seo') ? ['seo'] : [])];
	// A {{record.x}} image needs x too.
	for (const m of seoImage.matchAll(/\{\{\s*record\.([a-zA-Z0-9_]+)/g)) if (readable(m[1]) && !keys.includes(m[1])) keys.push(m[1]);

	const records: any[] = await liveFind(def, Model, { query: reach.query, keys, sort: { updatedAt: -1 }, limit: MAX_ITEMS });
	const [before, after] = pub.path.split(`[${pattern.param}]`);
	const base = extra(pub);
	const out: SitemapEntry[] = [];
	for (const rec of records) {
		if (recordHidden(rec)) continue;
		const value = field === '_id' ? String(rec._id) : rec[field];
		const text = typeof value === 'number' ? String(value) : str(value);
		if (!text || text.includes('/')) continue;
		const image = seoImage.includes('{{') ? interpolate(seoImage, { record: rec }).trim() : seoImage || (imageField ? imageOf(rec[imageField]) : '');
		out.push({ path: `${before}${encodeURIComponent(text)}${after}`, updatedAt: rec.updatedAt, ...base, ...(image && { image }) });
	}
	return out;
};

/** Every address the sitemap lists, sorted by path. */
export const sitemapEntries = async ({ doc, origin, pagesModel, seoModel }: { doc: any; origin: string; pagesModel?: any; seoModel?: any }): Promise<SitemapEntry[]> => {
	if (doc?.seo?.indexing === false || doc?.seo?.sitemap === false) return [];

	const list: any[] = pagesModel ? await pagesModel.find({ status: 'published' }, { path: 1, updatedAt: 1 }).sort({ path: 1 }).limit(PART_SIZE).lean() : [];
	const records: any[] = seoModel ? await seoModel.find({}, { page: 1, noIndex: 1, image: 1, 'seo.ogImage': 1, 'seo.robots': 1 }).lean() : [];
	const seoBy = new Map(records.map(r => [String(r.page), r]));
	const hidden = (pageId: any) => {
		const r = seoBy.get(String(pageId));
		return r?.noIndex === true || r?.seo?.robots?.index === false;
	};
	const kitImage = (pageId: any) => {
		const r = seoBy.get(String(pageId));
		return imageOf(r?.image) || imageOf(r?.seo?.ogImage);
	};

	// Site builder pages (docs/site-builder SB-03), static and template: published, not hidden from search nor taken
	// out of the sitemap (SEO → Sitemap, SB-31). Each also has a kit Pages record at the same path (kit.ts pushPage) —
	// the builder page decides.
	const builtAll: any[] = await SitePage.find(
		{ published: { $ne: null } },
		{
			'published.path': 1,
			'published.kind': 1,
			'published.source': 1,
			'published.publishedAt': 1,
			'published.seo.noIndex': 1,
			'published.seo.image': 1,
			'published.seo.sitemapInclude': 1,
			'published.seo.sitemapPriority': 1,
			'published.seo.sitemapChangeFrequency': 1,
		}
	)
		.limit(PART_SIZE)
		.lean();
	const statics = builtAll.filter(p => p.published.kind !== 'template');
	const templates = builtAll.filter(p => p.published.kind === 'template');
	const builtBy = new Map(statics.map(p => [p.published.path, p.published]));
	const listed = (pub: any) => pub.seo?.noIndex !== true && pub.seo?.sitemapInclude !== false;
	// A page's own priority and change frequency, else Site setup's Default SEO (SB-33).
	const extra = (pub: any) => {
		const s = withSiteDefaults(pub.seo || {}, doc.seo?.defaults, { isHome: false, ownImage: true });
		return { priority: s.sitemapPriority, changeFrequency: s.sitemapChangeFrequency };
	};
	const ownImage = (pub: any) => (str(pub.seo?.image) && !str(pub.seo.image).includes('{{') ? { image: str(pub.seo.image) } : {});

	const entries: SitemapEntry[] = [];
	const seen = new Set<string>();
	const add = (e: SitemapEntry) => {
		if (!e.path || seen.has(e.path) || entries.length >= MAX_URLS) return;
		seen.add(e.path);
		entries.push(e);
	};

	for (const p of list) {
		// A template page's own address (/blog/[slug]) is no page: its records are listed below.
		if (!p.path || isTemplatePath(p.path) || hidden(p._id)) continue;
		const pub = builtBy.get(p.path);
		if (pub && !listed(pub)) continue;
		const image = kitImage(p._id);
		add({ path: p.path, updatedAt: p.updatedAt, ...(pub && { ...extra(pub), ...ownImage(pub) }), ...(image && { image }) });
	}
	for (const p of statics) if (listed(p.published)) add({ path: p.published.path, updatedAt: p.published.publishedAt, ...extra(p.published), ...ownImage(p.published) });

	const defs = templates.length ? await publicDefs() : new Map();
	for (const p of templates) {
		if (!listed(p.published)) continue;
		for (const e of await templateEntries(p.published, extra, defs)) add(e);
	}
	for (const path of extraPaths(doc.seo?.sitemapExtra, origin)) add({ path });

	return entries.sort((a, b) => a.path.localeCompare(b.path));
};

const xml = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
const FREQUENCIES = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
const absolute = (origin: string, url: string) => (/^https?:\/\//.test(url) ? url : url.startsWith('//') ? `https:${url}` : `${origin}${url.startsWith('/') ? '' : '/'}${url}`);
const day = (d: any) => {
	const t = d ? new Date(d) : null;
	return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : '';
};

/** A <urlset>: each address with its date, change frequency, priority and image. */
export const urlsetXml = (origin: string, entries: SitemapEntry[]) =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries
		.map(e => {
			const lastmod = day(e.updatedAt);
			return `  <url><loc>${xml(`${origin}${e.path}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${
				e.changeFrequency && FREQUENCIES.includes(e.changeFrequency) ? `<changefreq>${e.changeFrequency}</changefreq>` : ''
			}${typeof e.priority === 'number' && e.priority >= 0 && e.priority <= 1 ? `<priority>${e.priority.toFixed(1)}</priority>` : ''}${
				e.image ? `<image:image><image:loc>${xml(absolute(origin, e.image))}</image:loc></image:image>` : ''
			}</url>`;
		})
		.join('\n')}\n</urlset>\n`;

/** A <sitemapindex> of the numbered parts, each with its newest date. */
export const indexXml = (origin: string, entries: SitemapEntry[]) => {
	const parts = Math.ceil(entries.length / PART_SIZE);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: parts }, (_, i) => {
		const newest = entries
			.slice(i * PART_SIZE, (i + 1) * PART_SIZE)
			.map(e => day(e.updatedAt))
			.filter(Boolean)
			.sort()
			.pop();
		return `  <sitemap><loc>${xml(`${origin}/sitemap.xml?part=${i + 1}`)}</loc>${newest ? `<lastmod>${newest}</lastmod>` : ''}</sitemap>`;
	}).join('\n')}\n</sitemapindex>\n`;
};

/** What /sitemap.xml answers: all of it, the index (over PART_SIZE), or one numbered part (null: no such part). */
export const sitemapResponse = (origin: string, entries: SitemapEntry[], part?: unknown): string | null => {
	const n = Number(part);
	if (part === undefined || part === null || part === '') return entries.length > PART_SIZE ? indexXml(origin, entries) : urlsetXml(origin, entries);
	if (!Number.isInteger(n) || n < 1 || (n - 1) * PART_SIZE >= Math.max(entries.length, 1)) return null;
	return urlsetXml(origin, entries.slice((n - 1) * PART_SIZE, n * PART_SIZE));
};
