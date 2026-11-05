import ApiEndpoint from '../../models/tenancy/apiEndpoint.model.js';
import RouteConfig from '../../models/builder/routeConfig.model.js';
import RouteVersion from '../../models/builder/routeVersion.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import SidebarItem from '../../models/sidebaritems/model.js';
import { BuildError, updateModelCore } from '../../controllers/builder/models.controller.js';
import { TEMPLATE_MAX_STEPS, buildFeature } from '../../controllers/builder/features.service.js';
import { planFromAi } from '../../controllers/builder/features.schema.js';
import { listDefaultsOf } from '../apiEndpoints.function.js';
import { compiledModel, freeUid, inProjectCollection, uidOf } from '../dynamicModels.function.js';
import { MODEL_KEY } from '../projectIndexes.function.js';
import { invalidateRoute } from '../resolveRoute.function.js';
import { Installed, applySidebar, engineFieldsReadOnly } from './install.js';
import { ModelKey, OLD_PRICE_AFTER_TAX, coreFieldsOf, modelSpecs } from './blueprint.js';
import { ensureDiscountAutomations } from './discountAutomations.js';
import { zoneOf } from './discounts.js';
import { zoneForCountry } from './zones.js';
import Organization from '../../models/tenancy/organization.model.js';
import { formulasOfPage } from '../automations.function.js';
import { recalculateFormulas } from '../formula.function.js';
import { currentScope } from '../tenantScope.function.js';
import { Store, storeOf } from './store.js';
import { ensureStoreSiteKit } from '../websiteKit.function.js';
import { applyAllCategoryTaxes } from './categoryTax.js';
import { rebuildPurchases } from './purchases.js';
import { seedStoreDashboard } from './dashboard.js';
import { ensureDeliveryAutomations } from './deliveryAutomations.js';
import { ensureTaxAutomations } from './taxAutomations.js';
import { refreshTaxAdded, relabelPriceColumns } from './taxRates.js';
import { publishConfigPatch } from '../../controllers/builder/builder.controller.js';

/**
 * A store built before the blueprint last changed, brought up to it
 * (docs/ecommerce EC-21): the fields added since, put on its models beside
 * the person's own and locked like the rest of the store's; a label or helper
 * renewed only where it's still the one MINT gave it. Then each change's own
 * fill-in for the records already there. Safe to run again — what's done is
 * left alone. Runs in the project's scope.
 */

/** Labels the blueprint used to give a field — renewed to today's when the store still has them. */
const OLD_LABELS: Partial<Record<ModelKey, Record<string, string[]>>> = {
	category: { sortOrder: ['Order on the POS'], image: ['Image'] },
	product: { taxRate: ['Tax rate'] },
	coupon: { type: ['Type'], minOrder: ['Minimum order'], startsAt: ['Starts'], endsAt: ['Ends'], usageLimit: ['Can be used (times)'], used: ['Used'] },
};

/** Fields the blueprint no longer has: taken off a store's model once their values are carried over (the coupon's one value, Active, and what it applies to). */
const DROPPED: Partial<Record<ModelKey, string[]>> = { coupon: ['value', 'active', 'appliesTo', 'categories', 'products'] };

/** Descriptions the blueprint used to give a model — renewed to today's when the store still has them. */
const OLD_DESCRIPTIONS: Partial<Record<ModelKey, string[]>> = {
	category: ['How products are grouped — on the POS too'],
};

type Change = { model: string; added: string[]; renewed: string[]; filled: string[] };

/** Today's blueprint fields missing from `have`, each put after the blueprint field before it. */
const merged = (have: any[], want: any[]) => {
	const out = [...have];
	const keys = () => new Set(out.map(f => f.key));
	const added: string[] = [];
	want.forEach((f, i) => {
		if (keys().has(f.key)) return;
		const before = want
			.slice(0, i)
			.reverse()
			.find(w => keys().has(w.key));
		const at = before ? out.findIndex(x => x.key === before.key) + 1 : 0;
		out.splice(at, 0, { ...f });
		added.push(f.key);
	});
	return { fields: out, added };
};

