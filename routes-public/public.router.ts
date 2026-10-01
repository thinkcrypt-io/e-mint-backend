import express from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import ProjectCustomer, { CUSTOMER_TOKEN_KIND } from '../library/models/tenancy/projectCustomer.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { runInScope } from '../library/functions/tenantScope.function.js';
import {
	compiledModel,
	displayFieldOf,
	generateSettings,
	makeTargetLookup,
	syncDynamicModels,
} from '../library/functions/dynamicModels.function.js';
import { getActiveSettings } from '../library/functions/resolveRoute.function.js';
import { dataToSettings } from '../library/functions/routeRegistry.function.js';
import { applyFormulas, formulasOf, stripFormulaKeys } from '../library/functions/formula.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';

/**
 * /public/api/:project — a tenant project's public API (docs/multi-tenancy
 * WO-11), for the tenant's own website or app. No admin or tenant token: the
 * project is named by its `publicSlug`, and each model answers only the
 * actions its builder turned on (ModelDefinition.publicApi).
 *
 *   GET  /                      the project's public info (name, type, models)
 *   POST /auth/register         { name, email, password }  → { token, customer }
 *   POST /auth/login            { email, password }        → { token, customer }
 *   GET  /auth/me               the signed-in customer
 *   PUT  /auth/me               { name, phone }
 *   POST /auth/logout-everywhere  signs every device out
 *   GET  /:route                list   ?page&limit(≤100)&sort=field|-field&<field>=<value>
 *   GET  /:route/:id            get
 *   POST /:route                create
 *   PUT  /:route/:id            update
 *   DELETE /:route/:id          delete
 *
 * A model with `auth: 'customer'` needs `Authorization: Bearer <customer
 * token>` of this project; with `ownerOnly` each customer only reaches the
 * records they created. Only the model's own fields go in and out (plus _id,
 * code, createdAt, updatedAt) — never `customer`, never anything else.
 */

const router = express.Router({ mergeParams: true });

const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';
const authLimit = rateLimit({ name: 'public-auth', windowMs: 15 * 60 * 1000, max: 40 });
const apiLimit = rateLimit({ name: 'public-api', windowMs: 60 * 1000, max: 300 });

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

/* -------------------------------------------------------- the project */

router.use(apiLimit);

// The project by its public slug; the rest of the request runs in its scope.
router.use(async (req: any, res: any, next: any) => {
	try {
		const slug = String(req.params.project || '').toLowerCase();
		const project: any = /^[a-z0-9-]{1,120}$/.test(slug) ? await TenantProject.findOne({ publicSlug: slug }).lean() : null;
		if (!project || project.isActive === false) return res.status(404).json({ message: 'Not found' });
		const org: any = await Organization.findById(project.organization, { isActive: 1 }).lean();
		if (!org || org.isActive === false) return res.status(404).json({ message: 'Not found' });
		req.project = project;
		runInScope({ organization: project.organization, project: project._id }, () => next());
	} catch (e) {
		next(e);
	}
});

/** The signed-in customer of this project, or null. */
const customerOf = async (req: any) => {
	const header = String(req.headers.authorization || '');
	if (!header.startsWith('Bearer ')) return null;
	try {
		const claims: any = jwt.verify(header.slice(7).trim(), secret());
		if (claims?.kind !== CUSTOMER_TOKEN_KIND || claims.project !== String(req.project._id)) return null;
		const customer: any = await ProjectCustomer.findById(claims._id).lean();
		if (!customer || customer.isActive === false || (customer.tokenVersion || 0) !== (claims.v || 0)) return null;
		return customer;
	} catch {
		return null;
	}
};

const publicCustomer = (c: any) => ({ _id: String(c._id), name: c.name, email: c.email, phone: c.phone || '', createdAt: c.createdAt });

/* ------------------------------------------------------------- models */

/** The project's models with a public API, by route. */
const publicDefs = async () => {
	const defs: any[] = await ModelDefinition.find({ active: { $ne: false }, 'publicApi.enabled': true }).lean();
	return new Map(defs.map(d => [d.route, d]));
};

