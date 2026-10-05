import mongoose from 'mongoose';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import SiteWidgets from '../models/tenancy/siteWidgets.model.js';
import SiteCart from '../models/tenancy/siteCart.model.js';
import Organization from '../models/tenancy/organization.model.js';
import { runInScope } from './tenantScope.function.js';
import { compiledModel, syncDynamicModels } from './dynamicModels.function.js';
import { countryByCode, listCountries } from './countries.function.js';
import { TenancyError } from './tenancy.function.js';

/**
 * The shop behind the site widgets (docs/widgets W-05, README §4). Widgets
 * don't assume model names: a project says which of its models is the
 * catalogue and which fields mean name, price, stock, variants…, and where a
 * signed-in customer's cart is kept — in MINT (`SiteCart`) or in a model of
 * its own (the E-commerce template's Cart items). Everything about money is
 * worked out here, from the catalogue, never from what a browser sends (WD5):
 * the browser only ever sends product ids, variant names and quantities.
 */

/* ------------------------------------------------------------- the mapping */

export type ShopMapping = {
	product: {
		model: string;
		fields: {
			name: string;
			price: string;
			compareAtPrice?: string;
			image?: string;
			stock?: string;
			status?: string;
			variants?: string;
		};
		/** With `status`: the values that sell (a boolean field: [true]). */
		activeValues?: (string | boolean)[];
		/** With `variants`: the sub-fields of each variant. */
		variant?: { name: string; price?: string; priceChange?: string; stock?: string };
	};
	/** Signed-in carts in a model of the project's own; null keeps them in MINT. */
	cart: { model: string; fields: { product: string; quantity: string; variant?: string; label?: string } } | null;
	currency: string;
};

/** What each part of the mapping may be. */
const KINDS = {
	name: ['text', 'textarea'],
	price: ['number', 'formula'],
	compareAtPrice: ['number', 'formula'],
	image: ['image', 'images'],
	stock: ['number'],
	status: ['select', 'text', 'boolean'],
	variants: ['sectionlist'],
	variantName: ['text', 'select'],
	variantPrice: ['number'],
	variantStock: ['number'],
	cartProduct: ['reference'],
	cartQuantity: ['number'],
	cartVariant: ['text', 'select'],
	cartLabel: ['text'],
};

const MAX_LINES = 50;
const MAX_QTY = 99;

/** A project's models and their fields, for the panel's Shop form. */
export const shopModels = (defs: any[]) =>
	defs.map(d => ({
		name: d.name,
		title: d.title || d.name,
		route: d.route,
		publicApi: { enabled: !!d.publicApi?.enabled, ownerOnly: !!d.publicApi?.ownerOnly, auth: d.publicApi?.auth || 'none' },
		fields: (d.fields || []).map((f: any) => ({
			key: f.key,
			label: f.label || f.key,
			kind: f.kind,
			...(f.ref && { ref: f.ref }),
			...(f.options?.length && { options: f.options.map((o: any) => ({ value: o.value, label: o.label || o.value })) }),
			...(f.kind === 'sectionlist' && { fields: (f.fields || []).map((s: any) => ({ key: s.key, label: s.label || s.key, kind: s.kind })) }),
		})),
	}));

const fieldOf = (def: any, key?: string) => (key ? (def?.fields || []).find((f: any) => f.key === key) : null);
const pick = (fields: any[] = [], kinds: string[], names: RegExp) => fields.find(f => kinds.includes(f.kind) && names.test(f.key))?.key;

/**
 * A suggestion from the models' names and fields — what the E-commerce and
 * Products & orders templates make is recognised as it is. Null when nothing
 * looks like a catalogue.
 */
