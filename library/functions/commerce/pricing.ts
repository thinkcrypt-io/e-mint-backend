import { TenancyError } from '../tenancy.function.js';
import { Store, roundFor } from './store.js';
import { isId, itemView, stockAt } from './catalogue.js';

/**
 * What a basket costs (docs/ecommerce EC6): the one calculation the POS's
 * running total, a sale, a manual order and a return's refund all use. The
 * browser sends variants, quantities and *requests* — a discount, a coupon
 * code; prices, discounts, tax and totals are worked out here.
 *
 * Order of work, per line, rounded to the currency as it goes:
 *   gross = price × quantity
 *   − its own discount (amount or %)
 *   − its share of the coupon (eligible lines only), then of the order discount
 *   = net; tax on net: inside it (inclusive) or added to it.
 */

export type Discount = { type: 'percent' | 'amount'; value: number } | null | undefined;
export type QuoteInput = {
	outlet?: any;
	customer?: any;
	lines: { variant: any; quantity: any; discount?: Discount }[];
	orderDiscount?: Discount;
	couponCode?: string;
	shipping?: any;
};

export type QuoteLine = {
	variant: string;
	product: string;
	name: string;
	sku: string;
	quantity: number;
	unitPrice: number;
	gross: number;
	lineDiscount: number;
	couponDiscount: number;
	orderDiscount: number;
	discount: number;
	net: number;
	taxRate: number;
	tax: number;
	total: number;
	trackStock: boolean;
	available: number | null;
	category: string | null;
};

export type Quote = {
	lines: QuoteLine[];
	subtotal: number;
	lineDiscounts: number;
	couponDiscount: number;
	orderDiscount: number;
	discount: number;
	tax: number;
	taxMode: 'none' | 'inclusive' | 'added';
	shipping: number;
	total: number;
	coupon: { _id: string; code: string; type: string; value: number } | null;
	currency: string;
	/** Things that stop a sale (an unknown coupon, a line out of stock…). */
	problems: string[];
	warnings: string[];
};

const discountOf = (d: Discount, base: number) => {
	if (!d || !(Number(d.value) > 0)) return 0;
	const v = Number(d.value);
	return Math.min(base, d.type === 'percent' ? (base * Math.min(v, 100)) / 100 : v);
};

/** Shares `amount` over `bases` in proportion, each rounded, the last taking what rounding left. */
const share = (amount: number, bases: number[], round: (n: number) => number) => {
	const total = bases.reduce((a, b) => a + b, 0);
	if (!amount || !total) return bases.map(() => 0);
	let left = round(amount);
	return bases.map((b, i) => {
		if (i === bases.length - 1) return left;
		const part = round((amount * b) / total);
		left = round(left - part);
		return part;
	});
};

