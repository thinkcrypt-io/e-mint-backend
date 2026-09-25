import { Response } from 'express';
import mongoose from 'mongoose';
import { BuilderState, ModelDefinition, RouteConfig, RouteSettings, RouteVersion } from '../../models/builder/_index.js';
import {
	collectFilterRoutes,
	collectResourceRoutes,
	configToData,
	dataToSettings,
	FilterRouteEntry,
	listModelFields,
	ResourceRouteEntry,
	settingsToData,
	dynamicMounts,
	getDynamicVersion,
} from '../../functions/routeRegistry.function.js';
import { effectiveSource, getGlobalSources, invalidateRoute } from '../../functions/resolveRoute.function.js';
import { PROTECTED_ROUTES, checkSettings, validateDraft, withSystemFields } from './validate.js';
import { formulaPipeline, formulasOf } from '../../functions/formula.function.js';

type Kind = 'settings' | 'config';
const KINDS: Kind[] = ['settings', 'config'];
const modelFor = (kind: Kind): mongoose.Model<any> => (kind === 'settings' ? RouteSettings : RouteConfig);

// The router stack is fixed once the server has booted; only the model
// builder's routes change after that, and they bump the dynamic version.
let registry: {
	version: number;
	resources: Map<string, ResourceRouteEntry>;
	filters: Map<string, FilterRouteEntry>;
} | null = null;

const getRegistry = (app: any) => {
	if (registry?.version !== getDynamicVersion())
		registry = {
			version: getDynamicVersion(),
			resources: new Map(collectResourceRoutes(app).map(e => [e.route, e])),
			filters: new Map(collectFilterRoutes(app).map(e => [e.route, e])),
		};
	return registry;
};

/**
 * The code a route was built from, in RouteSettings / RouteConfig shape.
 * Settings exist only for defineRoutes routes; config at least carries the
 * route's settings filters (filtered to the admin role, as getFilters does).
 */
const codeFor = (app: any, route: string) => {
	const { resources, filters } = getRegistry(app);
	const resource = resources.get(route);
	const filterEntry = filters.get(route);

	const role = filterEntry?.source.role;
	const codeFilters = (filterEntry?.source.filters || []).filter(
		(f: any) => !f?.roles?.length || !role || f.roles.includes(role)
	);

	return {
		resource,
		model: resource?.source.Model || filterEntry?.source.baseModel,
		settings: resource ? settingsToData(resource.source.settings) : null,
		config: resource || filterEntry ? configToData(resource?.source.frontendConfig, codeFilters) : null,
	};
};

const kind = (value: any): Kind | null => (KINDS.includes(value) ? value : null);

const fail = (res: Response, status: number, message: string, problems?: string[]) =>
	res.status(status).json({ message, ...(problems && { problems }) });

/**
 * GET /builder/routes
 *
 * Every admin route the builder knows: those built by defineRoutes (settings
 * and config) and custom routes that only have a filter row. With each, what
 * it currently runs on and whether a draft is waiting.
 */
