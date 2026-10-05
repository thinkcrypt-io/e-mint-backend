import express from 'express';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import { ProjectTemplate } from '../library/models/templates/_index.js';
import { ModelDefinition } from '../library/models/builder/_index.js';
import { currentScope } from '../library/functions/tenantScope.function.js';
import { handle, TenancyError } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { applyTemplate } from '../library/functions/applyTemplate.function.js';
import { BuildError } from '../library/controllers/builder/models.controller.js';
import { KIT_ROUTES, whatsInside } from '../library/controllers/templates/blueprint.js';

/**
 * /tenant/api/p/:projectId/templates — starting a new project from a published
 * template (docs/templates T-14, the website and API part): the templates this
 * project's kind can use, and applying one with the full engine (models,
 * pages, site defaults, sidebar, dashboard, roles, sample data) — the same
 * build a template preview runs. Big templates take longer than a request may
 * (T-16), so the build runs in the background and the panel polls
 * GET /templates/applying. Needs `build`.
 *
 *   GET  /                 { doc: [{ key, name, summary, icon, version, inside, questions }] }
 *   POST /:key/apply       { answers?, sampleData? } → 202 { status: 'building' }
 *   GET  /applying         { status, name, error?, problems?, result? } | { status: null }
 */
const router = express.Router({ mergeParams: true });
router.use(tenantPermissions(['build']));

/** A build that started longer ago than this died with a server restart. */
const STALE_MS = 15 * 60 * 1000;

const usable = (type: string) => {
	const org = currentScope()?.organization;
	return ProjectTemplate.find(
		{ type, status: 'published', $or: [{ visibility: 'everyone' }, ...(org ? [{ visibility: 'organizations', organizations: org }] : [])] },
		{ key: 1, name: 1, summary: 1, icon: 1, version: 1, published: 1, type: 1, status: 1 }
	)
		.sort({ name: 1 })
		.lean();
};

const applyingView = (p: any) => {
	const a = p?.applying;
	if (!a?.status) return { status: null };
	const stale = a.status === 'building' && Date.now() - new Date(a.startedAt).getTime() > STALE_MS;
	if (stale) return { status: 'failed', key: a.key, name: a.name, error: 'The build stopped part-way — the server restarted. Try again.' };
	return { status: a.status, key: a.key, name: a.name, error: a.error, problems: a.problems, result: a.result };
};

router.get(
	'/',
	handle(async (req: any) => {
		const docs: any[] = await usable(req.project.type || 'app');
		return {
			doc: docs.map(d => {
				const inside = whatsInside(d.published);
				return {
					key: d.key,
					name: d.name,
					summary: d.summary || '',
					icon: d.icon || '',
					version: d.version,
					inside: {
						models: inside.models.map((m: any) => m.title),
						pages: inside.pages.map((p: any) => p.name || p.path),
						sampleRecords: inside.counts.sampleRecords,
					},
					questions: d.published?.questions || [],
				};
			}),
		};
	})
);

router.get(
	'/applying',
	handle(async (req: any) => applyingView(await TenantProject.findById(req.project._id, { applying: 1 }).lean()))
);

router.post(
	'/:key/apply',
	handle(async (req: any, res: any) => {
		const project: any = await TenantProject.findById(req.project._id).lean();
		const now = applyingView(project);
		if (now.status === 'building') throw new TenancyError(409, `“${now.name}” is still being set up — wait for it to finish.`);
		if (project.template?.key) throw new TenancyError(400, 'This project was already made from a template. Start a new project to use another.');
		// A website's own kit (pages, SEO, contents) doesn't count — every website starts with it.
		if (await ModelDefinition.countDocuments({ route: { $nin: Object.values(KIT_ROUTES) } }))
			throw new TenancyError(400, 'Templates go into a new, empty project — this one already has models. Start a new project for it.');
		const template: any = (await usable(project.type || 'app')).find((t: any) => t.key === req.params.key);
		if (!template) throw new TenancyError(404, 'That template isn’t available — it may have been taken down.');

		const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
		const sampleData = req.body?.sampleData !== false;
		await TenantProject.updateOne(
			{ _id: project._id },
			{ $set: { applying: { template: template._id, key: template.key, name: template.name, status: 'building', startedAt: new Date() } } }
		);

		// Not awaited: the panel polls /applying. The request lends its caller and address.
		applyTemplate(req, { project, template, answers, sampleData })
			.then(result =>
				TenantProject.updateOne(
					{ _id: project._id },
					{
						$set: {
							'applying.status': 'ready',
							'applying.finishedAt': new Date(),
							'applying.result': { models: result.models, pages: result.pages, records: result.records, warnings: result.warnings },
						},
					}
				)
			)
			.catch((e: any) => {
				if (!(e instanceof BuildError)) console.error(`Applying the template “${template.name}” failed:`, e?.stack || e);
				return TenantProject.updateOne(
					{ _id: project._id },
					{
						$set: {
							'applying.status': 'failed',
							'applying.finishedAt': new Date(),
							'applying.error': String(e?.message || 'the build failed').slice(0, 2000),
							'applying.problems': (e?.problems || []).slice(0, 50).map((p: any) => String(p).slice(0, 500)),
						},
					}
				);
			})
			.catch(() => undefined);

		res.status(202);
		return { status: 'building', key: template.key, name: template.name };
	})
);

export default router;
