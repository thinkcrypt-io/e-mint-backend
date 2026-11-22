import express from 'express';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { compiledModel, syncDynamicModels } from '../library/functions/dynamicModels.function.js';
import { loadSite } from '../library/functions/siteConfig.function.js';
import { testConnection } from '../library/functions/siteConnection.function.js';
import { chooseWay, detectSite, startUsing, verifyOwnership } from '../library/functions/seoSetup.function.js';

/**
 * /tenant/api/p/:projectId/seo-setup — Mint SEO's setup wizard (docs/seo-panel SP-05…07). Open before the site is
 * live (the SEO guard lets it through as a setup path).
 *
 *   POST /detect { url }   look at the site: platform, Cloudflare, current SEO, snippet / Worker, sitemap; recommend a
 *                          way; save the address + hostnames on `connection` and in the project's domains
 *   POST /way { mode }     save the picked way (script | cloudflare), step ≥ 3
 *   POST /verify           is the site this project's: a visit from it, the Worker, or the TXT record
 *   POST /start            Start using: owned + connection test without a missing item → status live
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

router.post(
	'/way',
	handle(async req => {
		mayConnect(req);
		const out = await chooseWay(req.project, req.body?.mode);
		if ('error' in out) throw new TenancyError(400, out.error);
		return out;
	})
);

router.post(
	'/verify',
	handle(async req => {
		mayConnect(req);
		return verifyOwnership(req.project);
	})
);

const kit = async (route: string) => {
	const def: any = await ModelDefinition.findOne({ route }, { name: 1, route: 1 }).lean();
	return def ? compiledModel(def.name) : null;
};

router.post(
	'/start',
	handle(async req => {
		mayConnect(req);
		const { owned } = await verifyOwnership(req.project);
		await syncDynamicModels({ app: req.app });
		const [doc, pages, seo] = await Promise.all([loadSite(req.project, { req }), kit('pages'), kit('seo')]);
		const test = await testConnection(req.project, doc, { pages: pages || undefined, seo: seo || undefined }, doc?.connection?.siteUrl);
		const out = await startUsing(req.project, test, owned);
		if ('error' in out) throw new TenancyError(409, out.error);
		return out;
	})
);

export default router;
