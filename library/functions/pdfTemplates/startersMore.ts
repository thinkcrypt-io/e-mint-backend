import { Slot } from './schema.js';
import { text, fields, row, cols, col, box, space, fillSpace, hrow, line, image, table, tcol, PAGE, look, signatures, businessBlock, BUSINESS, CUSTOMER } from './starterKit.js';

/**
 * More starter templates (PT-36): further invoices, receipts and
 * quotations, and the categories past those three — purchase orders,
 * delivery notes, credit notes, statements, payslips, certificates and
 * vouchers (MORE_CATEGORIES, seeded beside the first three). Colours name
 * theme roles ("accent", "soft"…) so a look recolours them (D24).
 */

/* --------------------------------------------------------------- helpers */

const m = (t: string, p: Record<string, any> = {}) => text(t, { size: 8.5, color: 'muted', ...p });
const cap = (t: string, p: Record<string, any> = {}) => text(t, { size: 7.5, weight: 600, color: 'muted', upper: true, spacing: 0.8, mb: 3, ...p });
const pageFooter = (left = '{{business.name}}  ·  {{business.website}}') => [
	line({ color: 'line', mb: 6 }),
	hrow([m(left, { size: 7.5 }), fillSpace(), m('Page {{page}} of {{pages}}', { size: 7.5 })]),
];
const party = (a: string, who: string, what: string, extra: Slot[] = []): Slot[] => [
	{ token: `${a}.${who}.name`, label: `${what} name`, type: 'text' },
	{ token: `${a}.${who}.address`, label: `${what} address`, type: 'text' },
	{ token: `${a}.${who}.email`, label: `${what} email`, type: 'text' },
	{ token: `${a}.${who}.phone`, label: `${what} phone`, type: 'text' },
	...extra,
];
const s = (token: string, label: string, type: Slot['type'] = 'text', of?: Slot[]): Slot => ({ token, label, type, ...(of && { of }) });

const ITEMS: Slot[] = [s('item.description', 'Description'), s('item.quantity', 'Quantity', 'number'), s('item.price', 'Unit price', 'number'), s('item.amount', 'Line amount', 'number')];
const SAMPLE_ITEMS = [
	{ description: 'Website design — home, shop and checkout pages', quantity: 1, price: 45000, amount: 45000 },
	{ description: 'Product photography (per product)', quantity: 24, price: 650, amount: 15600 },
	{ description: 'Hosting, 12 months', quantity: 1, price: 9600, amount: 9600 },
	{ description: 'Training session for the shop team', quantity: 2, price: 3500, amount: 7000 },
];
const totalsRows = (a: string, more: any[] = []) => [
	row('Subtotal', `{{${a}.subtotal | money}}`),
	row('Discount', `{{${a}.discount | money}}`),
	row('Tax', `{{${a}.tax | money}}`),
	...more,
];

/* ------------------------------------------------------------ categories */

/** The gallery categories these bring (D21), after Invoices, Receipts and Quotations. */
export const MORE_CATEGORIES = [
	{ key: 'purchase-order', name: 'Purchase orders', description: 'What you order from a supplier, at agreed prices.', order: 3 },
	{ key: 'delivery-note', name: 'Delivery notes', description: 'Challans and packing slips that go with the goods.', order: 4 },
	{ key: 'credit-note', name: 'Credit notes', description: 'Money given back or taken off an invoice.', order: 5 },
	{ key: 'statement', name: 'Statements', description: 'A customer’s account over a period: invoices, payments, balance.', order: 6 },
	{ key: 'payslip', name: 'Payslips', description: 'An employee’s pay for a month: earnings, deductions, net pay.', order: 7 },
	{ key: 'certificate', name: 'Certificates', description: 'Completion, achievement and appreciation certificates.', order: 8 },
	{ key: 'voucher', name: 'Vouchers', description: 'Payment and expense vouchers for the books.', order: 9 },
];

/* -------------------------------------------------------------- invoices */

const invoiceSlots = (extra: Slot[] = []): Slot[] => [
	s('invoice.number', 'Number'),
	s('invoice.date', 'Date', 'date'),
	s('invoice.dueDate', 'Due date', 'date'),
	s('invoice.status', 'Status'),
	...party('invoice', 'customer', 'Customer'),
	s('invoice.items', 'Line items', 'list', ITEMS),
	s('invoice.subtotal', 'Subtotal', 'number'),
	s('invoice.discount', 'Discount', 'number'),
	s('invoice.tax', 'Tax / VAT', 'number'),
	s('invoice.total', 'Total', 'number'),
	s('invoice.paid', 'Amount paid', 'number'),
	s('invoice.due', 'Balance due', 'number'),
	s('invoice.notes', 'Notes'),
	...extra,
];
const invoiceData = (p: Record<string, any> = {}) => ({
	invoice: {
		number: 'INV-2026-0042',
		date: '2026-10-13',
		dueDate: '2026-10-27',
		status: 'due',
		customer: CUSTOMER,
		items: SAMPLE_ITEMS,
		subtotal: 77200,
		discount: 2200,
		tax: 11250,
		total: 86250,
		paid: 30000,
		due: 56250,
		notes: 'Please pay by bank transfer within 14 days. Thank you for your business.',
		...p,
	},
	business: BUSINESS,
});