/**
 * The category fill-in (EC-21): every one shown on the POS and the website, a
 * website order, a web address made from its name. Straight to the collection
 * — the fields may not be compiled yet on a dry run.
 */
const fillCategories = async (def: any, apply: boolean, firstTime: boolean) => {
	const Category: any = compiledModel(def.name);
	if (!Category) return [];
	const own = inProjectCollection(def) ? { [MODEL_KEY]: def.name } : {};
	const col = Category.collection;
	const blank = { $in: [null, ''] };
	const filled: string[] = [];
	const statusless = await col.countDocuments({ ...own, $or: [{ posStatus: blank }, { webStatus: blank }] });
	if (statusless) filled.push(`${statusless} shown on the POS and website`);
	const nameless: any[] = await col.find({ ...own, slug: blank }, { projection: { name: 1 } }).toArray();
	if (nameless.length) filled.push(`${nameless.length} web address(es)`);
	// Order on POS ran lowest first before; now it's highest first. The first time, the numbers are
	// turned round so the order people set stays, and the website (which sorted by it) gets the same.
	const ordered: any[] = firstTime ? await col.find({ ...own, sortOrder: { $type: 'number' } }, { projection: { sortOrder: 1 } }).toArray() : [];
	const top = Math.max(0, ...ordered.map(c => c.sortOrder));
	if (ordered.some(c => c.sortOrder)) filled.push(`${ordered.length} order(s) turned round to highest first, the same on the website`);
	if (!apply) return filled;
	if (ordered.some(c => c.sortOrder))
		for (const c of ordered) await col.updateOne({ _id: c._id }, { $set: { sortOrder: top + 1 - c.sortOrder, webOrder: top + 1 - c.sortOrder } });
	await col.updateMany({ ...own, posStatus: blank }, { $set: { posStatus: 'active' } });
	await col.updateMany({ ...own, webStatus: blank }, { $set: { webStatus: 'active' } });
	await col.updateMany({ ...own, webOrder: null }, { $set: { webOrder: 0 } });
	for (const c of nameless) {
		const base = uidOf(c.name);
		if (base) await col.updateOne({ _id: c._id }, { $set: { slug: await freeUid(Category, 'slug', base, c._id) } });
	}
	return filled;
};

/** Coupons from before they had their own fields: the percentage or the amount from their one value, Status from Active. */
const fillCoupons = async (def: any, apply: boolean) => {
	const Coupon: any = compiledModel(def.name);
	if (!Coupon) return [];
	const own = inProjectCollection(def) ? { [MODEL_KEY]: def.name } : {};
	const col = Coupon.collection;
	const old: any[] = await col.find({ ...own, $or: [{ status: { $in: [null, ''] } }, { percentOff: null, amountOff: null, value: { $ne: null } }] }).toArray();
	if (!old.length) return [];
	if (apply)
		for (const c of old) {
			const set: any = {};
			if (!c.status) set.status = c.active === false ? 'inactive' : 'active';
			if (c.percentOff == null && c.amountOff == null && c.value != null) set[c.type === 'fixed' ? 'amountOff' : 'percentOff'] = Number(c.value) || 0;
			if (Object.keys(set).length) await col.updateOne({ _id: c._id }, { $set: set });
		}
	return [`${old.length} coupon(s) moved to the new percentage / amount and status fields`];
};

/** Products from before product types: With variations when they have options, Simple otherwise. */
const fillProducts = async (def: any, apply: boolean) => {
	const Product: any = compiledModel(def.name);
	if (!Product) return [];
	const own = inProjectCollection(def) ? { [MODEL_KEY]: def.name } : {};
	const col = Product.collection;
	const blank = { $in: [null, ''] };
	const todo: any[] = await col.find({ ...own, productType: blank }, { projection: { options: 1 } }).toArray();
	if (!todo.length) return [];
	const varied = todo.filter(p => Array.isArray(p.options) && p.options.some((o: any) => String(o?.name || '').trim() && String(o?.values || '').trim()));
	if (apply) {
		if (varied.length) await col.updateMany({ _id: { $in: varied.map(p => p._id) } }, { $set: { productType: 'variation' } });
		await col.updateMany({ ...own, productType: blank }, { $set: { productType: 'simple' } });
	}
	return [`${todo.length} product(s) given a type — ${varied.length} with variations`];
};

