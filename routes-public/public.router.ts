import express from 'express';
import { lockedChanges } from '../library/functions/fieldLocks.function.js';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import Organization from '../library/models/tenancy/organization.model.js';
import ProjectCustomer, { CUSTOMER_TOKEN_KIND } from '../library/models/tenancy/projectCustomer.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { currentScope, runInScope } from '../library/functions/tenantScope.function.js';
import {
	compiledModel,
	displayFieldOf,
	generateSettings,
	makeTargetLookup,
	syncDynamicModels,
} from '../library/functions/dynamicModels.function.js';
import { getActiveSettings } from '../library/functions/resolveRoute.function.js';
import { dataToSettings } from '../library/functions/routeRegistry.function.js';
import { applyFormulasLinked, formulasOf, stripFormulaKeys } from '../library/functions/formula.function.js';
import { recalculateDependents } from '../library/functions/formulaDependents.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import WebsiteEvent, { DEVICE_TYPES, EVENT_TYPES } from '../library/models/tenancy/websiteEvent.model.js';
import { clientIp, locate, parseUserAgent } from '../library/functions/sessions.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { loadSite, publicConfig, publicSettings, robotsTxt, siteOrigin, siteTags, sitemapXml } from '../library/functions/siteConfig.function.js';
import { contactOf, forwardConversion, forwardPageviews, visitorOf } from '../library/functions/serverTracking.function.js';
import { later, notifyTenant, projectAudience, projectHrefFor } from '../library/functions/tenantNotify.function.js';
import { fireWebhooks } from '../library/functions/webhooks.function.js';
import { fireAutomations } from '../library/functions/automations.function.js';
import { LinkedError, linkedForApi, linkedRulesOf } from '../library/functions/linkedRelationships.function.js';
import { resolveOther, resources } from '../library/controllers/builder/viewDocument.controller.js';
import { loadWidgets, publicWidgets } from '../library/functions/widgets.function.js';
import { accountByEmail, accountsModel, currentAccount, customerRole, linkCustomerRecord, registerInModel, signInLocked, syncCustomerRecord } from '../library/functions/authMapping.function.js';
import { welcomeCustomer } from '../library/functions/mail.function.js';
import { canEmailCustomers, resetPassword, sendResetLink } from '../library/functions/customerReset.function.js';
import { checkout, checkoutOptions, customerOrders, paymentStatus } from '../library/functions/payments.function.js';
import { cleanLines, customerCart, getProduct, loadShop, priceCart, setCustomerCart } from '../library/functions/shop.function.js';
import ApiCall from '../library/models/tenancy/apiCall.model.js';
import { callRecord } from '../library/functions/apiLogs.function.js';
import { isDraftModel, liveCount, liveFind, liveFindOne } from '../library/functions/drafts.function.js';
import { Access, askedPopulate, defaultPopulate, defsByName, populateDocs } from '../library/functions/contentPopulate.function.js';
import { withImageDetails } from '../library/functions/mediaDetails.function.js';
import ApiEndpoint from '../library/models/tenancy/apiEndpoint.model.js';
import {
	checkCreate,
	ensureEndpoints,
	matchEndpoint,
	outOf,
	reachOf,
	sendsServerKey,
	serverKeyOf,
	writableOf,
} from '../library/functions/apiEndpoints.function.js';
import SitePage from '../library/models/siteBuilder/sitePage.model.js';
import { isRenderer, NotFound, renderPage } from '../library/siteBuilder/render.js';
import { ensureProjectKey, projectByKey } from '../library/functions/projectKey.function.js';
import { apiOrigin } from '../library/controllers/mcp/website.tools.js';
import {
	fieldKeys,
	isId,
	listCapabilities,
	listFilters,
	listSelect,
	listSort,
	outKeys,
	publicDefs,
	publicReach,
	refPopulates,
	shape,
} from '../library/functions/publicRecords.function.js';

/**
 * Tells the project's people who can see `route` that something came in from
 * the site (WO-37) — after the response, never failing it.
 */
const tellTeam = (req: any, { route, permission, title, message, path, record }: { route: string; permission: string; title: string; message?: string; path: string; record?: any }) =>
	later(async () => {
		const project = req.project;
		const people = await projectAudience({ organization: project.organization, project: project._id, permission });
		const href = await projectHrefFor(project, path);
		await notifyTenant(
			people.map(recipient => ({ recipient, organization: project.organization, project: project._id, type: 'site-record', title, message, href, route, record }))
		);
	});

/**
 * /public/api — a tenant project's public API (docs/multi-tenancy WO-11), for
 * the tenant's own website or app. No admin or tenant token: the project is
 * named by its key, `?apiKey=<mint_pk_…>` or `X-Api-Key` (docs/api-builder
 * D14; 401 api_key_missing / api_key_invalid without a good one), and each
 * model answers only what its endpoints allow.
 *
 *   GET  /                      the project's public info (name, type, models)
 *   POST /auth/register         { name, email, password }  → { token, customer }
 *   POST /auth/login            { email, password }        → { token, customer }
 *   GET  /auth/me               the signed-in customer (`record`: their record in the project’s own customer model, docs/widgets W-24)
 *   PUT  /auth/me               { name, phone }
 *   POST /auth/logout-everywhere  signs every device out
 *   POST /auth/forgot           { email, returnTo? }      → emails a link to choose a new password (W-25)
 *   POST /auth/reset            { token, password }        → { token, customer } — the link's token, signed in
 *   GET  /:route                list   ?page&limit(≤100)&sort=-a,b&search=&<field>=<value>&<field>[<op>]=<value>
 *   GET  /:route/:id            get
 *   POST /:route                create
 *   PUT  /:route/:id            update
 *   DELETE /:route/:id          delete
 *
 * An endpoint for signed-in customers may admit only some roles (W-26,
 * `access.roles`): the role is the sign-in model's Role field on the
 * customer's record — 403 `role_required` otherwise. The public API never
 * writes that field.
 *
 * A model with `auth: 'customer'` needs `Authorization: Bearer <customer
 * token>` of this project; with `ownerOnly` each customer only reaches the
 * records they created (the record's `_customer`, set by the server). Only the
 * model's own fields go in and out (plus _id, code, createdAt, updatedAt) —
 * never `_customer`, never anything else. Fields the builder made read-only
 * (`publicApi.readOnlyFields` — an order's status, a payment reference) and
 * formulas are never written: on create they take their default, on update
 * they're left as they are; `GET /` marks them `readOnly`.
 */

