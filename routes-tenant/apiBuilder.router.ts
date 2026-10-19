import express from 'express';
import { signInRoles } from '../library/functions/authMapping.function.js';
import mongoose from 'mongoose';
import ApiEndpoint, { ENDPOINT_ACTIONS } from '../library/models/tenancy/apiEndpoint.model.js';
import ServerKey, { hashServerKey, newServerKey } from '../library/models/tenancy/serverKey.model.js';
import ProjectCustomer from '../library/models/tenancy/projectCustomer.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { regenerateProjectKey } from '../library/functions/projectKey.function.js';
import {
	ACTION_LABEL,
	checkEndpoint,
	ensureEndpoints,
	newStandard,
	pathTaken,
	ruleFields,
	standardPath,
	syncSummary,
} from '../library/functions/apiEndpoints.function.js';
import { syncDynamicModels } from '../library/functions/dynamicModels.function.js';
import { defaultPopulate, defsByName, populateOptions } from '../library/functions/contentPopulate.function.js';
import { listCapabilities } from '../library/functions/publicRecords.function.js';
import ApiCall from '../library/models/tenancy/apiCall.model.js';
import { findLogs, logSummary, logView } from '../library/functions/apiLogs.function.js';

/**
 * /tenant/api/p/:projectId/api-builder — the project's public API as endpoints
 * (docs/api-builder AB-02). Everything here needs Build.
 *
 *   GET    /overview                   counts, models, the newest calls
 *   GET    /endpoints                  every endpoint (standard ones made from `publicApi` first), and the models
 *   GET    /endpoints/:id              one, with its model's fields and rule fields
 *   POST   /endpoints                  a custom endpoint { name, note, model, action, path, access, fields, list, populate, enabled }
 *   POST   /endpoints/generate         { model, actions[], who }   a model's standard endpoints
 *   PUT    /endpoints/:id              the same as POST, whole (a standard one keeps its model, action and path)
 *   PATCH  /endpoints/:id              { enabled }
 *   DELETE /endpoints/:id
 *   GET    /keys                       server keys (never their secret)
 *   POST   /keys                       { name } → the key's secret, once
 *   DELETE /keys/:id                   revoke
 *   POST   /project-key                a new project key (docs/api-builder D14); the old one stops at once
 *   GET    /logs                       calls, newest first: ?hours (1|24|168) &endpoint (an id, or none) &status
 *                                      (ok|errors|4xx|5xx|a code) &method &who &customer &key &q &before (cursor) &limit
 *   GET    /logs/summary               the same filters: totals, typical/slow times, a chart, top errors and endpoints
 *   GET    /logs/:id                   one call
 *
 * A bad endpoint answers 400 with `on`, the input at fault ("access.when.1").
 */
const router = express.Router({ mergeParams: true });
router.use(tenantPermissions(['build']));
// Links inside components (populate, docs/cms CMS-09) need the project's components loaded.
router.use('/endpoints', (req: any, _res: any, next: any) => syncDynamicModels({ app: req.app }).then(() => next(), next));

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const view = (e: any) => ({
	_id: String(e._id),
	name: e.name,
	note: e.note || '',
	model: e.model,
	action: e.action,
	method: e.method,
	path: e.path,
	standard: !!e.standard,
	enabled: e.enabled !== false,
	access: { who: e.access?.who || 'anyone', when: e.access?.when || [], match: e.access?.match || 'all', customerRoles: e.access?.customerRoles || [] },
	fields: { out: e.fields?.out ?? null, write: e.fields?.write ?? null, readOnly: e.fields?.readOnly || [] },
	list: {
		filters: e.list?.filters || [],
		callerFilters: e.list?.callerFilters !== false,
		sort: e.list?.sort || '',
		limit: e.list?.limit || 20,
		maxLimit: e.list?.maxLimit || 100,
	},
	populate: e.populate ?? null,
	stats: { calls: e.stats?.calls || 0, lastCalledAt: e.stats?.lastCalledAt || null },
	createdAt: e.createdAt,
	updatedAt: e.updatedAt,
});