/** The website's rules on the store's own standard list endpoints (a Status on website, an Order on website). */
const fillEndpoints = async (def: any, apply: boolean) => {
	const want = listDefaultsOf(def);
	const ep: any = want && (await ApiEndpoint.findOne({ model: def.route, action: 'list', standard: true }).lean());
	if (!ep) return [];
	const set: any = {};
	const filters = ep.list?.filters || [];
	const missing = want!.filters.filter(w => !filters.some((f: any) => f?.field === w.field));
	if (missing.length) set['list.filters'] = [...filters, ...missing];
	// An empty sort, or the POS order the website used before it had its own.
	if (want!.sort && (!ep.list?.sort || ep.list.sort === 'sortOrder')) set['list.sort'] = want!.sort;
	if (!Object.keys(set).length) return [];
	if (apply) await ApiEndpoint.updateOne({ _id: ep._id }, { $set: set });
	return [`${ep.method} ${ep.path}: ${[missing.length && 'hides what’s inactive on the website', set['list.sort'] && `sorted ${set['list.sort']}`].filter(Boolean).join(', ')}`];
};

/**
 * The public lists and pages send back these fields when they name what they send: Products and Categories their
 * SEO (the website shows it on its page), Products and Variants their sale price and discount (DISCOUNTS.md DS14).
 */
const fillOut = async (def: any, keys: string[], what: string, apply: boolean) => {
	const ep: any = await ApiEndpoint.findOne({ model: def.route, standard: true, action: { $in: ['list', 'get'] } }).lean();
	const out = ep?.fields?.out;
	const have = new Set((def.fields || []).map((f: any) => f.key));
	const missing = keys.filter(k => have.has(k));
	if (!Array.isArray(out) || missing.every(k => out.includes(k))) return [];
	if (apply) await ApiEndpoint.updateMany({ model: def.route, standard: true, action: { $in: ['list', 'get'] }, 'fields.out': { $type: 'array' } }, { $addToSet: { 'fields.out': { $each: missing } } });
	return [`public ${def.title} list and page send back their ${what}`];
};
const fillSeoOut = (def: any, apply: boolean) => fillOut(def, ['seo'], 'SEO', apply);

/**
 * The page laid out in the blueprint's sections (EC21: Category, POS
 * configuration, Website configuration, Images — short inputs side by side),
 * when it doesn't have them all yet. Fields the person added go in a More
 * details section. Published straight away, the version before kept.
 */
const layoutPage = async (req: any, def: any, step: any, fields: any[], apply: boolean) => {
	if (!Array.isArray(step.form)) return [];
	const doc: any = await RouteConfig.findOne({ route: def.route });
	if (!doc?.data) return [];
	const titles = new Set((doc.data.form || []).map((x: any) => x?.sectionTitle));
	if (step.form.every((x: any) => titles.has(x.sectionTitle))) return [];
	const own = fields.map(f => f.key);
	const has = (k: string) => own.includes(k);
	const placed = new Set<string>(step.form.flatMap((x: any) => x.fields.flat()));
	// Fields the blueprint shows only on the detail page (an engine count like Used) aren't "added by the person" for the form.
	const viewed = new Set<string>((step.view || []).flatMap((x: any) => x.fields));
	const rest = own.filter(k => !placed.has(k) && !viewed.has(k));
	const form = [
		...step.form.map((x: any) => ({
			...x,
			fields: x.fields.map((row: any) => (Array.isArray(row) ? row.filter(has) : has(row) ? row : null)).filter((row: any) => row && (!Array.isArray(row) || row.length)),
		})),
		...(rest.length ? [{ sectionTitle: 'More details', description: 'Fields you added', fields: rest }] : []),
	].filter((x: any) => x.fields.length);
	const view = [
		...(step.view || []).map((x: any) => ({ ...x, fields: x.fields.filter((k: string) => has(k) || k === 'createdAt') })),
		...(rest.length ? [{ title: 'More details', columns: 2, fields: rest }] : []),
	].filter((x: any) => x.fields.length);
	if (apply) {
		const version = (doc.version || 0) + 1;
		const data = { ...doc.data, form, view };
		const draft = doc.draft ? { ...doc.draft, form, view } : doc.draft;
		await RouteConfig.updateOne({ _id: doc._id }, { $set: { data, draft, version, publishedAt: new Date(), publishedBy: req.user?._id } });
		await RouteVersion.create({ route: def.route, kind: 'config', version, data, note: 'The store’s upgrade: the page in sections', publishedBy: req.user?._id });
		invalidateRoute(def.route);
	}
	return [`form and detail page in sections (${form.map(x => x.sectionTitle).join(', ')})`];
};