const invoiceElegant = {
	key: 'invoice-elegant',
	name: 'Invoice — Elegant',
	description: 'A centred serif letterhead between fine rules, quiet tables and the balance in the accent colour — for studios, consultants and hotels.',
	kind: 'invoice',
	alias: 'invoice',
	page: { ...PAGE, margin: [48, 54, 48, 54] },
	style: look('navy', 'classic', { size: 10 }),
	header: [],
	body: [
		image('{{business.logo}}', { height: 34, align: 'center', mb: 8 }),
		text('{{business.name}}', { font: 'heading', size: 20, align: 'center', spacing: 1, mb: 2 }),
		m('{{business.address}}  ·  {{business.phone}}  ·  {{business.email}}', { align: 'center' }),
		space(14),
		line({ color: 'line', thickness: 0.6, mb: 2 }),
		line({ color: 'line', thickness: 0.6 }),
		space(16),
		text('Invoice', { font: 'heading', size: 26, italic: true, align: 'center', color: 'accent', mb: 18 }),
		hrow(
			[
				box([cap('Billed to'), text('{{invoice.customer.name}}', { size: 11.5, weight: 600, mb: 2 }), m('{{invoice.customer.address}}'), m('{{invoice.customer.email}}')], { pad: 0, grow: 1 }),
				box([fields([row('Invoice no.', '{{invoice.number}}', { bold: true }), row('Issued', '{{invoice.date | date}}'), row('Due', '{{invoice.dueDate | date}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true, gap: 4 })], { pad: 0, basis: 200 }),
			],
			{ gap: 24 }
		),
		space(22),
		table('invoice.items', [
			tcol('Description', '{{item.description}}', 3.4),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'center'),
			tcol('Rate', '{{item.price | money}}', 1.2, 'right'),
			tcol('Amount', '{{item.amount | money}}', 1.3, 'right'),
		], { headerColor: 'accent', lineColor: 'line', lines: 'rows', emptyText: 'No items', pad: 8 }),
		space(14),
		hrow(
			[
				box([cap('Notes'), text('{{invoice.notes}}', { size: 9.5, italic: true })], { pad: 0, grow: 1 }),
				box([fields([...totalsRows('invoice'), row('Total', '{{invoice.total | money}}', { bold: true, line: true }), row('Paid', '{{invoice.paid | money}}')], { align: 'right', hideEmpty: true, gap: 4 }), space(8), box([hrow([text('Balance due', { color: 'onAccent', weight: 600 }), fillSpace(), text('{{invoice.due | money}}', { color: 'onAccent', weight: 700, size: 12 })], { valign: 'middle' })], { bg: 'accent', padX: 10, padY: 8 })], { pad: 0, basis: 230 }),
			],
			{ gap: 28 }
		),
		fillSpace(),
		m('{{business.note}}', { align: 'center', mb: 6 }),
		text('With thanks', { font: 'heading', size: 12, italic: true, align: 'center', color: 'accent' }),
	],
	footer: [m('Page {{page}} of {{pages}}', { size: 7.5, align: 'center' })],
	slots: invoiceSlots(),
	sample: invoiceData(),
};

const invoiceProforma = {
	key: 'invoice-proforma',
	name: 'Proforma invoice',
	description: 'A price and terms sent before the sale — for advance payment, an LC or customs. Says plainly that it isn’t a tax invoice.',
	kind: 'invoice',
	alias: 'invoice',
	page: PAGE,
	style: look('amber', 'corporate'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('PROFORMA INVOICE', { font: 'heading', size: 18, weight: 700, color: 'accent', align: 'right', spacing: 1, mb: 6 }), fields([row('PI no.', '{{invoice.number}}', { bold: true }), row('Date', '{{invoice.date | date}}'), row('Valid until', '{{invoice.dueDate | date}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true })], { pad: 0, basis: 220 })]),
		space(18),
		hrow(
			[
				box([cap('Buyer'), text('{{invoice.customer.name}}', { size: 11, weight: 600, mb: 2 }), m('{{invoice.customer.address}}'), m('{{invoice.customer.email}}   {{invoice.customer.phone}}')], { bg: 'soft', pad: 12, radius: 4, grow: 1 }),
				box([cap('Terms'), fields([row('Payment', '{{invoice.paymentTerms | default:"100% advance"}}'), row('Delivery', '{{invoice.delivery | default:"On receipt of payment"}}'), row('Currency', '{{invoice.currency | default:"BDT"}}')], { labelWidth: 0.4, gap: 3 })], { bg: 'soft', pad: 12, radius: 4, grow: 1 }),
			],
			{ gap: 12 }
		),
		space(18),
		table('invoice.items', [
			tcol('#', '{{index}}', 0.35),
			tcol('Description', '{{item.description}}', 3.2),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'right'),
			tcol('Unit price', '{{item.price | money}}', 1.2, 'right'),
			tcol('Amount', '{{item.amount | money}}', 1.3, 'right'),
		], { headerBg: 'accent', headerColor: 'onAccent', lineColor: 'line', lines: 'grid', emptyText: 'No items', pad: 6 }),
		space(12),
		hrow(
			[
				box([cap('Notes'), text('{{invoice.notes}}', { size: 9 }), m('In words: {{invoice.total | words}}', { italic: true, mt: 6 }), m('{{business.note}}', { mt: 6 })], { pad: 0, grow: 1 }),
				box([fields([...totalsRows('invoice'), row('Total payable', '{{invoice.total | money}}', { bar: true })], { align: 'right', hideEmpty: true, gap: 4 })], { pad: 0, basis: 220 }),
			],
			{ gap: 24 }
		),
		space(14),
		box([text('This is a proforma invoice, not a demand for payment or a tax invoice. A tax invoice follows on delivery.', { size: 8.5, italic: true, color: 'dark' })], { border: 0.75, borderColor: 'accent', padX: 10, padY: 7, radius: 3 }),
		fillSpace(),
		signatures(['Accepted by the buyer', 'For {{business.name}}'], { mt: 30 }),
	],
	footer: pageFooter('{{business.name}}  ·  {{business.taxId}}'),
	slots: invoiceSlots([s('invoice.paymentTerms', 'Payment terms'), s('invoice.delivery', 'Delivery terms'), s('invoice.currency', 'Currency')]),
	sample: invoiceData({ number: 'PI-2026-0011', paymentTerms: '50% advance, 50% before dispatch', delivery: 'Ex-works Dhaka, 3 weeks', currency: 'BDT' }),
};

const TAX_ITEMS: Slot[] = [...ITEMS.slice(0, 3), s('item.vatRate', 'VAT rate (%)', 'number'), s('item.vat', 'Line VAT', 'number'), ITEMS[3]];
const invoiceTax = {
	key: 'invoice-tax',
	name: 'Tax invoice (VAT)',
	description: 'Both parties’ BIN / VAT numbers, VAT worked out on every line and the VAT total called out — for VAT-registered sellers.',
	kind: 'invoice',
	alias: 'invoice',
	page: PAGE,
	style: look('emerald', 'clean'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('TAX INVOICE', { font: 'heading', size: 20, weight: 700, align: 'right', spacing: 1.5, mb: 4 }), m('Seller: {{business.taxId}}', { align: 'right', mb: 6 }), fields([row('Invoice no.', '{{invoice.number}}', { bold: true }), row('Date', '{{invoice.date | date}}'), row('Due', '{{invoice.dueDate | date}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true })], { pad: 0, basis: 220 })]),
		space(18),
		box([hrow([box([cap('Buyer'), text('{{invoice.customer.name}}', { size: 11, weight: 600, mb: 2 }), m('{{invoice.customer.address}}')], { pad: 0, grow: 1 }), box([cap('Buyer’s BIN / VAT no.'), text('{{invoice.customer.taxId | default:"—"}}', { weight: 600 }), cap('Contact', { mt: 8 }), m('{{invoice.customer.phone}}   {{invoice.customer.email}}')], { pad: 0, basis: 200 })], { gap: 20 })], { border: 0.75, borderColor: 'line', pad: 12, radius: 4 }),
		space(18),
		table('invoice.items', [
			tcol('#', '{{index}}', 0.35),
			tcol('Description', '{{item.description}}', 2.6),
			tcol('Qty', '{{item.quantity | number}}', 0.5, 'right'),
			tcol('Unit price', '{{item.price | money}}', 1.1, 'right'),
			tcol('VAT%', '{{item.vatRate | number}}', 0.8, 'right'),
			tcol('VAT', '{{item.vat | money}}', 1, 'right'),
			tcol('Amount', '{{item.amount | money}}', 1.2, 'right'),
		], { headerBg: 'soft', headerColor: 'dark', lineColor: 'line', lines: 'rows', size: 9, emptyText: 'No items', pad: 6 }),
		space(12),
		hrow(
			[
				box([cap('In words'), text('{{invoice.total | words}}', { size: 9, italic: true }), cap('Notes', { mt: 10 }), text('{{invoice.notes}}', { size: 9 })], { pad: 0, grow: 1 }),
				box([fields([row('Value before VAT', '{{invoice.subtotal | money}}'), row('Discount', '{{invoice.discount | money}}'), row('VAT', '{{invoice.tax | money}}', { bold: true }), row('Total incl. VAT', '{{invoice.total | money}}', { bar: true }), row('Paid', '{{invoice.paid | money}}'), row('Balance due', '{{invoice.due | money}}', { bold: true })], { align: 'right', hideEmpty: true, gap: 4 })], { pad: 0, basis: 230 }),
			],
			{ gap: 24 }
		),
		fillSpace(),
		m('{{business.note}}', { mb: 20 }),
		signatures(['Received by the buyer', 'Authorised signatory, {{business.name}}']),
	],
	footer: pageFooter(),
	slots: invoiceSlots([s('invoice.customer.taxId', 'Buyer’s BIN / VAT no.')]).map(x => (x.token === 'invoice.items' ? { ...x, of: TAX_ITEMS } : x)),
	sample: invoiceData({
		customer: { ...CUSTOMER, taxId: 'BIN 000987654-0202' },
		items: SAMPLE_ITEMS.map(i => ({ ...i, vatRate: 15, vat: Math.round(i.amount * 0.15) })),
		subtotal: 77200,
		discount: 0,
		tax: 11580,
		total: 88780,
		paid: 0,
		due: 88780,
	}),
};

/* -------------------------------------------------------------- receipts */

const receiptSlots: Slot[] = [
	s('receipt.number', 'Receipt number'),
	s('receipt.date', 'Date', 'date'),
	s('receipt.customer.name', 'Received from'),
	s('receipt.customer.phone', 'Payer’s phone'),
	s('receipt.amount', 'Amount', 'number'),
	s('receipt.method', 'Payment method'),
	s('receipt.reference', 'Reference / transaction ID'),
	s('receipt.invoice.number', 'For invoice (number)'),
	s('receipt.balance', 'Balance still due', 'number'),
	s('receipt.notes', 'Notes'),
];
const receiptModern = {
	key: 'receipt-modern',
	name: 'Receipt — Modern',
	description: 'An accent band, the amount in a large card with a PAID stamp, and the payment’s details in a tidy list.',
	kind: 'receipt',
	alias: 'receipt',
	page: { ...PAGE, margin: [0, 48, 0, 48] },
	style: look('plum', 'friendly', { size: 10 }),
	header: [
		box([hrow([box([text('{{business.name}}', { font: 'heading', size: 15, weight: 700, color: 'onAccent' }), text('{{business.phone}}  ·  {{business.email}}', { size: 8.5, color: 'onAccent' })], { pad: 0 }), fillSpace(), text('Receipt', { font: 'heading', size: 22, weight: 600, color: 'onAccent' })], { valign: 'middle' })], { bg: 'accent', padX: 0, padY: 20, bleed: true }),
	],
	body: [
		space(24),
		hrow([box([cap('Receipt no.'), text('{{receipt.number}}', { weight: 600 })], { pad: 0, grow: 1 }), box([cap('Date'), text('{{receipt.date | date}}', { weight: 600 })], { pad: 0, grow: 1 }), box([cap('For invoice'), text('{{receipt.invoice.number | default:"—"}}', { weight: 600 })], { pad: 0, grow: 1 })], { gap: 16 }),
		space(20),
		box(
			[
				hrow([box([m('Received from'), text('{{receipt.customer.name}}', { size: 14, weight: 600 })], { pad: 0, grow: 1 }), box([text('PAID', { size: 13, weight: 700, color: 'accent', align: 'center', spacing: 3 })], { border: 1.5, borderColor: 'accent', padX: 12, padY: 4, radius: 4 })], { valign: 'middle' }),
				space(14),
				m('Amount'),
				text('{{receipt.amount | money}}', { font: 'heading', size: 32, weight: 700, color: 'dark' }),
				m('{{receipt.amount | words}}', { italic: true, size: 9.5 }),
			],
			{ bg: 'soft', pad: 22, radius: 10 }
		),
		space(20),
		fields([row('Paid by', '{{receipt.method}}'), row('Reference', '{{receipt.reference}}'), row('Payer’s phone', '{{receipt.customer.phone}}'), row('Still due', '{{receipt.balance | money}}', { bold: true }), row('Note', '{{receipt.notes}}')], { labelWidth: 0.25, hideEmpty: true, gap: 6 }),
		fillSpace(),
		hrow([m('Thank you — keep this receipt for your records.', { italic: true }), fillSpace(), box([line({ color: 'text', mb: 4 }), m('Received by', { align: 'center' })], { pad: 0, basis: 170 })], { valign: 'bottom', mb: 24 }),
	],
	footer: [box([hrow([text('{{business.address}}', { size: 7.5, color: 'onAccent' }), fillSpace(), text('{{business.website}}', { size: 7.5, color: 'onAccent' })])], { bg: 'dark', padX: 0, padY: 12, bleed: true })],
	slots: receiptSlots,
	sample: {
		receipt: { number: 'RCT-0107', date: '2026-10-13', customer: { name: 'Rahman Traders Ltd.', phone: '+880 1711 000000' }, amount: 30000, method: 'bKash', reference: 'TrxID 9KD82HF1QA', invoice: { number: 'INV-2026-0042' }, balance: 56250, notes: 'Part payment against the October invoice.' },
		business: BUSINESS,
	},
};

/* ------------------------------------------------------------ quotations */

const estimate = {
	key: 'quote-estimate',
	name: 'Estimate — Project',
	description: 'For services: the scope of work in your words, the costed items, a timeline and the terms, then the customer’s sign-off.',
	kind: 'quotation',
	alias: 'quote',
	page: PAGE,
	style: look('forest', 'newsroom'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('Estimate', { font: 'heading', size: 26, weight: 700, color: 'accent', align: 'right', mb: 6 }), fields([row('Estimate no.', '{{quote.number}}', { bold: true }), row('Date', '{{quote.date | date}}'), row('Valid until', '{{quote.validUntil | date}}')], { align: 'right', labelWidth: 0.5, hideEmpty: true })], { pad: 0, basis: 200 })]),
		space(16),
		line({ color: 'accent', thickness: 2 }),
		space(16),
		hrow([box([cap('Prepared for'), text('{{quote.customer.name}}', { size: 11, weight: 600, mb: 2 }), m('{{quote.customer.address}}'), m('{{quote.customer.email}}')], { pad: 0, grow: 1 }), box([cap('Project'), text('{{quote.title}}', { size: 11, weight: 600, mb: 2 }), m('Timeline: {{quote.timeline}}')], { pad: 0, grow: 1.2 })], { gap: 24 }),
		space(16),
		box([cap('Scope of work'), text('{{quote.scope}}', { size: 9.5, lineHeight: 1.55 })], { bg: 'soft', pad: 14, radius: 4 }),
		space(16),
		table('quote.items', [
			tcol('#', '{{index}}', 0.35),
			tcol('Item', '{{item.description}}', 3.2),
			tcol('Qty / hrs', '{{item.quantity | number}}', 0.8, 'right'),
			tcol('Rate', '{{item.price | money}}', 1.1, 'right'),
			tcol('Amount', '{{item.amount | money}}', 1.3, 'right'),
		], { headerColor: 'accent', lineColor: 'line', lines: 'rows', emptyText: 'No items', pad: 7 }),
		space(12),
		hrow(
			[
				box([cap('Terms'), text('{{quote.notes}}', { size: 9 }), text('{{texts.terms_conditions}}', { size: 8.5, color: 'muted', mt: 4 })], { pad: 0, grow: 1 }),
				box([fields([...totalsRows('quote'), row('Estimated total', '{{quote.total | money}}', { bar: true })], { align: 'right', hideEmpty: true, gap: 4 })], { pad: 0, basis: 220 }),
			],
			{ gap: 24 }
		),
		fillSpace(),
		m('This is an estimate: the final invoice may differ if the scope changes. Changes are agreed in writing first.', { italic: true, mb: 22 }),
		signatures(['Approved by (name, signature, date)', 'For {{business.name}}']),
	],
	footer: pageFooter(),
	slots: [
		s('quote.number', 'Estimate number'),
		s('quote.date', 'Date', 'date'),
		s('quote.validUntil', 'Valid until', 'date'),
		s('quote.title', 'Project title'),
		s('quote.timeline', 'Timeline'),
		s('quote.scope', 'Scope of work'),
		...party('quote', 'customer', 'Customer').slice(0, 3),
		s('quote.items', 'Line items', 'list', ITEMS),
		s('quote.subtotal', 'Subtotal', 'number'),
		s('quote.discount', 'Discount', 'number'),
		s('quote.tax', 'Tax / VAT', 'number'),
		s('quote.total', 'Total', 'number'),
		s('quote.notes', 'Notes / terms'),
	],
	sample: {
		quote: {
			number: 'EST-2026-0007',
			date: '2026-10-13',
			validUntil: '2026-11-12',
			title: 'Online shop for Rahman Traders',
			timeline: '6 weeks from the advance',
			scope: 'Design and build a mobile-first online shop: home, category, product, cart and checkout pages; product photography for 24 products; a year of hosting; and training for the shop team on adding products and handling orders.',
			customer: CUSTOMER,
			items: SAMPLE_ITEMS,
			subtotal: 77200,
			discount: 2200,
			tax: 11250,
			total: 86250,
			notes: '40% on approval, 40% at launch, 20% a month after. Two rounds of changes included.',
		},
		business: BUSINESS,
	},
};

/* ------------------------------------------------------- purchase orders */

const PO_ITEMS: Slot[] = [s('item.sku', 'Item code / SKU'), ...ITEMS];
const poSlots: Slot[] = [
	s('po.number', 'PO number'),
	s('po.date', 'Order date', 'date'),
	s('po.deliveryDate', 'Deliver by', 'date'),
	...party('po', 'supplier', 'Supplier'),
	s('po.shipTo', 'Deliver to (address)'),
	s('po.paymentTerms', 'Payment terms'),
	s('po.items', 'Line items', 'list', PO_ITEMS),
	s('po.subtotal', 'Subtotal', 'number'),
	s('po.tax', 'Tax / VAT', 'number'),
	s('po.shipping', 'Shipping', 'number'),
	s('po.total', 'Total', 'number'),
	s('po.notes', 'Notes'),
];
const poSample = {
	po: {
		number: 'PO-2026-0153',
		date: '2026-10-13',
		deliveryDate: '2026-10-24',
		supplier: { name: 'Delta Packaging Co.', address: 'Plot 7, BSCIC Industrial Area\nTongi, Gazipur', email: 'sales@deltapack.com.bd', phone: '+880 1915 000000' },
		shipTo: 'Northwind Studio warehouse\nRoad 14, Tejgaon I/A, Dhaka 1208',
		paymentTerms: '30 days after delivery',
		items: [
			{ sku: 'BX-A4-W', description: 'Mailer box, A4, white', quantity: 500, price: 38, amount: 19000 },
			{ sku: 'BX-A5-K', description: 'Mailer box, A5, kraft', quantity: 800, price: 26, amount: 20800 },
			{ sku: 'TP-48-C', description: 'Packing tape, 48 mm, clear (roll)', quantity: 60, price: 85, amount: 5100 },
			{ sku: 'ST-RND-50', description: 'Round logo stickers, 50 mm (sheet of 20)', quantity: 150, price: 40, amount: 6000 },
		],
		subtotal: 50900,
		tax: 3818,
		shipping: 1200,
		total: 55918,
		notes: 'Quote the PO number on the delivery challan and the bill. Deliveries 10am–5pm, Sunday to Thursday.',
	},
	business: BUSINESS,
};
const poTable = (p: Record<string, any>) =>
	table('po.items', [
		tcol('#', '{{index}}', 0.35),
		tcol('Code', '{{item.sku}}', 0.9),
		tcol('Description', '{{item.description}}', 2.8),
		tcol('Qty', '{{item.quantity | number}}', 0.6, 'right'),
		tcol('Unit price', '{{item.price | money}}', 1.1, 'right'),
		tcol('Amount', '{{item.amount | money}}', 1.2, 'right'),
	], { lineColor: 'line', emptyText: 'No items', pad: 6, ...p });
const poTotals = fields([row('Subtotal', '{{po.subtotal | money}}'), row('Tax', '{{po.tax | money}}'), row('Shipping', '{{po.shipping | money}}'), row('Total', '{{po.total | money}}', { bar: true })], { align: 'right', hideEmpty: true, gap: 4 });

const poStandard = {
	key: 'po-standard',
	name: 'Purchase order',
	description: 'Your order to a supplier: who supplies, where and when to deliver, the coded items at agreed prices, and your authorisation.',
	kind: 'purchase-order',
	alias: 'po',
	page: PAGE,
	style: look('graphite', 'clean'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('PURCHASE ORDER', { font: 'heading', size: 18, weight: 700, align: 'right', spacing: 1, mb: 6 }), fields([row('PO no.', '{{po.number}}', { bold: true }), row('Date', '{{po.date | date}}'), row('Deliver by', '{{po.deliveryDate | date}}', { bold: true })], { align: 'right', labelWidth: 0.45, hideEmpty: true })], { pad: 0, basis: 210 })]),
		space(18),
		cols([
			col([box([cap('Supplier'), text('{{po.supplier.name}}', { size: 11, weight: 600, mb: 2 }), m('{{po.supplier.address}}'), m('{{po.supplier.phone}}   {{po.supplier.email}}')], { border: 0.75, borderColor: 'line', pad: 12 })]),
			col([box([cap('Deliver to'), text('{{po.shipTo}}', { size: 9.5 }), cap('Payment terms', { mt: 8 }), text('{{po.paymentTerms}}', { size: 9.5 })], { border: 0.75, borderColor: 'line', pad: 12 })]),
		], { gap: 12 }),
		space(18),
		poTable({ headerBg: 'dark', headerColor: 'onAccent', lines: 'grid' }),
		space(12),
		hrow([box([cap('Instructions'), text('{{po.notes}}', { size: 9 }), m('In words: {{po.total | words}}', { italic: true, mt: 6 })], { pad: 0, grow: 1 }), box([poTotals], { pad: 0, basis: 210 })], { gap: 24 }),
		fillSpace(),
		signatures(['Prepared by', 'Approved by', 'Accepted by the supplier'], { mt: 30 }),
	],
	footer: pageFooter('{{business.name}}  ·  {{business.taxId}}'),
	slots: poSlots,
	sample: poSample,
};

const poModern = {
	key: 'po-modern',
	name: 'Purchase order — Modern',
	description: 'A coloured band, the delivery date and order total up front, light rows — the same purchase order with more colour.',
	kind: 'purchase-order',
	alias: 'po',
	page: { ...PAGE, margin: [0, 42, 0, 42] },
	style: look('ocean', 'tech'),
	header: [
		box([hrow([box([text('{{business.name}}', { font: 'heading', size: 15, weight: 700, color: 'onAccent' }), text('{{business.address}}', { size: 8, color: 'onAccent' })], { pad: 0 }), fillSpace(), box([text('Purchase order', { font: 'heading', size: 19, weight: 600, color: 'onAccent', align: 'right' }), text('{{po.number}}', { size: 9, color: 'onAccent', align: 'right' })], { pad: 0 })], { valign: 'middle' })], { bg: 'accent', padX: 0, padY: 18, bleed: true }),
	],
	body: [
		space(18),
		hrow(
			[
				box([cap('Supplier'), text('{{po.supplier.name}}', { size: 11, weight: 600, mb: 2 }), m('{{po.supplier.address}}'), m('{{po.supplier.email}}')], { pad: 0, grow: 1 }),
				box([cap('Ordered'), text('{{po.date | date}}', { weight: 600 }), cap('Deliver by', { mt: 8 }), text('{{po.deliveryDate | date}}', { weight: 600, color: 'accent' })], { pad: 0, basis: 100 }),
				box([cap('Order total', { align: 'right' }), text('{{po.total | money}}', { size: 18, weight: 700, color: 'accent', align: 'right' }), m('{{po.paymentTerms}}', { align: 'right', mt: 2 })], { pad: 0, basis: 160 }),
			],
			{ gap: 16 }
		),
		space(14),
		box([hrow([cap('Deliver to', { mb: 0 }), text('{{po.shipTo}}', { size: 9, grow: 1 })], { gap: 12 })], { bg: 'soft', padX: 12, padY: 8, radius: 4 }),
		space(16),
		poTable({ headerBg: 'soft', headerColor: 'dark', zebra: true, lines: 'none', pad: 7 }),
		space(14),
		hrow([box([cap('Instructions'), text('{{po.notes}}', { size: 9 })], { border: 0.75, borderColor: 'line', pad: 12, radius: 6, grow: 1 }), box([poTotals], { pad: 0, basis: 200 })], { gap: 20 }),
		fillSpace(),
		signatures(['Authorised by', 'Supplier’s acceptance'], { mt: 30, mb: 20 }),
	],
	footer: [box([hrow([text('{{business.phone}}  ·  {{business.email}}', { size: 7.5, color: 'onAccent' }), fillSpace(), text('Page {{page}} of {{pages}}', { size: 7.5, color: 'onAccent' })])], { bg: 'dark', padX: 0, padY: 12, bleed: true })],
	slots: poSlots,
	sample: poSample,
};

/* -------------------------------------------------------- delivery notes */

const challan = {
	key: 'delivery-challan',
	name: 'Delivery challan',
	description: 'Goods sent, with no prices: the order it belongs to, the vehicle, the items and quantities, and signatures for prepared, delivered and received in good condition.',
	kind: 'delivery-note',
	alias: 'delivery',
	page: PAGE,
	style: look('graphite', 'corporate'),
	header: [],
	body: [
		hrow([image('{{business.logo}}', { height: 38 }), box([text('{{business.name}}', { font: 'heading', size: 15, weight: 700, align: 'center' }), m('{{business.address}}', { align: 'center' }), m('{{business.phone}}  ·  {{business.email}}', { align: 'center' })], { pad: 0, grow: 1 }), space(38)], { valign: 'middle' }),
		space(10),
		line({ color: 'text', thickness: 1.2 }),
		space(10),
		hrow([fillSpace(), box([text('DELIVERY CHALLAN', { size: 13, weight: 700, spacing: 3, align: 'center' })], { border: 1, borderColor: 'text', padX: 16, padY: 5 }), fillSpace()]),
		space(14),
		cols([
			col([fields([row('To', '**{{delivery.customer.name}}**'), row('Address', '{{delivery.customer.address}}'), row('Phone', '{{delivery.customer.phone}}')], { labelWidth: 0.24, hideEmpty: true, gap: 3 })], 1.4),
			col([fields([row('Challan no.', '{{delivery.number}}', { bold: true }), row('Date', '{{delivery.date | date}}'), row('Order / PO', '{{delivery.order}}'), row('Vehicle', '{{delivery.vehicle}}'), row('Driver', '{{delivery.driver}}')], { align: 'right', labelWidth: 0.32, hideEmpty: true, gap: 3 })]),
		]),
		space(16),
		table('delivery.items', [
			tcol('SL', '{{index}}', 0.4, 'center'),
			tcol('Description of goods', '{{item.description}}', 3.6),
			tcol('Unit', '{{item.unit}}', 0.7, 'center'),
			tcol('Quantity', '{{item.quantity | number}}', 0.9, 'right'),
			tcol('Remarks', '{{item.remarks}}', 1.4),
		], { headerBg: 'soft', lineColor: 'text', lines: 'grid', emptyText: 'No items', pad: 6 }),
		space(8),
		hrow([fillSpace(), text('Total quantity: **{{delivery.items | sum:quantity | number}}**')]),
		space(12),
		m('{{delivery.notes}}'),
		space(8),
		text('Received the above goods in good order and condition.', { size: 9, italic: true }),
		fillSpace(),
		signatures(['Prepared by', 'Delivered by', 'Received by (name, seal, date)'], { mt: 40 }),
	],
	footer: [hrow([m('Not an invoice — prices go on the bill.', { size: 7.5 }), fillSpace(), m('Page {{page}} of {{pages}}', { size: 7.5 })])],
	slots: [
		s('delivery.number', 'Challan number'),
		s('delivery.date', 'Date', 'date'),
		s('delivery.order', 'Order / PO number'),
		s('delivery.vehicle', 'Vehicle number'),
		s('delivery.driver', 'Driver'),
		s('delivery.customer.name', 'Customer name'),
		s('delivery.customer.address', 'Delivery address'),
		s('delivery.customer.phone', 'Customer phone'),
		s('delivery.items', 'Goods', 'list', [s('item.description', 'Description'), s('item.unit', 'Unit'), s('item.quantity', 'Quantity', 'number'), s('item.remarks', 'Remarks')]),
		s('delivery.notes', 'Notes'),
	],
	sample: {
		delivery: {
			number: 'DC-2026-0311',
			date: '2026-10-13',
			order: 'PO-RT-0921',
			vehicle: 'Dhaka Metro Ta 11-2345',
			driver: 'Md. Karim (+880 1712 000000)',
			customer: CUSTOMER,
			items: [
				{ description: 'Cotton T-shirt, crew neck, black (M)', unit: 'pcs', quantity: 120, remarks: '6 cartons' },
				{ description: 'Cotton T-shirt, crew neck, black (L)', unit: 'pcs', quantity: 150, remarks: '7 cartons' },
				{ description: 'Polo shirt, navy (L)', unit: 'pcs', quantity: 80, remarks: '4 cartons' },
				{ description: 'Hang tags and poly bags', unit: 'set', quantity: 350, remarks: '' },
			],
			notes: 'Partial delivery — the XL sizes follow next week.',
		},
		business: BUSINESS,
	},
};

const packingSlip = {
	key: 'packing-slip',
	name: 'Packing slip',
	description: 'Goes in the parcel: ship-to address in a large box, the order and tracking numbers, items with tick boxes, and a thank-you note.',
	kind: 'delivery-note',
	alias: 'shipment',
	page: PAGE,
	style: look('teal', 'soft'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('Packing slip', { font: 'heading', size: 22, weight: 700, color: 'accent', align: 'right', mb: 6 }), fields([row('Order', '{{shipment.order}}', { bold: true }), row('Shipped', '{{shipment.date | date}}'), row('Parcels', '{{shipment.parcels}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true })], { pad: 0, basis: 190 })]),
		space(20),
		hrow(
			[
				box([cap('Ship to'), text('{{shipment.customer.name}}', { size: 14, weight: 700, mb: 3 }), text('{{shipment.customer.address}}', { size: 11, lineHeight: 1.4 }), text('{{shipment.customer.phone}}', { size: 10, mt: 4 })], { border: 1.5, borderColor: 'accent', pad: 16, radius: 8, grow: 1.4 }),
				box([cap('Courier'), text('{{shipment.carrier}}', { weight: 600, mb: 8 }), cap('Tracking no.'), text('{{shipment.tracking}}', { font: 'mono', weight: 600, mb: 8 }), cap('Slip no.'), text('{{shipment.number}}')], { bg: 'soft', pad: 16, radius: 8, grow: 1 }),
			],
			{ gap: 14 }
		),
		space(20),
		table('shipment.items', [
			tcol('Packed', '[   ]', 0.6, 'center'),
			tcol('SKU', '{{item.sku}}', 1),
			tcol('Item', '{{item.description}}', 3.4),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'right'),
		], { headerColor: 'accent', lineColor: 'line', lines: 'rows', emptyText: 'No items', pad: 8 }),
		space(8),
		hrow([fillSpace(), m('Items: **{{shipment.items | count}}**   ·   Pieces: **{{shipment.items | sum:quantity | number}}**')]),
		space(18),
		box([text('Thank you for your order!', { font: 'heading', size: 13, weight: 600, color: 'dark', mb: 3 }), text('{{shipment.notes}}', { size: 9 })], { bg: 'soft', pad: 14, radius: 8 }),
		fillSpace(),
		m('Something missing or damaged? Write to {{business.email}} or call {{business.phone}} within 7 days.', { align: 'center' }),
	],
	footer: [],
	slots: [
		s('shipment.number', 'Slip number'),
		s('shipment.order', 'Order number'),
		s('shipment.date', 'Shipped on', 'date'),
		s('shipment.parcels', 'Number of parcels'),
		s('shipment.carrier', 'Courier'),
		s('shipment.tracking', 'Tracking number'),
		s('shipment.customer.name', 'Customer name'),
		s('shipment.customer.address', 'Shipping address'),
		s('shipment.customer.phone', 'Customer phone'),
		s('shipment.items', 'Items', 'list', [s('item.sku', 'SKU'), s('item.description', 'Description'), s('item.quantity', 'Quantity', 'number')]),
		s('shipment.notes', 'Note to the customer'),
	],
	sample: {
		shipment: {
			number: 'PS-50218',
			order: '#10482',
			date: '2026-10-13',
			parcels: '1 of 1',
			carrier: 'Pathao Courier',
			tracking: 'PTH-DK-88412093',
			customer: { name: 'Nusrat Jahan', address: 'Flat 5B, House 21, Road 3, Block C\nBanani, Dhaka 1213', phone: '+880 1819 000000' },
			items: [
				{ sku: 'TS-BLK-M', description: 'Cotton T-shirt, crew neck, black — M', quantity: 2 },
				{ sku: 'TT-CAN-NAT', description: 'Canvas tote bag, natural', quantity: 1 },
				{ sku: 'MG-CER-WHT', description: 'Ceramic mug, white, 350 ml', quantity: 2 },
			],
			notes: 'We packed this by hand. Share a photo and tag us — we’d love to see it.',
		},
		business: BUSINESS,
	},
};

/* ----------------------------------------------------------- credit note */

const creditNote = {
	key: 'credit-note',
	name: 'Credit note',
	description: 'Money taken off an invoice — returns, short delivery or a goodwill discount: the invoice it adjusts, why, the lines credited and the credit total.',
	kind: 'credit-note',
	alias: 'credit',
	page: PAGE,
	style: look('rose', 'editorial'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('Credit note', { font: 'heading', size: 26, weight: 700, color: 'accent', align: 'right', mb: 6 }), fields([row('Credit no.', '{{credit.number}}', { bold: true }), row('Date', '{{credit.date | date}}'), row('Against invoice', '{{credit.invoice.number}}', { bold: true })], { align: 'right', labelWidth: 0.5, hideEmpty: true })], { pad: 0, basis: 220 })]),
		space(20),
		hrow(
			[
				box([cap('Customer'), text('{{credit.customer.name}}', { size: 11, weight: 600, mb: 2 }), m('{{credit.customer.address}}'), m('{{credit.customer.email}}')], { pad: 0, grow: 1 }),
				box([cap('Reason'), text('{{credit.reason}}', { size: 9.5 })], { border: 2, borderColor: 'accent', borderSides: ['left'], padX: 12, padY: 4, grow: 1 }),
			],
			{ gap: 24 }
		),
		space(20),
		table('credit.items', [
			tcol('Description', '{{item.description}}', 3.4),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'right'),
			tcol('Unit price', '{{item.price | money}}', 1.2, 'right'),
			tcol('Credit', '{{item.amount | money}}', 1.3, 'right'),
		], { headerBg: 'soft', headerColor: 'dark', lineColor: 'line', lines: 'rows', emptyText: 'No lines', pad: 7 }),
		space(14),
		hrow(
			[
				box([cap('How it’s settled'), text('{{credit.settlement | default:"Taken off your next invoice"}}', { size: 9.5 }), m('{{credit.notes}}', { mt: 6 })], { pad: 0, grow: 1 }),
				box([fields([row('Subtotal', '{{credit.subtotal | money}}'), row('Tax', '{{credit.tax | money}}'), row('Total credit', '{{credit.total | money}}', { bar: true })], { align: 'right', hideEmpty: true, gap: 4 }), m('{{credit.total | words}}', { align: 'right', italic: true, mt: 6 })], { pad: 0, basis: 220 }),
			],
			{ gap: 24 }
		),
		fillSpace(),
		signatures(['Authorised signature']),
	],
	footer: pageFooter(),
	slots: [
		s('credit.number', 'Credit note number'),
		s('credit.date', 'Date', 'date'),
		s('credit.invoice.number', 'Invoice it adjusts (number)'),
		...party('credit', 'customer', 'Customer').slice(0, 3),
		s('credit.reason', 'Reason'),
		s('credit.items', 'Lines credited', 'list', ITEMS),
		s('credit.subtotal', 'Subtotal', 'number'),
		s('credit.tax', 'Tax', 'number'),
		s('credit.total', 'Total credit', 'number'),
		s('credit.settlement', 'How it’s settled'),
		s('credit.notes', 'Notes'),
	],
	sample: {
		credit: {
			number: 'CN-2026-0009',
			date: '2026-10-13',
			invoice: { number: 'INV-2026-0042' },
			customer: CUSTOMER,
			reason: 'Six product photos were re-shot at our cost, and one training session was cancelled.',
			items: [
				{ description: 'Product photography (per product) — re-shoot', quantity: 6, price: 650, amount: 3900 },
				{ description: 'Training session for the shop team', quantity: 1, price: 3500, amount: 3500 },
			],
			subtotal: 7400,
			tax: 1110,
			total: 8510,
			settlement: 'Taken off the balance of INV-2026-0042',
			notes: 'Sorry for the trouble — thank you for your patience.',
		},
		business: BUSINESS,
	},
};