/** A model as the endpoint editors need it: its fields, what rules can name, what a list can be filtered and sorted by. */
const modelView = (d: any, defs?: Map<string, any>) => ({
	route: d.route,
	drafts: !!d.draftAndPublish,
	single: d.kind === 'single',
	// The links its reads can fill (docs/cms CMS-09), and the ones filled when the endpoint names none.
	...(defs && { populate: populateOptions(d, defs), populateDefault: defaultPopulate(d, defs) }),
	name: d.name,
	title: d.title || d.name,
	fields: (d.fields || [])
		.filter((f: any) => !['section', 'sectionlist', 'component', 'blocks'].includes(f.kind))
		.map((f: any) => ({
			key: f.key,
			label: f.label || f.key,
			kind: f.kind,
			required: !!f.required,
			...(f.ref && { ref: f.ref }),
			...(f.options?.length && { options: f.options.map((o: any) => ({ value: o.value, label: o.label || o.value })) }),
		})),
	ruleFields: ruleFields(d),
	sort: listCapabilities(d).sort,
});

const load = async (id: any) => {
	if (!isId(id)) throw new TenancyError(404, 'Endpoint not found');
	const e: any = await ApiEndpoint.findById(id).lean();
	if (!e) throw new TenancyError(404, 'Endpoint not found');
	return e;
};

const models = async () =>
	(await ModelDefinition.find({ active: { $ne: false } }, { route: 1, name: 1, title: 1, fields: 1, kind: 1, draftAndPublish: 1, publicApi: 1, displayField: 1, code: 1 })
		.sort({ title: 1 })
		.lean()) as any[];

/** Saves, turning a duplicate path into a 400 on `path`. */
const saving = async <T>(doc: any, run: () => Promise<T>) => {
	try {
		return await run();
	} catch (e: any) {
		if (e?.code === 11000) throw pathTaken(doc);
		throw e;
	}
};

const said = (req: any, e: any, text: string, action: 'create' | 'update' | 'delete' = 'update') =>
	recordProjectEvent({ req, action, model: 'ApiEndpoint', modelPath: 'public-api/endpoints', document: e._id, name: e.name, text });

/* ------------------------------------------------------------ overview */

router.get(
	'/overview',
	handle(async () => {
		await ensureEndpoints();
		const [endpoints, keys, customers, defs]: any[] = await Promise.all([
			ApiEndpoint.find({}).lean(),
			ServerKey.countDocuments({ revokedAt: null }),
			ProjectCustomer.countDocuments({}),
			models(),
		]);
		const on = endpoints.filter((e: any) => e.enabled !== false);
		const recent = [...endpoints]
			.filter((e: any) => e.stats?.lastCalledAt)
			.sort((a: any, b: any) => +new Date(b.stats.lastCalledAt) - +new Date(a.stats.lastCalledAt))
			.slice(0, 5)
			.map(view);
		return {
			endpoints: { total: endpoints.length, on: on.length, custom: endpoints.filter((e: any) => !e.standard).length },
			who: {
				anyone: on.filter((e: any) => (e.access?.who || 'anyone') === 'anyone').length,
				customer: on.filter((e: any) => e.access?.who === 'customer').length,
				key: on.filter((e: any) => e.access?.who === 'key').length,
			},
			calls: endpoints.reduce((n: number, e: any) => n + (e.stats?.calls || 0), 0),
			keys,
			customers,
			models: defs.map((d: any) => ({
				route: d.route,
				title: d.title || d.name,
				endpoints: endpoints.filter((e: any) => e.model === d.route).length,
				on: on.filter((e: any) => e.model === d.route).length,
			})),
			recent,
		};
	})
);

/* ----------------------------------------------------------- endpoints */

router.get(
	'/endpoints',
	handle(async req => {
		await ensureEndpoints();
		const [docs, defs]: any[] = await Promise.all([ApiEndpoint.find({}).sort({ model: 1, standard: -1, path: 1, method: 1 }).lean(), models()]);
		const byName = defsByName(defs);
		return { doc: docs.map(view), total: docs.length, models: defs.map((d: any) => modelView(d, byName)), signIn: await signInRoles(req.project) };
	})
);