export const getBuilderRoutes = async (req: any, res: Response): Promise<Response> => {
	try {
		const { resources, filters } = getRegistry(req.app);
		const routes = [...new Set([...resources.keys(), ...filters.keys()])].sort();

		const [settingsDocs, configDocs] = await Promise.all(
			KINDS.map(k =>
				modelFor(k)
					.find({}, { route: 1, version: 1, publishedAt: 1, draftUpdatedAt: 1, draft: 1, source: 1, 'data.route.title': 1 })
					.lean()
			)
		);
		const global = await getGlobalSources();
		const index = (docs: any[]) => new Map(docs.map(d => [d.route, d]));
		const settingsBy = index(settingsDocs);
		const configBy = index(configDocs);

		const state = (doc: any, k: Kind) =>
			doc
				? {
						version: doc.version || 0,
						publishedAt: doc.publishedAt || null,
						hasDraft: !!doc.draft,
						draftUpdatedAt: doc.draftUpdatedAt || null,
						source: doc.source || 'inherit',
						// What the API actually serves: a published copy with its
						// source on DB, or else the code file.
						serving: doc.version && effectiveSource(doc.source, global, k) === 'db' ? 'db' : 'code',
				  }
				: null;

		const doc = routes.map(route => {
			const resource = resources.get(route);
			const c = configBy.get(route);
			return {
				route,
				title: c?.data?.route?.title || resource?.source.frontendConfig?.route?.title || null,
				model: (resource?.source.Model || filters.get(route)?.source.baseModel)?.modelName || null,
				// generic: a ServerPage table (has a config file or a published config);
				// resource: built by defineRoutes; custom: hand-written route, filters only.
				kind: resource ? (resource.source.frontendConfig || c?.data?.route ? 'generic' : 'resource') : 'custom',
				protected: PROTECTED_ROUTES.has(route),
				// Built in the model builder rather than in code.
				built: dynamicMounts.has(route),
				settings: state(settingsBy.get(route), 'settings'),
				config: state(c, 'config'),
			};
		});

		return res.status(200).json({ doc, global });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * GET /builder/route?route=products
 *
 * Everything the editor needs for one route: the code version of both files,
 * the published copies and drafts, and the model's real fields.
 */
export const getBuilderRoute = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.query.route || '').trim();
		if (!route) return fail(res, 400, 'route is required');

		const code = codeFor(req.app, route);
		if (!code.model) return fail(res, 404, `No admin route '${route}'`);

		const [settings, config] = await Promise.all(KINDS.map(k => modelFor(k).findOne({ route }).lean()));
		const global = await getGlobalSources();
		const envelope = (doc: any, k: Kind) =>
			doc
				? {
						data: doc.data,
						draft: doc.draft,
						version: doc.version || 0,
						publishedAt: doc.publishedAt || null,
						draftUpdatedAt: doc.draftUpdatedAt || null,
						source: doc.source || 'inherit',
						serving: doc.data && effectiveSource(doc.source, global, k) === 'db' ? 'db' : 'code',
				  }
				: null;

		return res.status(200).json({
			route,
			model: code.model.modelName,
			kind: code.resource ? 'resource' : 'custom',
			protected: PROTECTED_ROUTES.has(route),
			// A model-builder route: its fields are edited there, not here.
			builtModel: dynamicMounts.has(route)
				? await ModelDefinition.findOne({ route }, { _id: 1, name: 1, title: 1 }).lean()
				: null,
			code: { settings: code.settings, config: code.config },
			settings: envelope(settings, 'settings'),
			config: envelope(config, 'config'),
			global,
			fields: listModelFields(code.model),
			models: Object.keys(mongoose.models).sort(),
		});
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** Validation plus, for settings, the safety rules against the code version. */
const check = (req: any, route: string, k: Kind, draft: any) => {
	const validated = validateDraft(k, draft);
	if (validated.error) return { problems: validated.error };
	let value = validated.value;
	if (k === 'settings') {
		const code = codeFor(req.app, route);
		if (!code.resource) return { problems: [`'${route}' isn't built from a settings file; only its config can change.`] };
		// System fields (createdAt; owner, privacy, access) are always as generated.
		value = withSystemFields(value, code.model, code.resource.source.settings);
		const problems = checkSettings({
			route,
			data: value,
			model: code.model,
			codeSettings: code.resource.source.settings,
		});
		if (problems.length) return { problems };
	}
	return { value };
};

/**
 * PUT /builder/draft   { route, kind, draft }
 *
 * Saves a draft. Validated now as well as at publish, so a problem shows up
 * while it's being edited rather than at the last step.
 */
export const saveBuilderDraft = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.body?.route || '').trim();
		const k = kind(req.body?.kind);
		if (!route || !k) return fail(res, 400, 'route and kind (settings | config) are required');

		const code = codeFor(req.app, route);
		if (!code.model) return fail(res, 404, `No admin route '${route}'`);

		const { value, problems } = check(req, route, k, req.body?.draft);
		if (problems) return fail(res, 400, 'The draft has problems', problems);

		const doc = await modelFor(k).findOneAndUpdate(
			{ route },
			{
				$set: { draft: value, draftUpdatedAt: new Date(), draftUpdatedBy: req.user?._id, model: code.model.modelName },
				$setOnInsert: { route, data: null, version: 0 },
			},
			{ upsert: true, new: true }
		);

		return res.status(200).json({ message: 'Draft saved', draftUpdatedAt: doc.draftUpdatedAt });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** DELETE /builder/draft?route=&kind= — throws the draft away. */