/**
 * Models the blueprint gained after the store was built (Deliveries, docs/couriers CR-02): built as one feature in
 * the store's sidebar category, marked as the store's (EC4), their engine fields read-only (EC5), recorded on the
 * store's settings and the sidebar redone. The links they make to the store's models (a delivery's order) give
 * those pages their tab.
 */
const addModels = async (req: any, store: Store, apply: boolean): Promise<Change[]> => {
	const missing = modelSpecs(store.answers).filter(s => !store.installed[s.key]);
	if (!missing.length) return [];
	const changes = missing.map(s => ({ model: s.step.title, added: [], renewed: [], filled: ['built for this store'] }));
	if (!apply) return changes;
	const first: any = store.installed.order || Object.values(store.installed)[0];
	const def: any = first && (await ModelDefinition.findById(first.id, { sidebarItem: 1 }).lean());
	const item: any = def?.sidebarItem && (await SidebarItem.findById(def.sidebarItem, { category: 1 }).lean());
	const plan = {
		title: `Store: ${missing.map(s => s.step.title).join(', ')}`,
		summary: 'Added to the store by its upgrade.',
		sidebarCategory: item?.category ? String(item.category) : '',
		steps: missing.map(s => ({ action: 'create', ...s.step })),
	};
	const built = await buildFeature(req, planFromAi(plan), { source: 'template', maxSteps: TEMPLATE_MAX_STEPS });
	const installed: Installed = { ...store.installed };
	for (const s of missing) {
		const m = built.created.find(c => c.title === s.step.title);
		if (!m) throw new BuildError(500, `${s.step.title} wasn’t built`);
		installed[s.key] = { name: m.name, route: m.route, id: m.id };
		await ModelDefinition.updateOne({ _id: m.id }, { $set: { system: 'commerce', systemFields: coreFieldsOf(s.step) } });
		await engineFieldsReadOnly(m.route, s.engine);
	}
	await CommerceSettings.updateOne({}, { $set: { installed } });
	await applySidebar(store.answers, installed);
	return changes;
};

/**
 * A page that lists the products picking it (docs/ecommerce DISCOUNTS.md DS7, DS11): the Products tab a new store gets
 * from the product's link, given to a store whose model came by this upgrade — built on its own, before Products had
 * the link, so the build made no tab. A collection's products (Collections), a discount's (Discount).
 */
const ensureProductsTab = async (req: any, store: Store, key: 'collection' | 'discount', foreignField: string, apply: boolean): Promise<Change[]> => {
	const target = store.installed[key];
	const prod = store.installed.product;
	if (!target || !prod) return [];
	const doc: any = await RouteConfig.findOne({ route: target.route }, { data: 1 }).lean();
	const tabs: any[] = Array.isArray(doc?.data?.viewTabs) ? doc.data.viewTabs : [];
	if (tabs.some(t => t?.related === prod.route && t?.foreignField === foreignField)) return [];
	const pdef: any = await ModelDefinition.findById(prod.id, { fields: 1 }).lean();
	if (!pdef?.fields?.some((f: any) => f.key === foreignField)) return [];
	if (apply) {
		const pc: any = await RouteConfig.findOne({ route: prod.route }, { data: 1 }).lean();
		const cols = (Array.isArray(pc?.data?.table) ? pc.data.table : ['name', 'category', 'price', 'totalStock', 'status'])
			.map((c: any) => (typeof c === 'string' ? c : c?.key || c?.dataKey))
			.filter((c: any) => typeof c === 'string' && c && c !== foreignField && !c.includes('.'))
			.slice(0, 5);
		await publishConfigPatch(
			req,
			target.route,
			data => ({ ...data, viewTabs: [...(Array.isArray(data.viewTabs) ? data.viewTabs : []), { related: prod.route, foreignField, title: 'Products', display: 'table', columns: cols, pageSize: 10 }] }),
			'The store’s upgrade: a Products tab'
		);
	}
	return [{ model: key === 'collection' ? 'Collections' : 'Discounts', added: [], renewed: [], filled: [`a Products tab on each ${key}’s page`] }];
};

