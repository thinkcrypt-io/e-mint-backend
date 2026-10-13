import { FieldNode, fieldTree, templatePaths } from './data.js';
import { PdfSettingsData, PdfTemplateData, textsRoot } from './schema.js';

/**
 * Preview data (docs/pdf-templates PT-18): every field a template can print,
 * filled with something that looks right — a name where a name goes, an
 * email, a date, three line items whose amounts add up to the total. Built
 * from the page's fields; the template's own sample wins where it has a
 * value. The business details and saved texts are the scope's own, the
 * empty ones filled in too, so the preview shows the whole layout.
 */

const MONEYISH = /amount|total|price|paid|due|balance|cost|tax|vat|discount|subtotal|fee|salary|payable|rate/i;
const DAY = 86400000;

const pick = <T>(list: T[], i: number) => list[i % list.length];

/** A plausible value for one field, from its key and kind; `i` varies it between rows. */
export const dummyValue = (key: string, label: string, type: string, i = 0): any => {
	const k = key.toLowerCase();
	if (key === '_id') return `6a1b2c3d4e5f60718293a4b${i}`;
	if (type === 'number') {
		if (/qty|quantity|count|units?$|pcs|hours?/.test(k)) return pick([2, 5, 1, 3], i);
		if (/percent|pct/.test(k)) return pick([10, 5, 15], i);
		if (MONEYISH.test(k)) return pick([12500, 3450, 980, 22000], i);
		return pick([12, 4, 30, 7], i);
	}
	if (type === 'date') return new Date(Date.now() + (/due|until|expir|valid/.test(k) ? 14 : -i) * DAY);
	if (type === 'boolean') return true;
	if (type === 'image') return '';
	if (/e-?mail/.test(k)) return pick(['accounts@rahman-traders.example', 'billing@greenleaf.example', 'hello@acme.example'], i);
	if (/phone|mobile|tel|contact/.test(k)) return pick(['+880 1711 234567', '+880 1819 765432', '+880 1552 111222'], i);
	if (/address|street|location/.test(k)) return pick(['House 12, Road 5, Gulshan 2, Dhaka 1212', 'Plot 8, Agrabad C/A, Chattogram', '45 Kemal Ataturk Ave, Banani, Dhaka'], i);
	if (/city|district/.test(k)) return pick(['Dhaka', 'Chattogram', 'Sylhet'], i);
	if (/country/.test(k)) return 'Bangladesh';
	if (/status|state/.test(k)) return pick(['Paid', 'Due', 'Partly paid'], i);
	if (/method|mode|channel/.test(k)) return pick(['Bank transfer', 'bKash', 'Cash'], i);
	if (/website|url|link|site/.test(k)) return 'https://example.com';
	if (/unit/.test(k)) return pick(['pcs', 'hrs', 'months'], i);
	if (/(^|[^a-z])(code|no|number|ref|reference|invoice|bill|receipt|serial|sku)$/.test(k) || /(code|number|no)$/.test(k))
		return `${/receipt/.test(k) ? 'RCP' : /bill/.test(k) ? 'BIL' : 'INV'}-${1024 + i}`;
	if (/description|item|product|service|particular|line|detail/.test(k)) return pick(['Website design and build', 'Hosting, 12 months', 'Support hours', 'Domain renewal'], i);
	if (/note|remark|comment|memo|message|terms/.test(k)) return 'Thank you for your business. Payment is due within 14 days.';
	if (/name|title|client|customer|company|vendor|supplier|party|payee|payer|by$|to$/.test(k)) return pick(['Rahman Traders', 'Green Leaf Ltd', 'Acme Supplies'], i);
	return `Sample ${(label || key).toLowerCase()}`;
};

const keyOf = (n: FieldNode) => n.path.split('.').pop() || n.path;

/** A record shaped like `nodes`, every field filled; section lists get three rows. */
export const dummyRecord = (nodes: FieldNode[], i = 0): Record<string, any> => {
	const out: Record<string, any> = {};
	for (const n of nodes || []) {
		const key = keyOf(n);
		if (n.type === 'list') out[key] = [0, 1, 2].map(j => dummyRecord(n.children || [], j));
		else if (n.type === 'section' || n.type === 'reference')
			out[key] = n.children?.length ? dummyRecord(n.children, i) : { _id: dummyValue('_id', '', 'text', i), name: dummyValue('name', 'Name', 'text', i) };
		else out[key] = n.list ? [dummyValue(key, n.label, n.type, i)] : dummyValue(key, n.label, n.type, i);
	}
	return out;
};

/**
 * Totals that add up: rows' amount = qty × price, and the record's total /
 * subtotal / amount the rows' sum, paid half, due the rest.
 */
type Totals = { sum: number; paid: number };