export const guessShop = (defs: any[], currency: string): ShopMapping | null => {
	const product =
		defs.find(d => /^product$/i.test(d.name) && pick(d.fields, KINDS.price, /price/i)) ||
		defs.find(d => /product|item|catalog/i.test(d.name) && pick(d.fields, KINDS.price, /price/i));
	if (!product) return null;
	const f = product.fields || [];
	const name = pick(f, KINDS.name, /^(name|title)$/i) || pick(f, KINDS.name, /name|title/i);
	const price = pick(f, KINDS.price, /^price$/i) || pick(f, KINDS.price, /price/i);
	if (!name || !price) return null;
	const status = pick(f, ['select'], /^status$/i);
	const statusField = fieldOf(product, status);
	const variants = pick(f, KINDS.variants, /variant|option/i);
	const vf = fieldOf(product, variants)?.fields || [];
	const vName = variants ? pick(vf, KINDS.variantName, /^(name|title|label)$/i) : undefined;
	const mapping: ShopMapping = {
		product: {
			model: product.name,
			fields: {
				name,
				price,
				...opt('compareAtPrice', pick(f, KINDS.compareAtPrice, /compare|was|old|regular/i)),
				...opt('image', pick(f, KINDS.image, /image|photo|picture/i)),
				...opt('stock', pick(f, KINDS.stock, /^(stock|quantity|inventory)$/i)),
				...(statusField?.options?.some((o: any) => o.value === 'active') && { status }),
				...(vName && { variants }),
			},
			...(statusField?.options?.some((o: any) => o.value === 'active') && { activeValues: ['active'] }),
			...(vName && {
				variant: {
					name: vName,
					...opt('priceChange', pick(vf, KINDS.variantPrice, /change|diff|extra|adjust/i)),
					...(!pick(vf, KINDS.variantPrice, /change|diff|extra|adjust/i) && opt('price', pick(vf, KINDS.variantPrice, /^price$/i))),
					...opt('stock', pick(vf, KINDS.variantStock, /stock|quantity|inventory/i)),
				},
			}),
		},
		cart: null,
		currency,
	};
	const cart = defs.find(d => d.publicApi?.enabled && /cart/i.test(d.name) && (d.fields || []).some((x: any) => x.kind === 'reference' && x.ref === product.name));
	if (cart) {
		const productKey = (cart.fields || []).find((x: any) => x.kind === 'reference' && x.ref === product.name).key;
		const quantity = pick(cart.fields, KINDS.cartQuantity, /qty|quantity/i);
		if (quantity)
			mapping.cart = {
				model: cart.name,
				fields: {
					product: productKey,
					quantity,
					...opt('variant', pick(cart.fields, KINDS.cartVariant, /variant/i)),
					...opt('label', pick(cart.fields, KINDS.cartLabel, /^(label|name|title)$/i)),
				},
			};
	}
	return mapping;
};
const opt = (key: string, value?: string) => (value ? { [key]: value } : {});

/** A field the mapping names: it exists and is of a kind that fits — or a 400 saying which. */
const need = (def: any, key: any, kinds: string[], what: string, required = false) => {
	if (key === undefined || key === null || key === '') {
		if (required) throw new TenancyError(400, `Pick the ${what} field.`);
		return undefined;
	}
	const f = (def.fields || []).find((x: any) => x.key === key);
	if (!f) throw new TenancyError(400, `${def.title || def.name} has no “${key}” field (for the ${what}).`);
	if (!kinds.includes(f.kind)) throw new TenancyError(400, `The ${what} must be a ${kinds.join(' or ')} field — “${f.label || f.key}” is ${f.kind}.`);
	return String(key);
};

