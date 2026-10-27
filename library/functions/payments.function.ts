import crypto from 'crypto';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import Organization from '../models/tenancy/organization.model.js';
import SitePayment from '../models/tenancy/sitePayment.model.js';
import SitePaymentSettings from '../models/tenancy/sitePaymentSettings.model.js';
import { open, seal } from '../../lib/crypto/secret.js';
import { runInScope } from './tenantScope.function.js';
import { compiledModel, generateSettings, makeTargetLookup, syncDynamicModels } from './dynamicModels.function.js';
import { getActiveSettings } from './resolveRoute.function.js';
import { dataToSettings } from './routeRegistry.function.js';
import { applyFormulasLinked, formulasOf } from './formula.function.js';
import { listCountries, providersFor } from './countries.function.js';
import { fireWebhooks } from './webhooks.function.js';
import { fireAutomations } from './automations.function.js';
import { later, notifyTenant, projectAudience, projectHrefFor } from './tenantNotify.function.js';
import { siteOrigin } from './siteConfig.function.js';
import { TenancyError } from './tenancy.function.js';
import { ShopMapping, cleanLines, customerCart, loadShop, priceCart, setCustomerCart } from './shop.function.js';
import { esc, para, sendOrgMail } from './mail.function.js';
import { designMail } from './mailDesign.function.js';
import * as stripe from './payments/stripe.js';
import * as sslcommerz from './payments/sslcommerz.js';
import * as bkash from './payments/bkash.js';

/**
 * Payments for a tenant's site (docs/widgets W-06, README §3). The flow, the
 * same for every provider:
 *
 * 1. `checkout` — the browser sends ids, variants, quantities and contact
 *    details, never prices. The cart is priced from the catalogue
 *    (`priceCart`); anything that can't be bought stops it. The Order is
 *    written in the project's own orders model (the shop's order mapping) as
 *    waiting for payment, a `SitePayment` records the amount, and the
 *    provider is asked for a payment page.
 * 2. The buyer pays on the provider's page and comes back to the site.
 * 3. Only the provider, asked by the server, can make an order paid. Stripe:
 *    its webhook (`stripeWebhook`), signature checked with the tenant's
 *    signing secret, then the session fetched again. SSLCommerz (W-07b): the
 *    buyer's return post and the IPN only carry a `val_id`, which the
 *    validation API is asked about (`sslcommerzReturn`, `sslcommerzIpn`).
 *    bKash (W-07b): the buyer's return only carries a paymentID, which the
 *    server then executes — or looks up — with bKash (`bkashReturn`). Amount
 *    and currency must match what checkout asked for. Then — once, whatever
 *    retries come —
 *    the payment and order become paid, stock goes down, the cart empties, the
 *    order webhook fires, the team is told and the buyer gets an email.
 *
 * Each tenant uses its own merchant account (WD6); providers offered follow
 * the organization's country (W-02).
 */

export const PROVIDERS: Record<string, { name: string; ready: boolean }> = {
	stripe: { name: 'Stripe', ready: true },
	sslcommerz: { name: 'SSLCommerz', ready: true },
	bkash: { name: 'bKash', ready: true },
};

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });

/* ------------------------------------------------------------- settings */

const offeredFor = async (project: any) => {
	await listCountries();
	const org: any = await Organization.findById(project.organization, { country: 1 }).lean();
	return providersFor(org?.country);
};

const SECRETS = '+stripe.secretKey +stripe.webhookSecret +sslcommerz.storePassword +bkash.password +bkash.appSecret';
const loadSettings = (project: any): Promise<any> => runInScope(scopeOf(project), () => SitePaymentSettings.findOne({}).select(SECRETS).lean());

/** What the panel sees: everything but the keys, which only say whether they're set. */
export const paymentSettingsView = async (project: any, apiOrigin: string) => {
	const doc: any = await loadSettings(project);
	const s = doc?.stripe || {};
	const ssl = doc?.sslcommerz || {};
	const bk = doc?.bkash || {};
	const shop = await loadShop(project).catch(() => null);
	return {
		stripe: {
			enabled: !!s.enabled,
			mode: s.mode || 'test',
			publishableKey: s.publishableKey || '',
			secretKeySet: !!s.secretKey,
			webhookSecretSet: !!s.webhookSecret,
			webhookUrl: `${apiOrigin}/public/payments/stripe/${project.publicSlug}`,
		},
		sslcommerz: {
			enabled: !!ssl.enabled,
			mode: ssl.mode || 'test',
			storeId: ssl.storeId || '',
			storePasswordSet: !!ssl.storePassword,
			ipnUrl: `${apiOrigin}/public/payments/sslcommerz/${project.publicSlug}/ipn`,
			currencies: sslcommerz.SSLCOMMERZ_CURRENCIES,
		},
		bkash: {
			enabled: !!bk.enabled,
			mode: bk.mode || 'test',
			username: bk.username || '',
			appKey: bk.appKey || '',
			passwordSet: !!bk.password,
			appSecretSet: !!bk.appSecret,
			currencies: ['BDT'],
		},
		/** The shop's currency — bKash takes BDT only (empty: the shop isn't set up). */
		currency: shop?.currency || '',
		successUrl: doc?.successUrl || '',
		cancelUrl: doc?.cancelUrl || '',
		offered: await offeredFor(project),
		providers: PROVIDERS,
		siteOrigin: siteOrigin(project) || '',
	};
};

const sealed = (v: string) => {
	try {
		return seal(v);
	} catch {
		throw new TenancyError(500, 'This server can’t store keys yet (SECRET_ENCRYPTION_KEY isn’t set) — tell MINT’s team.', 'secret_key_missing');
	}
};

