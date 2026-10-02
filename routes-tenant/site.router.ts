import express from 'express';
import Joi from 'joi';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { compiledModel, syncDynamicModels } from '../library/functions/dynamicModels.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { mergeSiteConfig, setupChecklist, siteConfigOf, siteOrigin } from '../library/functions/siteConfig.function.js';

/**
 * /tenant/api/p/:projectId — a website project's setup (docs/multi-tenancy WO-34).
 *
 *   GET /site-config      tracking tags, head/body code, SEO & indexing, redirects, headers, domains
 *   PUT /site-config      any of those sections (each replaces only the keys it names; lists whole)   build
 *                         `domains` needs manage-projects
 *   GET /site-overview    the website's state for its home: settings, pages, checklist, addresses
 *
 * Reading needs to open the project; website projects only.
 */
const router = express.Router();

const websiteOnly = (req: any) => {
	if (req.project.type !== 'website') throw new TenancyError(404, 'Only website projects have a site setup');
};

const DOMAIN = Joi.string()
	.trim()
	.lowercase()
	.max(253)
	.pattern(/^(localhost(:\d+)?|([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?)$/)
	.messages({ 'string.pattern.base': 'A domain looks like example.com' });

const view = (project: any) => ({ ...siteConfigOf(project), domains: project.domains || [], origin: siteOrigin(project) });

router.get(
	'/site-config',
	handle(async req => {
		websiteOnly(req);
		return view(req.project);
	})
);

router.put(
	'/site-config',
	handle(async req => {
		websiteOnly(req);
		if (!grants(req.permissions, ['build'])) throw new TenancyError(403, 'Your role can’t change the site setup (it needs Build)');
		const { domains, ...patch } = req.body || {};
		const $set: any = {};
		if (Object.keys(patch).length) {
			try {
				$set.site = mergeSiteConfig(req.project, patch);
			} catch (e: any) {
				throw new TenancyError(400, e.message);
			}
		}
		if (domains !== undefined) {
			if (!grants(req.permissions, ['manage-projects'])) throw new TenancyError(403, 'Changing the domains needs Manage projects');
			const { value, error } = Joi.array().items(DOMAIN).max(20).unique().validate(domains);
			if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
			$set.domains = value;
		}
		if (!Object.keys($set).length) throw new TenancyError(400, 'Nothing to change');
		const project = await TenantProject.findOneAndUpdate({ _id: req.project._id }, { $set }, { new: true }).lean();
		return view(project);
	})
);

/** A website kit model in this project (the builder may have renamed or removed it). */
const kit = async (route: string) => {
	const def: any = await ModelDefinition.findOne({ route }, { name: 1, route: 1 }).lean();
	return def ? compiledModel(def.name) : null;
};

router.get(
	'/site-overview',
	handle(async req => {
		websiteOnly(req);
		await syncDynamicModels({ app: req.app });
		const [Settings, Pages, Seo, Contents] = await Promise.all([kit('site-settings'), kit('pages'), kit('seo'), kit('web-contents')]);
		const settings: any = Settings ? await Settings.findOne({}).sort({ createdAt: 1 }).lean() : null;
		const pages: any[] = Pages ? await Pages.find({}, { name: 1, path: 1, status: 1, showInMenu: 1, updatedAt: 1 }).sort({ priority: -1, path: 1 }).limit(100).lean() : [];
		const ids = pages.map(p => p._id);
		const [seoPages, blocks]: any = await Promise.all([
			Seo ? Seo.distinct('page', { page: { $in: ids } }) : [],
			Contents ? Contents.aggregate([{ $match: { page: { $in: ids }, status: { $ne: 'archived' } } }, { $group: { _id: '$page', n: { $sum: 1 } } }]) : [],
		]);
		const withSeo = new Set(seoPages.map(String));
		const blockCount = new Map<string, number>(blocks.map((b: any) => [String(b._id), b.n]));
		const published = pages.filter(p => p.status === 'published');
		const counts = { total: pages.length, published: published.length, withSeo: published.filter(p => withSeo.has(String(p._id))).length };
		return {
			settings: settings
				? { _id: String(settings._id), siteName: settings.siteName || '', logo: settings.logo || '', favicon: settings.favicon || '', metaTitle: settings.metaTitle || '', metaDescription: settings.metaDescription || '' }
				: null,
			pages: pages.map(p => ({
				_id: String(p._id),
				name: p.name,
				path: p.path,
				status: p.status,
				seo: withSeo.has(String(p._id)),
				contents: blockCount.get(String(p._id)) || 0,
				updatedAt: p.updatedAt,
			})),
			counts,
			checklist: setupChecklist(req.project, settings, counts),
			domains: req.project.domains || [],
			origin: siteOrigin(req.project),
			kit: { settings: !!Settings, pages: !!Pages, seo: !!Seo, contents: !!Contents },
		};
	})
);

export default router;
