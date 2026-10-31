import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import Organization from '../../models/tenancy/organization.model.js';
import { countryByCode, listCountries, providersFor } from '../countries.function.js';
import { PROVIDERS } from '../payments.function.js';
import { runInScope } from '../tenantScope.function.js';
import { TenancyError } from '../tenancy.function.js';
import { COURIERS } from './couriers/index.js';

/**
 * The store's settings (docs/ecommerce EC2): the setup wizard's answers, what
 * the organization's country offers, and checking a change. One
 * `CommerceSettings` per e-commerce project; every section can be saved on its
 * own (the wizard saves a step at a time, Store settings a card at a time).
 */

/* ------------------------------------------------------------------ types */

export type Outlet = { name: string; code: string; kind: 'store' | 'warehouse'; address?: string; phone?: string };
export type TaxRate = { name: string; rate: number; default?: boolean };
export type ShippingRate = { name: string; amount: number };

export type Answers = {
	/** guestCheckout: the store's website takes orders without an account (EC-16a); off, buyers sign in first. */
	store: { currency: string; orderPrefix: string; negativeStock: boolean; guestCheckout: boolean };
	/** Made as Outlet records when the store is set up; after that they're kept on the Outlets page. */
	outlets: Outlet[];
	products: { variations: boolean; options: string[]; brands: boolean; barcodes: boolean; trackStock: boolean };
	payments: { tenders: string[]; custom: string[]; gateways: string[] };
	returns: { allowed: boolean; windowDays: number; partial: boolean; restockDefault: boolean; refundMethods: string[]; storeCredit: boolean };
	delivery: { enabled: boolean; rates: ShippingRate[]; couriers: string[] };
	pos: {
		receipt: { size: '80mm' | 'a4'; header: string; footer: string };
		shifts: boolean;
		held: boolean;
		discounts: boolean;
		coupons: boolean;
		tax: { mode: 'none' | 'inclusive' | 'added'; rates: TaxRate[] };
		customerRequired: boolean;
	};
};

export const SECTIONS = ['store', 'outlets', 'products', 'payments', 'returns', 'delivery', 'pos'] as const;
export type Section = (typeof SECTIONS)[number];
/** The wizard's steps, in order (README §5): the sections, then the review. */
export const STEPS = [...SECTIONS, 'review'] as const;

/* --------------------------------------------------------------- offered */

/** In-store ways to pay. Mobile wallets are paid by the buyer's app and typed in by reference. */
const TENDERS: Record<string, { label: string; countries?: string[] }> = {
	cash: { label: 'Cash' },
	card: { label: 'Card (on a terminal)' },
	bank: { label: 'Bank transfer' },
	'wallet:bkash': { label: 'bKash (by reference)', countries: ['BD'] },
	'wallet:nagad': { label: 'Nagad (by reference)', countries: ['BD'] },
	'wallet:rocket': { label: 'Rocket (by reference)', countries: ['BD'] },
	wallet: { label: 'Mobile wallet (by reference)' },
};

/** Couriers an order can be sent to, by country — from the courier registry (docs/couriers CR5). */
export { COURIERS };

export const REFUND_METHODS: Record<string, string> = {
	original: 'The way they paid (online payments are refunded through the gateway)',
	cash: 'Cash',
	'store-credit': 'Store credit',
	other: 'Another way (bank, wallet — noted by hand)',
};

const orgCountry = async (organization: any) => {
	await listCountries();
	const org: any = await Organization.findById(organization, { country: 1 }).lean();
	return countryByCode(org?.country);
};

/** What the project's organization may choose from: tenders, gateways and couriers by its country, and its currency. */
export const offeredFor = async (project: any) => {
	const country = await orgCountry(project.organization);
	const code = country?.code || '';
	const local = (countries?: string[]) => !countries || countries.includes(code);
	// A generic wallet only where the country's own ones aren't listed.
	const hasOwnWallets = Object.entries(TENDERS).some(([id, t]) => id.startsWith('wallet:') && t.countries?.includes(code));
	return {
		country: country ? { code: country.code, name: country.name, flag: country.flag } : null,
		currency: country?.currency?.code || 'USD',
		tenders: Object.entries(TENDERS)
			.filter(([id, t]) => local(t.countries) && !(id === 'wallet' && hasOwnWallets))
			.map(([id, t]) => ({ id, label: t.label })),
		gateways: providersFor(code).map(id => ({ id, name: PROVIDERS[id]?.name || id })),
		couriers: Object.entries(COURIERS)
			.filter(([, c]) => c.countries.includes(code))
			.map(([id, c]) => ({ id, name: c.name, ready: c.ready })),
		refundMethods: Object.entries(REFUND_METHODS).map(([id, label]) => ({ id, label })),
	};
};