const URL_OK = /^https?:\/\/[^\s]+$/i;

/**
 * Saves the settings. Keys sent replace the stored ones; empty keeps them.
 * Test keys only in test mode, live keys only in live; a provider the
 * organization's country doesn't offer can't be switched on.
 */
export const savePaymentSettings = async (project: any, body: any) => {
	const was: any = await loadSettings(project);
	const set: any = {};
	if (body.stripe) {
		const b = body.stripe;
		const mode = b.mode === 'live' ? 'live' : 'test';
		const prefix = mode === 'live' ? 'live' : 'test';
		const secretKey = String(b.secretKey || '').trim();
		const webhookSecret = String(b.webhookSecret || '').trim();
		const publishableKey = String(b.publishableKey ?? was?.stripe?.publishableKey ?? '').trim();
		if (secretKey && !new RegExp(`^(sk|rk)_${prefix}_[A-Za-z0-9]+$`).test(secretKey))
			throw new TenancyError(400, `That isn’t a Stripe ${mode} secret key — it starts with sk_${prefix}_ (or rk_${prefix}_ for a restricted key).`);
		if (publishableKey && !new RegExp(`^pk_${prefix}_[A-Za-z0-9]+$`).test(publishableKey))
			throw new TenancyError(400, `That isn’t a Stripe ${mode} publishable key — it starts with pk_${prefix}_.`);
		if (webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) throw new TenancyError(400, 'The webhook signing secret starts with whsec_.');
		// A key stored for the other mode doesn't carry over.
		const modeChanged = (was?.stripe?.mode || 'test') !== mode;
		const storedSecret = modeChanged ? '' : was?.stripe?.secretKey || '';
		const storedHook = modeChanged ? '' : was?.stripe?.webhookSecret || '';
		const enabled = !!b.enabled;
		if (enabled) {
			if (!(await offeredFor(project)).includes('stripe')) throw new TenancyError(400, 'Stripe isn’t offered in your organization’s country.');
			if (!secretKey && !storedSecret) throw new TenancyError(400, `Add your Stripe ${mode} secret key before switching Stripe on.`);
			if (!webhookSecret && !storedHook) throw new TenancyError(400, 'Add the webhook signing secret before switching Stripe on — without it no order can be marked paid.');
		}
		set.stripe = {
			enabled,
			mode,
			publishableKey,
			secretKey: secretKey ? sealed(secretKey) : storedSecret,
			webhookSecret: webhookSecret ? sealed(webhookSecret) : storedHook,
		};
	}
	if (body.sslcommerz) {
		const b = body.sslcommerz;
		const mode = b.mode === 'live' ? 'live' : 'test';
		const storeId = String(b.storeId ?? was?.sslcommerz?.storeId ?? '').trim();
		const storePassword = String(b.storePassword || '').trim();
		if (storeId && !/^[A-Za-z0-9_.-]{2,80}$/.test(storeId)) throw new TenancyError(400, 'That isn’t an SSLCommerz store id — letters and digits, as SSLCommerz emailed it.');
		if (storePassword.length > 200) throw new TenancyError(400, 'That store password is too long.');
		const modeChanged = (was?.sslcommerz?.mode || 'test') !== mode;
		const stored = modeChanged ? '' : was?.sslcommerz?.storePassword || '';
		const enabled = !!b.enabled;
		if (enabled) {
			if (!(await offeredFor(project)).includes('sslcommerz')) throw new TenancyError(400, 'SSLCommerz isn’t offered in your organization’s country.');
			if (!storeId) throw new TenancyError(400, `Add your SSLCommerz ${mode === 'live' ? 'live' : 'sandbox'} store id before switching SSLCommerz on.`);
			if (!storePassword && !stored) throw new TenancyError(400, `Add your SSLCommerz ${mode === 'live' ? 'live' : 'sandbox'} store password before switching SSLCommerz on.`);
		}
		set.sslcommerz = { enabled, mode, storeId, storePassword: storePassword ? sealed(storePassword) : stored };
	}
	if (body.bkash) {
		const b = body.bkash;
		const mode = b.mode === 'live' ? 'live' : 'test';
		const username = String(b.username ?? was?.bkash?.username ?? '').trim();
		const appKey = String(b.appKey ?? was?.bkash?.appKey ?? '').trim();
		const password = String(b.password || '').trim();
		const appSecret = String(b.appSecret || '').trim();
		if (username.length > 120) throw new TenancyError(400, 'That bKash username is too long.');
		if (appKey && !/^[A-Za-z0-9_-]{8,200}$/.test(appKey)) throw new TenancyError(400, 'That isn’t a bKash app key — letters and digits, as bKash sent it.');
		if (appSecret && !/^[A-Za-z0-9_-]{8,300}$/.test(appSecret)) throw new TenancyError(400, 'That isn’t a bKash app secret — letters and digits, as bKash sent it.');
		if (password.length > 200) throw new TenancyError(400, 'That bKash password is too long.');
		const modeChanged = (was?.bkash?.mode || 'test') !== mode;
		const storedPassword = modeChanged ? '' : was?.bkash?.password || '';
		const storedSecret = modeChanged ? '' : was?.bkash?.appSecret || '';
		const enabled = !!b.enabled;
		if (enabled) {
			if (!(await offeredFor(project)).includes('bkash')) throw new TenancyError(400, 'bKash isn’t offered in your organization’s country.');
			const missing = [!username && 'username', !password && !storedPassword && 'password', !appKey && 'app key', !appSecret && !storedSecret && 'app secret'].filter(Boolean);
			if (missing.length) throw new TenancyError(400, `Add your bKash ${mode === 'live' ? 'live' : 'sandbox'} ${missing.join(', ')} before switching bKash on.`);
		}
		set.bkash = {
			enabled,
			mode,
			username,
			appKey,
			password: password ? sealed(password) : storedPassword,
			appSecret: appSecret ? sealed(appSecret) : storedSecret,
		};
	}
	for (const k of ['successUrl', 'cancelUrl'] as const) {
		if (body[k] === undefined) continue;
		const v = String(body[k] || '').trim();
		if (v && !URL_OK.test(v)) throw new TenancyError(400, `The ${k === 'successUrl' ? 'thank-you' : 'back-to-cart'} page must be a full address (https://…).`);
		set[k] = v.slice(0, 500);
	}
	await runInScope(scopeOf(project), () => SitePaymentSettings.updateOne({}, { $set: set }, { upsert: true }));
};