/**
 * Sale price beside Price after tax in the form's Pricing section, and the discount's fields beside them on the
 * detail page (DS1) — an upgrade adds new fields to the first section, out of the way. Done once per page.
 */
const placeSaleFields = async (req: any, def: any, product: boolean, apply: boolean) => {
	const doc: any = await RouteConfig.findOne({ route: def.route }, { data: 1 }).lean();
	const form: any[] = Array.isArray(doc?.data?.form) ? doc.data.form : [];
	const flat = (sec: any) => (sec?.fields || []).flat();
	const pricing = form.find(x => flat(x).includes('priceAfterTax')) || form.find(x => flat(x).includes('price'));
	if (!pricing || flat(pricing).includes('salePrice')) return [];
	if (apply) {
		const ours = product ? ['discount', 'discountPercent', 'salePrice'] : ['discountPercent', 'salePrice'];
		await publishConfigPatch(
			req,
			def.route,
			data => {
				const strip = (rows: any[]) => rows.map((r: any) => (Array.isArray(r) ? r.filter(k => !ours.includes(k)) : ours.includes(r) ? null : r)).filter((r: any) => r && (!Array.isArray(r) || r.length));
				const out = { ...data };
				if (Array.isArray(out.form)) {
					const at = out.form.findIndex((x: any) => flat(x).includes('priceAfterTax'));
					const pi = at >= 0 ? at : out.form.findIndex((x: any) => flat(x).includes('price'));
					out.form = out.form.map((x: any, i: number) => {
						const fields = strip(x.fields || []);
						if (i !== pi) return { ...x, fields };
						const key = at >= 0 ? 'priceAfterTax' : 'price';
						return {
							...x,
							fields: fields.map((r: any) => (r === key ? (key === 'price' ? ['price', 'salePrice'] : ['salePrice', 'priceAfterTax']) : Array.isArray(r) && r.includes(key) ? (key === 'price' ? [...r, 'salePrice'] : r.flatMap((k: string) => (k === key ? ['salePrice', key] : [k]))) : r)),
						};
					});
				}
				if (Array.isArray(out.view) && out.view.length) {
					const views = out.view.map((x: any) => ({ ...x, fields: (x.fields || []).filter((k: any) => !ours.includes(typeof k === 'string' ? k : k?.field)) }));
					const vi = views.findIndex((x: any) => x.fields.some((k: any) => k === 'priceAfterTax' || k === 'price'));
					const show = product ? ours : ours;
					if (vi >= 0) views[vi] = { ...views[vi], fields: views[vi].fields.flatMap((k: any) => (k === (views[vi].fields.includes('priceAfterTax') ? 'priceAfterTax' : 'price') ? [k, ...show] : [k])) };
					else views[0] = { ...views[0], fields: [...views[0].fields, ...show] };
					out.view = views;
				}
				return out;
			},
			'The store’s upgrade: Sale price beside the price'
		);
	}
	return ['Sale price beside the price on the form and the detail page'];
};

/**
 * The sale-price fill (DS13), once: every product and variant without a Discount % gets 0, and their formulas are
 * worked out again — Sale price = Price, Price after tax unchanged (it now reads Sale price).
 */