router.get(
	'/endpoints/:id',
	handle(async req => {
		const e = await load(req.params.id);
		const defs = await models();
		const def: any = defs.find((d: any) => d.route === e.model);
		return { ...view(e), modelInfo: def ? modelView(def, defsByName(defs)) : null, signIn: await signInRoles(req.project) };
	})
);

router.post(
	'/endpoints/generate',
	handle(async (req, res) => {
		const route = String(req.body?.model || '').toLowerCase();
		const def: any = await ModelDefinition.findOne({ route, active: { $ne: false } }).lean();
		if (!def) throw Object.assign(new TenancyError(400, 'Pick a model'), { extra: { on: 'model' } });
		const actions: string[] = (Array.isArray(req.body?.actions) ? req.body.actions : ['list', 'get']).filter((a: any) =>
			(ENDPOINT_ACTIONS as readonly string[]).includes(a)
		);
		if (!actions.length) throw Object.assign(new TenancyError(400, 'Pick at least one action'), { extra: { on: 'actions' } });
		const who = ['anyone', 'customer', 'key'].includes(req.body?.who) ? req.body.who : 'anyone';
		const auth = { anyone: 'none', customer: 'customer', key: 'key' }[who as 'anyone'] as any;
		await ensureEndpoints();
		const made: any[] = [];
		const turnedOn: any[] = [];
		const skipped: string[] = [];
		for (const action of actions) {
			const existing: any = await ApiEndpoint.findOne({ model: route, action, standard: true }).lean();
			if (existing) {
				if (!existing.enabled) {
					await ApiEndpoint.updateOne({ _id: existing._id }, { $set: { enabled: true, updatedBy: req.user._id } });
					turnedOn.push(existing);
				} else skipped.push(`${existing.method} ${existing.path}`);
				continue;
			}
			// Owner-only for customers' own records is a choice made after, on the endpoint's Access tab.
			const doc = { ...newStandard(def, action, { auth, ownerOnly: false, readOnlyFields: [] }), createdBy: req.user._id, updatedBy: req.user._id };
			try {
				made.push((await ApiEndpoint.create(doc)).toObject());
			} catch (e: any) {
				if (e?.code !== 11000) throw e;
				skipped.push(`${doc.method} ${standardPath(route, action)} (a custom endpoint answers there)`);
			}
		}
		await syncSummary(route);
		if (made.length || turnedOn.length)
			recordProjectEvent({
				req,
				action: 'create',
				model: 'ApiEndpoint',
				modelPath: 'public-api/endpoints',
				document: [...made, ...turnedOn][0]._id,
				name: def.title || def.name,
				text: `generated the API for ${def.title || def.name}: ${[...made, ...turnedOn].map(e => ACTION_LABEL[e.action]).join(', ')}`,
			});
		res.status(201);
		return { made: made.map(view), turnedOn: turnedOn.map(e => view({ ...e, enabled: true })), skipped };
	})
);

router.post(
	'/endpoints',
	handle(async (req, res) => {
		const { doc } = await checkEndpoint(req.body || {});
		const e: any = await saving(doc, () => ApiEndpoint.create({ ...doc, standard: false, createdBy: req.user._id, updatedBy: req.user._id }));
		await syncSummary(doc.model);
		said(req, e, `created the endpoint ${doc.method} ${doc.path}`, 'create');
		res.status(201);
		return view(e.toObject());
	})
);

router.put(
	'/endpoints/:id',
	handle(async req => {
		const current = await load(req.params.id);
		const { doc } = await checkEndpoint(req.body || {}, current);
		await saving(doc, () => ApiEndpoint.updateOne({ _id: current._id }, { $set: { ...doc, updatedBy: req.user._id } }));
		await syncSummary(doc.model);
		said(req, current, `changed the endpoint ${doc.method} ${doc.path}`);
		return view(await load(current._id));
	})
);