export const discardBuilderDraft = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.query.route || '').trim();
		const k = kind(req.query.kind);
		if (!route || !k) return fail(res, 400, 'route and kind are required');

		const doc: any = await modelFor(k).findOne({ route });
		if (!doc) return res.status(200).json({ message: 'Nothing to discard' });

		// A document that only ever held a draft goes entirely, so the route is
		// back to running on code with nothing left over.
		if (!doc.data) await doc.deleteOne();
		else {
			doc.draft = null;
			doc.draftUpdatedAt = undefined;
			await doc.save();
		}
		return res.status(200).json({ message: 'Draft discarded' });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * POST /builder/publish   { route, kinds?: ['settings','config'], note? }
 *
 * Makes the drafts live: each is re-checked, copied into `data`, versioned and
 * snapshotted. All requested kinds are checked before any is written, so a
 * route never ends up with new settings and an old config because the second
 * one failed.
 */
/** A settings copy's formulas, to tell whether a publish changed any. */
const formulaSignature = (data: any) =>
	JSON.stringify(
		(data?.fields || [])
			.filter((f: any) => f?.schema?.type === 'formula')
			.map((f: any) => [f.key, f.schema.formula])
	);

export const publishBuilderRoute = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.body?.route || '').trim();
		if (!route) return fail(res, 400, 'route is required');
		const kinds: Kind[] = (Array.isArray(req.body?.kinds) ? req.body.kinds : KINDS).filter(kind);

		const docs = await Promise.all(kinds.map(k => modelFor(k).findOne({ route })));
		const pending = kinds.map((k, i) => ({ k, doc: docs[i] })).filter(p => p.doc?.draft);
		if (!pending.length) return fail(res, 400, 'Nothing to publish — no drafts for this route');

		// What goes live is the checked draft — with its system fields as generated.
		const checked = new Map<Kind, any>();
		for (const { k, doc } of pending) {
			const { problems, value } = check(req, route, k, doc.draft);
			if (problems) return fail(res, 400, `The ${k} draft has problems`, problems);
			checked.set(k, value);
		}

		const published: any[] = [];
		let recalculated: number | undefined;
		for (const { k, doc } of pending) {
			const before = k === 'settings' ? formulaSignature(doc.data) : '';
			doc.data = checked.get(k);
			doc.draft = null;
			doc.version = (doc.version || 0) + 1;
			doc.publishedAt = new Date();
			doc.publishedBy = req.user?._id;
			doc.markModified('data');
			await doc.save();
			await RouteVersion.create({
				route,
				kind: k,
				version: doc.version,
				data: doc.data,
				note: req.body?.note,
				publishedBy: req.user?._id,
			});
			published.push({ kind: k, version: doc.version });

			// A formula added or changed: every existing record's value, recalculated in the database.
			if (k === 'settings' && formulaSignature(doc.data) !== before) {
				const formulas = formulasOf(dataToSettings(doc.data));
				const model = codeFor(req.app, route).model;
				if (formulas.length && model) recalculated = (await model.updateMany({}, formulaPipeline(formulas))).modifiedCount;
			}
		}

		invalidateRoute(route);
		return res.status(200).json({ message: 'Published', published, ...(recalculated !== undefined && { recalculated }) });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * POST /builder/reset   { route, kind }
 *
 * Puts a route back on its code file: the published copy is snapshotted (so
 * it can be restored) and the document removed.
 */
export const resetBuilderRoute = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.body?.route || '').trim();
		const k = kind(req.body?.kind);
		if (!route || !k) return fail(res, 400, 'route and kind are required');

		const doc: any = await modelFor(k).findOne({ route });
		if (!doc) return res.status(200).json({ message: 'Already running on code' });

		if (doc.data)
			await RouteVersion.create({
				route,
				kind: k,
				version: doc.version || 0,
				data: doc.data,
				note: 'Snapshot before reset to code',
				publishedBy: req.user?._id,
			});
		await doc.deleteOne();

		invalidateRoute(route);
		return res.status(200).json({ message: `'${route}' ${k} reset to code` });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** GET /builder/versions?route=&kind= — published versions, newest first. */
