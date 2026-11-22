import express from 'express';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { detectSite } from '../library/functions/seoSetup.function.js';

/**
 * /tenant/api/p/:projectId/seo-setup — Mint SEO's setup wizard (docs/seo-panel SP-05…07). Open before the site is
 * live (the SEO guard lets it through as a setup path).
 *
 *   POST /detect { url }   look at the site: platform, Cloudflare, current SEO, snippet / Worker, sitemap; recommend a
 *                          way; save the address + hostnames on `connection` and in the project's domains
 */
const router = express.Router({ mergeParams: true });

const mayConnect = (req: any) => {
	if (req.project.type !== 'website') throw new TenancyError(404, 'Only website projects connect a site');
	if (!grants(req.permissions, ['build', 'manage-site'])) throw new TenancyError(403, 'Your role can’t set up the site');
};

router.post(
	'/detect',
	handle(async req => {
		mayConnect(req);
		const out = await detectSite(req.project, req.body?.url);
		if ('error' in out) throw new TenancyError(400, out.error);
		return out;
	})
);

export default router;
