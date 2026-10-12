import { FieldNode } from './data.js';
import { Block, PdfTemplateData, Slot, TemplateList, aliasOf } from './schema.js';

/**
 * Using a starter on a page (docs/pdf-templates D7): each slot it prints
 * (Total, Customer name, Line items → Price…) is matched to one of the
 * page's fields — guessed by name and kind, changed by the person — and the
 * starter's tokens are rewritten to those fields. Slots left unmatched keep
 * their token, which prints nothing until it's matched in the designer.
 */

/** What a slot's field is usually called, best first. */
const SYNONYMS: Record<string, string[]> = {
	number: ['number', 'no', 'invoiceNumber', 'invoiceNo', 'billNumber', 'billNo', 'receiptNumber', 'receiptNo', 'code', 'reference', 'ref'],
	date: ['date', 'issueDate', 'invoiceDate', 'billDate', 'receiptDate', 'paymentDate', 'issuedOn', 'createdAt'],
	dueDate: ['dueDate', 'due', 'dueOn', 'paymentDue', 'deadline'],
	status: ['status', 'state', 'paymentStatus'],
	'customer.name': ['customer.name', 'client.name', 'party.name', 'buyer.name', 'contact.name', 'customerName', 'clientName', 'billTo', 'name', 'customer', 'client'],
	'customer.address': ['customer.address', 'client.address', 'party.address', 'billingAddress', 'address', 'customerAddress', 'clientAddress'],
	'customer.email': ['customer.email', 'client.email', 'party.email', 'email', 'customerEmail', 'clientEmail'],
	'customer.phone': ['customer.phone', 'client.phone', 'party.phone', 'phone', 'mobile', 'customerPhone', 'clientPhone'],
	items: ['items', 'lineItems', 'lines', 'products', 'entries', 'services', 'rows'],
	subtotal: ['subtotal', 'subTotal', 'netAmount', 'amountBeforeTax'],
	discount: ['discount', 'discountAmount'],
	tax: ['tax', 'vat', 'taxAmount', 'vatAmount', 'gst'],
	total: ['total', 'grandTotal', 'totalAmount', 'amount', 'netTotal', 'payable'],
	paid: ['paid', 'paidAmount', 'amountPaid', 'received', 'totalPaid'],
	due: ['due', 'dueAmount', 'balance', 'balanceDue', 'outstanding', 'remaining'],
	notes: ['notes', 'note', 'remarks', 'terms', 'comments', 'description'],
	amount: ['amount', 'paidAmount', 'total', 'value', 'sum'],
	method: ['method', 'paymentMethod', 'mode', 'paymentMode', 'channel', 'via', 'account', 'paymentAccount'],
	reference: ['reference', 'transactionId', 'trxId', 'txnId', 'txn', 'ref', 'referenceNo'],
	'invoice.number': ['invoice.number', 'invoice.code', 'invoice.invoiceNumber', 'bill.number', 'bill.code', 'order.code', 'invoice', 'bill'],
	'item.description': ['description', 'name', 'title', 'product.name', 'item.name', 'service.name', 'product', 'item', 'details'],
	'item.quantity': ['quantity', 'qty', 'units', 'count', 'hours'],
	'item.price': ['price', 'unitPrice', 'rate', 'unitCost', 'cost'],
	'item.amount': ['amount', 'total', 'lineTotal', 'subtotal', 'value'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, '');

type Flat = { path: string; type: string; list?: boolean };

const flatten = (nodes: FieldNode[], out: Flat[] = []): Flat[] => {
	for (const n of nodes) {
		out.push({ path: n.path, type: n.type, list: n.list });
		if (n.children && n.type !== 'list') flatten(n.children, out);
	}
	return out;
};

const fits = (slot: Slot, f: Flat) => {
	if (slot.type === 'number') return f.type === 'number';
	if (slot.type === 'date') return f.type === 'date';
	if (slot.type === 'image') return f.type === 'image' || f.type === 'text';
	if (slot.type === 'list') return f.type === 'list';
	return f.type !== 'list' && f.type !== 'section';
};

/** The best field for a slot key (`customer.name`) among candidates, or ''. */
const best = (key: string, slot: Slot, candidates: Flat[]): string => {
	const words = SYNONYMS[key] || [key];
	let pick = '';
	let score = 0;
	for (const f of candidates) {
		if (!fits(slot, f)) continue;
		const p = norm(f.path.replace(/^item\./, ''));
		words.forEach((w, i) => {
			const n = norm(w);
			const s = p === n ? 200 - i : p.split('.').pop() === n.split('.').pop() && !n.includes('.') ? 100 - i : 0;
			if (s > score) [score, pick] = [s, f.path];
		});
	}
	return pick;
};

export type ListChoice = { path: string } | { route: string; foreignField: string };
export type Mapping = Record<string, string | ListChoice>;

/** First guesses for every slot of a starter on a page. */
export const guessMapping = (
	starter: { alias: string; slots?: Slot[] },
	tree: { fields: FieldNode[]; lists: { route: string; foreignField: string; fields: FieldNode[] }[] }
): Mapping => {
	const out: Mapping = {};
	const flat = flatten(tree.fields);
	const root = `${starter.alias}.`;
	for (const slot of starter.slots || []) {
		const key = slot.token.startsWith(root) ? slot.token.slice(root.length) : slot.token;
		if (slot.type !== 'list') {
			out[slot.token] = best(key, slot, flat);
			continue;
		}
		// A list: one of the record's own (section list) fields, else a page whose records point here.
		const own = best(key, slot, flat);
		let items: Flat[] = [];
		if (own) {
			out[slot.token] = { path: own };
			const node = (function find(nodes: FieldNode[]): FieldNode | undefined {
				for (const n of nodes) {
					if (n.path === own) return n;
					const hit = n.children && find(n.children);
					if (hit) return hit;
				}
			})(tree.fields);
			items = flatten(node?.children || []);
		} else {
			const words = (SYNONYMS[key] || [key]).map(norm);
			const list = tree.lists.find(l => words.some(w => norm(l.route).includes(w.replace(/s$/, '')))) || null;
			if (list) {
				out[slot.token] = { route: list.route, foreignField: list.foreignField };
				items = flatten(list.fields);
			} else out[slot.token] = '';
		}
		for (const sub of slot.of || []) out[sub.token] = items.length ? best(sub.token, sub, items) : '';
	}
	return out;
};

/* --------------------------------------------------------- rewriting */

const PATHLIKE = /(?<![\w$.'"])[A-Za-z_$][\w$]*(?:\.[\w$]+)+/g;

/**
 * The starter with its tokens pointing at the page's fields: `invoice.total`
 * → `bill.grandTotal`, `invoice.items` → `bill.items` (or a list from
 * another page), `item.price` → `item.unitPrice`.
 */
export const applyMapping = (starter: PdfTemplateData, mapping: Mapping, page: { route: string; title: string }): PdfTemplateData => {
	const alias = aliasOf(page.title || page.route);
	const lists: TemplateList[] = [];
	const listNames = new Map<string, string>();
	const slots = new Map((starter.slots || []).map(s => [s.token, s]));

	// Longest first, so `invoice.customer.name` wins over `invoice.customer`.
	const keys = Object.keys(mapping).sort((a, b) => b.length - a.length);
	const target = (key: string): string | null => {
		const m = mapping[key];
		if (!m) return null;
		if (typeof m === 'string') return key.startsWith('item.') ? `item.${m.replace(/^item\./, '')}` : `${alias}.${m}`;
		if ('path' in m) return `${alias}.${m.path}`;
		let name = listNames.get(key);
		if (!name) {
			name = slots.get(key)?.token.split('.').pop() || 'items';
			if (lists.some(l => l.name === name)) name = `${name}${lists.length + 1}`;
			lists.push({ name, route: m.route, foreignField: m.foreignField, limit: 500 });
			listNames.set(key, name);
		}
		return name;
	};
	const rewritePath = (p: string): string => {
		for (const key of keys) {
			if (p === key || p.startsWith(`${key}.`)) {
				const t = target(key);
				return t ? t + p.slice(key.length) : p;
			}
		}
		return p;
	};
	const rewriteText = (text: string) =>
		typeof text === 'string' ? text.replace(/\{\{([\s\S]*?)\}\}/g, (_m, inner: string) => `{{${inner.replace(PATHLIKE, rewritePath)}}}`) : text;

	const walk = (blocks: Block[]): Block[] =>
		(blocks || []).map(b => {
			const out: any = { ...b };
			if (out.showIf) out.showIf = out.showIf.map((c: any) => ({ ...c, field: rewritePath(c.field) }));
			if (typeof out.text === 'string') out.text = rewriteText(out.text);
			if (typeof out.src === 'string') out.src = rewriteText(out.src);
			if (out.type === 'table') {
				out.rows = rewritePath(out.rows);
				out.columns = out.columns.map((c: any) => ({ ...c, header: rewriteText(c.header), value: rewriteText(c.value) }));
			}
			if (out.type === 'fields') out.rows = out.rows.map((r: any) => ({ ...r, label: rewriteText(r.label), value: rewriteText(r.value) }));
			if (out.type === 'columns') out.columns = out.columns.map((c: any) => ({ ...c, blocks: walk(c.blocks) }));
			if (out.type === 'box') out.blocks = walk(out.blocks);
			return out;
		});

	const out: PdfTemplateData = {
		...starter,
		route: page.route,
		alias,
		header: walk(starter.header),
		body: walk(starter.body),
		footer: walk(starter.footer),
		lists: [...(starter.lists || []), ...lists],
	};
	// Whatever wasn't matched still names the starter's alias, and prints nothing.
	delete out.slots;
	delete out.sample;
	return out;
};
