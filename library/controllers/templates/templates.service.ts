import mongoose from 'mongoose';
import { ProjectTemplate, TEMPLATE_TYPES } from '../../models/templates/_index.js';
import { recordHistory } from '../../functions/recordHistory.function.js';
import { uniqueSlug } from '../../functions/tenancy.function.js';
import { BuildError } from '../builder/models.controller.js';
import { PARTS, PARTS_BY_TYPE, Part, TemplateType, emptyBlueprint, normalizeBlueprint, normalizePart, whatsInside } from './blueprint.js';
import { validateTemplate } from './validate.js';
import { captureProject } from './capture.js';

/**
 * Template Studio's one service (docs/templates): the super admin's panel
 * (`/admin/api/templates`) and the Templates MCP (`/templates/mcp`, T-06)
 * both go through here, so a template made either way is checked and stored
 * the same. Nothing here builds a model — see validate.ts (checks) and the
 * apply engine (T-03, builds into a sandbox or a new project).
 */

const str = (v: any, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const isTemplateType = (v: any): v is TemplateType => (TEMPLATE_TYPES as readonly string[]).includes(v);
export const isPart = (v: any): v is Part => (PARTS as readonly string[]).includes(v);

/** By id or key. */
export const findTemplate = async (idOrKey: string) => {
	const q = str(idOrKey, 80);
	if (!q) return null;
	return ProjectTemplate.findOne(mongoose.isValidObjectId(q) ? { _id: q } : { key: q.toLowerCase() });
};

const mustFind = async (idOrKey: string) => {
	const doc = await findTemplate(idOrKey);
	if (!doc) throw new BuildError(404, 'No template with that id or key — list the templates to find it.');
	return doc;
};

/** The list columns that mirror the draft's overview, so lists never read blueprints. */
const mirror = (doc: any) => {
	const o = doc.draft?.overview || {};
	doc.name = o.name || doc.name || 'Untitled template';
	doc.summary = o.summary || '';
	doc.category = o.category || '';
	doc.icon = o.icon || '';
	doc.color = o.color || '';
};

/** A template as the studio and the MCP show it: the draft, what's inside, and how it checks. */
export const describeTemplate = async (req: any, doc: any) => {
	const t = doc.toObject ? doc.toObject() : doc;
	const validation = await validateTemplate(req, t.type, t.draft);
	return {
		_id: t._id,
		key: t.key,
		type: t.type,
		status: t.status,
		name: t.name,
		summary: t.summary,
		category: t.category,
		icon: t.icon,
		color: t.color,
		visibility: t.visibility,
		organizations: t.organizations,
		version: t.version,
		changed: t.changed,
		versions: (t.versions || []).map(({ blueprint, ...v }: any) => v),
		usage: t.usage,
		source: t.source,
		parts: PARTS_BY_TYPE[t.type as TemplateType],
		draft: t.draft,
		whatsInside: whatsInside(t.draft),
		validation,
		createdBy: t.createdBy,
		updatedBy: t.updatedBy,
		createdAt: t.createdAt,
		updatedAt: t.updatedAt,
	};
};

export const listTemplates = async (filters: { type?: string; status?: string; category?: string; search?: string } = {}) => {
	const q: any = {};
	if (isTemplateType(filters.type)) q.type = filters.type;
	if (['draft', 'published', 'archived'].includes(filters.status as string)) q.status = filters.status;
	else q.status = { $ne: 'archived' };
	if (filters.category) q.category = str(filters.category, 60);
	const search = str(filters.search, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (search) q.$or = [{ name: new RegExp(search, 'i') }, { summary: new RegExp(search, 'i') }, { key: new RegExp(search, 'i') }];
	return ProjectTemplate.find(q, { draft: 0, published: 0, 'versions.blueprint': 0 })
		.sort({ status: 1, category: 1, name: 1 })
		.populate('updatedBy', 'name')
		.lean();
};

/** A new draft: type, name and the overview so far. */
export const createTemplate = async (
	req: any,
	input: { type: any; name?: any; summary?: any; category?: any; key?: any; overview?: any; blueprint?: any },
	source: 'panel' | 'mcp' | 'starter' | 'capture' | 'import' = 'panel'
) => {
	if (!isTemplateType(input?.type)) throw new BuildError(400, `Pick what kind of template it is: ${TEMPLATE_TYPES.join(', ')}.`);
	const type = input.type;
	const overview = { ...(input.overview || {}), ...(input.name && { name: input.name }), ...(input.summary && { summary: input.summary }), ...(input.category && { category: input.category }) };
	const draft = input.blueprint ? normalizeBlueprint(type, { ...input.blueprint, overview: { ...(input.blueprint.overview || {}), ...overview } }) : emptyBlueprint(type, overview);
	if (!draft.overview.name) throw new BuildError(400, 'Give the template a name.');
	const key = await uniqueSlug(str(input.key, 60) || draft.overview.name, k => ProjectTemplate.exists({ key: k }));
	const doc: any = new ProjectTemplate({ key, type, draft, source, createdBy: req.user?._id, updatedBy: req.user?._id, name: draft.overview.name });
	mirror(doc);
	await doc.save();
	recordHistory({ req, action: 'create', model: 'ProjectTemplate', doc });
	return doc;
};

/**
 * Saves the draft: one part (`part` + `value`) or the whole blueprint. The
 * published version is untouched (TD5) — the draft is marked changed.
 */
export const saveDraft = async (req: any, idOrKey: string, input: { part?: any; value?: any; blueprint?: any }) => {
	const doc: any = await mustFind(idOrKey);
	if (doc.status === 'archived') throw new BuildError(400, 'This template is archived — restore it before editing.');
	const type = doc.type as TemplateType;
	if (input.part !== undefined) {
		if (!isPart(input.part)) throw new BuildError(400, `Unknown part “${input.part}”. Parts: ${PARTS.join(', ')}.`);
		if (!PARTS_BY_TYPE[type].includes(input.part))
			throw new BuildError(400, `${type} templates don’t have a ${input.part} part. They have: ${PARTS_BY_TYPE[type].join(', ')}.`);
		doc.draft = { ...doc.draft, [input.part]: normalizePart(type, input.part, input.value) };
	} else if (input.blueprint && typeof input.blueprint === 'object') {
		doc.draft = normalizeBlueprint(type, input.blueprint);
	} else throw new BuildError(400, 'Send a part and its value, or the whole blueprint.');
	if (!doc.draft.overview?.name) throw new BuildError(400, 'The template needs a name.');
	doc.markModified('draft');
	doc.changed = true;
	doc.updatedBy = req.user?._id;
	mirror(doc);
	await doc.save();
	recordHistory({ req, action: 'update', model: 'ProjectTemplate', doc, changes: [{ field: input.part || 'blueprint', label: input.part ? `Draft: ${input.part}` : 'Draft', from: '', to: 'changed' }] });
	return doc;
};

export const validateById = async (req: any, idOrKey: string) => {
	const doc: any = await mustFind(idOrKey);
	return validateTemplate(req, doc.type, doc.draft);
};

export { mustFind as getTemplateOrFail };

/* ------------------------------------------------------------- T-05 */

const EXPORT_FORMAT = 'emint-template@1';

/** Who can use it and its status: visibility, organizations, key, archive / restore. */
export const saveSettings = async (req: any, idOrKey: string, input: { key?: any; visibility?: any; organizations?: any; archived?: any }) => {
	const doc: any = await mustFind(idOrKey);
	const changes: { field: string; label: string; from: string; to: string }[] = [];
	if (input.key !== undefined) {
		const key = str(input.key, 60).toLowerCase();
		if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(key)) throw new BuildError(400, 'A key is lowercase letters, digits and hyphens, e.g. “finance-management”.');
		if (key !== doc.key) {
			if (doc.version > 0) throw new BuildError(400, 'A published template’s key can’t change — projects built from it name it by its key.');
			if (await ProjectTemplate.exists({ key })) throw new BuildError(400, `The key “${key}” is taken.`);
			changes.push({ field: 'key', label: 'Key', from: doc.key, to: key });
			doc.key = key;
		}
	}
	if (input.visibility !== undefined) {
		if (!['everyone', 'organizations', 'hidden'].includes(input.visibility)) throw new BuildError(400, 'Visibility is everyone, organizations or hidden.');
		changes.push({ field: 'visibility', label: 'Visibility', from: doc.visibility, to: input.visibility });
		doc.visibility = input.visibility;
	}
	if (input.organizations !== undefined) {
		const ids = (Array.isArray(input.organizations) ? input.organizations : []).filter((id: any) => mongoose.isValidObjectId(id)).slice(0, 200);
		doc.organizations = ids;
		changes.push({ field: 'organizations', label: 'Organizations', from: '', to: `${ids.length} organization(s)` });
	}
	if (doc.visibility === 'organizations' && !doc.organizations.length)
		throw new BuildError(400, 'Pick the organizations that may use it, or make it visible to everyone.');
	if (input.archived !== undefined) {
		const archived = input.archived === true;
		const next = archived ? 'archived' : doc.version > 0 ? 'published' : 'draft';
		if (next !== doc.status) changes.push({ field: 'status', label: 'Status', from: doc.status, to: next });
		doc.status = next;
	}
	doc.updatedBy = req.user?._id;
	await doc.save();
	recordHistory({ req, action: 'update', model: 'ProjectTemplate', doc, changes });
	return doc;
};

/**
 * Publishes the draft as the next version (TD5): refused while it has errors
 * or missing explanations (TD11). Projects built later get this version;
 * projects already built keep theirs.
 */
export const publishTemplate = async (req: any, idOrKey: string, input: { notes?: any }) => {
	const doc: any = await mustFind(idOrKey);
	if (doc.status === 'archived') throw new BuildError(400, 'This template is archived — restore it before publishing.');
	const notes = str(input.notes, 2000);
	if (!notes) throw new BuildError(400, 'Say what changed in this version — the notes show in its history.');
	if (doc.version > 0 && !doc.changed) throw new BuildError(400, `Nothing changed since version ${doc.version}.`);
	const validation = await validateTemplate(req, doc.type, doc.draft);
	if (!validation.canPublish)
		throw new BuildError(
			400,
			validation.ok ? 'Explain the template before publishing it' : 'Fix the template’s problems before publishing it',
			[...validation.errors, ...validation.explain].map(i => `${i.message} ${i.fix}`)
		);
	const version = doc.version + 1;
	const blueprint = JSON.parse(JSON.stringify(doc.draft));
	doc.versions.push({ version, blueprint, notes, publishedBy: req.user?._id, publishedAt: new Date() });
	doc.published = blueprint;
	doc.version = version;
	doc.status = 'published';
	doc.changed = false;
	doc.updatedBy = req.user?._id;
	doc.markModified('published');
	await doc.save();
	recordHistory({ req, action: 'update', model: 'ProjectTemplate', doc, changes: [{ field: 'version', label: 'Published', from: String(version - 1), to: `v${version} — ${notes}` }] });
	return doc;
};

/** One version's blueprint, to look at or compare. */
export const getVersion = async (idOrKey: string, v: any) => {
	const doc: any = await mustFind(idOrKey);
	const found = doc.versions.find((x: any) => x.version === Number(v));
	if (!found) throw new BuildError(404, `Version ${v} doesn’t exist — this template has ${doc.version || 'no'} published version(s).`);
	return { version: found.version, notes: found.notes, publishedAt: found.publishedAt, publishedBy: found.publishedBy, blueprint: found.blueprint, whatsInside: whatsInside(found.blueprint) };
};

/** Copies an old version into the draft — publishing it makes it the newest version again. */
export const restoreVersion = async (req: any, idOrKey: string, v: any) => {
	const doc: any = await mustFind(idOrKey);
	const found = doc.versions.find((x: any) => x.version === Number(v));
	if (!found) throw new BuildError(404, `Version ${v} doesn’t exist.`);
	doc.draft = normalizeBlueprint(doc.type, found.blueprint);
	doc.markModified('draft');
	doc.changed = true;
	doc.updatedBy = req.user?._id;
	mirror(doc);
	await doc.save();
	recordHistory({ req, action: 'update', model: 'ProjectTemplate', doc, changes: [{ field: 'draft', label: 'Draft', from: '', to: `restored from v${found.version}` }] });
	return doc;
};

/** A new draft with the same blueprint (a variant: “E-commerce (fashion)”). */
export const duplicateTemplate = async (req: any, idOrKey: string, input: { name?: any }) => {
	const doc: any = await mustFind(idOrKey);
	const name = str(input.name, 80) || `${doc.name} (copy)`;
	return createTemplate(req, { type: doc.type, key: name, blueprint: { ...doc.draft, overview: { ...doc.draft.overview, name } } }, doc.source === 'mcp' ? 'mcp' : 'panel');
};

/** The draft as a JSON file — to keep in git, or move between servers. */
export const exportTemplate = async (idOrKey: string) => {
	const doc: any = await mustFind(idOrKey);
	return { format: EXPORT_FORMAT, key: doc.key, type: doc.type, version: doc.version, exportedAt: new Date().toISOString(), blueprint: doc.draft };
};

/** A new draft from an exported file. The key gets a suffix when it's taken. */
export const importTemplate = async (req: any, data: any, source: 'panel' | 'mcp' = 'panel') => {
	if (!data || typeof data !== 'object') throw new BuildError(400, 'Send the exported template (a JSON object).');
	if (data.format !== EXPORT_FORMAT) throw new BuildError(400, `This isn’t an exported template (format “${EXPORT_FORMAT}” expected).`);
	if (!isTemplateType(data.type)) throw new BuildError(400, `Unknown template type “${data.type}”.`);
	const doc = await createTemplate(req, { type: data.type, key: data.key, blueprint: data.blueprint }, 'import');
	return doc;
};

/** A project's structure as a new draft (TD13). */
export const captureTemplate = async (req: any, input: { project?: any; name?: any; sampleData?: any }) => {
	if (!mongoose.isValidObjectId(input.project)) throw new BuildError(400, 'Pick the project to save as a template.');
	const blueprint = await captureProject(input.project, { name: str(input.name, 80), sampleData: input.sampleData === true });
	return createTemplate(req, { type: blueprint.type, blueprint }, 'capture');
};

/** Deletes a draft that was never published; a published one is archived instead (projects name it). */
export const deleteTemplate = async (req: any, idOrKey: string) => {
	const doc: any = await mustFind(idOrKey);
	if (doc.version > 0) {
		doc.status = 'archived';
		await doc.save();
		recordHistory({ req, action: 'update', model: 'ProjectTemplate', doc, changes: [{ field: 'status', label: 'Status', from: 'published', to: 'archived' }] });
		return { archived: true, message: 'It was published, so it’s archived: hidden from new projects, kept for the projects built from it.' };
	}
	await ProjectTemplate.deleteOne({ _id: doc._id });
	recordHistory({ req, action: 'delete', model: 'ProjectTemplate', doc });
	return { archived: false, message: 'Template deleted' };
};
