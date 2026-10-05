import SiteWidgets from '../models/tenancy/siteWidgets.model.js';
import { runInScope } from './tenantScope.function.js';
import { loadSite } from './siteConfig.function.js';
import { TenancyError } from './tenancy.function.js';
import { loadShop } from './shop.function.js';

/**
 * Site widgets (docs/widgets): what each widget accepts, a project's settings
 * merged over the defaults, and what a site's `mint.js` is told. One list
 * (`WIDGET_TYPES`) drives the panel's form, the checks on save and the public
 * config — a widget added here shows up everywhere.
 */

export type WidgetOption = {
	key: string;
	label: string;
	kind: 'select' | 'boolean' | 'text' | 'number';
	options?: { value: string; label: string }[];
	default: any;
	help: string;
	min?: number;
	max?: number;
};
export type WidgetText = { key: string; label: string; default: string };
export type WidgetType = {
	name: string;
	title: string;
	/** One line on what the visitor sees. */
	summary: string;
	/** A few sentences: what it does, what it needs. */
	description: string;
	/** The user guide's anchor. */
	guide: string;
	options: WidgetOption[];
	texts: WidgetText[];
	/** The HTML that places it on a page (the loader script goes once per page). */
	snippet: string;
};

export const WIDGET_TYPES: Record<string, WidgetType> = {
	login: {
		name: 'login',
		title: 'Login & account',
		summary: 'Sign in and create an account; once signed in, the visitor’s name and a sign-out link.',
		description:
			'Customers sign up and sign in to the project’s customer accounts — the same ones the public API’s signed-in endpoints use. Shown as a card, or as a button that opens one. The page’s own code gets Mint.auth (the customer, their token, sign in / out) to call signed-in endpoints.',
		guide: 'login',
		options: [
			{
				key: 'layout',
				label: 'Layout',
				kind: 'select',
				options: [
					{ value: 'card', label: 'A card on the page' },
					{ value: 'button', label: 'A button that opens the card' },
				],
				default: 'card',
				help: 'A button suits a header; a card suits an account page.',
			},
			{
				key: 'startWith',
				label: 'Opens on',
				kind: 'select',
				options: [
					{ value: 'signin', label: 'Sign in' },
					{ value: 'signup', label: 'Create an account' },
				],
				default: 'signin',
				help: 'Which form shows first.',
			},
			{ key: 'allowSignUp', label: 'Let visitors create accounts', kind: 'boolean', default: true, help: 'Off: only people who already have an account can sign in.' },
		],
		texts: [
			{ key: 'signInTitle', label: 'Sign-in title', default: 'Sign in' },
			{ key: 'signUpTitle', label: 'Sign-up title', default: 'Create your account' },
			{ key: 'signInButton', label: 'Sign-in button', default: 'Sign in' },
			{ key: 'signUpButton', label: 'Sign-up button', default: 'Create account' },
			{ key: 'toSignUp', label: 'Link to sign up', default: 'New here? Create an account' },
			{ key: 'toSignIn', label: 'Link to sign in', default: 'Have an account? Sign in' },
			{ key: 'signedIn', label: 'Signed in ({name} is their name)', default: 'Signed in as {name}' },
			{ key: 'signOut', label: 'Sign-out link', default: 'Sign out' },
			{ key: 'openButton', label: 'Button (button layout)', default: 'Sign in' },
		],
		snippet: '<div data-mint="login"></div>',
	},
	cart: {
		name: 'cart',
		title: 'Cart',
		summary: 'Add-to-cart buttons on any product, a cart button with a count, and a cart drawer with quantities and the subtotal.',
		description:
			'Put data-mint-add="<product id>" on any button and it adds that product; products with variants ask which one. Guests’ carts are kept in their browser and join their account when they sign in, so a cart follows them between devices. Prices, stock and the subtotal always come from your catalogue — never from the page. Needs the Shop set up first (above).',
		guide: 'cart',
		options: [
			{
				key: 'layout',
				label: 'Layout',
				kind: 'select',
				options: [
					{ value: 'button', label: 'A cart button that opens a drawer' },
					{ value: 'page', label: 'The cart itself, on the page' },
				],
				default: 'button',
				help: 'A button suits a header; the cart itself suits a /cart page.',
			},
			{ key: 'checkoutUrl', label: 'Checkout page', kind: 'text', default: '', help: 'Where the Checkout button goes, e.g. /checkout. Empty: no Checkout button yet (the checkout widget is coming).' },
			{ key: 'openOnAdd', label: 'Open the cart when something’s added', kind: 'boolean', default: true, help: 'Off: a short “Added” message instead.' },
		],
		texts: [
			{ key: 'button', label: 'Cart button', default: 'Cart' },
			{ key: 'title', label: 'Cart title', default: 'Your cart' },
			{ key: 'empty', label: 'Empty cart', default: 'Your cart is empty.' },
			{ key: 'subtotal', label: 'Subtotal', default: 'Subtotal' },
			{ key: 'note', label: 'Under the subtotal', default: 'Delivery and any discount are worked out at checkout.' },
			{ key: 'checkout', label: 'Checkout button', default: 'Checkout' },
			{ key: 'remove', label: 'Remove link', default: 'Remove' },
			{ key: 'added', label: 'Added message', default: 'Added to your cart' },
			{ key: 'choose', label: 'Variant picker title', default: 'Choose one' },
			{ key: 'addButton', label: 'Variant picker button', default: 'Add to cart' },
			{ key: 'soldOut', label: 'Sold out', default: 'Sold out' },
			{ key: 'limited', label: 'Fewer in stock ({count} is how many)', default: 'Only {count} left — quantity changed' },
			{ key: 'unavailable', label: 'No longer sold', default: 'No longer available' },
		],
		snippet: '<div data-mint="cart"></div>\n<button data-mint-add="PRODUCT_ID">Add to cart</button>',
	},
};