/** Stripe's keys, opened — or null when Stripe isn't on. */
const stripeKeys = async (project: any) => {
	const doc: any = await loadSettings(project);
	const s = doc?.stripe;
	if (!s?.secretKey) return null;
	try {
		return { enabled: !!s.enabled, mode: s.mode || 'test', secretKey: open(s.secretKey), webhookSecret: s.webhookSecret ? open(s.webhookSecret) : '', successUrl: doc.successUrl || '', cancelUrl: doc.cancelUrl || '' };
	} catch {
		throw new TenancyError(500, 'The Stripe keys can’t be read on this server — add them again in Payments.', 'secret_unreadable');
	}
};

const unreadable = (name: string) => new TenancyError(500, `The ${name} details can’t be read on this server — add them again in Payments.`, 'secret_unreadable');

/** SSLCommerz's store, opened — or null when it has no password stored. */
const sslKeys = async (project: any) => {
	const doc: any = await loadSettings(project);
	const s = doc?.sslcommerz;
	if (!s?.storeId || !s.storePassword) return null;
	try {
		return { enabled: !!s.enabled, mode: s.mode || 'test', storeId: s.storeId, storePassword: open(s.storePassword) };
	} catch {
		throw unreadable('SSLCommerz');
	}
};

/** bKash's four merchant details, opened — or null when any is missing. */
const bkashKeys = async (project: any) => {
	const doc: any = await loadSettings(project);
	const b = doc?.bkash;
	if (!b?.username || !b.appKey || !b.password || !b.appSecret) return null;
	try {
		return { enabled: !!b.enabled, mode: b.mode || 'test', username: b.username, appKey: b.appKey, password: open(b.password), appSecret: open(b.appSecret) };
	} catch {
		throw unreadable('bKash');
	}
};

/** The panel's "check the keys" buttons: asks the provider whether the stored details work. */
export const checkPaymentKeys = async (project: any, provider = 'stripe') => {
	try {
		if (provider === 'sslcommerz') {
			const keys = await sslKeys(project);
			if (!keys) throw new TenancyError(400, 'Add your SSLCommerz store id and password first.');
			await sslcommerz.checkKeys(keys);
			return { ok: true, mode: keys.mode, provider };
		}
		if (provider === 'bkash') {
			const keys = await bkashKeys(project);
			if (!keys) throw new TenancyError(400, 'Add all four bKash merchant details first.');
			await bkash.checkKeys(keys);
			return { ok: true, mode: keys.mode, provider };
		}
		const keys = await stripeKeys(project);
		if (!keys) throw new TenancyError(400, 'Add your Stripe secret key first.');
		await stripe.checkKey(keys.secretKey);
		return { ok: true, mode: keys.mode, provider: 'stripe' };
	} catch (e: any) {
		if (e instanceof TenancyError) throw e;
		throw new TenancyError(e.status === 401 ? 400 : 502, e.message);
	}
};

/** What a site may offer at checkout right now (for the checkout widget). */
export const checkoutOptions = async (project: any) => {
	const [offered, keys, ssl, bk, shop] = await Promise.all([
		offeredFor(project),
		stripeKeys(project).catch(() => null),
		sslKeys(project).catch(() => null),
		bkashKeys(project).catch(() => null),
		loadShop(project).catch(() => null),
	]);
	const currency = shop?.currency || '';
	const methods = [] as { provider: string; name: string; mode: string }[];
	if (offered.includes('stripe') && keys?.enabled && keys.webhookSecret) methods.push({ provider: 'stripe', name: 'Card (Stripe)', mode: keys.mode });
	if (offered.includes('sslcommerz') && ssl?.enabled && sslcommerz.SSLCOMMERZ_CURRENCIES.includes(currency))
		methods.push({ provider: 'sslcommerz', name: 'Card, mobile banking or net banking (SSLCommerz)', mode: ssl.mode });
	if (offered.includes('bkash') && bk?.enabled && currency === 'BDT') methods.push({ provider: 'bkash', name: 'bKash', mode: bk.mode });
	return { methods };
};

/* ------------------------------------------------------------ the order */

/** The order model, compiled, and its formulas (a template's total is one). */
const orderModel = async (app: any, m: ShopMapping) => {
	await syncDynamicModels({ app });
	const def: any = await ModelDefinition.findOne({ name: m.order!.model, active: { $ne: false } }).lean();
	const Model = def && compiledModel(def.name);
	if (!Model) throw new TenancyError(409, 'The shop’s orders model isn’t available — check Site setup → Widgets → Shop.', 'shop_not_set_up');
	const published = await getActiveSettings(def.route);
	const settings = published?.data ? dataToSettings(published.data) : generateSettings(def, makeTargetLookup(app, [def]));
	return { def, Model, formulas: formulasOf(settings) };
};