const balance = (record: Record<string, any>): Totals => {
	let sum = 0;
	for (const v of Object.values(record)) {
		if (!Array.isArray(v) || !v.length || typeof v[0] !== 'object') continue;
		for (const row of v) {
			const qty = Object.entries(row).find(([k, x]) => typeof x === 'number' && /qty|quantity|count|units?$|hours?/i.test(k))?.[1] as number | undefined;
			const price = Object.entries(row).find(([k, x]) => typeof x === 'number' && /price|rate|unit/i.test(k) && !/qty|quantity/i.test(k))?.[0];
			const amountKey = Object.keys(row).find(k => typeof row[k] === 'number' && /amount|total|line|subtotal/i.test(k));
			if (amountKey) {
				if (qty && price) row[amountKey] = qty * row[price];
				sum += row[amountKey];
			}
		}
		if (sum) break;
	}
	if (!sum) return { sum: 0, paid: 0 };
	const paidKey = Object.keys(record).find(k => typeof record[k] === 'number' && /paid/i.test(k));
	const paid = Math.round(sum / 2);
	for (const [k, v] of Object.entries(record)) {
		if (typeof v !== 'number') continue;
		// Paid before the totals: "paidAmount" ends like an amount.
		if (/paid/i.test(k)) record[k] = paid;
		else if (/due|balance|remaining|outstanding/i.test(k)) record[k] = paidKey ? sum - paid : sum;
		else if (/tax|vat/i.test(k)) record[k] = Math.round(sum * 0.15);
		else if (/discount/i.test(k)) record[k] = 0;
		else if (/^(sub)?total$|grand|amount$|payable|net/i.test(k)) record[k] = sum;
	}
	return { sum, paid: paidKey ? paid : 0 };
};

/** `a` with `b`'s values over it, objects merged, lists and values replaced. */
const over = (a: any, b: any): any => {
	if (b === undefined || b === null || b === '') return a;
	if (Array.isArray(b) || typeof b !== 'object' || b instanceof Date || typeof a !== 'object' || a === null || Array.isArray(a)) return b;
	const out = { ...a };
	for (const [k, v] of Object.entries(b)) out[k] = over(a[k], v);
	return out;
};

const SAMPLE_BUSINESS = {
	name: 'Your Business Ltd',
	address: 'House 1, Road 2, Gulshan 1, Dhaka 1212',
	phone: '+880 1700 000000',
	email: 'accounts@yourbusiness.example',
	website: 'https://yourbusiness.example',
	taxId: 'BIN 000123456',
	note: 'Bank: City Bank · A/C 1234567890 · Routing 225261725',
};

/** A "LOGO" badge — the logo's place when the business has none yet. */
const SAMPLE_LOGO = `data:image/svg+xml;base64,${Buffer.from(
	'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" rx="14" fill="#e5e7eb"/><text x="150" y="62" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#6b7280" text-anchor="middle" letter-spacing="4">YOUR LOGO</text></svg>'
).toString('base64')}`;

const FIXED = new Set(['business', 'texts', 'today', 'now', 'page', 'pages', 'template', 'item', 'index']);

/**
 * What the template prints that's still empty — a starter's slot left
 * unmatched ({{invoice.due}} on a page without it), a field the page doesn't
 * have: filled too, by its name, so the preview has no holes. Real downloads
 * still print those blank.
 */
const fillGaps = (template: PdfTemplateData, roots: Record<string, any>, totals: Totals) => {
	// Amounts that agree with the line items: total = their sum, paid, due = the rest.
	const value = (key: string) => {
		if (/date|day|on$|at$/i.test(key)) return dummyValue(key, key, 'date');
		if (totals.sum && MONEYISH.test(key)) {
			if (/paid/i.test(key)) return totals.paid;
			if (/due|balance|remaining|outstanding/i.test(key)) return totals.sum - totals.paid;
			if (/tax|vat|discount|fee/i.test(key)) return 0;
			return totals.sum;
		}
		return dummyValue(key, key, MONEYISH.test(key) ? 'number' : 'text');
	};
	const lists = new Set((template.lists || []).map(l => l.name));
	for (const p of templatePaths(template)) {
		const keys = p.split('.');
		if (keys.length < 2 || FIXED.has(keys[0]) || lists.has(keys[0])) continue;
		let at: any = roots;
		for (let i = 0; i < keys.length - 1 && at && typeof at === 'object' && !Array.isArray(at); i++) at = at[keys[i]] ??= {};
		const last = keys[keys.length - 1];
		if (!at || typeof at !== 'object' || Array.isArray(at) || (at[last] !== undefined && at[last] !== '')) continue;
		at[last] = value(last);
	}
};

/** Every root a template prints, for a preview. */
export const previewRoots = async (req: any, template: PdfTemplateData, settings: PdfSettingsData, sample: any = {}) => {
	const tree = template.route ? await fieldTree(req, template.route).catch(() => null) : null;
	let record: Record<string, any> = tree ? dummyRecord(tree.fields) : {};
	const totals = balance(record);
	record = over(record, sample?.[template.alias]);

	const lists: Record<string, any[]> = {};
	for (const l of template.lists || []) {
		const fields = tree?.lists.find(x => x.route === l.route && x.foreignField === l.foreignField)?.fields || [];
		lists[l.name] = Array.isArray(sample?.[l.name]) ? sample[l.name] : [0, 1].map(i => dummyRecord(fields.map(f => ({ ...f, path: f.path.replace(/^item\./, '') })), i));
	}

	const own = settings.business;
	const business: any = { ...own };
	for (const [k, v] of Object.entries(SAMPLE_BUSINESS)) if (!business[k]) business[k] = sample?.business?.[k] || v;
	if (!business.logo) business.logo = sample?.business?.logo || SAMPLE_LOGO;

	// Saved texts the template prints that the scope hasn't written yet.
	const texts: Record<string, string> = textsRoot(settings);
	for (const p of templatePaths(template))
		if (p.startsWith('texts.') && !texts[p.slice(6)]) texts[p.slice(6)] = `Sample ${p.slice(6).replace(/_/g, ' ')}: payment is due within 14 days. Goods once sold are not returnable.`;

	const now = new Date();
	const roots: Record<string, any> = { ...sample, ...lists, [template.alias]: record, record, business, texts, today: now, now, template: { name: template.name } };
	fillGaps(template, roots, totals);
	return roots;
};
