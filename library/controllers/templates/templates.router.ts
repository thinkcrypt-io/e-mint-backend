import express, { Response } from 'express';
import { adminProtect, adminPermissions } from '../../../middleware/index.js';
import { ORG_PERMISSIONS } from '../../functions/tenantPermissions.function.js';
import { TEMPLATE_TYPES } from '../../models/templates/_index.js';
import { BuildError } from '../builder/models.controller.js';
import {
	BLOCK_CATEGORIES,
	BUILTIN_PLACEHOLDERS,
	PAGE_STATUSES,
	PAGE_TEMPLATES,
	PARTS,
	PARTS_BY_TYPE,
	PUBLIC_ACTIONS,
	QUESTION_KINDS,
	WEBHOOK_EVENTS,
} from './blueprint.js';
import {
	captureTemplate,
	createTemplate,
	deleteTemplate,
	describeTemplate,
	duplicateTemplate,
	exportTemplate,
	getTemplateOrFail,
	getVersion,
	importTemplate,
	listTemplates,
	publishTemplate,
	restoreVersion,
	saveDraft,
	saveSettings,
	validateById,
} from './templates.service.js';
import { deletePreview, listPreviews, previewTemplate, reopenPreview } from '../../functions/templateSandbox.function.js';
import { createKey, listKeys, revokeKey } from './keys.js';
import { generateSampleData } from './sampleAi.js';

/**
 * /admin/api/templates — Template Studio's API for the super admin panel
 * (docs/templates). Permissions (scripts/seedTemplateAccess.js): view-, create-,
 * edit-, delete-templates; publishing (T-05) needs edit-template-publishing.
 */

const fail = (res: Response, status: number, message: string, problems?: string[]) => res.status(status).json({ message, ...(problems && { problems }) });