export type Contact = { email: string; name?: string; phone?: string; note?: string; address?: Record<string, string> };
const ADDRESS_KEYS = ['name', 'line1', 'line2', 'city', 'region', 'postcode', 'country', 'phone'];

/** The address as the order's field takes it: its own sub-fields, or one block of text. */
const addressFor = (def: any, key: string, a: Record<string, string> = {}) => {
	const f = (def.fields || []).find((x: any) => x.key === key);
	if (f?.kind === 'section') {
		const out: any = {};
		for (const sub of f.fields || []) if (a[sub.key]) out[sub.key] = a[sub.key];
		// Common other names for the same thing.
		const alias: Record<string, string[]> = { line1: ['address', 'street', 'address1'], line2: ['address2'], postcode: ['zip', 'postalCode', 'postal'], region: ['state', 'division', 'district'] };
		for (const [from, tos] of Object.entries(alias)) for (const to of tos) if (a[from] && (f.fields || []).some((s: any) => s.key === to) && !out[to]) out[to] = a[from];
		return out;
	}
	return ADDRESS_KEYS.filter(k => a[k]).map(k => a[k]).join('\n');
};

const ref = () => crypto.randomBytes(12).toString('base64url');

/* ------------------------------------------------------------- checkout */

/**
 * Checkout: an order at the server's prices and a provider's payment page.
 * Signed in, the customer's saved cart is bought; a guest sends their lines
 * and an email. Returns where to send the buyer.
 */