router.get(
	'/',
	handle(async req => {
		const defs = await publicDefs();
		return {
			name: req.project.name,
			type: req.project.type,
			slug: req.project.publicSlug,
			auth: { register: 'auth/register', login: 'auth/login', me: 'auth/me' },
			models: [...defs.values()].map(d => ({
				route: d.route,
				title: d.title,
				actions: d.publicApi.actions || [],
				auth: d.publicApi.auth || 'none',
				ownerOnly: !!d.publicApi.ownerOnly,
				fields: d.fields.map((f: any) => ({ key: f.key, label: f.label || f.key, kind: f.kind, required: !!f.required, ...(f.options?.length && { options: f.options.map((o: any) => o.value) }) })),
			})),
		};
	})
);

/* --------------------------------------------------------- customers */

const password = Joi.string().min(8).max(200).required().messages({ 'string.min': 'Use at least 8 characters for the password' });

router.post(
	'/auth/register',
	authLimit,
	handle(async req => {
		const body = check(
			Joi.object({
				name: Joi.string().trim().min(1).max(120).required(),
				email: Joi.string().trim().lowercase().email().required(),
				phone: Joi.string().trim().max(40).allow(''),
				password,
			}),
			req.body
		);
		if (await ProjectCustomer.exists({ email: body.email }))
			throw new TenancyError(400, 'An account with this email exists — sign in instead.', 'email_taken');
		const customer: any = await ProjectCustomer.create({ ...body, lastLoginAt: new Date() });
		return { token: customer.generateToken(), customer: publicCustomer(customer) };
	})
);

router.post(
	'/auth/login',
	authLimit,
	handle(async req => {
		const body = check(Joi.object({ email: Joi.string().trim().lowercase().email().required(), password: Joi.string().required() }), req.body);
		const customer: any = await ProjectCustomer.findOne({ email: body.email }).select('+password');
		if (!customer || !(await customer.checkPassword(body.password))) throw new TenancyError(400, 'That email and password don’t match.');
		if (customer.isActive === false) throw new TenancyError(400, 'This account has been switched off.');
		customer.lastLoginAt = new Date();
		await customer.save();
		return { token: customer.generateToken(), customer: publicCustomer(customer) };
	})
);

const signedIn = async (req: any) => {
	const customer = await customerOf(req);
	if (!customer) throw new TenancyError(401, 'Sign in first.', 'customer_required');
	return customer;
};

router.get('/auth/me', handle(async req => publicCustomer(await signedIn(req))));

router.put(
	'/auth/me',
	handle(async req => {
		const customer = await signedIn(req);
		const body = check(Joi.object({ name: Joi.string().trim().min(1).max(120), phone: Joi.string().trim().max(40).allow('') }), req.body);
		const doc = await ProjectCustomer.findByIdAndUpdate(customer._id, { $set: body }, { new: true }).lean();
		return publicCustomer(doc);
	})
);

router.post(
	'/auth/logout-everywhere',
	handle(async req => {
		const customer = await signedIn(req);
		await ProjectCustomer.updateOne({ _id: customer._id }, { $inc: { tokenVersion: 1 } });
		return { message: 'Signed out everywhere' };
	})
);

/* --------------------------------------------- the site API (websites) */

/**
 * For website projects (WO-18): the site in one or two calls instead of
 * stitching the kit's models together. Read-only, published records only.
 *
 *   GET /site                      the site settings (first record) and its menu
 *   GET /pages/by-path?path=/about  a published page, its SEO, and its visible
 *                                  published contents in priority order
 *
 * Built on the kit's models (website kit routes); a site that renamed or
 * removed them gets 404 here and can use the per-model routes instead.
 */
const kitModel = async (req: any, route: string) => {
	await syncDynamicModels({ app: req.app });
	const def: any = (await publicDefs()).get(route);
	return def ? { def, Model: compiledModel(def.name) } : null;
};

const menuOf = async (req: any) => {
	const pages = await kitModel(req, 'pages');
	if (!pages?.Model) return [];
	const list: any[] = await pages.Model.find({ status: 'published', showInMenu: { $ne: false } }, { name: 1, path: 1, parent: 1, priority: 1 })
		.sort({ priority: -1, name: 1 })
		.lean();
	return list.map(p => ({ _id: String(p._id), name: p.name, path: p.path, parent: p.parent ? String(p.parent) : null }));
};