const router = express.Router({ mergeParams: true });

const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';
const authLimit = rateLimit({ name: 'public-auth', windowMs: 15 * 60 * 1000, max: 40 });
const apiLimit = rateLimit({ name: 'public-api', windowMs: 60 * 1000, max: 300, skip: isRenderer });

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

/* -------------------------------------------------------- the project */

router.use(apiLimit);

/** Where a call gets the project key: `?apiKey=` or the `X-Api-Key` header. */
const projectKeyOf = (req: any) => {
	const q = req.query?.apiKey;
	const v = Array.isArray(q) ? q[0] : q;
	return String(v || req.headers['x-api-key'] || '').trim();
};

// The project its key names (docs/api-builder D14) — `?apiKey=` or `X-Api-Key`,
// taken out of the query so it's never read as a filter or logged. Only MINT's
// site renderer (its secret header) still names a project by its slug, as the
// first part of the path. The rest of the request runs in the project's scope.
router.use(async (req: any, res: any, next: any) => {
	try {
		if (req.method === 'OPTIONS') return res.sendStatus(204);
		const key = projectKeyOf(req);
		if (req.query) delete req.query.apiKey;
		let project: any = null;
		if (key) {
			project = await projectByKey(key);
			if (!project) return res.status(401).json({ message: 'That apiKey isn’t valid — it may have been regenerated. Copy the project key from API → Keys.', code: 'api_key_invalid' });
		} else if (isRenderer(req)) {
			const [, first, ...rest] = req.url.split('/');
			const slug = decodeURIComponent(first || '').toLowerCase();
			project = /^[a-z0-9-]{1,120}$/.test(slug) ? await TenantProject.findOne({ publicSlug: slug }).lean() : null;
			req.url = `/${rest.join('/')}`;
		} else return res.status(401).json({ message: 'The apiKey is missing — add ?apiKey=<your project key>. It’s on API → Keys in your project.', code: 'api_key_missing' });
		if (!project || project.isActive === false) return res.status(404).json({ message: 'Not found' });
		const org: any = await Organization.findById(project.organization, { isActive: 1 }).lean();
		if (!org || org.isActive === false) return res.status(404).json({ message: 'Not found' });
		req.project = project;
		runInScope({ organization: project.organization, project: project._id }, () => next());
	} catch (e) {
		next(e);
	}
});

// The project's request log (docs/api-builder AB-06; T-09's "recent calls"):
// every call but the site's own page renders and analytics beacons — what was
// asked, which endpoint answered, who called, the answer and its time. Never
// bodies, tokens or addresses (apiLogs.function callRecord). The router fills
// `req.apiLog` on the way: the endpoint (open), the customer (customerOf), the
// server key (open), and the error the caller got (here, from res.json).
const UNLOGGED = /^\/(render|track|site)(\/|$)/;
router.use((req: any, res: any, next: any) => {
	if (req.method === 'OPTIONS' || UNLOGGED.test(req.path) || isRenderer(req)) return next();
	const started = Date.now();
	const scope = currentScope();
	req.apiLog = {};
	const json = res.json.bind(res);
	res.json = (body: any) => {
		if (res.statusCode >= 400 && body && typeof body === 'object') req.apiLog.error = { message: body.message, code: body.code };
		return json(body);
	};
	res.on('finish', () => {
		if (!scope) return;
		runInScope(scope, () => ApiCall.create(callRecord(req, res, started))).catch(() => undefined);
	});
	next();
});

/** The signed-in customer of this project, or null. */
const customerOf = async (req: any) => {
	const header = String(req.headers.authorization || '');
	if (!header.startsWith('Bearer ')) return null;
	try {
		const claims: any = jwt.verify(header.slice(7).trim(), secret());
		if (claims?.kind !== CUSTOMER_TOKEN_KIND || claims.project !== String(req.project._id)) return null;
		const row: any = await ProjectCustomer.findById(claims._id).lean();
		if (!row || row.isActive === false || (row.tokenVersion || 0) !== (claims.v || 0)) return null;
		// An account the project's own model holds is as its record is now — gone with it (W-24).
		const now: any = await currentAccount(req.app, req.project, row);
		if (!now) return null;
		// Their role on the sign-in model, as the record has it now (W-26).
		const customer = { ...now, role: await customerRole(req.app, req.project, now) };
		if (req.apiLog) req.apiLog.customer = customer;
		return customer;
	} catch {
		return null;
	}
};

/** `record`: their record in the project's own customer model (W-24), when Login & account has one. */
const publicCustomer = (c: any) => ({ _id: String(c._id), name: c.name, email: c.email, phone: c.phone || '', record: c.record ? String(c.record) : null, role: c.role ?? null, createdAt: c.createdAt });

/** The account as the site sees it — with its role (W-26), read from its record. */
const answerCustomer = async (req: any, c: any) => publicCustomer({ ...c, role: await customerRole(req.app, req.project, c) });

/* ------------------------------------------------------------- models */

