import express from 'express';
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
import { applyFormulas, formulasOf, stripFormulaKeys } from '../library/functions/formula.function.js';
import { rateLimit } from '../library/functions/rateLimit.function.js';
import WebsiteEvent, { DEVICE_TYPES, EVENT_TYPES } from '../library/models/tenancy/websiteEvent.model.js';
import { clientIp, locate, parseUserAgent } from '../library/functions/sessions.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { loadSite, publicConfig, publicSettings, robotsTxt, siteOrigin, siteTags, sitemapXml } from '../library/functions/siteConfig.function.js';
import { contactOf, forwardConversion, forwardPageviews, visitorOf } from '../library/functions/serverTracking.function.js';
import { later, notifyTenant, projectAudience, projectHrefFor } from '../library/functions/tenantNotify.function.js';
import { fireWebhooks } from '../library/functions/webhooks.function.js';
import { loadWidgets, publicWidgets } from '../library/functions/widgets.function.js';
import { welcomeCustomer } from '../library/functions/mail.function.js';
import { checkout, checkoutOptions, paymentStatus } from '../library/functions/payments.function.js';
import { cleanLines, customerCart, getProduct, loadShop, priceCart, setCustomerCart } from '../library/functions/shop.function.js';
import ApiCall from '../library/models/tenancy/apiCall.model.js';

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
 *   GET  /:route                list   ?page&limit(≤100)&sort=-a,b&search=&<field>=<value>&<field>[<op>]=<value>
 *   GET  /:route/:id            get
 *   POST /:route                create
 *   PUT  /:route/:id            update
 *   DELETE /:route/:id          delete
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