/** The mapping as saved: every field checked against the project's models, unknown keys gone. */
export const checkShop = (body: any, defs: any[]): ShopMapping => {
	const byName = new Map(defs.map(d => [d.name, d]));
	const p = body?.product || {};
	const product = byName.get(p.model);
	if (!product) throw new TenancyError(400, 'Pick the model that holds your products.');
	const pf = p.fields || {};
	const fields: ShopMapping['product']['fields'] = {
		name: need(product, pf.name, KINDS.name, 'product name', true)!,
		price: need(product, pf.price, KINDS.price, 'price', true)!,
	};
	for (const [k, kinds, what] of [
		['compareAtPrice', KINDS.compareAtPrice, 'compare-at price'],
		['image', KINDS.image, 'image'],
		['stock', KINDS.stock, 'stock'],
		['status', KINDS.status, 'status'],
		['variants', KINDS.variants, 'variants'],
	] as const) {
		const v = need(product, pf[k], kinds as any, what);
		if (v) (fields as any)[k] = v;
	}
	const out: ShopMapping = { product: { model: product.name, fields }, cart: null, currency: '' };

	if (fields.status) {
		const sf = fieldOf(product, fields.status);
		const values = (Array.isArray(p.activeValues) ? p.activeValues : []).filter((v: any) => (sf.kind === 'boolean' ? typeof v === 'boolean' : typeof v === 'string' && v.trim()));
		if (sf.kind === 'boolean') out.product.activeValues = values.length ? [...new Set<boolean>(values)] : [true];
		else {
			if (!values.length) throw new TenancyError(400, 'Say which status values are for sale (e.g. Active).');
			if (sf.kind === 'select' && values.some((v: string) => !(sf.options || []).some((o: any) => o.value === v)))
				throw new TenancyError(400, `“${values.find((v: string) => !(sf.options || []).some((o: any) => o.value === v))}” isn’t one of the status field’s choices.`);
			out.product.activeValues = [...new Set<string>(values.map((v: string) => v.trim()))].slice(0, 20);
		}
	}

	if (fields.variants) {
		const sub = { title: 'Each variant', fields: fieldOf(product, fields.variants).fields || [] };
		const v = p.variant || {};
		out.product.variant = { name: need(sub, v.name, KINDS.variantName, 'variant name', true)! };
		const price = need(sub, v.price, KINDS.variantPrice, 'variant price');
		const change = need(sub, v.priceChange, KINDS.variantPrice, 'variant price change');
		if (price && change) throw new TenancyError(400, 'A variant has its own price or a price change, not both.');
		if (price) out.product.variant.price = price;
		if (change) out.product.variant.priceChange = change;
		const stock = need(sub, v.stock, KINDS.variantStock, 'variant stock');
		if (stock) out.product.variant.stock = stock;
	}

	if (body?.cart?.model) {
		const cart = byName.get(body.cart.model);
		if (!cart) throw new TenancyError(400, `There's no “${body.cart.model}” model.`);
		if (cart.name === product.name) throw new TenancyError(400, 'Carts need a model of their own, not the products’.');
		if (!cart.publicApi?.enabled) throw new TenancyError(400, `Turn on ${cart.title || cart.name}’s public API (owner-only) first — each cart line belongs to a customer.`);
		const cf = body.cart.fields || {};
		const productKey = need(cart, cf.product, KINDS.cartProduct, 'cart’s product', true)!;
		if (fieldOf(cart, productKey).ref !== product.name) throw new TenancyError(400, `The cart’s product field must link to ${product.title || product.name}.`);
		out.cart = { model: cart.name, fields: { product: productKey, quantity: need(cart, cf.quantity, KINDS.cartQuantity, 'cart’s quantity', true)! } };
		const variant = need(cart, cf.variant, KINDS.cartVariant, 'cart’s variant');
		if (variant) out.cart.fields.variant = variant;
		else if (fields.variants) throw new TenancyError(400, 'Your products have variants — pick the cart field that keeps which one.');
		const label = need(cart, cf.label, KINDS.cartLabel, 'cart’s label');
		if (label) out.cart.fields.label = label;
	}

	const currency = String(body?.currency || '').trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(currency)) throw new TenancyError(400, 'Pick the currency your prices are in (e.g. BDT, USD).');
	out.currency = currency;
	return out;
};

/* ---------------------------------------------------------- load and save */

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });

/** The organization's own currency (from its country), for a first suggestion. */
const orgCurrency = async (project: any) => {
	const org: any = await Organization.findById(project.organization, { country: 1 }).lean();
	await listCountries();
	return countryByCode(org?.country)?.currency?.code || 'USD';
};

/** The saved mapping, or null. Kept checked against today's models: a field since removed makes it null. */
export const loadShop = async (project: any): Promise<ShopMapping | null> => {
	const [doc, defs]: any[] = await runInScope(scopeOf(project), () =>
		Promise.all([SiteWidgets.findOne({}, { shop: 1 }).lean(), ModelDefinition.find({ active: { $ne: false } }).lean()])
	);
	if (!doc?.shop) return null;
	try {
		return checkShop(doc.shop, defs);
	} catch {
		return null;
	}
};

