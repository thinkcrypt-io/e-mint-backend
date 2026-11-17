/**
 * The product form in pages (docs/multi-page-forms MF-08): every store's Products add / edit
 * page in five steps — Basic information (with pricing) → Images → Inventory & variations →
 * SEO & others → Review & finalize (the summary, then status and collections, then Save).
 * A product with a key-value field gets Specifications before SEO & others. Used by the
 * installer for new stores and by the store upgrade for the ones built before.
 *
 * Works on whatever form the store has now: each section goes to the page its fields belong
 * on, so the person's own sections are kept (on SEO & others); Status and Collections are
 * taken out of their sections into Publishing on the last page.
 */

type Step = { key: string; title: string; description?: string };

export const PRODUCT_STEPS: Step[] = [
	{ key: 'basic', title: 'Basic information', description: 'What it is, where it sits and what it sells for' },
	{ key: 'images', title: 'Images', description: 'Photos shoppers see — the first one is the cover' },
	{ key: 'stock', title: 'Inventory & variations', description: 'Its codes, stock, and what it varies by — sizes, colours…' },
	{ key: 'specs', title: 'Specifications', description: 'Its details, by its category’s groups' },
	{ key: 'seo', title: 'SEO & others', description: 'How it shows in search results and shared links, and anything else' },
	{ key: 'final', title: 'Review & finalize', description: 'Check everything, then decide whether it’s on sale and where it shows' },
];

/** Pulled out of their sections onto the last page. */
const FINAL_FIELDS = ['status', 'collections'];
/**
 * What only the store writes (EC5) — nothing to fill in, so not on the form (the record page shows them).
 * The form's formulas read a missing value as 0, and the server works them out on save.
 */
const COUNTS = ['totalStock', 'views', 'wishlistCount', 'sold30', 'searchClicks30', 'discount', 'discountPercent'];
/** Kept in Pricing: Sale price (a new store's form leaves it at the end) and Tax added, which the live Price after tax reads. */
const BESIDE_TAX = ['salePrice', 'taxAdded'];

const PAGE_OF: Record<string, string> = {
	seo: 'seo',
	keywords: 'seo',
	options: 'stock',
	images: 'images',
	price: 'basic',
	priceAfterTax: 'basic',
	salePrice: 'basic',
	compareAtPrice: 'basic',
	cost: 'basic',
	taxRate: 'basic',
	taxAdded: 'basic',
	sku: 'stock',
	barcode: 'stock',
	trackStock: 'stock',
	name: 'basic',
	productType: 'basic',
	category: 'basic',
	brand: 'basic',
	description: 'basic',
};
// The page a section goes on: the first of its fields that names one, in this order.
const ORDER = ['specs', 'stock', 'images', 'basic', 'seo'];

const flat = (section: any): string[] => (Array.isArray(section?.fields) ? section.fields.flat() : []);

/**
 * The route config's `form` and `formSteps` with the product's pages, or null when the store
 * already decided on pages (on or off — what's done is left alone) or there's no form.
 */