// An API project's calls, for its dashboard's "recent calls" (docs/templates T-09):
// method, path, answer and time — nothing sent or signed in with.
router.use((req: any, res: any, next: any) => {
	if (req.project?.type !== 'api' || req.method === 'OPTIONS') return next();
	const started = Date.now();
	const scope = currentScope();
	res.on('finish', () => {
		if (!scope) return;
		const path = String(req.path || '/').slice(0, 300);
		const route = path.split('/')[1] || '';
		runInScope(scope, () =>
			ApiCall.create({
				method: req.method,
				path,
				route: route === 'auth' ? '' : route.slice(0, 60),
				status: res.statusCode,
				ms: Date.now() - started,
				customer: String(req.headers.authorization || '').startsWith('Bearer '),
			})
		).catch(() => undefined);
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
		tellTeam(req, {
			route: 'customers',
			permission: 'view-customers',
			title: `New customer on ${req.project.name}: ${customer.name}`,
			message: customer.email,
			path: `/customers/${customer._id}`,
			record: customer._id,
		});
		if (req.project.type === 'website') forwardConversion(req.project, req, 'signup', { email: customer.email, phone: customer.phone });
		// A welcome from the business, through its own email server (docs/messaging M-02) — when it has one.
		later(() => welcomeCustomer(req.project, customer, siteOrigin(req.project) || undefined));
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
		const xmlText = doc.seo?.indexing !== false && doc.seo?.sitemap !== false ? sitemapXml(origin, list.filter(p => p.path && !hidden.has(String(p._id)))) : sitemapXml(origin, []);
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

/* ---------------------------------------------- checkout (docs/widgets W-06) */

/**
 *   GET  /checkout/options     the ways to pay switched on: { methods: [{ provider, name, mode }] }
 *   POST /checkout             { provider, email, name?, phone?, address?, note?, lines? (guests) }
 *                              → { ref, order, amount, currency, redirectUrl } — send the buyer to redirectUrl
 *   GET  /checkout/:ref        the thank-you page's question: { status, order, amount, lines… }
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
	'/checkout/:ref',
	handle(async (req: any) => paymentStatus(String(req.params.ref || '')))
);

/* ------------------------------------------------------- model routes */

const SYSTEM_OUT = ['_id', 'code', 'createdAt', 'updatedAt'];

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

/**
 * The records a call may reach: with owner-only, the customer's own; on a
 * model with per-record access (D19) only those marked public — a record kept
 * to some of the team never reaches a site. Archived records (bulk Archive)
 * never do either, as in the admin's lists.
 */
const owned = (ctx: Ctx) => ({
	archivedAt: null,
	...(ctx.def.publicApi.ownerOnly && { _customer: ctx.customer!._id }),
	...(ctx.def.access?.enabled && { privacy: 'public' }),
});

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

/* ------------------------------------------- lists: filters, search, sort */

/**
 * How GET /:route narrows and orders a list — the admin lists' syntax
 * (middleware/filter.middleware.ts: `<field>_<op>=<value>`), read per kind of
 * field. Documented for tenants in the admin's user-docs/public-api (#filters)
 * and on the Public API page's reference, which reads `listCapabilities` from
 * GET /.
 *
 *   <field>=<value>            equals (a list field: has it; a date: that whole
 *                              day, or today|week|month|year|days_7|months_3)
 *   <field>=a&<field>=b        any of them (same as _in)
 *   <field>_<op>=<value>       ne, in, nin, gt, gte, lt, lte, btwn, contains, all
 *   search=<words>             the text fields contain it, any case
 *   sort=-price,name           up to three fields, `-` for descending
 *   fields=name,price          only these fields come back (_id always)
 *
 * Different filters must all match. Names the API doesn't know (a field that
 * isn't filterable, `?v=2` cache busters, sorting by an unknown field) are
 * ignored; a value it can't read, or an operator a field doesn't take, answers
 * 400. Field keys may contain `_`: the whole key is tried as a field first.
 * Only string values are read (qs's `a[b]=` objects answer 400), so nothing
 * from the query string reaches MongoDB as an operator.
 */
type Family = 'text' | 'choice' | 'number' | 'date' | 'boolean' | 'id' | 'list' | 'ids';

const FAMILY: Record<string, Family> = {
	text: 'text',
	email: 'text',
	url: 'text',
	textarea: 'text',
	select: 'choice',
	number: 'number',
	formula: 'number',
	date: 'date',
	boolean: 'boolean',
	reference: 'id',
	multiselect: 'list',
	tags: 'list',
	references: 'ids',
};

const OPS: Record<Family, string[]> = {
	text: ['eq', 'ne', 'in', 'nin', 'contains'],
	choice: ['eq', 'ne', 'in', 'nin'],
	number: ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'btwn'],
	date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'btwn'],
	boolean: ['eq', 'ne'],
	id: ['eq', 'ne', 'in', 'nin'],
	list: ['eq', 'ne', 'in', 'nin', 'all'],
	ids: ['eq', 'ne', 'in', 'nin', 'all'],
};
const ALL_OPS = new Set(Object.values(OPS).flat());

/** Query names that are the list's own, never a field filter (as in the admin's filter middleware). */
const RESERVED = new Set(['page', 'limit', 'sort', 'search', 'fields', 'skip', 'archived']);
/** Kinds `search` looks through. */
const SEARCHED = new Set(['text', 'email', 'textarea', 'select', 'tags']);
const SYSTEM_DATES = [
	{ key: 'createdAt', label: 'Created', kind: 'date' },
	{ key: 'updatedAt', label: 'Updated', kind: 'date' },
];

/** The fields a list can be filtered by, with their family. */
const filterable = (def: any) =>
	[...def.fields, ...SYSTEM_DATES].filter((f: any) => FAMILY[f.kind] && !RESERVED.has(f.key)).map((f: any) => ({ ...f, family: FAMILY[f.kind] as Family }));

/** What a model's list takes, for GET / (the API reference is built from it). */
const listCapabilities = (def: any) => ({
	filters: filterable(def).map(f => ({ key: f.key, kind: f.kind, ops: OPS[f.family as Family] })),
	search: def.fields.filter((f: any) => SEARCHED.has(f.kind)).map((f: any) => f.key),
	sort: [...def.fields.filter((f: any) => !['section', 'sectionlist', 'password'].includes(f.kind)).map((f: any) => f.key), ...SYSTEM_OUT],
});

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** A date filter's value as [from, to) — a plain day is the whole day (UTC); the admin's shortcuts work too. */
const dayRange = (f: any, raw: string): [Date, Date] => {
	const v = raw.trim().toLowerCase();
	const today = startOfDay(new Date());
	const tomorrow = new Date(today.getTime() + DAY);
	const back = (n: number, unit: 'days' | 'months') => {
		const d = new Date(today);
		if (unit === 'days') d.setUTCDate(d.getUTCDate() - n);
		else d.setUTCMonth(d.getUTCMonth() - n);
		return d;
	};
	if (v === 'today' || v === 'daily') return [today, tomorrow];
	if (v === 'week' || v === 'weekly') return [back(7, 'days'), tomorrow];
	if (v === 'month' || v === 'monthly') return [back(1, 'months'), tomorrow];
	if (v === 'year' || v === 'yearly') return [back(12, 'months'), tomorrow];
	const rel = v.match(/^(days|months)_(\d{1,4})$/);
	if (rel) return [back(Number(rel[2]), rel[1] as 'days' | 'months'), tomorrow];
	const d = readValue(f, raw);
	return DATE_ONLY.test(raw.trim()) ? [d, new Date(d.getTime() + DAY)] : [d, new Date(d.getTime() + 1)];
};

/** One query value, read for the field's family — or a 400 naming the field. */
const readValue = (f: any, raw: any): any => {
	if (typeof raw !== 'string') throw new TenancyError(400, `${f.key}: send one plain value (use ${f.key}_gte=…, not ${f.key}[gte]=…)`);
	const v = raw.trim();
	switch (f.family as Family) {
		case 'number': {
			const n = Number(v);
			if (v === '' || !Number.isFinite(n)) throw new TenancyError(400, `${f.key} must be a number`);
			return n;
		}
		case 'boolean':
			if (v === 'true' || v === '1') return true;
			if (v === 'false' || v === '0') return false;
			throw new TenancyError(400, `${f.key} must be true or false`);
		case 'date': {
			const d = new Date(v);
			if (!v || Number.isNaN(d.getTime())) throw new TenancyError(400, `${f.key} must be a date, like 2026-10-04 or 2026-10-04T09:30:00Z`);
			return d;
		}
		case 'id':
		case 'ids':
			if (!isId(v)) throw new TenancyError(400, `${f.key} must be a record’s _id`);
			return new mongoose.Types.ObjectId(v);
		default:
			if (v.length > 200) throw new TenancyError(400, `${f.key}: at most 200 characters`);
			return f.kind === 'email' ? v.toLowerCase() : v;
	}
};

/** `a,b` or a repeated name, as a list of values. */
const valuesOf = (f: any, raw: any): any[] => {
	const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((r: any) => (typeof r === 'string' ? r.split(',') : [r])).filter((r: any) => r !== '');
	if (!parts.length) throw new TenancyError(400, `${f.key}: give at least one value`);
	if (parts.length > 100) throw new TenancyError(400, `${f.key}: at most 100 values`);
	return parts.map((p: any) => readValue(f, typeof p === 'string' ? p.trim() : p));
};

/** One field's condition for one operator. */
const condition = (f: any, op: string, raw: any): any => {
	const ops = OPS[f.family as Family];
	if (!ops.includes(op)) throw new TenancyError(400, `${f.key} can’t use _${op} — it takes ${ops.filter(o => o !== 'eq').map(o => `${f.key}_${o}`).join(', ')}`);
	if (op === 'in' || op === 'nin' || op === 'all') return { [`$${op}`]: valuesOf(f, raw) };
	if (Array.isArray(raw)) throw new TenancyError(400, `${f.key}_${op}: send it once`);
	if (op === 'btwn') {
		// from_to (the admin's form), or from,to; either end may be left out.
		const [from = '', to = ''] = String(raw).split(/[_,]/);
		if (!from.trim() && !to.trim()) throw new TenancyError(400, `${f.key}_btwn takes from_to, like ${f.family === 'date' ? '2026-10-01_2026-10-31' : '10_50'}`);
		const cond: any = {};
		if (f.family === 'date') {
			if (from.trim()) cond.$gte = dayRange(f, from)[0];
			if (to.trim()) cond.$lt = dayRange(f, to)[1];
		} else {
			if (from.trim()) cond.$gte = readValue(f, from);
			if (to.trim()) cond.$lte = readValue(f, to);
		}
		return cond;
	}
	if (f.family === 'date') {
		const [from, to] = dayRange(f, String(raw));
		return { eq: { $gte: from, $lt: to }, ne: { $not: { $gte: from, $lt: to } }, gt: { $gte: to }, gte: { $gte: from }, lt: { $lt: from }, lte: { $lt: to } }[op];
	}
	const value = readValue(f, raw);
	if (op === 'contains') return { $regex: escapeRegex(value), $options: 'i' };
	return op === 'eq' ? value : { [`$${op}`]: value };
};

/** A query name as a field and operator: `price` → eq, `price_gte` → gte, `first_name_in` → first_name + in. */
const parseKey = (key: string, fields: Map<string, any>): { f: any; op: string } | null => {
	if (fields.has(key)) return { f: fields.get(key), op: 'eq' };
	const cut = key.lastIndexOf('_');
	if (cut < 1) return null;
	const f = fields.get(key.slice(0, cut));
	const op = key.slice(cut + 1);
	if (!f) return null;
	if (!ALL_OPS.has(op) && op !== 'eq') throw new TenancyError(400, `Unknown operator _${op} on ${f.key}`);
	return { f, op };
};

/** The list's filter conditions (each must match) from the query string. */
const listFilters = (def: any, q: any): any[] => {
	const fields = new Map(filterable(def).map(f => [f.key, f]));
	const and: any[] = [];
	for (const [key, raw] of Object.entries(q)) {
		if (RESERVED.has(key) || raw === undefined || raw === '') continue;
		const hit = parseKey(key, fields);
		if (!hit) continue;
		const op = hit.op === 'eq' && Array.isArray(raw) ? 'in' : hit.op;
		and.push({ [hit.f.key]: condition(hit.f, op, raw) });
	}
	if (q.search !== undefined) {
		const words = String(Array.isArray(q.search) ? q.search[0] : q.search).trim().slice(0, 100);
		const keys = def.fields.filter((f: any) => SEARCHED.has(f.kind)).map((f: any) => f.key);
		if (words && !keys.length) throw new TenancyError(400, 'This model has no text fields to search');
		if (words) and.push({ $or: keys.map((k: string) => ({ [k]: { $regex: escapeRegex(words), $options: 'i' } })) });
	}
	return and;
};

/** `sort=-price,name` → up to three keys, then _id so pages never overlap. Unknown keys are skipped. */
const listSort = (def: any, raw: any) => {
	const allowed = new Set(listCapabilities(def).sort);
	const sort: Record<string, 1 | -1> = {};
	for (const part of String(Array.isArray(raw) ? raw.join(',') : raw || '').split(/[, ]/)) {
		const key = part.trim().replace(/^[-+]/, '');
		if (key && allowed.has(key) && !(key in sort) && Object.keys(sort).length < 3) sort[key] = part.trim().startsWith('-') ? -1 : 1;
	}
	if (!Object.keys(sort).length) sort.createdAt = -1;
	if (!('_id' in sort)) sort._id = -1;
	return sort;
};

/** `fields=name,price` → those of the record's keys (always _id); none asked or none known → all. */
const listSelect = (def: any, raw: any) => {
	const all = outKeys(def);
	const asked = String(Array.isArray(raw) ? raw.join(',') : raw || '')
		.split(',')
		.map(k => k.trim())
		.filter(k => all.includes(k));
	return asked.length ? [...new Set(['_id', ...asked])] : all;
};

router.get(
	'/:route',
	handle(async req => {
		const ctx = await open(req, 'list');
		const { def, Model } = ctx;
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
		const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
		const and = listFilters(def, req.query);
		const query: any = { ...owned(ctx), ...(and.length && { $and: and }) };
		const keys = listSelect(def, req.query.fields);
		const populate = (await refPopulates(def)).filter((p: any) => keys.includes(p.path));
		const find = Model.find(query).select(keys.join(' ')).sort(listSort(def, req.query.sort)).skip((page - 1) * limit).limit(limit).populate(populate);
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

/** The fields the public API never writes — the business sets them (an order's status, a payment reference). */
const readOnlyOf = (def: any) => new Set<string>(def.publicApi?.readOnlyFields || []);

/**
 * The body, cut down to the model's own (non-formula) fields the API may
 * write. Read-only fields are dropped like unknown keys: on create they take
 * their default, on update they keep what they have — so a site can send back
 * a record it read without being refused.
 */
const bodyOf = (req: any, ctx: Ctx) => {
	const body: any = {};
	const readOnly = readOnlyOf(ctx.def);
	for (const k of fieldKeys(ctx.def)) if (req.body?.[k] !== undefined && !readOnly.has(k)) body[k] = req.body[k];
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
		// On a model with per-record access, what a site sends in is public: the team sees it (it has no owner among them).
		const doc: any = new ctx.Model({
			...bodyOf(req, ctx),
			...(ctx.customer && { _customer: ctx.customer._id }),
			...(ctx.def.access?.enabled && { privacy: 'public' }),
		});
		applyFormulas(doc, ctx.formulas);
		try {
			await doc.save();
		} catch (e) {
			throw invalid(e);
		}
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
		const changed = doc.isModified();
		try {
			await doc.save();
		} catch (e) {
			throw invalid(e);
		}
		if (changed) fireWebhooks({ route: ctx.def.route, event: 'update', doc, source: 'api' });
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
		fireWebhooks({ route: ctx.def.route, event: 'delete', doc: gone, source: 'api' });
		return { message: 'Deleted' };
	})
);

export default router;