const fillSalePrices = async (store: Store, apply: boolean) => {
	const out: string[] = [];
	for (const key of ['product', 'variant'] as const) {
		const m = store.installed[key];
		if (!m) continue;
		const def: any = await ModelDefinition.findById(m.id).lean();
		const Model: any = def && compiledModel(def.name);
		if (!Model) continue;
		const own = inProjectCollection(def) ? { [MODEL_KEY]: def.name } : {};
		const n = await Model.collection.countDocuments(own);
		if (!n) continue;
		if (apply) {
			await Model.collection.updateMany({ ...own, discountPercent: null }, { $set: { discountPercent: 0 } });
			const formulas = await formulasOfPage(def);
			if (formulas.length) await recalculateFormulas(Model, {}, formulas);
		}
		out.push(`${n} ${key === 'product' ? 'product' : 'variant'}${n === 1 ? '' : 's'}: Sale price = Price, Price after tax ${apply ? 'worked out' : 'would be worked out'} from it`);
	}
	return out;
};

export const upgradeStore = async (req: any, { apply = false } = {}): Promise<Change[]> => {
	const store = await storeOf();
	const hadPurchases = !!store.installed.purchase;
	const changes: Change[] = await addModels(req, store, apply);
	for (const spec of modelSpecs(store.answers)) {
		const m = store.installed[spec.key];
		if (!m) continue;
		const def: any = await ModelDefinition.findById(m.id).lean();
		if (!def) continue;
		const want: any[] = spec.step.fields || [];
		// A section field once keyed updatedAt (now reserved) is renamed, or the model no longer saves.
		const have = (def.fields || []).map((f: any) =>
			f.kind === 'section' && f.fields?.some((x: any) => x.key === 'updatedAt')
				? { ...f, fields: f.fields.map((x: any) => (x.key === 'updatedAt' ? { ...x, key: 'lastUpdate' } : x)) }
				: f,
		);
		const renamed = JSON.stringify(have) !== JSON.stringify(def.fields || []);
		const dropped = (DROPPED[spec.key] || []).filter(k => have.some((f: any) => f.key === k));
		const { fields: all, added } = merged(have, want);
		const fields = all.filter((f: any) => !dropped.includes(f.key));
		const renewed: string[] = [];
		for (const f of fields) {
			const w = want.find(x => x.key === f.key);
			if (!w || added.includes(f.key)) continue;
			const old = OLD_LABELS[spec.key]?.[f.key] || [];
			if (w.label !== f.label && old.includes(f.label)) {
				f.label = w.label;
				renewed.push(f.key);
			}
			// A select that has gained options (Origin: Website) and a section that has gained fields (the delivery's city, landmark, email).
			if (w.kind === 'select' && f.kind === 'select' && Array.isArray(w.options)) {
				const have = new Set((f.options || []).map((o: any) => o.value));
				const more = w.options.filter((o: any) => !have.has(o.value));
				if (more.length) {
					f.options = [...(f.options || []), ...more];
					renewed.push(f.key);
				}
				if (spec.key === 'order' && f.key === 'channel' && f.label === 'Channel') {
					f.label = w.label;
					if (!renewed.includes(f.key)) renewed.push(f.key);
				}
			}
			// …and a row list too (an order's items gained the store discount they sold at, DISCOUNTS.md DS10).
			if ((w.kind === 'section' || w.kind === 'sectionlist') && f.kind === w.kind && Array.isArray(w.fields)) {
				const have = new Set((f.fields || []).map((x: any) => x.key));
				const more = w.fields.filter((x: any) => !have.has(x.key));
				if (more.length) {
					f.fields = [...(f.fields || []), ...more];
					if (!renewed.includes(f.key)) renewed.push(f.key);
				}
			}
			// A web address typed by hand only, from before it was made from the name.
			if (w.kind === 'uid' && f.kind === 'uid' && w.from && !f.from) {
				f.from = w.from;
				if (!renewed.includes(f.key)) renewed.push(f.key);
			}
			// A picker's own rules (the variants' product: only the ones with variations; SKU under each name).
			// Each rule on its own: a picker that already had a filter still gets the fill it was missing.
			if (f.kind === 'reference' && (w.optionFilters || w.pickerDetails || w.fillFrom)) {
				let gave = false;
				if (w.optionFilters && !f.optionFilters) (f.optionFilters = w.optionFilters), (gave = true);
				if (w.pickerDetails && !f.pickerDetails) (f.pickerDetails = w.pickerDetails), (gave = true);
				if (w.fillFrom && !f.fillFrom) (f.fillFrom = w.fillFrom), (gave = true);
				if (gave) {
					if (w.helper && !f.helper) f.helper = w.helper;
					if (!renewed.includes(f.key)) renewed.push(f.key);
				}
			}
			// Price after tax is worked out from the tax the till charges (taxAdded), not from the picked tax alone —
			// and from the sale price, now that discounts don't change Price (DISCOUNTS.md DS1).
			if (w.kind === 'formula' && f.kind === 'formula' && f.key === 'priceAfterTax' && f.formula !== w.formula && (/taxRate\.rate/.test(f.formula || '') || f.formula === OLD_PRICE_AFTER_TAX)) {
				f.formula = w.formula;
				f.helper = w.helper;
				if (!renewed.includes(f.key)) renewed.push(f.key);
			}
			if (w.helper && !f.helper && (old.includes(f.label) || f.label === w.label)) {
				f.helper = w.helper;
				if (!renewed.includes(f.key)) renewed.push(f.key);
			}
		}
		const description = OLD_DESCRIPTIONS[spec.key]?.includes(def.description) ? spec.step.description : def.description;
		if (description !== def.description) renewed.push('description');
		const core = [...new Set([...(def.systemFields || []), ...coreFieldsOf(spec.step)])].filter(k => !dropped.includes(k));
		if (renamed) renewed.push('updatedAt → lastUpdate');
		if (dropped.length) renewed.push(`removes ${dropped.join(', ')}`);
		const change: Change = { model: def.title, added, renewed, filled: [] };
		if (apply && (added.length || renewed.length || dropped.length)) {
			// The store's own fields can't be removed; the ones the blueprint dropped are let go first.
			if (dropped.length) await ModelDefinition.updateOne({ _id: def._id }, { $pull: { systemFields: { $in: dropped } } });
			await updateModelCore(req, def._id, { ...def, description, fields }, { note: 'Before the store’s upgrade' });
			await engineFieldsReadOnly(def.route, spec.engine);
		}
		if (apply && core.length !== (def.systemFields || []).length) await ModelDefinition.updateOne({ _id: def._id }, { $set: { systemFields: core } });
		change.filled.push(...(await layoutPage(req, def, spec.step, fields, apply)));
		if ((spec.key === 'product' || spec.key === 'variant') && fields.some((f: any) => f.key === 'salePrice'))
			change.filled.push(...(apply || !added.includes('salePrice') ? await placeSaleFields(req, def, spec.key === 'product', apply) : ['Sale price beside the price on the form and the detail page']));
		if (spec.key === 'coupon') change.filled.push(...(await fillCoupons(def, apply)));
		if (spec.key === 'product') change.filled.push(...(await fillProducts(def, apply)));
		if (spec.key === 'product' || spec.key === 'category') change.filled.push(...(await fillSeoOut(def, apply)));
		if (spec.key === 'product' || spec.key === 'variant') change.filled.push(...(await fillOut({ ...def, fields }, ['salePrice', 'discountPercent', 'discount'], 'sale price and discount', apply)));
		if (spec.key === 'category') change.filled.push(...(await fillCategories(def, apply, added.includes('webOrder'))), ...(await fillEndpoints({ ...def, fields }, apply)));
		if (change.added.length || change.renewed.length || change.filled.length) changes.push(change);
	}
	changes.push(...(await ensureProductsTab(req, await storeOf(), 'collection', 'collections', apply)));
	changes.push(...(await ensureProductsTab(req, await storeOf(), 'discount', 'discount', apply)));
	// What customers bought, worked out from the orders already there.
	if (!hadPurchases && apply) {
		const n = await rebuildPurchases(await storeOf());
		changes.push({ model: 'Customer purchases', added: [], renewed: [], filled: [`worked out for ${n} customer${n === 1 ? '' : 's'} from their orders`] });
	}
	// Categories that already had a tax hand it to their products — once; after that it follows each save.
	const done: any = ((await CommerceSettings.findOne({}, { doneOnce: 1 }).lean()) as any)?.doneOnce || [];
	if (!done.includes('category-tax')) {
		const n = await applyAllCategoryTaxes(await storeOf(), { apply });
		if (apply) await CommerceSettings.updateOne({}, { $addToSet: { doneOnce: 'category-tax' } });
		if (n) changes.push({ model: 'Products', added: [], renewed: [], filled: [`${n} product${n === 1 ? '' : 's'} ${apply ? 'took' : 'would take'} their category’s tax`] });
	}
	// The tax automations (EC-37): a category's tax to its products, a product's category to its tax, a product's tax to its variants.
	const taxMade = await ensureTaxAutomations(((await CommerceSettings.findOne({}, { installed: 1 }).lean()) as any)?.installed || store.installed, { apply });
	if (taxMade.length) changes.push({ model: 'Automations', added: [], renewed: [], filled: taxMade });
	// The price column's name follows the tax mode.
	const relabelled = await relabelPriceColumns(req, await storeOf(), { apply });
	if (relabelled.length) changes.push({ model: 'Products', added: [], renewed: relabelled, filled: [] });
	// Every item's tax by the till's rule, once, now that Price after tax reads it (EC-38).
	const doneTax: any = ((await CommerceSettings.findOne({}, { doneOnce: 1 }).lean()) as any)?.doneOnce || [];
	if (!doneTax.includes('tax-prices')) {
		if (apply) {
			await refreshTaxAdded(await storeOf());
			await CommerceSettings.updateOne({}, { $addToSet: { doneOnce: 'tax-prices' } });
		}
		changes.push({ model: 'Products', added: [], renewed: [], filled: [`Price after tax ${apply ? 'worked out' : 'would be worked out'} by the till’s tax rule`] });
	}
	// The store's time zone (DS9), for a store set up before it had one: its organization's country's.
	const zoned: any = await CommerceSettings.findOne({}, { 'answers.store.timeZone': 1 }).lean();
	if (!zoned?.answers?.store?.timeZone) {
		const org: any = await Organization.findById(currentScope()?.organization, { country: 1 }).lean();
		const tz = zoneForCountry(org?.country);
		if (apply) await CommerceSettings.updateOne({}, { $set: { 'answers.store.timeZone': tz } });
		changes.push({ model: 'Store settings', added: ['time zone'], renewed: [], filled: [tz] });
	}
	// Sale price on every product and variant, once (DISCOUNTS.md DS13).
	const doneSale: any = ((await CommerceSettings.findOne({}, { doneOnce: 1 }).lean()) as any)?.doneOnce || [];
	if (!doneSale.includes('sale-price')) {
		const filled = await fillSalePrices(await storeOf().catch(() => store), apply);
		if (apply) await CommerceSettings.updateOne({}, { $addToSet: { doneOnce: 'sale-price' } });
		if (filled.length) changes.push({ model: 'Products', added: [], renewed: [], filled });
	}
	// The discount automations D1–D6 (DS5), their start and end in the store's time zone.
	const fresh = await storeOf();
	const discountMade = await ensureDiscountAutomations((fresh.installed as any) || {}, await zoneOf(fresh), { apply });
	if (discountMade.length) changes.push({ model: 'Automations', added: [], renewed: [], filled: discountMade });
	// Deliveries' two emails, off until the owner turns them on (docs/couriers CR-14).
	const installedNow: any = ((await CommerceSettings.findOne({}, { installed: 1 }).lean()) as any)?.installed || store.installed;
	const mails = await ensureDeliveryAutomations(installedNow, { apply });
	if (mails.length) changes.push({ model: 'Automations', added: [], renewed: [], filled: mails.map(m => `“${m}” (off)`) });
	const home = await seedStoreDashboard(store.installed as any, { apply });
	if (home.length) changes.push({ model: 'Dashboard', added: [], renewed: [], filled: home });
	const kit = await ensureStoreSiteKit(req, { apply });
	if (kit.length) changes.push({ model: 'Website', added: [], renewed: [], filled: kit });
	return changes;
};
