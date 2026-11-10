import Organization from '../../models/tenancy/organization.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { formulasOfPage } from '../automations.function.js';
import { recalculateFormulas } from '../formula.function.js';
import { diffFields, recordHistory } from '../recordHistory.function.js';
import { currentScope } from '../tenantScope.function.js';
import { isId } from './catalogue.js';
import { Store, storeOf } from './store.js';
import { dayOf, dayText, endOfDay, startOfDay, validZone, zoneForCountry } from './zones.js';
import { touchLater } from './search/indexer.js';

/**
 * The store's discounts (docs/ecommerce DISCOUNTS.md DS1–DS4). A discount is a percentage off the products it names,
 * the products in its categories (and their sub-categories) and in its collections. Price is never changed: each
 * product carries the one discount that wins for it — its Discount and Discount % — and Sale price is worked out from
 * them (a formula), Price after tax from Sale price. Its variants carry the same Discount %.
 *
 * **One rule, worked out every time, never remembered (DS3):** the discounts that reach a product are the active,
 * started ones that name it, its category (or one above it, with sub-categories on) or one of its collections; the
 * biggest percentage wins, two are never added up. Every change — a discount saved, switched, deleted, started or
 * ended, a product moved, a category re-parented — works the products it touches out again with this rule. So
 * switching a discount off is exact: a product also in a smaller discount drops to that one, not to full price.
 *
 * Its end date (DS8): the store switches it off at the end of that day (automation D5); one whose end date has
 * passed can't be switched on until the date moves.
 *
 *   applyDiscounts(store, productIds)   writes the winning discount on those products and their variants
 *   productsTouched(store, …)           the products a saved / deleted discount, product or category affects
 *   discountProblem(store, before, body) why a discount can't be saved like this, or null
 *   previewDiscount(store, before, body) what saving it would do (the form's note, DS11)
 */

const BATCH = 200;
const ACTOR = 'Store: discounts';

const idsOf = (xs: any): string[] => [...new Set<string>((Array.isArray(xs) ? xs : xs ? [xs] : []).map((x: any) => String(x?._id ?? x)).filter(isId))];

/** The store's time zone: its own (Store settings), else its organization's country's. */
export const zoneOf = async (store: Store) => {
	const tz = (store.answers as any)?.store?.timeZone;
	if (validZone(tz)) return tz as string;
	const org = currentScope()?.organization;
	const o: any = org ? await Organization.findById(org, { country: 1 }).lean() : null;
	return zoneForCountry(o?.country);
};

/** Whether a discount reaches products right now: switched on, and its Starts day has come. */
const isLive = (d: any, tz: string, now: number) => d?.status !== 'inactive' && Number(d?.percent) > 0 && (!d.startsAt || (startOfDay(d.startsAt, tz)?.getTime() ?? 0) <= now);

/** Whether its Ends day is over. */
export const hasEnded = (d: any, tz: string, now = Date.now()) => !!d?.endsAt && (endOfDay(d.endsAt, tz)?.getTime() ?? Infinity) <= now;

/** Each category's parent. */
const parentsOf = async (store: Store) => {
	const out = new Map<string, string>();
	if (!store.installed.category) return out;
	for (const c of await store.M('category').find({}, { parent: 1 }).lean()) if (c.parent) out.set(String(c._id), String(c.parent?._id ?? c.parent));
	return out;
};

/** A category and every one above it (a loop in the tree stops it). */
const upFrom = (parents: Map<string, string>, id: string) => {
	const out: string[] = [];
	for (let at: string | undefined = id; at && !out.includes(at) && out.length < 20; at = parents.get(at)) out.push(at);
	return out;
};

/** Categories with every one under them. */
const withChildren = (parents: Map<string, string>, ids: string[]) => {
	const children = new Map<string, string[]>();
	for (const [c, p] of parents) children.set(p, [...(children.get(p) || []), c]);
	const out = new Set(ids);
	const queue = [...ids];
	while (queue.length && out.size < 5000) for (const k of children.get(queue.shift()!) || []) if (!out.has(k)) out.add(k), queue.push(k);
	return [...out];
};

type Ready = { _id: any; name: string; percent: number; products: Set<string>; categories: Set<string>; collections: Set<string>; sub: boolean };

const ready = (d: any): Ready => ({
	_id: d._id,
	name: d.name || 'Discount',
	percent: Math.min(100, Number(d.percent) || 0),
	products: new Set(idsOf(d.products)),
	categories: new Set(idsOf(d.categories)),
	collections: new Set(idsOf(d.collections)),
	sub: d.subCategories !== false,
});