/** The panel's view: the saved mapping (and why it no longer works, if so), a suggestion, the models. */
export const shopView = async (project: any) => {
	const [doc, defs]: any[] = await runInScope(scopeOf(project), () =>
		Promise.all([SiteWidgets.findOne({}, { shop: 1 }).lean(), ModelDefinition.find({ active: { $ne: false } }).lean()])
	);
	let shop: ShopMapping | null = null;
	let problem: string | null = null;
	if (doc?.shop)
		try {
			shop = checkShop(doc.shop, defs);
		} catch (e: any) {
			problem = e.message;
		}
	return { shop, saved: doc?.shop || null, problem, guess: guessShop(defs, await orgCurrency(project)), models: shopModels(defs) };
};

/** Saves the mapping (checked) — or clears it with null, which switches the cart off. */
export const saveShop = async (project: any, body: any) => {
	if (body?.shop === null) {
		await runInScope(scopeOf(project), () => SiteWidgets.updateOne({}, { $set: { shop: null, 'widgets.cart.enabled': false } }, { upsert: true }));
		return shopView(project);
	}
	const defs: any[] = await runInScope(scopeOf(project), () => ModelDefinition.find({ active: { $ne: false } }).lean());
	const shop = checkShop(body?.shop, defs);
	await runInScope(scopeOf(project), () => SiteWidgets.updateOne({}, { $set: { shop } }, { upsert: true }));
	return shopView(project);
};

/* ------------------------------------------------------- the catalogue */

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const money = (n: number) => Math.round(n * 100) / 100;
const firstImage = (v: any) => (Array.isArray(v) ? v.find(x => typeof x === 'string' && x) : typeof v === 'string' ? v : '') || '';
const isId = (v: any) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/** The catalogue model, compiled — the request already runs in the project's scope. */
const catalogue = async (app: any, m: ShopMapping) => {
	await syncDynamicModels({ app });
	const def: any = await ModelDefinition.findOne({ name: m.product.model, active: { $ne: false } }).lean();
	const Model = def && compiledModel(def.name);
	if (!Model) throw new TenancyError(409, 'The shop’s products model isn’t available — check Site setup → Widgets → Shop.', 'shop_not_set_up');
	return { def, Model };
};

/** Products a site may show: on sale (status), not archived, and public when the model keeps records private. */
const forSale = (def: any, m: ShopMapping) => ({
	archivedAt: null,
	...(m.product.fields.status && { [m.product.fields.status]: { $in: m.product.activeValues || [] } }),
	...(def.access?.enabled && { privacy: 'public' }),
});

/**
 * A product as widgets see it: name, price, compare-at, image, stock (null:
 * not counted) and variants with their own price and stock.
 */
export const productView = (doc: any, m: ShopMapping) => {
	const f = m.product.fields;
	const price = num(doc[f.price]) ?? 0;
	const compare = f.compareAtPrice ? num(doc[f.compareAtPrice]) : null;
	const v = m.product.variant;
	const variants =
		f.variants && v && Array.isArray(doc[f.variants])
			? doc[f.variants]
					.filter((x: any) => x && typeof x[v.name] === 'string' && x[v.name].trim())
					.map((x: any) => {
						const own = v.price ? num(x[v.price]) : null;
						const vp = own ?? price + (v.priceChange ? num(x[v.priceChange]) ?? 0 : 0);
						return {
							name: String(x[v.name]).trim(),
							price: money(Math.max(0, vp)),
							stock: v.stock ? Math.max(0, num(x[v.stock]) ?? 0) : null,
						};
					})
			: [];
	const stock = f.stock ? Math.max(0, num(doc[f.stock]) ?? 0) : null;
	return {
		_id: String(doc._id),
		name: String(doc[f.name] ?? '').trim(),
		price: money(Math.max(0, price)),
		compareAtPrice: compare !== null && compare > price ? money(compare) : null,
		image: f.image ? firstImage(doc[f.image]) : '',
		stock,
		variants,
		available: variants.length ? variants.some((x: any) => (x.stock === null ? stock !== 0 : x.stock > 0)) : stock !== 0,
		currency: m.currency,
	};
};

const productFields = (m: ShopMapping) => ['_id', ...Object.values(m.product.fields).filter(Boolean)].join(' ');

