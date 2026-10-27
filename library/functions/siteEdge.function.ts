import { edgeOf } from './siteConfig.function.js';
import { pathCandidates } from './siteHead.function.js';

/**
 * What the mint-edge Worker needs to run in front of a site (docs/site-connect SC-10), in one small answer it
 * caches for a minute: whether it's switched off, the domains it may rewrite, which pages are Mint's (so it asks
 * /site/head only for those), the redirects, and whether robots.txt / sitemap.xml come from Mint.
 */

/** The Worker version Mint ships now (mint-edge/src/index.js VERSION). Older Workers show "update available". */
export const EDGE_WORKER_VERSION = '1.0.0';

type Models = { pages?: any; seo?: any };

export const siteEdge = async (project: any, doc: any, models: Models) => {
	const edge = edgeOf(doc);
	// Only pages added to Website → SEO are Mint's (D4); the rest keep the page's own head, with no call to Mint.
	let pages: string[] = [];
	if (models.pages && models.seo) {
		const withSeo = await models.seo.distinct('page');
		const list: any[] = withSeo.length ? await models.pages.find({ _id: { $in: withSeo }, status: 'published' }, { path: 1 }).limit(5000).lean() : [];
		pages = [...new Set(list.filter(p => p.path).map(p => pathCandidates(p.path).path))].sort();
	}
	return {
		version: EDGE_WORKER_VERSION,
		bypass: edge.bypass,
		domains: project.domains || [],
		analytics: doc?.tracking?.mintAnalytics !== false,
		robots: edge.robots,
		sitemap: edge.sitemap,
		redirects: (doc?.redirects || []).map((r: any) => ({ from: pathCandidates(r.from).path, to: r.to, permanent: r.permanent !== false })),
		pages,
	};
};