router.get(
	'/site',
	handle(async req => {
		if (req.project.type !== 'website') throw new TenancyError(404, 'Not found');
		const settings = await kitModel(req, 'site-settings');
		const doc = settings?.Model ? await settings.Model.findOne({}).sort({ createdAt: 1 }).lean() : null;
		return { settings: doc ? shape(doc, settings!.def) : null, menu: await menuOf(req) };
	})
);

router.get(
	'/pages/by-path',
	handle(async req => {
		if (req.project.type !== 'website') throw new TenancyError(404, 'Not found');
		const path = String(req.query.path || '/').trim() || '/';
		const [pages, seo, contents] = await Promise.all([kitModel(req, 'pages'), kitModel(req, 'seo'), kitModel(req, 'web-contents')]);
		if (!pages?.Model) throw new TenancyError(404, 'Not found');
		const page: any = await pages.Model.findOne({ path, status: 'published' }).lean();
		if (!page) throw new TenancyError(404, 'No published page at that path');
		const [seoDoc, blocks]: any = await Promise.all([
			seo?.Model ? seo.Model.findOne({ page: page._id }).lean() : null,
			contents?.Model
				? contents.Model.find({ page: page._id, status: 'published', isVisible: { $ne: false } }).sort({ priority: -1, createdAt: 1 }).lean()
				: [],
		]);
		return {
			page: shape(page, pages.def),
			seo: seoDoc ? shape(seoDoc, seo!.def) : null,
			contents: (blocks || []).map((b: any) => shape(b, contents!.def)),
		};
	})
);

/* ------------------------------------------------------- model routes */

const SYSTEM_OUT = ['_id', 'code', 'createdAt', 'updatedAt'];
const FILTERABLE = new Set(['text', 'email', 'url', 'select', 'multiselect', 'tags', 'number', 'boolean', 'date', 'reference']);

type Ctx = { def: any; Model: mongoose.Model<any>; customer: any | null; formulas: any[] };

/** The model behind `/:route`, if `action` is public — and the customer when it needs one. */
const open = async (req: any, action: string): Promise<Ctx> => {
	await syncDynamicModels({ app: req.app });
	const def: any = (await publicDefs()).get(String(req.params.route || ''));
	if (!def || !(def.publicApi.actions || []).includes(action)) throw new TenancyError(404, 'Not found');
	const Model = compiledModel(def.name);
	if (!Model) throw new TenancyError(404, 'Not found');
	const customer = await customerOf(req);
	if (def.publicApi.auth === 'customer' && !customer) throw new TenancyError(401, 'Sign in first.', 'customer_required');
	// The route's settings as the panels use them (a published copy, or generated) — for formulas.
	const published = await getActiveSettings(def.route);
	const settings = published?.data ? dataToSettings(published.data) : generateSettings(def, makeTargetLookup(req.app, [def]));
	return { def, Model, customer, formulas: formulasOf(settings) };
};

/** Only the owner's records, when the model is owner-only. */
const owned = (ctx: Ctx) => (ctx.def.publicApi.ownerOnly ? { customer: ctx.customer!._id } : {});

const fieldKeys = (def: any) => def.fields.filter((f: any) => f.kind !== 'formula').map((f: any) => f.key);
const outKeys = (def: any) => [...SYSTEM_OUT, ...def.fields.map((f: any) => f.key)];

/**
 * How linked records come out: by their naming field. Returned as options (not
 * applied to a query here — awaiting a Mongoose query runs it).
 */
const refPopulates = async (def: any) => {
	const defs: any[] = await ModelDefinition.find({}, { name: 1, fields: 1, displayField: 1, code: 1 }).lean();
	const byName = new Map(defs.map(d => [d.name, d]));
	return def.fields
		.filter((f: any) => (f.kind === 'reference' || f.kind === 'references') && byName.get(f.ref))
		.map((f: any) => ({ path: f.key, select: `_id ${displayFieldOf(byName.get(f.ref))}` }));
};