export const THEME_DEFAULTS = { primaryColor: '', fontFamily: '', radius: 10, colorMode: 'auto' };
const COLOR_MODES = ['auto', 'light', 'dark'];
const HEX = /^#[0-9a-f]{6}$/i;

/** The panel's view of every widget: what it is and what can be set. */
export const widgetCatalog = () => Object.values(WIDGET_TYPES);

/** A widget's settings as used: saved values over the defaults, unknown keys gone. */
const mergeWidget = (type: WidgetType, saved: any = {}) => ({
	enabled: saved?.enabled === true,
	options: Object.fromEntries(type.options.map(o => [o.key, cleanOption(o, saved?.options?.[o.key])])),
	texts: Object.fromEntries(type.texts.map(t => [t.key, typeof saved?.texts?.[t.key] === 'string' && saved.texts[t.key].trim() ? saved.texts[t.key].trim().slice(0, 200) : t.default])),
});

/** One option's value, or its default when it doesn't fit. */
const cleanOption = (o: WidgetOption, v: any) => {
	if (v === undefined || v === null) return o.default;
	if (o.kind === 'boolean') return typeof v === 'boolean' ? v : o.default;
	if (o.kind === 'select') return o.options?.some(x => x.value === v) ? v : o.default;
	if (o.kind === 'number') {
		const n = Number(v);
		return Number.isFinite(n) ? Math.min(o.max ?? n, Math.max(o.min ?? n, n)) : o.default;
	}
	return typeof v === 'string' ? v.trim().slice(0, 300) : o.default;
};

const cleanTheme = (t: any = {}) => ({
	primaryColor: HEX.test(t?.primaryColor || '') ? t.primaryColor : '',
	fontFamily: typeof t?.fontFamily === 'string' ? t.fontFamily.replace(/[;{}<>]/g, '').trim().slice(0, 120) : '',
	radius: Number.isFinite(Number(t?.radius)) ? Math.min(24, Math.max(0, Math.round(Number(t.radius)))) : THEME_DEFAULTS.radius,
	colorMode: COLOR_MODES.includes(t?.colorMode) ? t.colorMode : 'auto',
});

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });

/** Every widget's settings (defaults where nothing's saved) and the theme. */
export const loadWidgets = async (project: any) => {
	const doc: any = await runInScope(scopeOf(project), () => SiteWidgets.findOne({}).lean());
	return {
		widgets: Object.fromEntries(Object.values(WIDGET_TYPES).map(t => [t.name, mergeWidget(t, doc?.widgets?.[t.name])])),
		theme: cleanTheme(doc?.theme || THEME_DEFAULTS),
		updatedAt: doc?.updatedAt || null,
	};
};

/**
 * Saves what's sent — per widget (enabled, options, texts) and the theme —
 * over what's there. Unknown widgets are refused; unknown options and texts
 * are dropped; values that don't fit fall back to the default.
 */
export const saveWidgets = async (project: any, body: any) => {
	const current = await loadWidgets(project);
	const widgets: any = { ...current.widgets };
	for (const [name, patch] of Object.entries<any>(body?.widgets || {})) {
		const type = WIDGET_TYPES[name];
		if (!type) throw new TenancyError(400, `There's no “${name}” widget — the widgets are ${Object.keys(WIDGET_TYPES).join(', ')}.`);
		const was = widgets[name];
		widgets[name] = mergeWidget(type, {
			enabled: typeof patch?.enabled === 'boolean' ? patch.enabled : was.enabled,
			options: { ...was.options, ...(patch?.options || {}) },
			texts: { ...was.texts, ...(patch?.texts || {}) },
		});
	}
	if (widgets.cart?.enabled && !current.widgets.cart.enabled && !(await loadShop(project)))
		throw new TenancyError(400, 'Set up the Shop first — which model holds your products and what its fields mean — then switch the cart on.', 'shop_not_set_up');
	const theme = body?.theme ? cleanTheme({ ...current.theme, ...body.theme }) : current.theme;
	await runInScope(scopeOf(project), () => SiteWidgets.updateOne({}, { $set: { widgets, theme } }, { upsert: true }));
	publicCache.delete(String(project._id));
	return loadWidgets(project);
};

/* ---------------------------------------------------- what mint.js gets */

const publicCache = new Map<string, { at: number; value: any }>();
const PUBLIC_TTL_MS = 30 * 1000;

/** After the shop changes: the next mint.js asks again. */
export const forgetPublicWidgets = (project: any) => publicCache.delete(String(project._id));

/**
 * The switched-on widgets and the look, for the site (no secrets — there are
 * none here). An empty primary colour takes the website's own (Site setup).
 */
export const publicWidgets = async (project: any) => {
	const key = String(project._id);
	const hit = publicCache.get(key);
	if (hit && Date.now() - hit.at < PUBLIC_TTL_MS) return hit.value;
	const { widgets, theme } = await loadWidgets(project);
	let primary = theme.primaryColor;
	if (!primary && project.type === 'website') {
		const site: any = await loadSite(project, { cached: true }).catch(() => null);
		const own = site?.identity?.primaryColor;
		if (HEX.test(own || '')) primary = own;
	}
	// The cart works only with the shop set up (a field since removed turns it off here).
	const shop = widgets.cart?.enabled ? await loadShop(project) : null;
	const value = {
		theme: { ...theme, primaryColor: primary || '#111827' },
		widgets: Object.fromEntries(
			Object.entries<any>(widgets)
				.filter(([name, w]) => w.enabled && (name !== 'cart' || shop))
				.map(([name, w]) => [name, { options: w.options, texts: w.texts }])
		),
		...(shop && { shop: { currency: shop.currency } }),
	};
	publicCache.set(key, { at: Date.now(), value });
	return value;
};