/**
 * The discounts in force now, as the rule reads them. `override`: a discount as it would be saved (the form's
 * preview) in place of the stored one; `without`: one left out (being deleted).
 */
const liveDiscounts = async (store: Store, { override, without }: { override?: any; without?: any } = {}) => {
	const tz = await zoneOf(store);
	const now = Date.now();
	const rows: any[] = await store.M('discount').find({ status: { $ne: 'inactive' } }).lean();
	const list = rows.filter(d => String(d._id) !== String(override?._id ?? '') && String(d._id) !== String(without ?? ''));
	if (override) list.push(override);
	return list.filter(d => isLive(d, tz, now)).map(ready);
};

/** The discount that wins for one product, or null: the biggest percentage; two the same — the older one. */
const winnerFor = (p: any, list: Ready[], parents: Map<string, string>) => {
	const id = String(p._id);
	const own = p.category ? String(p.category?._id ?? p.category) : '';
	const above = own ? upFrom(parents, own).slice(1) : [];
	const colls = idsOf(p.collections);
	let best: Ready | null = null;
	for (const d of list) {
		const hit = d.products.has(id) || (!!own && d.categories.has(own)) || (d.sub && above.some(c => d.categories.has(c))) || colls.some(c => d.collections.has(c));
		if (hit && (!best || d.percent > best.percent || (d.percent === best.percent && String(d._id) < String(best._id)))) best = d;
	}
	return best;
};

/** The products a discount reaches as it is (named, in its categories — and under them —, in its collections). */
export const reachOf = async (store: Store, d: any): Promise<string[]> => {
	const or: any[] = [];
	const products = idsOf(d?.products);
	let categories = idsOf(d?.categories);
	const collections = idsOf(d?.collections);
	if (categories.length && d?.subCategories !== false) categories = withChildren(await parentsOf(store), categories);
	if (products.length) or.push({ _id: { $in: products } });
	if (categories.length) or.push({ category: { $in: categories } });
	if (collections.length) or.push({ collections: { $in: collections } });
	if (!or.length) return [];
	return (await store.M('product').find({ $or: or }, { _id: 1 }).lean()).map((p: any) => String(p._id));
};

const formulasFor = async (store: Store, key: 'product' | 'variant') => {
	const def: any = store.installed[key] && (await ModelDefinition.findOne({ route: store.installed[key].route }).lean());
	return def ? formulasOfPage(def) : [];
};

export type Outcome = { seen: number; changed: number; given: number; back: number; byDiscount: Record<string, { name: string; percent: number; n: number }> };

/**
 * Works out these products' discount by the rule and writes what changed: Discount and Discount % on each product,
 * Discount % on its variants, their formulas (Sale price, Price after tax) worked out again — a bare write runs none —
 * and a History entry “Store: discounts”. Each discount's Products reached is counted again. `dry`: nothing written,
 * just what would change.
 */