export type Offered = Awaited<ReturnType<typeof offeredFor>>;

/* -------------------------------------------------------------- defaults */

export const defaultAnswers = (offered: Offered): Answers => ({
	store: { currency: offered.currency, orderPrefix: 'ORD', negativeStock: false, guestCheckout: true },
	outlets: [{ name: 'Main store', code: 'MAIN', kind: 'store' }],
	products: { variations: true, options: ['Size', 'Colour'], brands: false, barcodes: true, trackStock: true },
	payments: { tenders: offered.tenders.filter(t => t.id === 'cash' || t.id === 'card').map(t => t.id), custom: [], gateways: [] },
	returns: { allowed: true, windowDays: 30, partial: true, restockDefault: true, refundMethods: ['original', 'cash', 'store-credit'], storeCredit: true },
	delivery: { enabled: false, rates: [], couriers: [] },
	pos: {
		receipt: { size: '80mm', header: '', footer: 'Thank you for shopping with us' },
		shifts: true,
		held: true,
		discounts: true,
		coupons: true,
		tax: { mode: 'none', rates: [] },
		customerRequired: false,
	},
});

/* ------------------------------------------------------------- checking */

const text = (v: any, max = 120) => String(v ?? '').trim().slice(0, max);
const bool = (v: any, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const num = (v: any) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const uniq = <T>(xs: T[]) => [...new Set(xs)];

/**
 * One section of the answers, checked: each problem is a plain sentence the
 * wizard shows. Unknown keys are dropped; missing ones keep `current`'s.
 */
export const checkSection = (section: Section, input: any, current: Answers, offered: Offered): { value: any; problems: string[] } => {
	const problems: string[] = [];
	const cur: any = current[section];
	const v = input && typeof input === 'object' ? input : {};

	switch (section) {
		case 'store': {
			const currency = text(v.currency ?? cur.currency, 10).toUpperCase();
			if (!/^[A-Z]{3}$/.test(currency)) problems.push('Choose the currency the store sells in (a three-letter code like BDT or USD)');
			const orderPrefix = text(v.orderPrefix ?? cur.orderPrefix, 8).toUpperCase();
			if (orderPrefix && !/^[A-Z0-9-]+$/.test(orderPrefix)) problems.push('The order number prefix takes letters, numbers and dashes only');
			return { value: { currency, orderPrefix, negativeStock: bool(v.negativeStock, cur.negativeStock), guestCheckout: bool(v.guestCheckout, cur.guestCheckout ?? true) }, problems };
		}
		case 'outlets': {
			const list: any[] = Array.isArray(input) ? input : Array.isArray(v.outlets) ? v.outlets : cur;
			const outlets: Outlet[] = list.slice(0, 50).map((o: any) => ({
				name: text(o?.name, 80),
				code: text(o?.code, 12).toUpperCase(),
				kind: o?.kind === 'warehouse' ? 'warehouse' : 'store',
				...(text(o?.address, 300) && { address: text(o.address, 300) }),
				...(text(o?.phone, 40) && { phone: text(o.phone, 40) }),
			}));
			if (!outlets.length) problems.push('Add at least one outlet — the shop, stall or warehouse stock is kept in');
			outlets.forEach((o, i) => {
				if (!o.name) problems.push(`Outlet ${i + 1}: give it a name`);
				if (!/^[A-Z0-9-]{1,12}$/.test(o.code)) problems.push(`${o.name || `Outlet ${i + 1}`}: give it a short code of letters and numbers (MAIN, DHK-1)`);
			});
			const codes = outlets.map(o => o.code).filter(Boolean);
			if (uniq(codes).length !== codes.length) problems.push('Two outlets have the same code — each needs its own');
			if (outlets.length && !outlets.some(o => o.kind === 'store')) problems.push('At least one outlet must be a store — the POS sells from stores');
			return { value: outlets, problems };
		}
		case 'products': {
			const variations = bool(v.variations, cur.variations);
			const options = uniq((Array.isArray(v.options) ? v.options : cur.options).map((o: any) => text(o, 30)).filter(Boolean)).slice(0, 3) as string[];
			if (variations && !options.length) problems.push('Name at least one option products vary by (Size, Colour…), or turn variations off');
			return {
				value: { variations, options: variations ? options : [], brands: bool(v.brands, cur.brands), barcodes: bool(v.barcodes, cur.barcodes), trackStock: bool(v.trackStock, cur.trackStock) },
				problems,
			};
		}
		case 'payments': {
			const allowed = new Set(offered.tenders.map(t => t.id));
			const tenders = uniq((Array.isArray(v.tenders) ? v.tenders : cur.tenders).map((t: any) => text(t, 30)).filter((t: string) => allowed.has(t))) as string[];
			const custom = uniq((Array.isArray(v.custom) ? v.custom : cur.custom).map((t: any) => text(t, 40)).filter(Boolean)).slice(0, 10) as string[];
			const gatewaysOk = new Set(offered.gateways.map(g => g.id));
			const gateways = uniq((Array.isArray(v.gateways) ? v.gateways : cur.gateways).map((g: any) => text(g, 30)).filter((g: string) => gatewaysOk.has(g))) as string[];
			if (!tenders.length && !custom.length) problems.push('Choose at least one way customers pay in the store');
			return { value: { tenders, custom, gateways }, problems };
		}
		case 'returns': {
			const allowed = bool(v.allowed, cur.allowed);
			const windowDays = num(v.windowDays ?? cur.windowDays);
			if (allowed && !(Number.isInteger(windowDays) && windowDays >= 0 && windowDays <= 3650)) problems.push('Say how many days after a sale items can be returned (0 for no limit)');
			const storeCredit = bool(v.storeCredit, cur.storeCredit);
			const refundMethods = uniq((Array.isArray(v.refundMethods) ? v.refundMethods : cur.refundMethods).map((m: any) => text(m, 30)))
				.filter((m: any) => REFUND_METHODS[m])
				.filter((m: any) => m !== 'store-credit' || storeCredit) as string[];
			if (allowed && !refundMethods.length) problems.push('Choose at least one way to refund a return');
			return {
				value: { allowed, windowDays: Number.isFinite(windowDays) ? windowDays : 0, partial: bool(v.partial, cur.partial), restockDefault: bool(v.restockDefault, cur.restockDefault), refundMethods, storeCredit },
				problems,
			};
		}
		case 'delivery': {
			const enabled = bool(v.enabled, cur.enabled);
			const rates: ShippingRate[] = (Array.isArray(v.rates) ? v.rates : cur.rates).slice(0, 20).map((r: any) => ({ name: text(r?.name, 60), amount: num(r?.amount) }));
			rates.forEach((r, i) => {
				if (!r.name) problems.push(`Shipping rate ${i + 1}: give it a name (Inside Dhaka, Outside Dhaka…)`);
				if (!(r.amount >= 0)) problems.push(`${r.name || `Shipping rate ${i + 1}`}: give it an amount (0 for free)`);
			});
			const known = new Set(offered.couriers.map(c => c.id));
			const couriers = uniq((Array.isArray(v.couriers) ? v.couriers : cur.couriers).map((c: any) => text(c, 30)).filter((c: string) => known.has(c))) as string[];
			return { value: { enabled, rates: enabled ? rates : [], couriers: enabled ? couriers : [] }, problems };
		}
		case 'pos': {
			const r = v.receipt || {};
			const receipt = {
				size: (r.size ?? cur.receipt.size) === 'a4' ? 'a4' : '80mm',
				header: text(r.header ?? cur.receipt.header, 300),
				footer: text(r.footer ?? cur.receipt.footer, 300),
			};
			const t = v.tax || {};
			const mode = ['none', 'inclusive', 'added'].includes(t.mode) ? t.mode : cur.tax.mode;
			const rates: TaxRate[] = (Array.isArray(t.rates) ? t.rates : cur.tax.rates).slice(0, 20).map((x: any) => ({ name: text(x?.name, 60), rate: num(x?.rate), default: !!x?.default }));
			if (mode !== 'none') {
				if (!rates.length) problems.push('Add the tax rate you charge (VAT 15%…), or choose no tax');
				rates.forEach((x, i) => {
					if (!x.name) problems.push(`Tax rate ${i + 1}: give it a name`);
					if (!(x.rate >= 0 && x.rate <= 100)) problems.push(`${x.name || `Tax rate ${i + 1}`}: the rate is a percentage from 0 to 100`);
				});
				if (rates.length && !rates.some(x => x.default)) rates[0].default = true;
				if (rates.filter(x => x.default).length > 1) problems.push('Only one tax rate can be the default');
			}
			return {
				value: {
					receipt,
					shifts: bool(v.shifts, cur.shifts),
					held: bool(v.held, cur.held),
					discounts: bool(v.discounts, cur.discounts),
					coupons: bool(v.coupons, cur.coupons),
					tax: { mode, rates: mode === 'none' ? [] : rates },
					customerRequired: bool(v.customerRequired, cur.customerRequired),
				},
				problems,
			};
		}
	}
};

/** The whole answers checked (before setting up): every section's problems, by section. */
export const checkAll = (answers: Answers, offered: Offered) => {
	const out: Partial<Record<Section, string[]>> = {};
	for (const s of SECTIONS) {
		const { problems } = checkSection(s, answers[s], answers, offered);
		if (problems.length) out[s] = problems;
	}
	return out;
};

/* ---------------------------------------------------------- read / write */

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });

/** The project's settings doc, made with defaults the first time. */
export const loadCommerce = (project: any): Promise<any> =>
	runInScope(scopeOf(project), async () => {
		const found: any = await CommerceSettings.findOne({}).lean();
		if (found) return found;
		const offered = await offeredFor(project);
		try {
			return (await CommerceSettings.create({ answers: defaultAnswers(offered) })).toObject();
		} catch {
			// Two first reads at once: the other one made it.
			return CommerceSettings.findOne({}).lean();
		}
	});

/** Fills sections a stored doc lacks (a section added after it was saved) from the defaults. */
const withDefaults = (answers: any, offered: Offered): Answers => {
	const d: any = defaultAnswers(offered);
	const out: any = {};
	for (const s of SECTIONS) out[s] = answers?.[s] === undefined ? d[s] : s === 'outlets' ? answers[s] : { ...d[s], ...answers[s] };
	out.pos.receipt = { ...d.pos.receipt, ...(answers?.pos?.receipt || {}) };
	out.pos.tax = { ...d.pos.tax, ...(answers?.pos?.tax || {}) };
	return out;
};

/** What the panel reads: the answers, the status, what's offered, and what each step still needs. */
export const commerceView = async (project: any) => {
	const [doc, offered] = await Promise.all([loadCommerce(project), offeredFor(project)]);
	const answers = withDefaults(doc.answers, offered);
	return {
		status: doc.status,
		step: doc.step,
		answers,
		features: doc.features || [],
		installed: doc.installed || {},
		error: doc.error || '',
		problems: doc.problems || [],
		startedAt: doc.startedAt || null,
		finishedAt: doc.finishedAt || null,
		offered,
		needs: checkAll(answers, offered),
	};
};