export const getBuilderVersions = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.query.route || '').trim();
		const k = kind(req.query.kind);
		if (!route || !k) return fail(res, 400, 'route and kind are required');

		const doc = await RouteVersion.find({ route, kind: k }, { data: 0 })
			.sort({ version: -1, createdAt: -1 })
			.limit(50)
			.populate({ path: 'publishedBy', select: 'name email' })
			.lean();
		return res.status(200).json({ doc });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * POST /builder/restore   { route, kind, versionId }
 *
 * Loads an earlier version as the draft. It still has to be published, and is
 * checked against today's rules when it is.
 */
export const restoreBuilderVersion = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.body?.route || '').trim();
		const k = kind(req.body?.kind);
		if (!route || !k || !mongoose.isValidObjectId(req.body?.versionId))
			return fail(res, 400, 'route, kind and versionId are required');

		const version: any = await RouteVersion.findOne({ _id: req.body.versionId, route, kind: k }).lean();
		if (!version) return fail(res, 404, 'Version not found');

		const code = codeFor(req.app, route);
		await modelFor(k).findOneAndUpdate(
			{ route },
			{
				$set: { draft: version.data, draftUpdatedAt: new Date(), draftUpdatedBy: req.user?._id },
				$setOnInsert: { route, data: null, version: 0, model: code.model?.modelName },
			},
			{ upsert: true }
		);
		return res.status(200).json({ message: `Version ${version.version} loaded as the draft` });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** GET /builder/model/:name — a model's fields, for relation and option pickers. */