export const applyDiscounts = async (store: Store, productIds: any[], { dry = false, override, without }: { dry?: boolean; override?: any; without?: any } = {}): Promise<Outcome> => {
	const out: Outcome = { seen: 0, changed: 0, given: 0, back: 0, byDiscount: {} };
	if (!store.installed.discount || !store.installed.product) return out;
	const Product = store.M('product');
	const Variant = store.installed.variant ? store.M('variant') : null;
	const list = await liveDiscounts(store, { override, without });
	const parents = await parentsOf(store);
	const names = new Map<string, string>((await store.M('discount').find({}, { name: 1 }).lean()).map((d: any) => [String(d._id), d.name]));
	if (override?._id) names.set(String(override._id), override.name);
	const touched = new Set<string>();
	const ids = idsOf(productIds);
	const [pf, vf] = dry ? [[], []] : await Promise.all([formulasFor(store, 'product'), formulasFor(store, 'variant')]);

	for (let i = 0; i < ids.length; i += BATCH) {
		const docs: any[] = await Product.find({ _id: { $in: ids.slice(i, i + BATCH) } }, { name: 1, category: 1, collections: 1, discount: 1, discountPercent: 1, salePrice: 1, priceAfterTax: 1 }).lean();
		const changed: { p: any; win: Ready | null }[] = [];
		for (const p of docs) {
			out.seen++;
			const win = winnerFor(p, list, parents);
			if (win) {
				const k = String(win._id);
				out.byDiscount[k] = { name: win.name, percent: win.percent, n: (out.byDiscount[k]?.n || 0) + 1 };
			}
			const had = p.discount ? String(p.discount?._id ?? p.discount) : '';
			if (had === String(win?._id ?? '') && (Number(p.discountPercent) || 0) === (win?.percent || 0)) continue;
			changed.push({ p, win });
			out.changed++;
			if (win) out.given++;
			else out.back++;
			if (had) touched.add(had);
			if (win) touched.add(String(win._id));
		}
		if (dry || !changed.length) continue;
		for (const { p, win } of changed) {
			await Product.updateOne({ _id: p._id }, win ? { $set: { discount: win._id, discountPercent: win.percent } } : { $set: { discountPercent: 0 }, $unset: { discount: 1 } });
			if (Variant) await Variant.updateMany({ product: p._id }, { $set: { discountPercent: win?.percent || 0 } });
		}
		const changedIds = changed.map(c => c.p._id);
		// On sale and the price shoppers pay are search filters (docs/search SI4).
		touchLater(changedIds, 'discount');
		if (pf.length) await recalculateFormulas(Product, { _id: { $in: changedIds } }, pf);
		if (Variant && vf.length) await recalculateFormulas(Variant, { product: { $in: changedIds } }, vf);
		const after = new Map<string, any>((await Product.find({ _id: { $in: changedIds } }).lean()).map((d: any) => [String(d._id), d]));
		const named = (v: any) => (v ? { _id: v, name: names.get(String(v?._id ?? v)) || '' } : null);
		for (const { p } of changed) {
			const doc = after.get(String(p._id));
			if (!doc) continue;
			const changes = diffFields({
				before: { discount: named(p.discount), discountPercent: Number(p.discountPercent) || 0, salePrice: p.salePrice, priceAfterTax: p.priceAfterTax },
				after: { discount: named(doc.discount), discountPercent: Number(doc.discountPercent) || 0, salePrice: doc.salePrice, priceAfterTax: doc.priceAfterTax },
				fields: ['discount', 'discountPercent', 'salePrice', 'priceAfterTax'],
				settings: { discount: { title: 'Discount' }, discountPercent: { title: 'Discount %' }, salePrice: { title: 'Sale price' }, priceAfterTax: { title: 'Price after tax' } },
			});
			recordHistory({ req: { user: { name: ACTOR } }, action: 'update', model: Product.modelName, doc, changes, modelPath: store.installed.product.route });
		}
	}
	if (!dry) for (const id of touched) await store.M('discount').updateOne({ _id: id }, { $set: { reached: await Product.countDocuments({ discount: id }) } });
	return out;
};