router.get(
	'/',
	handle(async req => {
		await ensureEndpoints();
		const [defs, endpoints] = await Promise.all([publicDefs(), ApiEndpoint.find({ enabled: true }).sort({ model: 1, standard: -1, path: 1 }).lean()]);
		await syncDynamicModels({ app: req.app });
		const all: any[] = await ModelDefinition.find({ active: { $ne: false } }, { route: 1, name: 1, title: 1, fields: 1, access: 1, kind: 1, draftAndPublish: 1, publicApi: 1, displayField: 1, code: 1 }).lean();
		const byRoute = new Map<string, any>(all.map((d: any) => [d.route, d]));
		const byName = defsByName(all);
		return {
			name: req.project.name,
			type: req.project.type,
			slug: req.project.publicSlug,
			auth: { register: 'auth/register', login: 'auth/login', me: 'auth/me', forgot: 'auth/forgot', reset: 'auth/reset' },
			models: [...defs.values()].map(d => ({
				route: d.route,
				title: d.title,
				actions: d.publicApi.actions || [],
				auth: d.publicApi.auth || 'none',
				ownerOnly: !!d.publicApi.ownerOnly,
				...(d.publicApi.note && { note: d.publicApi.note }),
				fields: d.fields.map((f: any) => ({
					key: f.key,
					label: f.label || f.key,
					kind: f.kind,
					required: !!f.required,
					...(f.options?.length && { options: f.options.map((o: any) => o.value) }),
					// Never written by the API: sent on create or update, it's ignored.
					...((f.kind === 'formula' || readOnlyOf(d).has(f.key)) && { readOnly: true }),
				})),
				...(d.publicApi.actions || []).includes('list') && listCapabilities(d),
			})),
			// Every endpoint that answers (docs/api-builder): what the reference and the panel's tester read.
			endpoints: endpoints
				.filter((e: any) => byRoute.has(e.model))
				.map((e: any) => {
					const d = byRoute.get(e.model);
					const out = outOf(d, e);
					const writes = new Set(['create', 'update'].includes(e.action) ? writableOf(d, e) : []);
					return {
						name: e.name,
						...(e.note && { note: e.note }),
						method: e.method,
						path: e.path,
						action: e.action,
						model: e.model,
						modelTitle: d.title || d.name,
						standard: !!e.standard,
						who: e.access?.who || 'anyone',
						...(e.access?.who === 'customer' && e.access?.roles?.length && { roles: e.access.roles }),
						rules: (e.access?.when || []).length + (e.action === 'list' ? (e.list?.filters || []).length : 0),
						fields: d.fields
							.filter((f: any) => out.includes(f.key) || writes.has(f.key))
							.map((f: any) => ({
								key: f.key,
								label: f.label || f.key,
								kind: f.kind,
								required: !!f.required,
								...(f.options?.length && { options: f.options.map((o: any) => o.value) }),
								...(f.kind === 'component' && f.repeatable && { repeatable: true }),
								...(out.includes(f.key) && { out: true }),
								...(writes.has(f.key) && { write: true }),
							})),
						...(e.action === 'list' && {
							list: {
								limit: e.list?.limit || 20,
								maxLimit: e.list?.maxLimit || 100,
								...(e.list?.callerFilters !== false ? listCapabilities(d) : { filters: [], search: [], sort: [] }),
							},
						}),
						// The content API (docs/cms CMS-09): links ?populate= fills, and drafts behind a server key.
						...((e.action === 'list' || e.action === 'get') && {
							populate: e.populate ?? defaultPopulate(d, byName),
							...(d.draftAndPublish && { drafts: { param: statusParam(d) } }),
							...(d.kind === 'single' && e.action === 'list' && { single: true }),
						}),
					};
				}),
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
		// The project's own model may hold the accounts (W-24): the record is the account.
		const held = await accountsModel(req.app, req.project);
		let customer: any;
		if (held) {
			const made = await registerInModel(held, body);
			customer = made.customer;
			tellTeam(req, {
				route: made.def.route,
				permission: `view-${made.def.route}`,
				title: `New customer on ${req.project.name}: ${customer.name}`,
				message: customer.email,
				path: `/${made.def.route}/${made.record._id}`,
				record: made.record._id,
			});
		} else {
			if (await ProjectCustomer.exists({ email: body.email }))
				throw new TenancyError(400, 'An account with this email exists — sign in instead.', 'email_taken');
			customer = await ProjectCustomer.create({ ...body, lastLoginAt: new Date() });
			// A linked copy in the project's own customer model, when Login & account has one (W-24).
			await linkCustomerRecord(req.app, req.project, customer);
			tellTeam(req, {
				route: 'customers',
				permission: 'view-customers',
				title: `New customer on ${req.project.name}: ${customer.name}`,
				message: customer.email,
				path: `/customers/${customer._id}`,
				record: customer._id,
			});
		}
		if (req.project.type === 'website') forwardConversion(req.project, req, 'signup', { email: customer.email, phone: customer.phone });
		// A welcome from the business, through its own email server (docs/messaging M-02) — when it has one.
		later(() => welcomeCustomer(req.project, customer, siteOrigin(req.project) || undefined));
		return { token: customer.generateToken(), customer: await answerCustomer(req, customer.toObject()) };
	})
);

router.post(
	'/auth/login',
	authLimit,
	handle(async req => {
		const body = check(Joi.object({ email: Joi.string().trim().lowercase().email().required(), password: Joi.string().required() }), req.body);
		// The project's own model may hold the accounts (W-24): its record's email signs in. Accounts made
		// before that (MINT's Customers) still sign in with theirs.
		const held = await accountsModel(req.app, req.project);
		const customer: any =
			(held && (await accountByEmail(held, body.email))) || (await ProjectCustomer.findOne({ email: body.email, holder: { $ne: 'model' } }).select('+password'));
		if (!customer || !(await customer.checkPassword(body.password))) throw new TenancyError(400, 'That email and password don’t match.');
		if (customer.isActive === false) throw new TenancyError(400, 'This account has been switched off.');
		customer.lastLoginAt = new Date();
		await customer.save();
		// Accounts made before a customer model was chosen get their record now (W-24).
		await linkCustomerRecord(req.app, req.project, customer);
		const now = (await currentAccount(req.app, req.project, customer.toObject())) || customer.toObject();
		return { token: customer.generateToken(), customer: await answerCustomer(req, now) };
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
		await syncCustomerRecord(req.app, req.project, doc, body);
		return answerCustomer(req, (await currentAccount(req.app, req.project, doc)) || doc);
	})
);

/*
 * Forgot password (docs/widgets W-25, customerReset.function.ts). The answer
 * is the same whether the email has an account or not; 409 mail_not_set_up
 * when the business has no email to send it from.
 */
router.post(
	'/auth/forgot',
	authLimit,
	handle(async req => {
		const body = check(Joi.object({ email: Joi.string().trim().lowercase().email().required(), returnTo: Joi.string().trim().max(2000).allow('') }), req.body);
		if (!(await canEmailCustomers(req.project)))
			throw new TenancyError(409, 'This site can’t send emails yet, so a password can’t be reset here — contact the business.', 'mail_not_set_up');
		const scope = currentScope();
		const project = req.project;
		const apiBase = apiOrigin(req);
		later(() => runInScope(scope!, () => sendResetLink(req.app, project, { email: body.email, returnTo: body.returnTo, apiBase })));
		return { message: 'If there’s an account for that email, a link to choose a new password is on its way.' };
	})
);

router.post(
	'/auth/reset',
	authLimit,
	handle(async req => {
		const body = check(Joi.object({ token: Joi.string().trim().max(2000).required(), password }), req.body);
		const row = await resetPassword(req.app, req.project, body.token, body.password);
		const now = (await currentAccount(req.app, req.project, row.toObject())) || row.toObject();
		return { token: row.generateToken(), customer: await answerCustomer(req, now) };
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

/* ------------------------------------------------- analytics (websites) */

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch/i;
const trackLimit = rateLimit({ name: 'public-track', windowMs: 60 * 1000, max: 120 });

/** The site the event came from is one of the project's domains (any, when it lists none). */
const fromOwnSite = (req: any) => {
	const domains: string[] = req.project.domains || [];
	if (!domains.length) return true;
	const source = String(req.headers.origin || req.headers.referer || '');
	let host = '';
	try {
		host = new URL(source).host.toLowerCase();
	} catch {
		return false;
	}
	if (process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
	const bare = host.replace(/^www\./, '');
	return domains.some(d => {
		const dom = d.toLowerCase().replace(/^www\./, '');
		return bare === dom || bare.endsWith(`.${dom}`);
	});
};

const clip = (v: any, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const hostOf = (url?: string) => {
	try {
		return url ? new URL(url).host.toLowerCase().replace(/^www\./, '') : '';
	} catch {
		return '';
	}
};
/** A custom event's properties: a flat object of short values, at most 20. */
const smallProps = (p: any) => {
	if (!p || typeof p !== 'object' || Array.isArray(p)) return undefined;
	const out: any = {};
	for (const [k, v] of Object.entries(p).slice(0, 20))
		if (['string', 'number', 'boolean'].includes(typeof v)) out[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 200) : v;
	return Object.keys(out).length ? out : undefined;
};

router.post(
	'/track',
	trackLimit,
	// sendBeacon posts text/plain (a JSON content type would need a preflight it can't make).
	express.text({ type: 'text/plain', limit: '64kb' }),
	handle(async (req, res) => {
		res.status(202);
		if (req.project.type !== 'website') return { ok: false };
		const ua = String(req.headers['user-agent'] || '');
		if (BOT.test(ua) || !fromOwnSite(req)) return { ok: true }; // quietly dropped
		let body: any = req.body;
		if (typeof body === 'string') {
			try {
				body = JSON.parse(body);
			} catch {
				return { ok: false };
			}
		}
		const events = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
		if (!events.length) return { ok: true };
		const { browser, os, deviceType } = parseUserAgent(ua);
		const place: any = await locate(clientIp(req)).catch(() => null);
		const ownHost = String(req.headers.origin ? hostOf(String(req.headers.origin)) : '');
		const docs = events
			.filter((e: any) => EVENT_TYPES.includes(e?.type))
			.map((e: any) => {
				const refHost = hostOf(e.referrer);
				return {
					type: e.type,
					name: clip(e.name, 120),
					path: clip(e.path, 500),
					title: clip(e.title, 300),
					referrer: clip(e.referrer, 1000),
					referrerHost: refHost && refHost !== ownHost ? refHost : '',
					utmSource: clip(e.utmSource, 120),
					utmMedium: clip(e.utmMedium, 120),
					utmCampaign: clip(e.utmCampaign, 120),
					eventId: e.type === 'pageview' ? clip(e.eventId, 64) : undefined,
					sessionId: clip(body.sessionId, 64),
					visitorId: clip(body.visitorId, 64),
					device: (DEVICE_TYPES as readonly string[]).includes(deviceType) ? deviceType : 'other',
					os: clip(os, 40),
					browser: clip(browser, 40),
					country: place && !place.local ? clip(place.country, 80) : undefined,
					countryCode: place && !place.local ? clip(place.countryCode, 4) : undefined,
					city: place && !place.local ? clip(place.city, 80) : undefined,
					...(e.type === 'click' && e.element && {
						element: { tag: clip(e.element.tag, 20), text: clip(e.element.text, 200), href: clip(e.element.href, 1000), id: clip(e.element.id, 120) },
					}),
					...(e.type === 'event' && { props: smallProps(e.props) }),
				};
			});
		if (docs.length) await WebsiteEvent.insertMany(docs);
		// Page views to Meta's Conversions API too, when it's on (WO-38).
		forwardPageviews(req.project, visitorOf(req, body), docs.filter((d: any) => d.type === 'pageview'));
		return { ok: true, recorded: docs.length };
	})
);

/* --------------------------------------------- the site API (websites) */

/**
 * For website projects (WO-18): the site in one or two calls instead of
 * stitching the kit's models together. Read-only, published records only.
 *
 *   GET /site                      the site settings (WebsiteSettings, flat), its menu, and its
 *                                  configuration (tags, code, SEO, redirects, headers — WO-34, WO-38)
 *   GET /site/tags                 what /public/track.js injects: the tags and custom code
 *   GET /site/robots.txt           robots.txt from the indexing settings
 *   GET /site/sitemap.xml          the published pages (not hidden from search); ?origin=https://…
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

// The site widgets switched on for this project, and their look (docs/widgets W-03) — read by mint.js.
router.get(
	'/widgets',
	handle(async (req: any, res: any) => {
		res.setHeader('Cache-Control', 'public, max-age=30');
		return publicWidgets(req.project);
	})
);

/* ------------------------------------------------ the shop (docs/widgets W-05) */

/**
 * The cart widget's API. The browser sends product ids, variant names and
 * quantities — never prices: every answer is priced from the catalogue
 * (functions/shop.function.ts). Needs the shop set up and the Cart widget on.
 *
 *   GET  /shop/products/:id      a product as the widgets show it (price, variants, stock)
 *   POST /cart/price             { lines }  a guest's cart (kept in their browser), priced
 *   GET  /cart                   the signed-in customer's cart
 *   PUT  /cart                   { lines }  replaces it
 *   POST /cart/merge             { lines }  adds a guest cart to it (on sign-in)
 */
const shopOf = async (req: any) => {
	const [shop, saved] = await Promise.all([loadShop(req.project), loadWidgets(req.project)]);
	if (!shop || !saved.widgets.cart?.enabled) throw new TenancyError(404, 'This site’s cart is switched off (Site setup → Widgets).', 'cart_off');
	return shop;
};

router.get(
	'/shop/products/:id',
	handle(async (req: any) => getProduct(req.app, await shopOf(req), String(req.params.id)))
);

router.post(
	'/cart/price',
	handle(async (req: any) => priceCart(req.app, await shopOf(req), cleanLines(req.body?.lines)))
);

router.get(
	'/cart',
	handle(async (req: any) => {
		const shop = await shopOf(req);
		return customerCart(req.app, shop, await signedIn(req));
	})
);

router.put(
	'/cart',
	handle(async (req: any) => {
		const shop = await shopOf(req);
		return setCustomerCart(req.app, shop, await signedIn(req), req.body?.lines);
	})
);

router.post(
	'/cart/merge',
	handle(async (req: any) => {
		const shop = await shopOf(req);
		return setCustomerCart(req.app, shop, await signedIn(req), req.body?.lines, true);
	})
);

router.get(
	'/site',
	handle(async req => {
		if (req.project.type !== 'website') throw new TenancyError(404, 'Not found');
		const doc = await loadSite(req.project, { req, cached: true });
		return {
			settings: publicSettings(doc),
			menu: await menuOf(req),
			config: publicConfig(req.project, doc),
		};
	})
);

const websiteOnly = (req: any) => {
	if (req.project.type !== 'website') throw new TenancyError(404, 'Not found');
};

router.get(
	'/site/tags',
	handle(async (req, res) => {
		websiteOnly(req);
		res.setHeader('Cache-Control', 'public, max-age=60');
		return siteTags(await loadSite(req.project, { req, cached: true }));
	})
);

router.get(
	'/site/robots.txt',
	handle(async (req, res) => {
		websiteOnly(req);
		const doc = await loadSite(req.project, { req, cached: true });
		res.setHeader('Cache-Control', 'public, max-age=300');
		res.type('text/plain').send(robotsTxt(req.project, doc));
		return undefined;
	})
);

router.get(
	'/site/sitemap.xml',
	handle(async (req, res) => {
		websiteOnly(req);
		const asked = String(req.query.origin || '').replace(/\/+$/, '');
		const doc = await loadSite(req.project, { req, cached: true });
		const origin = /^https?:\/\/[^\s/]+$/.test(asked) ? asked : siteOrigin(req.project, doc);
		const pages = await kitModel(req, 'pages');
		const seo = await kitModel(req, 'seo');
		const list: any[] = pages?.Model ? await pages.Model.find({ status: 'published' }, { path: 1, updatedAt: 1 }).sort({ path: 1 }).limit(5000).lean() : [];
		const hidden = new Set(seo?.Model ? (await seo.Model.distinct('page', { noIndex: true })).map(String) : []);
		// Site builder pages (docs/site-builder SB-03): the published static ones not hidden from search.
		const built: any[] = await SitePage.find(
			{ published: { $ne: null }, 'published.kind': { $ne: 'template' }, 'published.seo.noIndex': { $ne: true } },
			{ 'published.path': 1, 'published.publishedAt': 1 }
		)
			.limit(5000)
			.lean();
		const kit = list.filter(p => p.path && !hidden.has(String(p._id)));
		const seen = new Set(kit.map(p => p.path));
		const all = [...kit, ...built.filter(p => !seen.has(p.published.path)).map(p => ({ path: p.published.path, updatedAt: p.published.publishedAt }))].sort((a, b) =>
			a.path.localeCompare(b.path)
		);
		const xmlText = doc.seo?.indexing !== false && doc.seo?.sitemap !== false ? sitemapXml(origin, all) : sitemapXml(origin, []);
		res.setHeader('Cache-Control', 'public, max-age=300');
		res.type('application/xml').send(xmlText);
		return undefined;
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
			// What's published (Contents keeps drafts until Publish, docs/cms D5), in the page's order.
			contents?.Model
				? liveFind(contents.def, contents.Model, { query: { page: page._id, status: 'published', isVisible: { $ne: false } }, sort: { order: 1, priority: -1, createdAt: 1 }, limit: 500 })
				: [],
		]);
		return {
			page: shape(page, pages.def),
			seo: seoDoc ? shape(seoDoc, seo!.def) : null,
			contents: (blocks || []).map((b: any) => shape(b, contents!.def)),
		};
	})
);

/**
 * The site builder's render call (docs/site-builder D8, "Render API"): one
 * published page of a builder site with everything the renderer needs —
 * site, design, layout, tree, SEO, menu, page links, tags, widgets.
 * 404 { error: 'not-found' } when nothing is published at the path.
 */
router.get('/render', async (req: any, res: any) => {
	try {
		await ensureProjectKey(req.project); // the page's scripts carry it (docs/api-builder D14)
		const out = await renderPage({ project: req.project, path: req.query.path, apiBase: apiOrigin(req), query: { page: req.query.page } });
		res.setHeader('Cache-Control', 'public, max-age=30');
		res.json(out);
	} catch (e: any) {
		if (e instanceof NotFound) return res.status(404).json({ error: 'not-found' });
		console.error('site render:', e);
		res.status(500).json({ error: 'render-failed' });
	}
});

/* ---------------------------------------------- checkout (docs/widgets W-06) */

/**
 *   GET  /checkout/options     the ways to pay switched on: { methods: [{ provider, name, mode }] }
 *   POST /checkout             { provider, email, name?, phone?, address?, note?, lines? (guests) }
 *                              → { ref, order, amount, currency, redirectUrl } — send the buyer to redirectUrl
 *   GET  /checkout/:ref        the thank-you page's question: { status, order, amount, lines… }
 *   GET  /shop/orders          the signed-in customer's own orders (the My orders widget)
 * Prices come from the catalogue; a cart that changed answers 409 with the new cart.
 */
const checkoutLimit = rateLimit({ name: 'public-checkout', windowMs: 10 * 60 * 1000, max: 30 });

router.get(
	'/checkout/options',
	handle(async (req: any) => checkoutOptions(req.project))
);

router.post(
	'/checkout',
	checkoutLimit,
	handle(async (req: any) => checkout({ app: req.app, project: req.project, customer: await customerOf(req), body: req.body || {} }))
);

router.get(
	'/shop/orders',
	handle(async (req: any) => customerOrders(req.app, req.project, await signedIn(req)))
);

router.get(
	'/checkout/:ref',
	handle(async (req: any) => paymentStatus(String(req.params.ref || '')))
);

/* ------------------------------------------------------- model routes */

/*
 * Every other address is one of the project's endpoints (docs/api-builder):
 * a model's standard ones (/<route>, /<route>/:id — kept in step with its
 * `publicApi`) and the custom ones made in the panel's API pages. One handler
 * matches the call to an endpoint, checks who may call it, and runs its action
 * with its rules: the records it reaches, the fields it writes and shows.
 */

type Ctx = {
	ep: any;
	id?: string;
	def: any;
	Model: mongoose.Model<any>;
	customer: any | null;
	settings: Record<string, any>;
	formulas: any[];
	/** The caller's server key — looked up once, when something needs it. */
	key?: any;
};

/** Signed-in endpoints limited to some roles (W-26) admit only customers with one of them. */
const roleAdmits = (ep: any, customer: any) => {
	const roles: string[] = ep?.access?.who === 'customer' ? ep.access?.roles || [] : [];
	return !roles.length || (!!customer?.role && roles.includes(customer.role));
};

/** The endpoint answering this call — or 404, 401 (sign in / a server key), 403 (a role it doesn't admit), as its "who" says. */
const open = async (req: any): Promise<Ctx> => {
	await ensureEndpoints();
	const endpoints: any[] = await ApiEndpoint.find({ enabled: true }).lean();
	const hit = matchEndpoint(endpoints, req.method, req.path);
	if (!hit) throw new TenancyError(404, 'Not found');
	const { ep, id } = hit;
	if (req.apiLog) req.apiLog.endpoint = ep;
	// Every call it answered, refused ones too — as its Logs tab shows them (AB-06).
	ApiEndpoint.updateOne({ _id: ep._id }, { $inc: { 'stats.calls': 1 }, $set: { 'stats.lastCalledAt': new Date() } }).catch(() => undefined);
	await syncDynamicModels({ app: req.app });
	const def: any = await ModelDefinition.findOne({ route: ep.model, active: { $ne: false } }).lean();
	const Model = def && compiledModel(def.name);
	if (!def || !Model) throw new TenancyError(404, 'Not found');
	if (id !== undefined && !isId(id)) throw new TenancyError(404, 'Not found');
	const customer = await customerOf(req);
	if (ep.access?.who === 'customer' && !customer) throw new TenancyError(401, 'Sign in first.', 'customer_required');
	if (!roleAdmits(ep, customer)) throw new TenancyError(403, 'Your account can’t use this.', 'role_required');
	const key = ep.access?.who === 'key' ? await serverKeyOf(req) : null;
	if (ep.access?.who === 'key' && !key)
		throw new TenancyError(401, sendsServerKey(req) ? 'That server key isn’t valid — it may have been revoked.' : 'This endpoint needs a server key.', 'key_required');
	if (key && req.apiLog) req.apiLog.key = key;
	// The route's settings as the panels use them (a published copy, or generated) — for formulas.
	const published = await getActiveSettings(def.route);
	const settings = published?.data ? dataToSettings(published.data) : generateSettings(def, makeTargetLookup(req.app, [def]));
	return { ep, id, def, Model, customer, settings, formulas: formulasOf(settings), ...(key && { key }) };
};

/** The caller's valid server key, or null. */
const keyOf = async (req: any, ctx: Ctx) => {
	if (ctx.key === undefined) {
		ctx.key = await serverKeyOf(req);
		if (ctx.key && req.apiLog) req.apiLog.key = ctx.key;
	}
	return ctx.key;
};

/**
 * `status=draft` (docs/cms D10, CMS-09): a drafts model's records as they are,
 * never-published ones too — for a server, so a server key only (a preview
 * link will come with CMS-08). `_status` always works; `status` too when the
 * model has no field of that name (then `status` filters that field).
 */
const statusParam = (def: any) => (def.fields.some((f: any) => f.key === 'status') ? '_status' : 'status');
const draftsAsked = async (req: any, ctx: Ctx) => {
	const raw = req.query._status ?? (statusParam(ctx.def) === 'status' ? req.query.status : undefined);
	if (raw === undefined || raw === '' || raw === 'published') return false;
	if (raw !== 'draft') throw new TenancyError(400, `${req.query._status !== undefined ? '_status' : 'status'} is published (the default) or draft`);
	if (!(await keyOf(req, ctx)))
		throw new TenancyError(
			401,
			sendsServerKey(req) ? 'That server key isn’t valid — it may have been revoked.' : 'Drafts aren’t public — send a server key (x-api-key) with status=draft.',
			'key_required'
		);
	return isDraftModel(ctx.def);
};

/**
 * What a linked record shows this caller (populate): its model's standard Read
 * one endpoint (or List) — who may call it, its rules and fields. Null → the
 * name only. Asked once per model per call.
 */
const accessFor = (req: any, ctx: Ctx): Access => {
	const seen = new Map<string, any>();
	return async (target: any) => {
		if (seen.has(target.route)) return seen.get(target.route);
		let out: any = null;
		if (target.publicApi?.enabled) {
			const eps: any[] = await ApiEndpoint.find({ model: target.route, standard: true, enabled: true, action: { $in: ['get', 'list'] } }).lean();
			const ep = eps.find(e => e.action === 'get') || eps.find(e => e.action === 'list');
			const who = ep?.access?.who || 'anyone';
			const may = ep && (who === 'anyone' || (who === 'customer' && ctx.customer && roleAdmits(ep, ctx.customer)) || (who === 'key' && (await keyOf(req, ctx))));
			if (may) out = { query: reachOf(target, ep, ctx.customer), keys: outOf(target, ep) };
		}
		seen.set(target.route, out);
		return out;
	};
};

/** The links this call fills (`?populate=`, among what the endpoint offers) — checked before anything is read. */
const linksFor = async (req: any, ctx: Ctx) => {
	if (req.query.populate === undefined || req.query.populate === '') return null;
	const defs = defsByName(await ModelDefinition.find({ active: { $ne: false } }).lean());
	const paths = askedPopulate(ctx.ep.populate ?? defaultPopulate(ctx.def, defs), req.query.populate);
	return paths.length ? { paths, defs } : null;
};

const fillLinks = async (req: any, ctx: Ctx, docs: any[], links: Awaited<ReturnType<typeof linksFor>>, draft: boolean) => {
	if (links) await populateDocs(ctx.def, docs, links.paths, links.defs, accessFor(req, ctx), { draft });
};

/** A drafts model's records also say when they went live (`publishedAt`, null when they aren't). */
const stampKeys = (def: any, keys: string[]) => (isDraftModel(def) && !def.fields.some((f: any) => f.key === 'publishedAt') ? [...keys, 'publishedAt'] : keys);

/** The records this call may reach: the endpoint's rules (reachOf), never archived ones. */
const reach = (ctx: Ctx) => reachOf(ctx.def, ctx.ep, ctx.customer);

/** What goes out: the endpoint's fields, and of those the ones `?fields=` asks for. */
const outFor = (ctx: Ctx, asked?: any) => {
	const allowed = outOf(ctx.def, ctx.ep);
	const picked = listSelect(ctx.def, asked).filter((k: string) => allowed.includes(k));
	return asked && picked.length ? [...new Set(['_id', ...picked])] : allowed;
};
/** A filled-in link without `_model` — how a project's shared collection tells models apart, not the caller's business. */
const bare = (v: any): any => {
	if (Array.isArray(v)) return v.map(bare);
	// A link filled on published values comes as a document (Model.populate on plain data).
	const o = v && typeof v.toObject === 'function' && !(v instanceof mongoose.Types.ObjectId) ? v.toObject() : v;
	return o && typeof o === 'object' && o._id !== undefined && '_model' in o ? (({ _model, ...rest }) => rest)(o) : o;
};
const shapeOut = (doc: any, keys: string[]) => {
	if (!doc) return doc;
	const out: any = {};
	for (const k of keys) if (doc[k] !== undefined) out[k] = bare(doc[k]);
	return out;
};

/** The fields the public API never writes — the business sets them (an order's status, a payment reference). */
const readOnlyOf = (def: any) => new Set<string>(def.publicApi?.readOnlyFields || []);

/**
 * The body, cut down to the fields this endpoint writes (the model's own,
 * never formulas, minus read-only ones). Others are dropped like unknown keys:
 * on create they take their default, on update they keep what they have — so a
 * site can send back a record it read without being refused.
 */
const bodyOf = async (req: any, ctx: Ctx) => {
	const body: any = {};
	// The sign-in model's role is the team's to set (W-26): sign-ups get its default, nobody promotes themselves.
	const locked = new Set(await signInLocked(req.project, ctx.def));
	for (const k of writableOf(ctx.def, ctx.ep)) if (req.body?.[k] !== undefined && !locked.has(k)) body[k] = req.body[k];
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

/**
 * Linked Relationships for a public-API save (docs/linked-relationships, D12):
 * only the rules marked "Also for website and API saves" start, as the
 * system — a site never gets to change records through rules nobody opted in.
 * Null when there are none. A refusal is a 400 with the rule's message.
 */
const apiLinked = async (req: any, ctx: Ctx, action: 'create' | 'update' | 'delete', before: any, after: any) => {
	const entry = resources(req.app).get(ctx.def.route);
	if (!entry) return null;
	const resolved = await resolveOther(entry);
	if (!linkedRulesOf(resolved.frontendConfig).some(r => r.fromApi)) return null;
	const plan = await linkedForApi(req, resolved, ctx.Model, action, before, after);
	if (plan?.error) throw new TenancyError(400, plan.error.message);
	return plan;
};

/** Whether this model has a rule that runs for public-API saves — everything else skips the extra work. */
const hasApiRules = async (req: any, ctx: Ctx) => {
	const entry = resources(req.app).get(ctx.def.route);
	return !!entry && linkedRulesOf((await resolveOther(entry)).frontendConfig).some(r => r.fromApi);
};

/** Runs a prepared plan after the save; on failure `undo` puts the record back and the error is answered. */
const applyLinked = async (plan: any, saved: any, undo: () => Promise<any>) => {
	if (!plan) return;
	try {
		await plan.apply(saved);
	} catch (e: any) {
		await undo();
		throw new TenancyError(e instanceof LinkedError ? e.status : 500, e?.message || 'A linked record could not be updated');
	}
};

const list = async (req: any, ctx: Ctx) => {
	const { def, Model, ep } = ctx;
	// A single type (docs/cms D2) answers with its one record, as an object — 404 until it's made.
	const draft = await draftsAsked(req, ctx);
	const links = await linksFor(req, ctx);
	if (def.kind === 'single') {
		const keys = outFor(ctx, req.query.fields);
		const populate = (await refPopulates(def)).filter((p: any) => keys.includes(p.path));
		const doc: any = await liveFindOne(def, Model, { query: reach(ctx), keys, populate, draft, stamp: true });
		if (!doc) throw new TenancyError(404, 'Not found');
		await fillLinks(req, ctx, [doc], links, draft);
		await withImageDetails(def, [doc]);
		return shapeOut(doc, stampKeys(def, keys));
	}
	const max = ep.list?.maxLimit || 100;
	const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || ep.list?.limit || 20, 1), max);
	const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
	// Callers' own filters, search and sort — unless the endpoint keeps them out.
	const own = ep.list?.callerFilters !== false;
	const and = own ? listFilters(def, req.query) : [];
	const base = reach(ctx);
	const query: any = and.length ? { ...base, $and: [...(base.$and || []), ...and] } : base;
	const keys = outFor(ctx, req.query.fields);
	const populate = (await refPopulates(def)).filter((p: any) => keys.includes(p.path));
	const sort = listSort(def, own && req.query.sort ? req.query.sort : ep.list?.sort);
	// A drafts model's published values (docs/cms D5); any other's records as they are.
	const [docs, total]: any[] = await Promise.all([
		liveFind(def, Model, { query, keys, sort, skip: (page - 1) * limit, limit, populate, draft, stamp: true }),
		liveCount(def, Model, query, { draft }),
	]);
	await fillLinks(req, ctx, docs, links, draft);
	await withImageDetails(def, docs);
	const out = stampKeys(def, keys);
	return { doc: docs.map((d: any) => shapeOut(d, out)), total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const getOne = async (req: any, ctx: Ctx) => {
	const draft = await draftsAsked(req, ctx);
	const links = await linksFor(req, ctx);
	const keys = outFor(ctx, req.query.fields);
	const populate = (await refPopulates(ctx.def)).filter((p: any) => keys.includes(p.path));
	const doc = await liveFindOne(ctx.def, ctx.Model, { query: { ...reach(ctx), _id: ctx.id }, keys, populate, draft, stamp: true });
	if (!doc) throw new TenancyError(404, 'Not found');
	await fillLinks(req, ctx, [doc], links, draft);
	await withImageDetails(ctx.def, [doc]);
	return shapeOut(doc, stampKeys(ctx.def, keys));
};

const create = async (req: any, res: any, ctx: Ctx) => {
	// On a model with per-record access, what a site sends in is public: the team sees it (it has no owner among them).
	const doc: any = new ctx.Model({
		...(await bodyOf(req, ctx)),
		...(ctx.customer && { _customer: ctx.customer._id }),
		...(ctx.def.access?.enabled && { privacy: 'public' }),
	});
	await applyFormulasLinked(doc, ctx.formulas, ctx.Model);
	// The endpoint's conditions, on the new record (an owner condition makes the customer its owner).
	checkCreate(ctx.ep, doc, ctx.customer);
	let plan: any = null;
	try {
		if (await hasApiRules(req, ctx)) {
			await doc.validate();
			plan = await apiLinked(req, ctx, 'create', null, doc.toObject());
		}
		await doc.save();
	} catch (e) {
		throw invalid(e);
	}
	await applyLinked(plan, doc, () => ctx.Model.collection.deleteOne({ _id: doc._id }));
	res.status(201);
	const label = doc.get?.(displayFieldOf(ctx.def));
	tellTeam(req, {
		route: ctx.def.route,
		permission: `view-${ctx.def.route}`,
		title: `New ${String(ctx.def.name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()} from ${req.project.name}`,
		message: typeof label === 'string' && label.trim() ? label.trim().slice(0, 140) : undefined,
		path: `/${ctx.def.route}/${doc._id}`,
		record: doc._id,
	});
	if (req.project.type === 'website') forwardConversion(req.project, req, 'lead', { ...contactOf(req.body), form: ctx.def.title || ctx.def.name });
	fireWebhooks({ route: ctx.def.route, event: 'create', doc, source: 'api' });
	fireAutomations({ route: ctx.def.route, event: 'create', doc: doc, actor: { name: 'Website' } });
	return shapeOut(doc.toObject(), outOf(ctx.def, ctx.ep));
};

const update = async (req: any, ctx: Ctx) => {
	const doc: any = await ctx.Model.findOne({ ...reach(ctx), _id: ctx.id });
	if (!doc) throw new TenancyError(404, 'Not found');
	const body = await bodyOf(req, ctx);
	// Locked by the record's state (a paid order's status): kept as it is, like a read-only field.
	for (const l of lockedChanges(ctx.settings, doc.toObject(), body)) delete body[l.field];
	const before = doc.toObject();
	const raw = (await hasApiRules(req, ctx)) ? await ctx.Model.collection.findOne({ _id: doc._id }) : null;
	doc.set(body);
	await applyFormulasLinked(doc, ctx.formulas, ctx.Model);
	const changed = doc.isModified();
	let plan: any = null;
	try {
		if (raw) {
			await doc.validate();
			plan = await apiLinked(req, ctx, 'update', before, doc.toObject());
		}
		await doc.save();
	} catch (e) {
		throw invalid(e);
	}
	await applyLinked(plan, doc, () => ctx.Model.collection.replaceOne({ _id: doc._id }, raw as any));
	// Records whose formulas read this one through a link (`tax.amount`).
	if (changed) await recalculateDependents(req.app, ctx.Model, [doc._id], [...Object.keys(body), ...ctx.formulas.map(f => f.key)]);
	if (changed) fireWebhooks({ route: ctx.def.route, event: 'update', doc, source: 'api' });
	if (changed) fireAutomations({ route: ctx.def.route, event: 'update', doc: doc, actor: { name: 'Website' } });
	return shapeOut(doc.toObject(), outOf(ctx.def, ctx.ep));
};

const remove = async (req: any, ctx: Ctx) => {
	let plan: any = null;
	let raw: any = null;
	if (await hasApiRules(req, ctx)) {
		const current = await ctx.Model.findOne({ ...reach(ctx), _id: ctx.id });
		if (!current) throw new TenancyError(404, 'Not found');
		raw = await ctx.Model.collection.findOne({ _id: current._id });
		plan = await apiLinked(req, ctx, 'delete', current.toObject(), null);
	}
	const gone = await ctx.Model.findOneAndDelete({ ...reach(ctx), _id: ctx.id });
	if (!gone) throw new TenancyError(404, 'Not found');
	await applyLinked(plan, gone, () => ctx.Model.collection.insertOne(raw));
	await recalculateDependents(req.app, ctx.Model, [gone._id]);
	fireWebhooks({ route: ctx.def.route, event: 'delete', doc: gone, source: 'api' });
	fireAutomations({ route: ctx.def.route, event: 'delete', doc: gone, actor: { name: 'Website' } });
	return { message: 'Deleted' };
};

router.use(
	handle(async (req, res) => {
		if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) throw new TenancyError(404, 'Not found');
		const ctx = await open(req);
		switch (ctx.ep.action) {
			case 'list':
				return list(req, ctx);
			case 'get':
				return getOne(req, ctx);
			case 'create':
				return create(req, res, ctx);
			case 'update':
				return update(req, ctx);
			case 'delete':
				return remove(req, ctx);
			default:
				throw new TenancyError(404, 'Not found');
		}
	})
);

export default router;