/**
 * Saves the sections in `body.answers` (each checked; any problem refuses the
 * whole save with 400 and `problems` by section) and the wizard's `step`.
 * `guard` (EC-03) may refuse a change the built store can't take.
 */
export const saveCommerce = async (
	project: any,
	body: any,
	guard?: (next: Answers, prev: Answers, doc: any) => Promise<void> | void
) => {
	const [doc, offered] = await Promise.all([loadCommerce(project), offeredFor(project)]);
	const prev = withDefaults(doc.answers, offered);
	const next: any = { ...prev };
	const problems: Partial<Record<Section, string[]>> = {};
	const given = body?.answers && typeof body.answers === 'object' ? body.answers : {};
	for (const s of SECTIONS) {
		if (given[s] === undefined) continue;
		// Store settings' outlets live on the Outlets page once the store is built.
		if (s === 'outlets' && doc.status === 'ready') continue;
		const r = checkSection(s, given[s], next, offered);
		next[s] = r.value;
		if (r.problems.length) problems[s] = r.problems;
	}
	if (Object.keys(problems).length) {
		const e: any = new TenancyError(400, Object.values(problems)[0]![0], 'commerce_settings');
		e.extra = { problems };
		throw e;
	}
	if (guard) await guard(next, prev, doc);
	const set: any = { answers: next };
	if (typeof body?.step === 'string' && (STEPS as readonly string[]).includes(body.step)) set.step = body.step;
	await runInScope(scopeOf(project), () => CommerceSettings.updateOne({ _id: doc._id }, { $set: set }));
	return commerceView(project);
};