/** The products a saved or deleted record touches: a discount's reach now and the ones carrying it; a product; a category's products (and those under it). */
export const productsTouched = async (store: Store, def: { route: string; name?: string }, doc: any, event: string): Promise<string[]> => {
	if (!store.installed.product || !doc?._id) return [];
	const Product = store.M('product');
	if (store.is('discount', def.route)) {
		const carrying = (await Product.find({ discount: doc._id }, { _id: 1 }).lean()).map((p: any) => String(p._id));
		return [...new Set([...carrying, ...(event === 'delete' ? [] : await reachOf(store, doc))])];
	}
	if (store.is('product', def.route)) return event === 'delete' ? [] : [String(doc._id)];
	if (store.is('category', def.route)) {
		const cats = withChildren(await parentsOf(store), [String(doc._id)]);
		return (await Product.find({ category: { $in: cats } }, { _id: 1 }).lean()).map((p: any) => String(p._id));
	}
	if (store.is('collection', def.route)) return (await Product.find({ collections: doc._id }, { _id: 1 }).lean()).map((p: any) => String(p._id));
	return [];
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The run's words: “Worked out 48 products: 45 now at 10% off (Eid sale), 3 back to their price.” */
export const outcomeText = (o: Outcome, dry = false) => {
	if (!o.seen) return 'No products to work out';
	const at = Object.values(o.byDiscount)
		.sort((a, b) => b.n - a.n)
		.slice(0, 3)
		.map(d => `${d.n} at ${d.percent}% off (${d.name})`);
	const tail = [at.join(', '), o.back && `${o.back} back to their price`].filter(Boolean).join('; ');
	return `${dry ? 'Would work out' : 'Worked out'} ${plural(o.seen, 'product')}, ${o.changed ? `${o.changed} ${dry ? 'would change' : 'changed'}` : 'none changed'}${tail ? ` — ${tail}` : ''}`;
};

/**
 * The store action “Work out discounts” (automations D1–D4, D6): the products the record touches, worked out.
 * Run inside the project's scope; a deleted discount is left out of the rule (it is gone already, but be sure).
 */
export const workOutDiscounts = async ({ def, doc, event, dry = false }: { def: any; doc: any; event: string; dry?: boolean }) => {
	const store = await storeOf();
	if (!store.installed.discount) return 'This store has no discounts';
	const ids = await productsTouched(store, def, doc, event);
	const o = await applyDiscounts(store, ids, { dry, ...(event === 'delete' && store.is('discount', def.route) && { without: doc._id }) });
	return outcomeText(o, dry);
};

/** A product's new variants carry its Discount % (they are made after it got it). Returns how many changed. */
export const variantsFollow = async (store: Store, productId: any) => {
	if (!store.installed.variant || !store.installed.discount || !isId(productId)) return 0;
	const p: any = await store.M('product').findById(productId, { discountPercent: 1 }).lean();
	if (!p) return 0;
	const pct = Number(p.discountPercent) || 0;
	const Variant = store.M('variant');
	const off: any[] = await Variant.find({ product: p._id, discountPercent: { $ne: pct } }, { _id: 1 }).lean();
	if (!off.length) return 0;
	await Variant.updateMany({ _id: { $in: off.map(v => v._id) } }, { $set: { discountPercent: pct } });
	const vf = await formulasFor(store, 'variant');
	if (vf.length) await recalculateFormulas(Variant, { _id: { $in: off.map(v => v._id) } }, vf);
	return off.length;
};

/**
 * Why a discount can't be saved like this (DS2, DS8), or null. `before`: the stored one (an edit), `body`: what's sent.
 * The same check for the panel's forms and inline edits (commerceGuard) and the MCP (commerceWriter).
 */
export const discountProblem = async (store: Store, before: any, body: any) => {
	const d = { ...(before || {}), ...(body || {}) };
	const pct = Number(d.percent);
	if (!(pct > 0 && pct <= 100)) return 'The percentage off is more than 0 and at most 100';
	if (d.startsAt && d.endsAt && (dayOf(d.endsAt) ?? 0) < (dayOf(d.startsAt) ?? 0)) return 'It ends before it starts — move one of the dates';
	if (!idsOf(d.products).length && !idsOf(d.categories).length && !idsOf(d.collections).length) return 'Pick what it applies to — products, categories or collections';
	const on = (d.status ?? 'active') !== 'inactive';
	const switchedOn = !before || before.status === 'inactive';
	const endMoved = body?.endsAt !== undefined && dayOf(body.endsAt) !== dayOf(before?.endsAt);
	if (on && (switchedOn || endMoved) && hasEnded(d, await zoneOf(store)))
		return `${d.name || 'This discount'} ${switchedOn ? 'ended' : 'would end'} on ${dayText(d.endsAt)} — move the end date to switch it on.`;
	return null;
};

/** What saving a discount would do (the form's note, DS11): how many products it would reach, and how many keep a bigger one. */
export const previewDiscount = async (store: Store, before: any, body: any) => {
	const d = { ...(before || {}), ...(body || {}), _id: before?._id || '000000000000000000000000' };
	const problem = await discountProblem(store, before, body);
	const reach = await reachOf(store, d);
	const carrying = before?._id ? (await store.M('product').find({ discount: before._id }, { _id: 1 }).lean()).map((p: any) => String(p._id)) : [];
	const o = await applyDiscounts(store, [...new Set([...reach, ...carrying])], { dry: true, override: d });
	const tz = await zoneOf(store);
	const live = isLive(d, tz, Date.now());
	const mine = o.byDiscount[String(d._id)]?.n || 0;
	return {
		problem,
		reach: reach.length,
		gets: live ? mine : 0,
		keepBigger: live ? Math.max(0, reach.length - mine) : 0,
		back: o.back,
		live,
		startsLater: d.status !== 'inactive' && !!d.startsAt && !live,
		text: problem
			? problem
			: !reach.length
			? 'Nothing picked reaches a product yet.'
			: d.status === 'inactive'
			? `Saved switched off: none of its ${plural(reach.length, 'product')} get it${carrying.length ? ` — ${plural(carrying.length, 'product')} go back to their price or a smaller discount` : ''}.`
			: !live
			? `It reaches ${plural(reach.length, 'product')} from ${dayText(d.startsAt)}.`
			: !mine
			? `None of its ${plural(reach.length, 'product')} would get ${Number(d.percent)}% off — ${reach.length === 1 ? 'it keeps' : 'they keep'} a bigger discount.`
			: `Saving gives ${Number(d.percent)}% off to ${plural(mine, 'product')}${reach.length - mine ? ` — ${plural(reach.length - mine, 'other')} ${reach.length - mine === 1 ? 'keeps' : 'keep'} a bigger discount` : ''}.`,
	};
};