export const quote = async (store: Store, input: QuoteInput, opts: { forSale?: boolean } = {}): Promise<Quote> => {
	const a = store.answers;
	const round = roundFor(a.store.currency);
	const problems: string[] = [];
	const warnings: string[] = [];
	const raw = (Array.isArray(input?.lines) ? input.lines : []).filter(l => l && isId(l.variant));
	if (!raw.length) throw new TenancyError(400, 'Add an item first');
	if (raw.length > 200) throw new TenancyError(400, 'At most 200 lines in one order');

	const discountsOn = store.features.includes('discounts');
	if (!discountsOn && (raw.some(l => l.discount && Number(l.discount.value) > 0) || (input.orderDiscount && Number(input.orderDiscount.value) > 0)))
		throw new TenancyError(400, 'Discounts are switched off for this store');

	const Variant = store.M('variant');
	const Product = store.M('product');
	const variants: any[] = await Variant.find({ _id: { $in: raw.map(l => l.variant) } }).lean();
	const products: any[] = await Product.find({ _id: { $in: variants.map(v => v.product) } }).lean();
	const vById = new Map(variants.map(v => [String(v._id), v]));
	const pById = new Map(products.map(p => [String(p._id), p]));
	const stock = isId(input.outlet) ? await stockAt(store, input.outlet, variants.map(v => v._id)) : new Map<string, number>();

	// Tax rates: a product's own, else the default.
	const taxMode = a.pos.tax.mode;
	const rates: any[] = taxMode === 'none' ? [] : await store.M('taxRate').find({}).lean();
	const rateOf = (p: any) => {
		if (taxMode === 'none') return 0;
		const own = p?.taxRate && rates.find(r => String(r._id) === String(p.taxRate));
		return Number((own || rates.find(r => r.isDefault) || { rate: 0 }).rate) || 0;
	};

	// Same variant twice adds up (a scanner adds lines one at a time).
	const merged = new Map<string, { variant: string; quantity: number; discount?: Discount }>();
	for (const l of raw) {
		const q = Number(l.quantity);
		if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) throw new TenancyError(400, 'Quantities are whole numbers above 0');
		const k = String(l.variant);
		const had = merged.get(k);
		merged.set(k, had ? { ...had, quantity: had.quantity + q } : { variant: k, quantity: q, discount: l.discount });
	}

	const lines: QuoteLine[] = [];
	for (const l of merged.values()) {
		const v = vById.get(l.variant);
		const p = v && pById.get(String(v.product));
		if (!v || !p) {
			problems.push('An item in the basket no longer exists');
			continue;
		}
		const view = itemView(p, v, stock.has(l.variant) ? stock.get(l.variant)! : isId(input.outlet) ? 0 : null);
		if (!view.active || p.status === 'archived' || p.status === 'draft') problems.push(`${view.name} isn’t for sale`);
		const gross = round(view.price * l.quantity);
		const lineDiscount = round(discountOf(l.discount, gross));
		if (view.trackStock && view.onHand !== null && view.onHand < l.quantity && !a.store.negativeStock)
			(opts.forSale ? problems : warnings).push(view.onHand > 0 ? `Only ${view.onHand} of ${view.name} left here` : `${view.name} is out of stock here`);
		lines.push({
			variant: view.variant,
			product: view.product,
			name: view.name,
			sku: view.sku,
			quantity: l.quantity,
			unitPrice: view.price,
			gross,
			lineDiscount,
			couponDiscount: 0,
			orderDiscount: 0,
			discount: 0,
			net: 0,
			taxRate: rateOf(p),
			tax: 0,
			total: 0,
			trackStock: view.trackStock,
			available: view.onHand,
			category: view.category,
		});
	}

	// The coupon, on the lines it covers.
	let coupon: Quote['coupon'] = null;
	const code = String(input.couponCode || '').trim();
	if (code) {
		if (!store.features.includes('coupons')) problems.push('Coupons are switched off for this store');
		else {
			const rx = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
			const c: any = await store.M('coupon').findOne({ couponCode: rx }).lean();
			const now = new Date();
			const afterLines = lines.reduce((s, l) => s + l.gross - l.lineDiscount, 0);
			const why = !c
				? `There’s no coupon ${code}`
				: c.active === false
				? `The coupon ${c.couponCode} is switched off`
				: c.startsAt && new Date(c.startsAt) > now
				? `The coupon ${c.couponCode} starts on ${new Date(c.startsAt).toDateString()}`
				: c.endsAt && new Date(c.endsAt).setHours(23, 59, 59, 999) < now.getTime()
				? `The coupon ${c.couponCode} has ended`
				: c.usageLimit && Number(c.used || 0) >= Number(c.usageLimit)
				? `The coupon ${c.couponCode} has been used up`
				: c.minOrder && afterLines < Number(c.minOrder)
				? `The coupon ${c.couponCode} needs an order of ${c.minOrder} or more`
				: null;
			if (why) problems.push(why);
			else {
				const ids = (xs: any[]) => new Set((xs || []).map((x: any) => String(x?._id || x)));
				const cats = ids(c.categories);
				const prods = ids(c.products);
				const eligible = lines.map(l =>
					c.appliesTo === 'categories' ? !!l.category && cats.has(l.category) : c.appliesTo === 'products' ? prods.has(l.product) : true
				);
				const bases = lines.map((l, i) => (eligible[i] ? l.gross - l.lineDiscount : 0));
				const base = bases.reduce((x, y) => x + y, 0);
				if (!base) problems.push(`The coupon ${c.couponCode} doesn’t cover anything in this order`);
				else {
					const amount = round(c.type === 'percent' ? (base * Math.min(Number(c.value) || 0, 100)) / 100 : Math.min(Number(c.value) || 0, base));
					share(amount, bases, round).forEach((x, i) => (lines[i].couponDiscount = x));
					coupon = { _id: String(c._id), code: c.couponCode, type: c.type, value: Number(c.value) || 0 };
				}
			}
		}
	}

	// The order discount, over what's left.
	const leftBases = lines.map(l => l.gross - l.lineDiscount - l.couponDiscount);
	const orderDiscount = round(discountOf(input.orderDiscount, leftBases.reduce((x, y) => x + y, 0)));
	share(orderDiscount, leftBases, round).forEach((x, i) => (lines[i].orderDiscount = x));

	for (const l of lines) {
		l.discount = round(l.lineDiscount + l.couponDiscount + l.orderDiscount);
		l.net = round(l.gross - l.discount);
		l.tax = taxMode === 'inclusive' ? round(l.net - l.net / (1 + l.taxRate / 100)) : taxMode === 'added' ? round((l.net * l.taxRate) / 100) : 0;
		l.total = round(l.net + (taxMode === 'added' ? l.tax : 0));
	}
	const sum = (k: keyof QuoteLine) => round(lines.reduce((s, l) => s + (Number(l[k]) || 0), 0));
	const shipping = round(Math.max(0, Number(input.shipping) || 0));
	return {
		lines,
		subtotal: sum('gross'),
		lineDiscounts: sum('lineDiscount'),
		couponDiscount: sum('couponDiscount'),
		orderDiscount: sum('orderDiscount'),
		discount: sum('discount'),
		tax: sum('tax'),
		taxMode,
		shipping,
		total: round(sum('total') + shipping),
		coupon,
		currency: a.store.currency,
		problems,
		warnings,
	};
};