const shape = (doc: any, def: any) => {
	if (!doc) return doc;
	const out: any = {};
	for (const k of outKeys(def)) if (doc[k] !== undefined) out[k] = doc[k];
	return out;
};

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

router.get(
	'/:route',
	handle(async req => {
		const ctx = await open(req, 'list');
		const { def, Model } = ctx;
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const query: any = { ...owned(ctx) };
		for (const f of def.fields) {
			if (!FILTERABLE.has(f.kind) || req.query[f.key] === undefined) continue;
			const raw = String(req.query[f.key]);
			if (f.kind === 'number') query[f.key] = Number(raw);
			else if (f.kind === 'boolean') query[f.key] = raw === 'true';
			else if (f.kind === 'reference') {
				if (isId(raw)) query[f.key] = raw;
			} else query[f.key] = raw;
		}
		const sortKey = String(req.query.sort || '-createdAt');
		const field = sortKey.replace(/^-/, '');
		const sort: any = outKeys(def).includes(field) ? { [field]: sortKey.startsWith('-') ? -1 : 1 } : { createdAt: -1 };
		const populate = await refPopulates(def);
		const find = Model.find(query).select(outKeys(def).join(' ')).sort(sort).skip((page - 1) * limit).limit(limit).populate(populate);
		const [docs, total] = await Promise.all([find.lean(), Model.countDocuments(query)]);
		return { doc: docs.map((d: any) => shape(d, def)), total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
	})
);

router.get(
	'/:route/:id',
	handle(async req => {
		const ctx = await open(req, 'get');
		if (!isId(req.params.id)) throw new TenancyError(404, 'Not found');
		const populate = await refPopulates(ctx.def);
		const doc = await ctx.Model.findOne({ _id: req.params.id, ...owned(ctx) }).select(outKeys(ctx.def).join(' ')).populate(populate).lean();
		if (!doc) throw new TenancyError(404, 'Not found');
		return shape(doc, ctx.def);
	})
);

/** The body, cut down to the model's own (non-formula) fields. */
const bodyOf = (req: any, ctx: Ctx) => {
	const body: any = {};
	for (const k of fieldKeys(ctx.def)) if (req.body?.[k] !== undefined) body[k] = req.body[k];
	stripFormulaKeys(body, ctx.formulas);
	return body;
};

const invalid = (e: any) => {
	if (e?.name === 'ValidationError') {
		const first: any = Object.values(e.errors || {})[0];
		return new TenancyError(400, first?.message || 'That isn’t valid');
	}
	if (e?.code === 11000) return new TenancyError(400, 'A record with that value already exists');
	if (e?.name === 'CastError') return new TenancyError(400, `${e.path} isn’t valid`);
	return e;
};

router.post(
	'/:route',
	handle(async (req, res) => {
		const ctx = await open(req, 'create');
		const doc: any = new ctx.Model({ ...bodyOf(req, ctx), ...(ctx.customer && { customer: ctx.customer._id }) });
		applyFormulas(doc, ctx.formulas);
		try {
			await doc.save();
		} catch (e) {
			throw invalid(e);
		}
		res.status(201);
		return shape(doc.toObject(), ctx.def);
	})
);

router.put(
	'/:route/:id',
	handle(async req => {
		const ctx = await open(req, 'update');
		if (!isId(req.params.id)) throw new TenancyError(404, 'Not found');
		const doc: any = await ctx.Model.findOne({ _id: req.params.id, ...owned(ctx) });
		if (!doc) throw new TenancyError(404, 'Not found');
		doc.set(bodyOf(req, ctx));
		applyFormulas(doc, ctx.formulas);
		try {
			await doc.save();
		} catch (e) {
			throw invalid(e);
		}
		return shape(doc.toObject(), ctx.def);
	})
);

router.delete(
	'/:route/:id',
	handle(async req => {
		const ctx = await open(req, 'delete');
		if (!isId(req.params.id)) throw new TenancyError(404, 'Not found');
		const gone = await ctx.Model.findOneAndDelete({ _id: req.params.id, ...owned(ctx) });
		if (!gone) throw new TenancyError(404, 'Not found');
		return { message: 'Deleted' };
	})
);

export default router;