/* ------------------------------------------------------------- statement */

const statement = {
	key: 'statement-account',
	name: 'Statement of account',
	description: 'A customer’s account over a period: opening balance, every invoice and payment with a running balance, and what’s owed now.',
	kind: 'statement',
	alias: 'statement',
	page: PAGE,
	style: look('indigo', 'modern'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('Statement', { font: 'heading', size: 24, weight: 700, align: 'right', mb: 6 }), fields([row('Date', '{{statement.date | date}}'), row('From', '{{statement.from | date}}'), row('To', '{{statement.to | date}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true })], { pad: 0, basis: 190 })]),
		space(18),
		hrow(
			[
				box([cap('Account of'), text('{{statement.customer.name}}', { size: 11, weight: 600, mb: 2 }), m('{{statement.customer.address}}'), m('{{statement.customer.email}}')], { pad: 0, grow: 1 }),
				box([cap('Opening'), text('{{statement.opening | money}}', { size: 11, weight: 600 })], { bg: 'soft', pad: 10, radius: 4, basis: 105 }),
				box([cap('Amount due', { color: 'onAccent' }), text('{{statement.closing | money}}', { size: 13, weight: 700, color: 'onAccent' })], { bg: 'accent', pad: 10, radius: 4, basis: 125 }),
			],
			{ gap: 10, valign: 'middle' }
		),
		space(18),
		table('statement.entries', [
			tcol('Date', '{{item.date | date}}', 1.15),
			tcol('Details', '{{item.description}}', 2.2),
			tcol('Ref.', '{{item.reference}}', 1.35),
			tcol('Debit', '{{item.debit | money}}', 1, 'right'),
			tcol('Credit', '{{item.credit | money}}', 1, 'right'),
			tcol('Balance', '{{item.balance | money}}', 1.1, 'right'),
		], { headerBg: 'soft', headerColor: 'dark', lineColor: 'line', zebra: true, lines: 'none', size: 9, emptyText: 'Nothing in this period', pad: 6 }),
		space(12),
		hrow([fillSpace(), box([fields([row('Opening balance', '{{statement.opening | money}}'), row('Invoiced', '{{statement.debits | money}}'), row('Paid', '{{statement.credits | money}}'), row('Amount due', '{{statement.closing | money}}', { bar: true })], { align: 'right', gap: 4 })], { pad: 0, basis: 230 })]),
		space(16),
		m('{{statement.notes}}'),
		fillSpace(),
		box([cap('How to pay'), text('{{business.note}}', { size: 9 })], { border: 0.75, borderColor: 'line', pad: 12, radius: 6 }),
		m('Please tell us within 15 days if anything here looks wrong.', { italic: true, mt: 8 }),
	],
	footer: pageFooter(),
	slots: [
		s('statement.date', 'Statement date', 'date'),
		s('statement.from', 'Period from', 'date'),
		s('statement.to', 'Period to', 'date'),
		...party('statement', 'customer', 'Customer').slice(0, 3),
		s('statement.opening', 'Opening balance', 'number'),
		s('statement.entries', 'Entries', 'list', [s('item.date', 'Date', 'date'), s('item.description', 'Details'), s('item.reference', 'Reference'), s('item.debit', 'Debit (invoiced)', 'number'), s('item.credit', 'Credit (paid)', 'number'), s('item.balance', 'Running balance', 'number')]),
		s('statement.debits', 'Total invoiced', 'number'),
		s('statement.credits', 'Total paid', 'number'),
		s('statement.closing', 'Closing balance', 'number'),
		s('statement.notes', 'Notes'),
	],
	sample: {
		statement: {
			date: '2026-10-13',
			from: '2026-09-01',
			to: '2026-09-30',
			customer: CUSTOMER,
			opening: 12500,
			entries: [
				{ date: '2026-09-03', description: 'Payment received — thank you', reference: 'RCT-0098', credit: 12500, balance: 0 },
				{ date: '2026-09-08', description: 'Invoice — product photography', reference: 'INV-2026-0036', debit: 15600, balance: 15600 },
				{ date: '2026-09-15', description: 'Invoice — hosting, 12 months', reference: 'INV-2026-0038', debit: 9600, balance: 25200 },
				{ date: '2026-09-21', description: 'Payment received — bKash', reference: 'RCT-0103', credit: 15600, balance: 9600 },
				{ date: '2026-09-28', description: 'Invoice — website design', reference: 'INV-2026-0041', debit: 45000, balance: 54600 },
			],
			debits: 70200,
			credits: 28100,
			closing: 54600,
			notes: 'INV-2026-0041 is due on 12 October.',
		},
		business: BUSINESS,
	},
};

/* --------------------------------------------------------------- payslip */

const LINE: Slot[] = [s('item.name', 'Name'), s('item.amount', 'Amount', 'number')];
const payslip = {
	key: 'payslip-standard',
	name: 'Payslip',
	description: 'A month’s pay: the employee’s details, earnings and deductions side by side, and the net pay in figures and words.',
	kind: 'payslip',
	alias: 'payslip',
	page: PAGE,
	style: look('navy', 'corporate'),
	header: [],
	body: [
		hrow([businessBlock({ grow: 1 }), box([text('Payslip', { font: 'heading', size: 24, weight: 700, color: 'accent', align: 'right', mb: 4 }), text('{{payslip.period}}', { size: 11, weight: 600, align: 'right' }), m('Paid on {{payslip.payDate | date}}', { align: 'right' })], { pad: 0, basis: 190 })]),
		space(18),
		box(
			[
				cols([
					col([fields([row('Employee', '**{{payslip.employee.name}}**'), row('Employee ID', '{{payslip.employee.code}}'), row('Designation', '{{payslip.employee.designation}}')], { labelWidth: 0.4, hideEmpty: true, gap: 3 })]),
					col([fields([row('Department', '{{payslip.employee.department}}'), row('Joined', '{{payslip.employee.joined | date}}'), row('Paid to', '{{payslip.account}}')], { labelWidth: 0.35, hideEmpty: true, gap: 3 })]),
				], { gap: 20 }),
			],
			{ bg: 'soft', pad: 14, radius: 4 }
		),
		space(18),
		hrow(
			[
				box([table('payslip.earnings', [tcol('Earnings', '{{item.name}}', 2), tcol('Amount', '{{item.amount | money}}', 1, 'right')], { headerBg: 'accent', headerColor: 'onAccent', lineColor: 'line', lines: 'rows', emptyText: '—', pad: 6 }), space(6), fields([row('Gross earnings', '{{payslip.gross | money}}', { bold: true })], { align: 'right' })], { pad: 0, grow: 1 }),
				box([table('payslip.deductions', [tcol('Deductions', '{{item.name}}', 2), tcol('Amount', '{{item.amount | money}}', 1, 'right')], { headerBg: 'dark', headerColor: 'onAccent', lineColor: 'line', lines: 'rows', emptyText: 'None', pad: 6 }), space(6), fields([row('Total deductions', '{{payslip.totalDeductions | money}}', { bold: true })], { align: 'right' })], { pad: 0, grow: 1 }),
			],
			{ gap: 16 }
		),
		space(18),
		box([hrow([box([text('Net pay', { size: 10, weight: 600, color: 'onAccent' }), text('{{payslip.net | words}}', { size: 8.5, italic: true, color: 'onAccent' })], { pad: 0, grow: 1 }), text('{{payslip.net | money}}', { font: 'heading', size: 20, weight: 700, color: 'onAccent' })], { valign: 'middle' })], { bg: 'accent', padX: 16, padY: 12, radius: 4 }),
		space(12),
		hrow([m('Working days: **{{payslip.workDays}}**'), m('Days present: **{{payslip.present}}**'), m('Leave taken: **{{payslip.leave}}**')], { gap: 24 }),
		fillSpace(),
		m('This payslip is computer-generated. Please keep it private.', { italic: true, mb: 22 }),
		signatures(['Employee’s signature', 'Accounts / HR']),
	],
	footer: pageFooter(),
	slots: [
		s('payslip.number', 'Payslip number'),
		s('payslip.period', 'Pay period (e.g. September 2026)'),
		s('payslip.payDate', 'Pay date', 'date'),
		s('payslip.employee.name', 'Employee name'),
		s('payslip.employee.code', 'Employee ID'),
		s('payslip.employee.designation', 'Designation'),
		s('payslip.employee.department', 'Department'),
		s('payslip.employee.joined', 'Joining date', 'date'),
		s('payslip.account', 'Bank account / wallet'),
		s('payslip.earnings', 'Earnings', 'list', LINE),
		s('payslip.deductions', 'Deductions', 'list', LINE),
		s('payslip.gross', 'Gross earnings', 'number'),
		s('payslip.totalDeductions', 'Total deductions', 'number'),
		s('payslip.net', 'Net pay', 'number'),
		s('payslip.workDays', 'Working days', 'number'),
		s('payslip.present', 'Days present', 'number'),
		s('payslip.leave', 'Leave taken', 'number'),
	],
	sample: {
		payslip: {
			number: 'PS-2026-09-014',
			period: 'September 2026',
			payDate: '2026-10-01',
			employee: { name: 'Farhana Akter', code: 'NW-014', designation: 'Senior Designer', department: 'Design', joined: '2023-02-15' },
			account: 'City Bank ···· 4471',
			earnings: [
				{ name: 'Basic salary', amount: 45000 },
				{ name: 'House rent', amount: 22500 },
				{ name: 'Medical allowance', amount: 4500 },
				{ name: 'Transport', amount: 3000 },
				{ name: 'Overtime (6 hrs)', amount: 2800 },
			],
			deductions: [
				{ name: 'Income tax (TDS)', amount: 2600 },
				{ name: 'Provident fund', amount: 4500 },
				{ name: 'Advance repayment', amount: 2000 },
			],
			gross: 77800,
			totalDeductions: 9100,
			net: 68700,
			workDays: 22,
			present: 21,
			leave: 1,
		},
		business: BUSINESS,
	},
};

/* ---------------------------------------------------------- certificates */

const CERT_PAGE = { size: 'A4', orientation: 'landscape', margin: [28, 28, 28, 28] };
const certSlots: Slot[] = [
	s('certificate.number', 'Certificate number'),
	s('certificate.recipient', 'Awarded to (name)'),
	s('certificate.title', 'For (course, programme or achievement)'),
	s('certificate.description', 'Description'),
	s('certificate.date', 'Date', 'date'),
	s('certificate.signer.name', 'Signed by (name)'),
	s('certificate.signer.title', 'Signer’s title'),
];
const certSample = (p: Record<string, any> = {}) => ({
	certificate: {
		number: 'NW-CERT-2026-0142',
		recipient: 'Farhana Akter',
		title: 'Advanced Brand Design',
		description: 'for completing the twelve-week programme, 48 hours of studio work and a final brand project, with distinction.',
		date: '2026-10-13',
		signer: { name: 'Tahmid Hasan', title: 'Programme Director' },
		...p,
	},
	business: BUSINESS,
});
// The page's inner height (A4 landscape less the margins) — the frame fills it.
const CERT_H = 595.28 - 56 - 1;

const certificateCompletion = {
	key: 'certificate-completion',
	name: 'Certificate of completion',
	description: 'Landscape, with a double frame, the name large in a serif, what it was for, the date and two signatures.',
	kind: 'certificate',
	alias: 'certificate',
	page: CERT_PAGE,
	style: look('navy', 'classic', { size: 11 }),
	header: [],
	body: [
		box(
			[
				box(
					[
						fillSpace(),
						image('{{business.logo}}', { height: 40, align: 'center', mb: 10 }),
						text('{{business.name}}', { font: 'heading', size: 12, align: 'center', upper: true, spacing: 3, color: 'muted', mb: 14 }),
						text('Certificate of Completion', { font: 'heading', size: 34, align: 'center', color: 'accent', mb: 16 }),
						text('This is to certify that', { size: 11, italic: true, align: 'center', color: 'muted', mb: 8 }),
						text('{{certificate.recipient}}', { font: 'heading', size: 36, weight: 600, align: 'center', mb: 4 }),
						hrow([fillSpace(), box([line({ color: 'line', thickness: 1 })], { pad: 0, basis: 320 }), fillSpace()], { mb: 12 }),
						text('has successfully completed', { size: 11, italic: true, align: 'center', color: 'muted', mb: 4 }),
						text('{{certificate.title}}', { font: 'heading', size: 18, weight: 600, align: 'center', color: 'dark', mb: 6 }),
						hrow([fillSpace(), box([text('{{certificate.description}}', { size: 10, align: 'center', color: 'muted' })], { pad: 0, basis: 440 }), fillSpace()]),
						fillSpace(),
						hrow(
							[
								box([text('{{certificate.date | date}}', { align: 'center', mb: 3 }), line({ color: 'text', mb: 4 }), text('Date', { size: 8.5, color: 'muted', align: 'center' })], { pad: 0, basis: 170 }),
								fillSpace(),
								box([text('No. {{certificate.number}}', { size: 8, color: 'muted', align: 'center' })], { pad: 0, basis: 170 }),
								fillSpace(),
								box([text('{{certificate.signer.name}}', { align: 'center', mb: 3 }), line({ color: 'text', mb: 4 }), text('{{certificate.signer.title}}', { size: 8.5, color: 'muted', align: 'center' })], { pad: 0, basis: 170 }),
							],
							{ valign: 'bottom' }
						),
					],
					{ border: 0.75, borderColor: 'accent', padX: 48, padY: 30, grow: 1 }
				),
			],
			{ border: 3, borderColor: 'accent', pad: 6, height: CERT_H }
		),
	],
	footer: [],
	slots: certSlots,
	sample: certSample(),
};

const certificateAppreciation = {
	key: 'certificate-appreciation',
	name: 'Certificate of appreciation',
	description: 'Landscape and modern: a coloured panel down the left with the award’s name, the person’s name large on the right — for staff, volunteers and partners.',
	kind: 'certificate',
	alias: 'certificate',
	page: { ...CERT_PAGE, margin: [0, 0, 0, 0] },
	style: look('plum', 'elegant', { size: 11 }),
	header: [],
	body: [
		hrow(
			[
				box(
					[
						image('{{business.logo}}', { height: 36, mb: 18 }),
						text('Certificate', { font: 'heading', size: 30, color: 'onAccent' }),
						text('of Appreciation', { font: 'heading', size: 22, italic: true, color: 'onAccent', mb: 18 }),
						box([], { bg: 'onAccent', pad: 0, height: 2, mb: 18 }),
						text('{{business.name}}', { size: 10, weight: 600, upper: true, spacing: 2, color: 'onAccent' }),
						fillSpace(),
						text('No. {{certificate.number}}', { size: 8, color: 'onAccent' }),
					],
					{ bg: 'accent', padX: 36, padY: 44, basis: 260 }
				),
				box(
					[
						fillSpace(),
						text('Presented to', { size: 11, upper: true, spacing: 3, color: 'muted', mb: 10 }),
						text('{{certificate.recipient}}', { font: 'heading', size: 38, weight: 600, color: 'dark', mb: 14 }),
						hrow([box([], { bg: 'accent', pad: 0, height: 3, basis: 60 }), fillSpace()], { mb: 16 }),
						text('In grateful recognition of', { size: 10.5, italic: true, color: 'muted', mb: 4 }),
						text('{{certificate.title}}', { font: 'heading', size: 17, weight: 600, mb: 8 }),
						text('{{certificate.description}}', { size: 10, color: 'muted', lineHeight: 1.6 }),
						fillSpace(),
						hrow(
							[
								box([text('{{certificate.date | date}}', { mb: 3 }), line({ color: 'text', mb: 4 }), text('Date', { size: 8.5, color: 'muted' })], { pad: 0, basis: 160 }),
								fillSpace(),
								box([text('{{certificate.signer.name}}', { mb: 3 }), line({ color: 'text', mb: 4 }), text('{{certificate.signer.title}}', { size: 8.5, color: 'muted' })], { pad: 0, basis: 180 }),
							],
							{ valign: 'bottom' }
						),
					],
					{ padX: 48, padY: 44, grow: 1 }
				),
			],
			{ gap: 0, valign: 'stretch', height: 595.28 - 1 }
		),
	],
	footer: [],
	slots: certSlots,
	sample: certSample({ title: 'Five years with Northwind Studio', description: 'Thank you for the care, craft and kindness you have brought to every project and every colleague since 2021.' }),
};

/* --------------------------------------------------------------- voucher */

const paymentVoucher = {
	key: 'voucher-payment',
	name: 'Payment voucher',
	description: 'The debit voucher for the books (half A4): paid to, the account head, amount in figures and words, how it was paid, and four signatures.',
	kind: 'voucher',
	alias: 'voucher',
	page: { size: 'A5', orientation: 'landscape', margin: [26, 30, 26, 30] },
	style: look('graphite', 'corporate', { size: 9.5 }),
	header: [],
	body: [
		hrow([box([text('{{business.name}}', { font: 'heading', size: 13, weight: 700 }), m('{{business.address}}', { size: 8 })], { pad: 0, grow: 1 }), box([text('PAYMENT VOUCHER', { size: 11, weight: 700, color: 'onAccent', spacing: 1.5, align: 'center' })], { bg: 'dark', padX: 10, padY: 5 })], { valign: 'middle' }),
		space(10),
		hrow([text('Voucher no. **{{voucher.number}}**'), fillSpace(), text('Date: **{{voucher.date | date}}**')]),
		space(8),
		table('voucher.lines', [
			tcol('Account head', '{{item.account}}', 1.4),
			tcol('Particulars', '{{item.description}}', 2.6),
			tcol('Amount', '{{item.amount | money}}', 1, 'right'),
		], { headerBg: 'soft', lineColor: 'text', lines: 'grid', emptyText: '—', pad: 5 }),
		hrow([text('In words: {{voucher.amount | words}}', { size: 8.5, italic: true, grow: 1 }), text('Total  **{{voucher.amount | money}}**', { size: 10.5 })], { mt: 5, valign: 'middle' }),
		space(8),
		fields([row('Paid to', '**{{voucher.payee}}**'), row('Paid by', '{{voucher.method}}   {{voucher.reference}}')], { labelWidth: 0.16, hideEmpty: true, gap: 3 }),
		fillSpace(),
		signatures(['Prepared by', 'Checked by', 'Approved by', 'Received by'], { gap: 18, mt: 24 }),
	],
	footer: [],
	slots: [
		s('voucher.number', 'Voucher number'),
		s('voucher.date', 'Date', 'date'),
		s('voucher.payee', 'Paid to'),
		s('voucher.amount', 'Total amount', 'number'),
		s('voucher.method', 'Paid by (cash, cheque, bank…)'),
		s('voucher.reference', 'Cheque / transaction no.'),
		s('voucher.lines', 'Lines', 'list', [s('item.account', 'Account head'), s('item.description', 'Particulars'), s('item.amount', 'Amount', 'number')]),
	],
	sample: {
		voucher: {
			number: 'PV-2026-0388',
			date: '2026-10-13',
			payee: 'Delta Packaging Co.',
			amount: 55918,
			method: 'Cheque',
			reference: 'City Bank chq. 0042117',
			lines: [
				{ account: 'Packaging materials', description: 'Against PO-2026-0153 — boxes, tape, stickers', amount: 50900 },
				{ account: 'VAT (input)', description: 'VAT on the above', amount: 3818 },
				{ account: 'Freight inward', description: 'Delivery to Tejgaon warehouse', amount: 1200 },
			],
		},
		business: BUSINESS,
	},
};

export const MORE_STARTERS = [
	invoiceElegant,
	invoiceProforma,
	invoiceTax,
	receiptModern,
	estimate,
	poStandard,
	poModern,
	challan,
	packingSlip,
	creditNote,
	statement,
	payslip,
	certificateCompletion,
	certificateAppreciation,
	paymentVoucher,
];