export const getProduct = async (app: any, m: ShopMapping, id: string) => {
	if (!isId(id)) throw new TenancyError(404, 'Not found');
	const { def, Model } = await catalogue(app, m);
	const doc = await Model.findOne({ _id: id, ...forSale(def, m) }).select(productFields(m)).lean();
	if (!doc) throw new TenancyError(404, 'Not found');
	return productView(doc, m);
};

/* ------------------------------------------------------------ the cart */

export type CartLine = { product: string; variant: string; quantity: number };

/** What a browser sent, as clean lines: real ids, whole quantities 1–99, same product + variant once. */
export const cleanLines = (raw: any): CartLine[] => {
	if (raw !== undefined && !Array.isArray(raw)) throw new TenancyError(400, 'lines must be a list');
	const out: CartLine[] = [];
	for (const l of raw || []) {
		const product = String(l?.product ?? '');
		if (!isId(product)) throw new TenancyError(400, 'Each line needs a product id');
		const variant = typeof l?.variant === 'string' ? l.variant.trim().slice(0, 200) : '';
		const q = Math.floor(Number(l?.quantity ?? 1));
		if (!Number.isFinite(q) || q < 1) throw new TenancyError(400, 'A quantity is at least 1');
		const same = out.find(x => x.product === product && x.variant === variant);
		if (same) same.quantity = Math.min(MAX_QTY, same.quantity + q);
		else out.push({ product, variant, quantity: Math.min(MAX_QTY, q) });
	}
	if (out.length > MAX_LINES) throw new TenancyError(400, `A cart holds up to ${MAX_LINES} different things`);
	return out;
};

/**
 * The cart priced from the catalogue. Each line comes back with its name,
 * image, unit price and total; one that can't be bought says why (`problem`:
 * unavailable, choose_variant, sold_out, limited — quantity cut to what's in
 * stock) and isn't counted in the subtotal. `lines` are what to keep: the
 * quantities after any cut, unavailable ones gone.
 */
export const priceCart = async (app: any, m: ShopMapping, lines: CartLine[]) => {
	const ids = [...new Set(lines.map(l => l.product))];
	const { def, Model } = ids.length ? await catalogue(app, m) : ({} as any);
	const docs: any[] = ids.length ? await Model.find({ _id: { $in: ids }, ...forSale(def, m) }).select(productFields(m)).lean() : [];
	const byId = new Map(docs.map(d => [String(d._id), productView(d, m)]));
	const priced = lines.map(l => {
		const p: any = byId.get(l.product);
		if (!p) return { ...l, name: '', image: '', unitPrice: null, total: 0, problem: 'unavailable' };
		const base = { product: l.product, variant: l.variant, name: p.name, image: p.image, compareAtPrice: null as number | null };
		let unit = p.price;
		let stock = p.stock;
		if (p.variants.length) {
			const v = p.variants.find((x: any) => x.name === l.variant);
			if (!v) return { ...base, variant: l.variant, quantity: l.quantity, unitPrice: null, total: 0, problem: l.variant ? 'unavailable' : 'choose_variant' };
			unit = v.price;
			if (v.stock !== null) stock = v.stock;
		} else if (l.variant) return { ...base, quantity: l.quantity, unitPrice: null, total: 0, problem: 'unavailable' };
		else base.compareAtPrice = p.compareAtPrice;
		if (stock === 0) return { ...base, quantity: l.quantity, unitPrice: unit, total: 0, stock: 0, problem: 'sold_out' };
		const quantity = stock === null ? l.quantity : Math.min(l.quantity, stock);
		return {
			...base,
			quantity,
			unitPrice: unit,
			total: money(unit * quantity),
			stock,
			...(quantity < l.quantity && { problem: 'limited', asked: l.quantity }),
		};
	});
	const counted = priced.filter(l => !l.problem || l.problem === 'limited');
	return {
		lines: priced,
		count: counted.reduce((s, l) => s + l.quantity, 0),
		subtotal: money(counted.reduce((s, l) => s + l.total, 0)),
		currency: m.currency,
	};
};

/** What to store after pricing: unavailable lines dropped, cut quantities kept cut. */
const keep = (priced: any): CartLine[] =>
	priced.lines.filter((l: any) => l.problem !== 'unavailable').map((l: any) => ({ product: l.product, variant: l.variant || '', quantity: l.quantity }));