const handle = (fn: (req: any, res: Response) => Promise<any>) => async (req: any, res: Response) => {
	try {
		return await fn(req, res);
	} catch (e: any) {
		if (e instanceof BuildError) return fail(res, e.status, e.message, e.problems);
		console.error('Templates:', e?.message);
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};

const view = [adminProtect, adminPermissions(['view-templates', 'edit-templates'])];
const create = [adminProtect, adminPermissions(['create-templates', 'edit-templates'])];
const edit = [adminProtect, adminPermissions(['edit-templates'])];
const remove = [adminProtect, adminPermissions(['delete-templates'])];
// Publishing reaches every tenant (TD10): its own permission.
const publish = [adminProtect, adminPermissions(['edit-template-publishing'])];

const router = express.Router();

/** GET /meta — what the studio's forms offer: types, each type's parts, and the allowed values. */
router.get(
	'/meta',
	...view,
	handle(async (_req, res) =>
		res.status(200).json({
			types: TEMPLATE_TYPES,
			parts: PARTS,
			partsByType: PARTS_BY_TYPE,
			questionKinds: QUESTION_KINDS,
			builtinPlaceholders: BUILTIN_PLACEHOLDERS,
			pageStatuses: PAGE_STATUSES,
			pageTemplates: PAGE_TEMPLATES,
			blockCategories: BLOCK_CATEGORIES,
			publicActions: PUBLIC_ACTIONS,
			webhookEvents: WEBHOOK_EVENTS,
			orgPermissions: ORG_PERMISSIONS,
		})
	)
);

/* ------------------------------------------------------- Templates MCP keys (T-06) */

/** GET /keys — every key Claude connects to /templates/mcp with (never the secrets). */
router.get(
	'/keys',
	adminProtect,
	adminPermissions(['view-template-keys', 'create-template-keys']),
	handle(async (_req, res) => res.status(200).json({ doc: await listKeys() }))
);

/** POST /keys { name, scopes?, expiresInDays? } — the secret is in this answer only. */
router.post(
	'/keys',
	adminProtect,
	adminPermissions(['create-template-keys']),
	handle(async (req, res) => res.status(201).json(await createKey(req, req.body || {})))
);

/** DELETE /keys/:keyId — revoked at once. */
router.delete(
	'/keys/:keyId',
	adminProtect,
	adminPermissions(['delete-template-keys']),
	handle(async (req, res) => {
		await revokeKey(req, req.params.keyId);
		return res.status(200).json({ message: 'Key revoked' });
	})
);

/* ------------------------------------------------------------ previews (T-04) */

/** POST /previews/:projectId/open — a fresh single-use link to a preview that still exists. */
router.post(
	'/previews/:projectId/open',
	...edit,
	handle(async (req, res) => res.status(200).json(await reopenPreview(req.params.projectId)))
);

/** DELETE /previews/:projectId — throws a preview away now rather than in 24 hours. */
router.delete(
	'/previews/:projectId',
	...edit,
	handle(async (req, res) => {
		await deletePreview(req.params.projectId);
		return res.status(200).json({ message: 'Preview deleted' });
	})
);

/** POST /import { …an exported template } — a new draft from a file. */
router.post(
	'/import',
	...create,
	handle(async (req, res) => {
		const doc = await importTemplate(req, req.body);
		return res.status(201).json({ doc: await describeTemplate(req, doc) });
	})
);

/** POST /capture { project, name?, sampleData? } — a project's structure as a new draft (records only from previews). */
router.post(
	'/capture',
	...create,
	handle(async (req, res) => {
		const doc = await captureTemplate(req, req.body || {});
		return res.status(201).json({ doc: await describeTemplate(req, doc) });
	})
);

/** GET / ?type&status&category&search — the gallery (no blueprints). */
router.get(
	'/',
	...view,
	handle(async (req, res) => res.status(200).json({ doc: await listTemplates(req.query || {}) }))
);

/** POST / { type, name, summary?, category?, key?, overview?, blueprint? } — a new draft. */
router.post(
	'/',
	...create,
	handle(async (req, res) => {
		const doc = await createTemplate(req, req.body || {}, 'panel');
		return res.status(201).json({ doc: await describeTemplate(req, doc) });
	})
);

/** GET /:id — by id or key: the draft, what's inside, and how it checks. */
router.get(
	'/:id',
	...view,
	handle(async (req, res) => res.status(200).json({ doc: await describeTemplate(req, await getTemplateOrFail(req.params.id)) }))
);

/** PUT /:id/draft { part, value } or { blueprint } (or ?part=… with { value }) — saves the draft; builds nothing. */
router.put(
	'/:id/draft',
	...edit,
	handle(async (req, res) => {
		const body = req.body || {};
		const part = body.part ?? req.query?.part;
		const doc = await saveDraft(req, req.params.id, part !== undefined ? { part, value: body.value } : { blueprint: body.blueprint });
		return res.status(200).json({ doc: await describeTemplate(req, doc) });
	})
);

/** POST /:id/validate — the draft's errors, missing explanations and warnings, each with its fix. */
router.post(
	'/:id/validate',
	...view,
	handle(async (req, res) => res.status(200).json({ validation: await validateById(req, req.params.id) }))
);

/** PUT /:id/settings { key?, visibility?, organizations?, archived? } — who can use it, and archive / restore. */
router.put(
	'/:id/settings',
	...publish,
	handle(async (req, res) => {
		const doc = await saveSettings(req, req.params.id, req.body || {});
		return res.status(200).json({ doc: await describeTemplate(req, doc) });
	})
);

/** POST /:id/publish { notes } — the draft becomes the next version (refused while it has problems). */
router.post(
	'/:id/publish',
	...publish,
	handle(async (req, res) => {
		const doc = await publishTemplate(req, req.params.id, req.body || {});
		return res.status(200).json({ doc: await describeTemplate(req, doc) });
	})
);

/** GET /:id/versions/:v — one published version's blueprint. */
router.get(
	'/:id/versions/:v',
	...view,
	handle(async (req, res) => res.status(200).json({ doc: await getVersion(req.params.id, req.params.v) }))
);

/** POST /:id/versions/:v/restore — copies that version into the draft. */
router.post(
	'/:id/versions/:v/restore',
	...edit,
	handle(async (req, res) => {
		const doc = await restoreVersion(req, req.params.id, req.params.v);
		return res.status(200).json({ doc: await describeTemplate(req, doc) });
	})
);

/** POST /:id/duplicate { name? } — a new draft with the same blueprint. */
router.post(
	'/:id/duplicate',
	...create,
	handle(async (req, res) => {
		const doc = await duplicateTemplate(req, req.params.id, req.body || {});
		return res.status(201).json({ doc: await describeTemplate(req, doc) });
	})
);

/** GET /:id/export — the draft as a JSON file. */
router.get(
	'/:id/export',
	...view,
	handle(async (req, res) => {
		const data = await exportTemplate(req.params.id);
		res.setHeader('Content-Disposition', `attachment; filename="${data.key}.template.json"`);
		return res.status(200).json(data);
	})
);

/** DELETE /:id — a never-published draft is deleted (with its previews); a published template is archived. */
router.delete(
	'/:id',
	...remove,
	handle(async (req, res) => {
		const doc: any = await getTemplateOrFail(req.params.id);
		// A draft that goes for good takes its previews with it; an archived template keeps them until they expire.
		if (!doc.version) for (const p of await listPreviews(doc._id)) await deletePreview(p._id).catch(() => undefined);
		return res.status(200).json(await deleteTemplate(req, req.params.id));
	})
);

/**
 * POST /:id/preview { from?: 'draft'|'published', answers?, sampleData? } —
 * builds the template into a throwaway sandbox project (deleted after 24 hours)
 * and returns a single-use link that opens it in the tenant panel.
 */
router.post(
	'/:id/preview',
	...edit,
	handle(async (req, res) => {
		const doc = await getTemplateOrFail(req.params.id);
		const body = req.body || {};
		const from = body.from === 'published' || body.from === 'draft' ? body.from : undefined;
		return res.status(201).json(await previewTemplate(req, doc, { from, answers: body.answers, sampleData: body.sampleData }));
	})
);

/**
 * POST /:id/ai/sample-data { model, count?, note? } — example records for one
 * model, written by Claude (the server's ANTHROPIC_API_KEY). Saves nothing:
 * the studio shows them and the admin keeps what they like.
 */
router.post(
	'/:id/ai/sample-data',
	...edit,
	handle(async (req, res) => res.status(200).json(await generateSampleData(req, req.params.id, req.body || {})))
);

/** GET /:id/previews — this template's previews that still exist. */
router.get(
	'/:id/previews',
	...view,
	handle(async (req, res) => {
		const doc = await getTemplateOrFail(req.params.id);
		return res.status(200).json({ doc: await listPreviews(doc._id) });
	})
);

export default router;