router.patch(
	'/endpoints/:id',
	handle(async req => {
		const current = await load(req.params.id);
		if (typeof req.body?.enabled !== 'boolean') throw new TenancyError(400, 'Send { enabled: true | false }');
		await ApiEndpoint.updateOne({ _id: current._id }, { $set: { enabled: req.body.enabled, updatedBy: req.user._id } });
		await syncSummary(current.model);
		said(req, current, `turned ${req.body.enabled ? 'on' : 'off'} the endpoint ${current.method} ${current.path}`);
		return view(await load(current._id));
	})
);

router.delete(
	'/endpoints/:id',
	handle(async req => {
		const current = await load(req.params.id);
		await ApiEndpoint.deleteOne({ _id: current._id });
		await syncSummary(current.model);
		said(req, current, `deleted the endpoint ${current.method} ${current.path}`, 'delete');
		return { message: 'Deleted' };
	})
);

/* ---------------------------------------------------------------- keys */

const keyView = (k: any) => ({
	_id: String(k._id),
	name: k.name,
	last4: k.last4,
	createdAt: k.createdAt,
	createdByName: k.createdByName || '',
	lastUsedAt: k.lastUsedAt || null,
	revokedAt: k.revokedAt || null,
});

router.get(
	'/keys',
	handle(async () => {
		const docs = await ServerKey.find({}).sort({ revokedAt: 1, createdAt: -1 }).limit(200).lean();
		return { doc: docs.map(keyView), total: docs.length };
	})
);

router.post(
	'/keys',
	handle(async (req, res) => {
		const name = String(req.body?.name || '').trim();
		if (!name) throw Object.assign(new TenancyError(400, 'Name the key — what will use it?'), { extra: { on: 'name' } });
		if (name.length > 80) throw Object.assign(new TenancyError(400, 'At most 80 characters'), { extra: { on: 'name' } });
		if ((await ServerKey.countDocuments({ revokedAt: null })) >= 50) throw new TenancyError(400, 'A project can have 50 keys — revoke one you no longer use.');
		const secret = newServerKey();
		const k: any = await ServerKey.create({ name, hash: hashServerKey(secret), last4: secret.slice(-4), createdBy: req.user._id, createdByName: req.user.name || '' });
		recordProjectEvent({ req, action: 'create', model: 'ServerKey', modelPath: 'public-api/keys', document: k._id, name, text: `made the server key “${name}”` });
		res.status(201);
		// The only time the secret leaves the server.
		return { ...keyView(k.toObject()), secret };
	})
);

router.delete(
	'/keys/:id',
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(404, 'Key not found');
		const k: any = await ServerKey.findById(req.params.id).lean();
		if (!k) throw new TenancyError(404, 'Key not found');
		if (!k.revokedAt) await ServerKey.updateOne({ _id: k._id }, { $set: { revokedAt: new Date() } });
		recordProjectEvent({ req, action: 'delete', model: 'ServerKey', modelPath: 'public-api/keys', document: k._id, name: k.name, text: `revoked the server key “${k.name}”` });
		return { message: 'Revoked' };
	})
);

// The project key names the project on the public API (D14). Reading it is
// GET /p/:project/project-key, for anyone in the project (snippets need it).
router.post(
	'/project-key',
	handle(async req => {
		const apiKey = await regenerateProjectKey(req.project);
		recordProjectEvent({ req, action: 'update', model: 'TenantProject', modelPath: 'public-api/keys', document: req.project._id, name: 'Project key', text: 'made a new project key — the old one no longer works' });
		return { apiKey };
	})
);

/* ---------------------------------------------------------------- logs */

router.get(
	'/logs',
	handle(async req => findLogs(req.query))
);

router.get(
	'/logs/summary',
	handle(async req => logSummary(req.query))
);

router.get(
	'/logs/:id',
	handle(async req => {
		if (!isId(req.params.id)) throw new TenancyError(404, 'That call isn’t in the log — calls are kept 7 days.');
		const c: any = await ApiCall.findById(req.params.id).lean();
		if (!c) throw new TenancyError(404, 'That call isn’t in the log — calls are kept 7 days.');
		return logView(c);
	})
);

export default router;