/** The project's own cart model, when the shop keeps carts there. */
const cartModel = async (m: ShopMapping) => {
	const def: any = await ModelDefinition.findOne({ name: m.cart!.model, active: { $ne: false } }).lean();
	const Model = def && compiledModel(def.name);
	if (!Model) throw new TenancyError(409, 'The shop’s cart model isn’t available — check Site setup → Widgets → Shop.', 'shop_not_set_up');
	return { def, Model };
};

/** A signed-in customer's stored lines. */
const readLines = async (m: ShopMapping, customer: any): Promise<CartLine[]> => {
	if (!m.cart) {
		const doc: any = await SiteCart.findOne({ customer: customer._id }).lean();
		return (doc?.lines || []).map((l: any) => ({ product: String(l.product), variant: l.variant || '', quantity: l.quantity }));
	}
	const { Model } = await cartModel(m);
	const f = m.cart.fields;
	const rows: any[] = await Model.find({ _customer: customer._id, archivedAt: null }).sort({ createdAt: 1 }).lean();
	return cleanLines(
		rows.filter(r => r[f.product]).map(r => ({ product: String(r[f.product]), variant: f.variant ? r[f.variant] || '' : '', quantity: Math.max(1, Math.floor(num(r[f.quantity]) ?? 1)) }))
	);
};

/** Replaces a signed-in customer's stored lines. In a cart model, rows that didn't change are left alone. */
const writeLines = async (m: ShopMapping, customer: any, lines: CartLine[], priced: any) => {
	if (!m.cart) {
		await SiteCart.updateOne({ customer: customer._id }, { $set: { lines: lines.map(l => ({ ...l, product: new mongoose.Types.ObjectId(l.product) })) } }, { upsert: true });
		return;
	}
	const { def, Model } = await cartModel(m);
	const f = m.cart.fields;
	const rows: any[] = await Model.find({ _customer: customer._id }).lean();
	const keyOf = (product: any, variant: any) => `${product}|${variant || ''}`;
	const wanted = new Map(lines.map(l => [keyOf(l.product, l.variant), l]));
	const seen = new Set<string>();
	const gone: any[] = [];
	for (const r of rows) {
		const k = keyOf(r[f.product], f.variant ? r[f.variant] : '');
		const l = wanted.get(k);
		if (!l || seen.has(k) || r.archivedAt) {
			gone.push(r._id);
			continue;
		}
		seen.add(k);
		if (num(r[f.quantity]) !== l.quantity) await Model.updateOne({ _id: r._id }, { $set: { [f.quantity]: l.quantity } });
	}
	if (gone.length) await Model.deleteMany({ _id: { $in: gone }, _customer: customer._id });
	const names = new Map(priced.lines.map((p: any) => [keyOf(p.product, p.variant), p.name]));
	for (const [k, l] of wanted) {
		if (seen.has(k)) continue;
		const name = String(names.get(k) || '');
		await Model.create({
			[f.product]: l.product,
			[f.quantity]: l.quantity,
			...(f.variant && l.variant && { [f.variant]: l.variant }),
			...(f.label && { [f.label]: (l.variant ? `${name} — ${l.variant}` : name).slice(0, 200) || 'Cart item' }),
			_customer: customer._id,
			...(def.access?.enabled && { privacy: 'public' }),
		});
	}
};

/** A signed-in customer's cart, priced (and tidied: what can't be bought any more is dropped). */
export const customerCart = async (app: any, m: ShopMapping, customer: any) => {
	const lines = await readLines(m, customer);
	const priced = await priceCart(app, m, lines);
	const kept = keep(priced);
	if (JSON.stringify(kept) !== JSON.stringify(lines)) await writeLines(m, customer, kept, priced);
	return priced;
};

/** Replaces a signed-in customer's cart (`merge`: adds to it — a guest cart on sign-in). */
export const setCustomerCart = async (app: any, m: ShopMapping, customer: any, raw: any, merge = false) => {
	const sent = cleanLines(raw);
	const lines = merge ? cleanLines([...(await readLines(m, customer)), ...sent]) : sent;
	const priced = await priceCart(app, m, lines);
	await writeLines(m, customer, keep(priced), priced);
	return priced;
};