export const getBuilderModelFields = async (req: any, res: Response): Promise<Response> => {
	try {
		const model = mongoose.models[req.params.name];
		if (!model) return fail(res, 404, `Model '${req.params.name}' not found`);
		return res.status(200).json({ model: model.modelName, fields: listModelFields(model) });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * GET /builder/backlinks/:name — routes whose model has a field referencing
 * model `name` (e.g. Blog.author → Author): what a view tab or related list
 * on that model's detail page can list.
 */
export const getBuilderBacklinks = async (req: any, res: Response): Promise<Response> => {
	try {
		const name = req.params.name;
		if (!mongoose.models[name]) return fail(res, 404, `Model '${name}' not found`);
		const doc = collectResourceRoutes(req.app)
			.map(e => ({
				route: e.route,
				model: e.source.Model.modelName,
				fields: listModelFields(e.source.Model)
					.filter(f => f.ref === name)
					.map(f => f.key),
			}))
			.filter(r => r.fields.length)
			.sort((a, b) => a.route.localeCompare(b.route));
		return res.status(200).json({ doc });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/** GET /builder/state — the global source switch. */
export const getBuilderState = async (req: any, res: Response): Promise<Response> => {
	try {
		return res.status(200).json(await getGlobalSources());
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

const SOURCES = ['db', 'code'];

/**
 * PUT /builder/state   { settings?: 'db' | 'code', config?: 'db' | 'code' }
 *
 * Flips every route that follows the global switch at once — the way back to
 * the code files if a published copy misbehaves. Live immediately.
 */
export const setBuilderState = async (req: any, res: Response): Promise<Response> => {
	try {
		const patch: any = {};
		for (const k of KINDS) {
			const v = req.body?.[k];
			if (v === undefined) continue;
			if (!SOURCES.includes(v)) return fail(res, 400, `${k} must be 'db' or 'code'`);
			patch[k] = v;
		}
		if (!Object.keys(patch).length) return fail(res, 400, 'Nothing to change');

		await BuilderState.findOneAndUpdate(
			{ key: 'global' },
			{ $set: { ...patch, updatedBy: req.user?._id }, $setOnInsert: { key: 'global' } },
			{ upsert: true }
		);
		invalidateRoute();
		return res.status(200).json(await getGlobalSources());
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

/**
 * PUT /builder/source   { route, kind, source: 'inherit' | 'db' | 'code' }
 *
 * Pins one route to its DB copy or its code file, or back to following the
 * global switch. Live immediately; drafts and versions are untouched.
 */
export const setBuilderSource = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.body?.route || '').trim();
		const k = kind(req.body?.kind);
		const source = req.body?.source;
		if (!route || !k || !['inherit', 'db', 'code'].includes(source))
			return fail(res, 400, "route, kind and source ('inherit' | 'db' | 'code') are required");

		const doc: any = await modelFor(k).findOne({ route });
		if (!doc) {
			// Without a document the route runs on code regardless.
			if (source === 'db') return fail(res, 400, `'${route}' has no ${k} copy in the DB to use — publish one first`);
			return res.status(200).json({ message: 'Already running on code' });
		}
		if (source === 'db' && !doc.data)
			return fail(res, 400, `'${route}' ${k} has only a draft — publish it before switching to it`);

		doc.source = source;
		doc.sourceUpdatedAt = new Date();
		doc.sourceUpdatedBy = req.user?._id;
		await doc.save();

		invalidateRoute(route);
		return res.status(200).json({ message: `'${route}' ${k} source set to ${source}` });
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};

// Key order carries no meaning in these objects (a copy that went through
// Mongo can come back reordered), so it's compared away; array order does.
const stable = (v: any): any =>
	Array.isArray(v)
		? v.map(stable)
		: v && typeof v === 'object'
			? Object.keys(v)
					.sort()
					.reduce((o: any, k) => ((o[k] = stable(v[k])), o), {})
			: v;
const same = (a: any, b: any) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));

/** Field-level differences between two settings copies. */
const diffSettings = (code: any, other: any) => {
	if (!code || !other) return null;
	const byKey = (d: any) => new Map((d.fields || []).map((f: any) => [f.key, f]));
	const a = byKey(code);
	const b = byKey(other);
	const added = [...b.keys()].filter(k => !a.has(k));
	const removed = [...a.keys()].filter(k => !b.has(k));
	const changed = [...b.keys()]
		.filter(k => a.has(k) && !same(a.get(k), b.get(k)))
		.map(k => {
			const x: any = a.get(k);
			const y: any = b.get(k);
			const props = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(p => !same(x[p], y[p]));
			return { key: k, props };
		});
	const common = [...b.keys()].filter(k => a.has(k));
	const reordered = !same(
		[...a.keys()].filter(k => b.has(k)),
		common
	);
	return { added, removed, changed, reordered, identical: !added.length && !removed.length && !changed.length && !reordered };
};

/** Section-level differences between two config copies. */
const diffConfig = (code: any, other: any) => {
	if (!code || !other) return null;
	const sections = [...new Set([...Object.keys(code), ...Object.keys(other)])].filter(k => k !== 'route');
	const changed = sections.filter(k => !same(code[k], other[k]));
	const routeKeys = [...new Set([...Object.keys(code.route || {}), ...Object.keys(other.route || {})])].filter(
		k => !same(code.route?.[k], other.route?.[k])
	);
	return { changed, route: routeKeys, identical: !changed.length && !routeKeys.length };
};

/**
 * GET /builder/compare?route=
 *
 * How the published copy (and the draft) differ from the code files — what
 * switching a route between DB and code would actually change.
 */
export const compareBuilderRoute = async (req: any, res: Response): Promise<Response> => {
	try {
		const route = String(req.query.route || '').trim();
		if (!route) return fail(res, 400, 'route is required');
		const code = codeFor(req.app, route);
		if (!code.model) return fail(res, 404, `No admin route '${route}'`);

		const [settings, config]: any[] = await Promise.all(KINDS.map(k => modelFor(k).findOne({ route }).lean()));
		return res.status(200).json({
			route,
			settings: {
				published: diffSettings(code.settings, settings?.data),
				draft: diffSettings(code.settings, settings?.draft),
			},
			config: {
				published: diffConfig(code.config, config?.data),
				draft: diffConfig(code.config, config?.draft),
			},
		});
	} catch (e: any) {
		console.error(e.message);
		return res.status(500).json({ message: e.message });
	}
};