export const checkout = async ({ app, project, customer, body, apiOrigin }: { app: any; project: any; customer: any | null; body: any; apiOrigin: string }) => {
	const shop = await loadShop(project);
	if (!shop?.order) throw new TenancyError(409, 'Checkout isn’t set up on this site yet (Site setup → Widgets → Shop → Orders).', 'checkout_off');
	const provider = String(body?.provider || '');
	const options = await checkoutOptions(project);
	if (!options.methods.some(x => x.provider === provider))
		throw new TenancyError(400, options.methods.length ? `Pay with ${options.methods.map(x => x.name).join(' or ')}.` : 'No way to pay is switched on for this site yet.', 'provider_off');

	const contact: Contact = {
		email: String(body?.email || customer?.email || '').trim().toLowerCase().slice(0, 200),
		name: String(body?.name || customer?.name || '').trim().slice(0, 120),
		phone: String(body?.phone || customer?.phone || '').trim().slice(0, 40),
		note: String(body?.note || '').trim().slice(0, 1000),
		address: Object.fromEntries(ADDRESS_KEYS.map(k => [k, String(body?.address?.[k] || '').trim().slice(0, 200)]).filter(([, v]) => v)),
	};
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new TenancyError(400, 'Enter an email address for the receipt.', 'email_required');

	const priced: any = customer ? await customerCart(app, shop, customer) : await priceCart(app, shop, cleanLines(body?.lines));
	if (!priced.lines.length || !priced.count) throw new TenancyError(400, 'The cart is empty.', 'cart_empty');
	const blocked = priced.lines.filter((l: any) => l.problem);
	if (blocked.length) {
		const e: any = new TenancyError(409, 'Some things in the cart changed — check it before paying.', 'cart_changed');
		e.extra = { cart: priced };
		throw e;
	}
	const amount = stripe.toMinor(priced.subtotal, shop.currency);
	if (amount < 1) throw new TenancyError(400, 'There’s nothing to pay for.', 'nothing_to_pay');

	const o = shop.order;
	const { def, Model, formulas } = await orderModel(app, shop);
	const items = priced.lines.map((l: any) => ({
		[o.item.name]: l.name,
		[o.item.quantity]: l.quantity,
		[o.item.unitPrice]: l.unitPrice,
		...(o.item.variant && l.variant && { [o.item.variant]: l.variant }),
		...(o.item.sku && l.sku && { [o.item.sku]: l.sku }),
		...(o.item.product && { [o.item.product]: l.product }),
	}));
	const doc: any = new Model({
		[o.fields.items]: items,
		[o.fields.status]: o.statuses.pending,
		...(o.fields.email && { [o.fields.email]: contact.email }),
		...(o.fields.name && contact.name && { [o.fields.name]: contact.name }),
		...(o.fields.phone && contact.phone && { [o.fields.phone]: contact.phone }),
		...(o.fields.note && contact.note && { [o.fields.note]: contact.note }),
		...(o.fields.address && Object.keys(contact.address || {}).length && { [o.fields.address]: addressFor(def, o.fields.address, contact.address) }),
		...(o.fields.shippingCost && { [o.fields.shippingCost]: 0 }),
		...(o.fields.total && { [o.fields.total]: priced.subtotal }),
		...(customer && { _customer: customer._id }),
		...(def.access?.enabled && { privacy: 'public' }),
	});
	await applyFormulasLinked(doc, formulas, Model);
	try {
		await doc.save();
	} catch (e: any) {
		const first: any = e?.name === 'ValidationError' ? Object.values(e.errors || {})[0] : null;
		throw new TenancyError(409, `The order couldn’t be saved${first?.message ? `: ${first.message}` : ''} — check the order mapping in Shop.`, 'order_invalid');
	}
	fireWebhooks({ route: def.route, event: 'create', doc, source: 'api' });
	fireAutomations({ route: def.route, event: 'create', doc, actor: { name: 'Checkout' } });

	const settings: any = await loadSettings(project);
	const mode = settings?.[provider]?.mode === 'live' ? 'live' : 'test';
	const site = siteOrigin(project);
	const r = ref();
	const fill = (u: string) => u.replace(/\{ref\}/g, r);
	const successUrl = fill(settings?.successUrl || (site ? `${site}/thank-you?ref={ref}` : ''));
	const cancelUrl = fill(settings?.cancelUrl || (site ? `${site}/cart` : ''));
	if (!successUrl || !cancelUrl) throw new TenancyError(409, 'Set the thank-you page in Payments (or the site’s domain in Site setup).', 'return_url_missing');

	const payment: any = await SitePayment.create({
		ref: r,
		order: doc._id,
		orderModel: def.name,
		orderCode: doc.code || '',
		provider,
		mode,
		amount,
		currency: shop.currency,
		status: 'created',
		email: contact.email,
		customer: customer?._id || null,
		lines: priced.lines.map((l: any) => ({ product: l.product, variant: l.variant, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total })),
		successUrl,
		cancelUrl,
		events: [{ type: 'created', at: new Date(), note: `${priced.count} item(s), ${priced.subtotal} ${shop.currency}` }],
	});
	const title = `${project.name} — order ${doc.code || String(doc._id).slice(-6)}`;
	// SSLCommerz and bKash send the buyer back to MINT first, which asks them what happened, then on to the site.
	const back = `${apiOrigin}/public/payments/${provider}/${project.publicSlug}`;
	try {
		let session: { id: string; url: string };
		if (provider === 'sslcommerz') {
			const keys = (await sslKeys(project))!;
			session = await sslcommerz.createSession(keys, {
				amount: priced.subtotal,
				currency: shop.currency,
				ref: r,
				title,
				items: priced.count,
				successUrl: `${back}/return/${r}/success`,
				failUrl: `${back}/return/${r}/fail`,
				cancelUrl: `${back}/return/${r}/cancel`,
				ipnUrl: `${back}/ipn`,
				customer: { name: contact.name, email: contact.email, phone: contact.phone, address: contact.address },
			});
		} else if (provider === 'bkash') {
			const keys = (await bkashKeys(project))!;
			session = await bkash.createPayment(keys, { amount: priced.subtotal, ref: r, payer: contact.phone || contact.email, callbackUrl: `${back}/return/${r}` });
		} else {
			const keys = (await stripeKeys(project))!;
			session = await stripe.createSession(keys.secretKey, {
				amount,
				currency: shop.currency,
				title,
				description: priced.lines.map((l: any) => `${l.quantity} × ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join(', '),
				email: contact.email,
				ref: r,
				successUrl,
				cancelUrl,
			});
		}
		await SitePayment.updateOne(
			{ _id: payment._id },
			{ $set: { status: 'pending', providerSessionId: session.id, checkoutUrl: session.url }, $push: { events: { type: 'session', at: new Date(), note: session.id } } }
		);
		return { ref: r, order: { _id: String(doc._id), code: doc.code || '' }, amount: priced.subtotal, currency: shop.currency, redirectUrl: session.url };
	} catch (e: any) {
		await SitePayment.updateOne({ _id: payment._id }, { $set: { status: 'failed', error: e.message }, $push: { events: { type: 'failed', at: new Date(), note: e.message } } });
		if (o.statuses.cancelled) await Model.updateOne({ _id: doc._id }, { $set: { [o.fields.status]: o.statuses.cancelled } });
		throw new TenancyError(502, `The payment page couldn’t be opened — ${e.message}`, 'provider_failed');
	}
};

/** The thank-you page's question: how is this payment doing? */
export const paymentStatus = async (r: string) => {
	const p: any = /^[A-Za-z0-9_-]{8,40}$/.test(r) ? await SitePayment.findOne({ ref: r }).lean() : null;
	if (!p) throw new TenancyError(404, 'Not found');
	return {
		ref: p.ref,
		status: p.status,
		order: { code: p.orderCode },
		amount: stripe.fromMinor(p.amount, p.currency),
		currency: p.currency,
		provider: p.provider,
		paidAt: p.paidAt,
		lines: (p.lines || []).map((l: any) => ({ name: l.name, variant: l.variant, quantity: l.quantity, total: l.total })),
	};
};

/* ------------------------------------------------------ confirming a payment */

/** Stock down by what was bought — the product's, and the variant's when variants count their own. */
const lowerStock = async (app: any, shop: ShopMapping, lines: any[]) => {
	const f = shop.product.fields;
	if (!f.stock && !shop.product.variant?.stock) return;
	await syncDynamicModels({ app });
	const Product = compiledModel(shop.product.model);
	if (!Product) return;
	for (const l of lines) {
		const inc: any = {};
		if (f.stock) inc[f.stock] = -l.quantity;
		const vStock = l.variant && f.variants && shop.product.variant?.stock;
		if (vStock) inc[`${f.variants}.$[v].${vStock}`] = -l.quantity;
		if (!Object.keys(inc).length) continue;
		await Product.updateOne({ _id: l.product }, { $inc: inc }, vStock ? { arrayFilters: [{ [`v.${shop.product.variant!.name}`]: l.variant }] } : {}).catch(() => undefined);
		if (f.stock) await Product.updateOne({ _id: l.product, [f.stock]: { $lt: 0 } }, { $set: { [f.stock]: 0 } }).catch(() => undefined);
	}
};

/** The buyer's receipt, from the business's own email server (when it has one). */
const receipt = async (project: any, payment: any) => {
	const currency = payment.currency;
	const money = (n: number) => `${Number(n).toFixed(currency && stripe.toMinor(1, currency) === 1 ? 0 : 2)} ${currency}`;
	const lines = (payment.lines || []).map((l: any) => `${l.quantity} × ${l.name}${l.variant ? ` (${l.variant})` : ''} — ${money(l.total)}`);
	const total = money(stripe.fromMinor(payment.amount, currency));
	const code = payment.orderCode ? ` ${payment.orderCode}` : '';
	await sendOrgMail(
		{
			to: payment.email,
			subject: `Your order${code} at ${project.name}`,
			text: `Thank you — we've received your payment of ${total}.\n\n${lines.join('\n')}\n\nTotal: ${total}\n\nWe'll be in touch when it's on its way.\n\n— ${project.name}`,
			html: await designMail(project, {
				heading: `Thank you for your order${esc(code)}`,
				body: para(`We’ve received your payment of <b>${esc(total)}</b>.`) +
					`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;">${(payment.lines || [])
						.map(
							(l: any) =>
								`<tr><td style="padding:6px 0;border-bottom:1px solid #eee;">${l.quantity} × ${esc(l.name)}${l.variant ? ` <span style="color:#6b7280">(${esc(l.variant)})</span>` : ''}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee;">${esc(money(l.total))}</td></tr>`
						)
						.join('')}<tr><td style="padding:8px 0;font-weight:700;">Total</td><td align="right" style="padding:8px 0;font-weight:700;">${esc(total)}</td></tr></table>` +
					para('We’ll be in touch when it’s on its way.'),
				...(siteOrigin(project) ? { button: { href: siteOrigin(project)!, text: `Back to ${project.name}` } } : {}),
			}),
		},
		{ organization: project.organization, project: project._id, kind: 'record' }
	);
};

/**
 * Marks a confirmed payment paid — once. The provider said it's paid, for
 * `amount` `currency`; anything that doesn't match what checkout asked for
 * is recorded and the order stays unpaid.
 */
const markPaid = async (app: any, project: any, payment: any, confirmed: { amount: number; currency: string; providerPaymentId: string }) => {
	if (confirmed.amount !== payment.amount || confirmed.currency.toUpperCase() !== payment.currency) {
		await SitePayment.updateOne(
			{ _id: payment._id, status: { $ne: 'paid' } },
			{
				$set: { status: 'failed', error: `Paid ${confirmed.amount} ${confirmed.currency}, expected ${payment.amount} ${payment.currency}` },
				$push: { events: { type: 'mismatch', at: new Date(), note: `${confirmed.amount} ${confirmed.currency}` } },
			}
		);
		return { paid: false, reason: 'amount_mismatch' };
	}
	// Only the first confirmation goes on; retries find it already paid.
	const won: any = await SitePayment.findOneAndUpdate(
		{ _id: payment._id, status: { $ne: 'paid' } },
		{ $set: { status: 'paid', paidAt: new Date(), providerPaymentId: confirmed.providerPaymentId, error: '' }, $push: { events: { type: 'paid', at: new Date(), note: confirmed.providerPaymentId } } },
		{ new: true }
	).lean();
	if (!won) return { paid: true, already: true };

	const shop = await loadShop(project);
	if (shop?.order) {
		const { def, Model } = await orderModel(app, shop);
		const o = shop.order;
		const doc: any = await Model.findById(payment.order);
		if (doc) {
			doc.set(o.fields.status, o.statuses.paid);
			if (o.fields.paymentReference) doc.set(o.fields.paymentReference, confirmed.providerPaymentId || payment.ref);
			await doc.save().catch((e: any) => console.error('payments: order not updated', e?.message));
			fireWebhooks({ route: def.route, event: 'update', doc, source: 'api' });
			fireAutomations({ route: def.route, event: 'update', doc, actor: { name: 'Checkout' } });
			later(async () => {
				const people = await projectAudience({ organization: project.organization, project: project._id, permission: `view-${def.route}` });
				const href = await projectHrefFor(project, `/${def.route}/${doc._id}`);
				await notifyTenant(
					people.map(recipient => ({
						recipient,
						organization: project.organization,
						project: project._id,
						type: 'site-record',
						title: `Paid order${doc.code ? ` ${doc.code}` : ''} on ${project.name}`,
						message: `${stripe.fromMinor(payment.amount, payment.currency)} ${payment.currency} · ${payment.email}`,
						href,
						route: def.route,
						record: doc._id,
					}))
				);
			});
		}
		await lowerStock(app, shop, won.lines || []);
		if (won.customer) await setCustomerCart(app, shop, { _id: won.customer }, []).catch(() => undefined);
	}
	later(() => receipt(project, won).catch(() => undefined));
	return { paid: true };
};

/**
 * POST /public/payments/stripe/:slug — Stripe's webhook. The signature must
 * match the project's signing secret; then the session is fetched from Stripe
 * itself and only its answer counts.
 */
export const stripeWebhook = async (app: any, project: any, raw: Buffer | undefined, signature: string) => {
	const keys = await runInScope(scopeOf(project), () => stripeKeys(project));
	if (!keys?.webhookSecret) throw new TenancyError(400, 'Stripe isn’t set up for this project');
	if (!raw || !stripe.verifySignature(raw, signature, keys.webhookSecret)) throw new TenancyError(400, 'Bad signature');
	let event: any;
	try {
		event = JSON.parse(raw.toString('utf8'));
	} catch {
		throw new TenancyError(400, 'Not JSON');
	}
	const session = event?.data?.object;
	if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event?.type) || !session?.id)
		return { received: true, ignored: event?.type };

	return runInScope(scopeOf(project), async () => {
		const payment: any = await SitePayment.findOne({ provider: 'stripe', providerSessionId: session.id }).lean();
		if (!payment) return { received: true, ignored: 'unknown session' };
		await SitePayment.updateOne({ _id: payment._id }, { $push: { events: { type: 'webhook', at: new Date(), note: event.type } } });
		// What Stripe says now — never what the webhook body says.
		const fresh = await stripe.getSession(keys.secretKey, session.id);
		if (fresh.client_reference_id !== payment.ref) return { received: true, ignored: 'reference mismatch' };
		if (fresh.payment_status === 'paid') return { received: true, ...(await markPaid(app, project, payment, { amount: fresh.amount_total, currency: fresh.currency, providerPaymentId: fresh.payment_intent || fresh.id })) };
		if (fresh.status === 'expired' || event.type === 'checkout.session.async_payment_failed') {
			const status = fresh.status === 'expired' ? 'expired' : 'failed';
			await SitePayment.updateOne({ _id: payment._id, status: { $nin: ['paid', 'refunded'] } }, { $set: { status } });
			return { received: true, status };
		}
		return { received: true, status: payment.status };
	});
};

/* ------------------------------------------- SSLCommerz and bKash returns */

/** Where a returning buyer goes: the thank-you page (paid, waiting or failed — it says which), or the cart if they went back. */
const landing = (payment: any, project: any, status: string) => {
	const site = siteOrigin(project) || '';
	return (status === 'cancelled' ? payment.cancelUrl : payment.successUrl) || site || null;
};

/** A payment that hasn't happened, marked so — never over one that did. */
const settleUnpaid = async (payment: any, status: 'failed' | 'cancelled' | 'expired', note: string) => {
	await SitePayment.updateOne(
		{ _id: payment._id, status: { $in: ['created', 'pending'] } },
		{ $set: { status, ...(status === 'failed' && note && { error: note.slice(0, 300) }) }, $push: { events: { type: status, at: new Date(), note: note.slice(0, 300) } } }
	);
	return status;
};

const SSL_UNPAID: Record<string, 'failed' | 'cancelled' | 'expired'> = { FAILED: 'failed', CANCELLED: 'cancelled', EXPIRED: 'expired', UNATTEMPTED: 'expired', INVALID_TRANSACTION: 'failed' };

/**
 * What SSLCommerz says about one payment — asked with the tenant's password,
 * by the `val_id` the post brought, else by our reference. Paid → markPaid;
 * a hint from the post (failed / cancelled) only lands when SSLCommerz has no
 * successful attempt either.
 */
const settleSsl = async (app: any, project: any, payment: any, valId: string, hint?: 'failed' | 'cancelled') => {
	const keys = await sslKeys(project);
	if (!keys) return { status: payment.status, reason: 'not set up' };
	let v: sslcommerz.SslValidation | null = null;
	if (valId && /^[A-Za-z0-9_-]{4,80}$/.test(valId)) v = await sslcommerz.validate(keys, valId).catch(() => null);
	let latest = '';
	if (!sslcommerz.isPaid(v) || v?.tran_id !== payment.ref) {
		const all = await sslcommerz.byTransaction(keys, payment.ref).catch(() => null);
		const found = (all?.element || []).filter(e => e.tran_id === payment.ref);
		v = found.find(sslcommerz.isPaid) || null;
		latest = found[found.length - 1]?.status || '';
		// What the transaction lookup returns can lack val_id's checks — confirm the paid one by its val_id.
		if (v?.val_id) v = (await sslcommerz.validate(keys, v.val_id).catch(() => null)) || v;
	}
	if (sslcommerz.isPaid(v) && v!.tran_id === payment.ref) {
		if (v!.risk_level === '1') {
			await SitePayment.updateOne(
				{ _id: payment._id, status: { $in: ['created', 'pending'] } },
				{
					$set: { status: 'pending', error: `SSLCommerz flagged this payment as risky (${v!.risk_title || 'risk'}) — check it in your SSLCommerz panel before you ship.` },
					$push: { events: { type: 'held', at: new Date(), note: v!.val_id } },
				}
			);
			return { status: 'pending', reason: 'risky' };
		}
		const currency = String(v!.currency_type || v!.currency || '').toUpperCase();
		const value = Number(v!.currency_amount || v!.amount);
		const r = await markPaid(app, project, payment, { amount: stripe.toMinor(value, currency || payment.currency), currency, providerPaymentId: v!.bank_tran_id || v!.val_id });
		return { status: r.paid ? 'paid' : 'failed', ...r };
	}
	const unpaid = hint || SSL_UNPAID[latest];
	if (unpaid) return { status: await settleUnpaid(payment, unpaid, `SSLCommerz: ${latest || unpaid}`) };
	return { status: payment.status };
};

/** The SSLCommerz payment for our reference, in its project. */
const sslPayment = async (project: any, r: string) => (/^[A-Za-z0-9_-]{8,40}$/.test(r) ? SitePayment.findOne({ provider: 'sslcommerz', ref: r }).lean() : null);

/**
 * POST /public/payments/sslcommerz/:slug/return/:ref/:to (success|fail|cancel) —
 * SSLCommerz posts the buyer back here. Returns where to send them on.
 */
export const sslcommerzReturn = (app: any, project: any, q: { ref: string; to: string; valId: string }) =>
	runInScope(scopeOf(project), async () => {
		const payment: any = await sslPayment(project, q.ref);
		if (!payment) return siteOrigin(project) || null;
		await SitePayment.updateOne({ _id: payment._id }, { $push: { events: { type: 'return', at: new Date(), note: q.to } } });
		const hint = q.to === 'cancel' ? 'cancelled' : q.to === 'fail' ? 'failed' : undefined;
		const r = await settleSsl(app, project, payment, q.valId, hint).catch((e: any) => {
			console.error('sslcommerz return:', e?.message);
			return { status: payment.status };
		});
		return landing(payment, project, r.status);
	});

/** POST /public/payments/sslcommerz/:slug/ipn — SSLCommerz's server-to-server notice. Only its validation API's answer counts. */
export const sslcommerzIpn = (app: any, project: any, body: any) =>
	runInScope(scopeOf(project), async () => {
		const payment: any = await sslPayment(project, String(body?.tran_id || ''));
		if (!payment) return { received: true, ignored: 'unknown transaction' };
		await SitePayment.updateOne({ _id: payment._id }, { $push: { events: { type: 'ipn', at: new Date(), note: String(body?.status || '').slice(0, 40) } } });
		return { received: true, ...(await settleSsl(app, project, payment, String(body?.val_id || ''))) };
	});

/**
 * GET /public/payments/bkash/:slug/return/:ref?paymentID&status — bKash sends
 * the buyer back here. On `success` the server executes the payment with
 * bKash (or, if that answer is lost or it already ran, looks it up); only a
 * Completed answer for our invoice and amount marks it paid. Returns where to
 * send the buyer on.
 */
export const bkashReturn = (app: any, project: any, q: { ref: string; paymentID: string; status: string }) =>
	runInScope(scopeOf(project), async () => {
		const payment: any = /^[A-Za-z0-9_-]{8,40}$/.test(q.ref) ? await SitePayment.findOne({ provider: 'bkash', ref: q.ref }).lean() : null;
		if (!payment) return siteOrigin(project) || null;
		// Someone else's paymentID can't settle this order.
		if (!q.paymentID || q.paymentID !== payment.providerSessionId) return landing(payment, project, payment.status);
		await SitePayment.updateOne({ _id: payment._id }, { $push: { events: { type: 'return', at: new Date(), note: q.status.slice(0, 40) } } });
		if (payment.status === 'paid') return landing(payment, project, 'paid');
		if (q.status !== 'success') return landing(payment, project, await settleUnpaid(payment, q.status === 'cancel' ? 'cancelled' : 'failed', `bKash: ${q.status || 'failure'}`));
		const keys = await bkashKeys(project);
		if (!keys) return landing(payment, project, payment.status);
		let p: bkash.BkashPayment | null = null;
		let why = '';
		try {
			p = await bkash.executePayment(keys, payment.providerSessionId);
		} catch (e: any) {
			why = e.message;
			// Executed before (a reload), or the answer was lost: bKash's record decides.
			p = await bkash.queryPayment(keys, payment.providerSessionId).catch(() => null);
		}
		if (p?.transactionStatus === 'Completed' && (!p.merchantInvoiceNumber || p.merchantInvoiceNumber === payment.ref)) {
			const r = await markPaid(app, project, payment, { amount: stripe.toMinor(Number(p.amount), 'BDT'), currency: p.currency || 'BDT', providerPaymentId: p.trxID || p.paymentID });
			return landing(payment, project, r.paid ? 'paid' : 'failed');
		}
		if (p?.transactionStatus === 'Initiated' && !why) return landing(payment, project, payment.status);
		return landing(payment, project, await settleUnpaid(payment, 'failed', why || `bKash: ${p?.transactionStatus || 'not completed'}`));
	});

/* ------------------------------------------------------------ my orders */

/** A signed-in customer's own orders, as the My orders widget shows them. */
export const customerOrders = async (app: any, project: any, customer: any) => {
	const shop = await loadShop(project);
	if (!shop?.order) throw new TenancyError(404, 'Orders aren’t set up on this site.', 'orders_off');
	const o = shop.order;
	const { def, Model } = await orderModel(app, shop);
	const statusField = (def.fields || []).find((f: any) => f.key === o.fields.status);
	const label = (v: any) => statusField?.options?.find((x: any) => x.value === v)?.label || String(v ?? '');
	const docs: any[] = await Model.find({ _customer: customer._id, archivedAt: null }).sort({ createdAt: -1 }).limit(50).lean();
	return {
		currency: shop.currency,
		doc: docs.map(d => {
			const items = (d[o.fields.items] || []).map((i: any) => ({
				name: i[o.item.name] || '',
				variant: o.item.variant ? i[o.item.variant] || '' : '',
				quantity: Number(i[o.item.quantity]) || 0,
				unitPrice: Number(i[o.item.unitPrice]) || 0,
			}));
			const total = o.fields.total && typeof d[o.fields.total] === 'number' ? d[o.fields.total] : items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
			return { _id: String(d._id), code: d.code || '', status: d[o.fields.status], statusLabel: label(d[o.fields.status]), total, items, createdAt: d.createdAt };
		}),
	};
};

/* ------------------------------------------------------------ the panel */

export const listPayments = async (project: any, limit = 100) =>
	(await runInScope(scopeOf(project), () => SitePayment.find({}).sort({ createdAt: -1 }).limit(limit).lean())).map((p: any) => ({
		_id: String(p._id),
		ref: p.ref,
		order: String(p.order),
		orderModel: p.orderModel,
		orderCode: p.orderCode,
		provider: p.provider,
		mode: p.mode,
		amount: stripe.fromMinor(p.amount, p.currency),
		currency: p.currency,
		status: p.status,
		email: p.email,
		error: p.error || '',
		paidAt: p.paidAt,
		createdAt: p.createdAt,
		events: p.events || [],
	}));