export const productPagesOf = (data: any, fields: any[]): { form: any[]; formSteps: any; button: any } | null => {
	if (data?.formSteps && typeof data.formSteps === 'object' && 'enabled' in data.formSteps) return null;
	const form: any[] = Array.isArray(data?.form) ? data.form : [];
	if (!form.length) return null;
	const kinds = new Map<string, string>(fields.map((f: any) => [f.key, f.kind]));
	const has = (k: string) => kinds.has(k);

	// Status and Collections leave their sections (for the last page), the counts the form; read-only tax and
	// discount figures sitting outside Pricing join it. A section left empty goes.
	const pricingAt = form.findIndex((s: any) => flat(s).includes('taxRate'));
	const strays = BESIDE_TAX.filter(k => form.some((s: any, i: number) => i !== pricingAt && flat(s).includes(k)) && !(pricingAt >= 0 && flat(form[pricingAt]).includes(k)));
	// Sale price on Price after tax's row, as the stores upgraded before have it.
	const besideAfterTax = (rows: any[]) => {
		const at = strays.includes('salePrice') ? rows.findIndex(r => r === 'priceAfterTax') : -1;
		if (at < 0) return rows;
		return rows.filter(r => r !== 'salePrice').map(r => (r === 'priceAfterTax' ? ['salePrice', 'priceAfterTax'] : r));
	};
	// Off this section: what goes to the last page, the counts, and tax figures that move to Pricing.
	const off = (k: string, i: number) => FINAL_FIELDS.includes(k) || COUNTS.includes(k) || (i !== pricingAt && pricingAt >= 0 && strays.includes(k));
	const out = form
		.map((s: any, i: number) => ({
			...s,
			fields: (i === pricingAt ? besideAfterTax([...(s.fields || []), ...strays]) : s.fields || [])
				.map((row: any) => (Array.isArray(row) ? row.filter((k: string) => !off(k, i)) : off(row, i) ? null : row))
				.map((row: any) => (Array.isArray(row) && row.length === 1 ? row[0] : row))
				.filter((row: any) => row && (!Array.isArray(row) || row.length)),
		}))
		.filter((s: any) => s.fields.length);

	const pageOf = (s: any) => {
		const keys = flat(s);
		if (keys.includes('seo')) return 'seo';
		const pages = new Set(keys.map(k => (kinds.get(k) === 'keyvalue' ? 'specs' : PAGE_OF[k])).filter(Boolean));
		return ORDER.find(p => pages.has(p)) || 'seo';
	};
	// Variations only for a product "With variations" — the blueprint's condition, which stores built before didn't keep.
	const VARIATION = { field: 'productType', operator: 'eq', value: 'variation' };
	const placed = out.map((s: any) => {
		const step = pageOf(s);
		const when = step === 'stock' && !s.showIf && has('productType') && flat(s).every(k => k === 'options') ? { showIf: VARIATION } : {};
		return { ...s, ...when, step, side: false };
	});

	// Search words aren't on the blueprint's form: beside SEO, where shoppers' words belong.
	const shown = new Set(placed.flatMap(flat));
	if (has('keywords') && !shown.has('keywords')) {
		const seo = placed.find((s: any) => s.step === 'seo' && flat(s).includes('seo'));
		if (seo) seo.fields = [...seo.fields, 'keywords'];
		else placed.push({ sectionTitle: 'Search', fields: ['keywords'], step: 'seo', side: false });
	}

	const final = FINAL_FIELDS.filter(has);
	if (final.length) placed.push({ sectionTitle: 'Publishing', description: 'Whether it’s on sale yet, and the groups it shows in on your website', fields: final, step: 'final', side: false });

	const used = new Set(placed.map((s: any) => s.step));
	// Specifications only when the product has them; the rest are always there (an empty one is skipped).
	const steps = PRODUCT_STEPS.filter(s => s.key !== 'specs' || used.has('specs'));
	// The sections in page order, so the builder lists them as people go through them.
	// Variations after Inventory on their page: the codes and stock first, then what it varies by.
	const late = (s: any) => (flat(s).includes('options') ? 1 : 0);
	const form2 = steps.flatMap(st => placed.filter((s: any) => s.step === st.key).sort((a: any, b: any) => late(a) - late(b)));

	const { isModal: _modal, ...button } = data?.route?.button || { title: 'Add product' };
	return {
		form: form2,
		formSteps: { enabled: true, review: true, reviewOn: 'final', steps },
		button: { ...button, path: button.path || '/products/create' },
	};
};

/** The patch for publishConfigPatch / a straight write: the data with its pages, or as it was. */
export const withProductPages = (data: any, fields: any[]) => {
	const p = productPagesOf(data, fields);
	if (!p) return data;
	return { ...data, form: p.form, formSteps: p.formSteps, route: { ...(data.route || {}), button: p.button } };
};
