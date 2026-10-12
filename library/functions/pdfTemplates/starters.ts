import { Slot } from './schema.js';

/**
 * The starter templates (docs/pdf-templates D6, D7). They go into the super
 * admin's gallery (scripts/seedPdfTemplates.js, or "Add the built-in
 * starters" on the super admin's PDF templates page), where they can be
 * edited like any template; with nothing published there, the gallery shows
 * these. Each declares its data as slots — what it prints, under its own
 * alias — which are matched to a page's fields when a project uses it.
 */

/* Small builders, so a starter reads like its layout. */
const text = (t: string, p: Record<string, any> = {}) => ({ type: 'text', text: t, ...p });
const fields = (rows: any[], p: Record<string, any> = {}) => ({ type: 'fields', rows, ...p });
const row = (label: string, value: string, p: Record<string, any> = {}) => ({ label, value, ...p });
const cols = (columns: any[], p: Record<string, any> = {}) => ({ type: 'columns', columns, ...p });
const col = (blocks: any[], width = 1, p: Record<string, any> = {}) => ({ blocks, width, ...p });
const box = (blocks: any[], p: Record<string, any> = {}) => ({ type: 'box', blocks, ...p });
const space = (height: number) => ({ type: 'spacer', height });
const line = (p: Record<string, any> = {}) => ({ type: 'divider', ...p });
const image = (src: string, p: Record<string, any> = {}) => ({ type: 'image', src, ...p });
const table = (rows: string, columns: any[], p: Record<string, any> = {}) => ({ type: 'table', rows, columns, ...p });
const tcol = (header: string, value: string, width = 1, align = 'left') => ({ header, value, width, align });

const PAGE = { size: 'A4', orientation: 'portrait', margin: [42, 42, 42, 42] };
const muted = (t: string, p: Record<string, any> = {}) => text(t, { size: 8.5, color: '#6b7280', ...p });
const label = (t: string, p: Record<string, any> = {}) => text(t, { size: 7.5, weight: 600, color: '#6b7280', upper: true, spacing: 0.8, mb: 3, ...p });

const footer = [
	line({ mb: 6 }),
	cols([
		col([muted('{{business.name}}  ·  {{business.website}}', { size: 7.5 })], 3),
		col([muted('Page {{page}} of {{pages}}', { size: 7.5, align: 'right' })], 1),
	]),
];

/* ---------------------------------------------------------------- slots */

const ITEM_SLOTS: Slot[] = [
	{ token: 'item.description', label: 'Description', type: 'text' },
	{ token: 'item.quantity', label: 'Quantity', type: 'number' },
	{ token: 'item.price', label: 'Unit price', type: 'number' },
	{ token: 'item.amount', label: 'Line amount', type: 'number' },
];

const invoiceSlots = (a: string): Slot[] => [
	{ token: `${a}.number`, label: 'Number', type: 'text' },
	{ token: `${a}.date`, label: 'Date', type: 'date' },
	{ token: `${a}.dueDate`, label: 'Due date', type: 'date' },
	{ token: `${a}.status`, label: 'Status', type: 'text' },
	{ token: `${a}.customer.name`, label: 'Customer name', type: 'text' },
	{ token: `${a}.customer.address`, label: 'Customer address', type: 'text' },
	{ token: `${a}.customer.email`, label: 'Customer email', type: 'text' },
	{ token: `${a}.customer.phone`, label: 'Customer phone', type: 'text' },
	{ token: `${a}.items`, label: 'Line items', type: 'list', of: ITEM_SLOTS },
	{ token: `${a}.subtotal`, label: 'Subtotal', type: 'number' },
	{ token: `${a}.discount`, label: 'Discount', type: 'number' },
	{ token: `${a}.tax`, label: 'Tax / VAT', type: 'number' },
	{ token: `${a}.total`, label: 'Total', type: 'number' },
	{ token: `${a}.paid`, label: 'Amount paid', type: 'number' },
	{ token: `${a}.due`, label: 'Balance due', type: 'number' },
	{ token: `${a}.notes`, label: 'Notes', type: 'text' },
];

const receiptSlots: Slot[] = [
	{ token: 'receipt.number', label: 'Receipt number', type: 'text' },
	{ token: 'receipt.date', label: 'Date', type: 'date' },
	{ token: 'receipt.customer.name', label: 'Received from', type: 'text' },
	{ token: 'receipt.amount', label: 'Amount', type: 'number' },
	{ token: 'receipt.method', label: 'Payment method', type: 'text' },
	{ token: 'receipt.reference', label: 'Reference / transaction ID', type: 'text' },
	{ token: 'receipt.invoice.number', label: 'For invoice (number)', type: 'text' },
	{ token: 'receipt.notes', label: 'Notes', type: 'text' },
];

/* --------------------------------------------------------------- samples */

const ITEMS = [
	{ description: 'Website design — home, shop and checkout pages', quantity: 1, price: 45000, amount: 45000 },
	{ description: 'Product photography (per product)', quantity: 24, price: 650, amount: 15600 },
	{ description: 'Hosting, 12 months', quantity: 1, price: 9600, amount: 9600 },
	{ description: 'Training session for the shop team', quantity: 2, price: 3500, amount: 7000 },
];
const invoiceSample = (a: string) => ({
	[a]: {
		number: a === 'bill' ? 'BILL-0042' : 'INV-2026-0042',
		date: '2026-10-13',
		dueDate: '2026-10-27',
		status: 'due',
		customer: { name: 'Rahman Traders Ltd.', address: 'House 12, Road 5, Dhanmondi\nDhaka 1205', email: 'accounts@rahmantraders.com', phone: '+880 1711 000000' },
		items: ITEMS,
		subtotal: 77200,
		discount: 2200,
		tax: 11250,
		total: 86250,
		paid: 30000,
		due: 56250,
		notes: 'Please pay by bank transfer within 14 days. Thank you for your business.',
	},
	business: {
		name: 'Northwind Studio',
		address: 'Level 4, 22 Gulshan Avenue, Dhaka 1212',
		phone: '+880 1800 000000',
		email: 'hello@northwind.studio',
		website: 'northwind.studio',
		taxId: 'BIN 000123456-0101',
		note: 'Bank: City Bank · A/C 1234 5678 9012 · Routing 225261725',
	},
});
const receiptSample = {
	receipt: {
		number: 'RCT-0107',
		date: '2026-10-13',
		customer: { name: 'Rahman Traders Ltd.' },
		amount: 30000,
		method: 'Bank transfer',
		reference: 'TXN 88412093',
		invoice: { number: 'INV-2026-0042' },
		notes: 'Part payment against the October invoice.',
	},
	business: invoiceSample('invoice').business,
};

/* -------------------------------------------------------------- starters */

const invoiceClassic = {
	key: 'invoice-classic',
	name: 'Invoice — Classic',
	description: 'Logo and business details on the left, the invoice number and dates on the right, a dark-headed items table and a totals stack ending in the balance due.',
	kind: 'invoice',
	alias: 'invoice',
	page: PAGE,
	style: { font: 'sans', size: 9.5, color: '#111827', muted: '#6b7280', accent: '#111827', lineHeight: 1.4 },
	header: [],
	body: [
		cols([
			col([
				image('{{business.logo}}', { height: 34, mb: 8 }),
				text('{{business.name}}', { size: 12.5, weight: 600, mb: 2 }),
				muted('{{business.address}}'),
				muted('{{business.phone}}   {{business.email}}'),
			], 1.4),
			col([
				text('INVOICE', { size: 26, weight: 700, align: 'right', spacing: 1.5, mb: 6 }),
				fields([row('Invoice no.', '{{invoice.number}}', { bold: true }), row('Date', '{{invoice.date | date}}'), row('Due', '{{invoice.dueDate | date}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true }),
			]),
		]),
		space(22),
		cols([
			col([
				box([
					label('Bill to'),
					text('{{invoice.customer.name}}', { size: 11, weight: 600, mb: 2 }),
					muted('{{invoice.customer.address}}'),
					muted('{{invoice.customer.email}}   {{invoice.customer.phone}}'),
				], { bg: '#f6f7f9', pad: 12, radius: 4 }),
			], 1.4),
			col([
				label('Balance due', { align: 'right' }),
				text('{{invoice.due | money}}', { size: 20, weight: 700, align: 'right' }),
				muted('Status: {{invoice.status | upper}}', { align: 'right', mt: 2 }),
			], 1, { valign: 'middle' }),
		]),
		space(20),
		table('invoice.items', [
			tcol('#', '{{index}}', 0.35),
			tcol('Description', '{{item.description}}', 3.2),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'right'),
			tcol('Unit price', '{{item.price | money}}', 1.2, 'right'),
			tcol('Amount', '{{item.amount | money}}', 1.3, 'right'),
		], { headerBg: '#111827', headerColor: '#ffffff', lines: 'rows', emptyText: 'No items', pad: 6 }),
		space(14),
		cols([
			col([
				label('Notes'),
				text('{{invoice.notes}}', { size: 9 }),
				muted('In words: {{invoice.total | words}}', { mt: 8, italic: true }),
			], 1.3),
			col([
				fields([
					row('Subtotal', '{{invoice.subtotal | money}}'),
					row('Discount', '{{invoice.discount | money}}'),
					row('Tax', '{{invoice.tax | money}}'),
					row('Total', '{{invoice.total | money}}', { bold: true, line: true }),
					row('Paid', '{{invoice.paid | money}}'),
					row('Balance due', '{{invoice.due | money}}', { bar: true }),
				], { align: 'right', labelWidth: 0.5, hideEmpty: true, gap: 4 }),
			]),
		]),
		space(26),
		muted('{{business.note}}'),
		space(30),
		cols([col([]), col([line({ color: '#111827', mb: 4 }), muted('Authorised signature', { align: 'center' })], 0.8)]),
	],
	footer,
	slots: invoiceSlots('invoice'),
	sample: invoiceSample('invoice'),
};

const invoiceModern = {
	key: 'invoice-modern',
	name: 'Invoice — Modern',
	description: 'A coloured band with the business name, light zebra rows and a bold total — change the accent colour to your brand’s.',
	kind: 'invoice',
	alias: 'invoice',
	page: PAGE,
	style: { font: 'sans', size: 9.5, color: '#0f172a', muted: '#64748b', accent: '#4f46e5', lineHeight: 1.45 },
	header: [],
	body: [
		box([
			cols([
				col([text('{{business.name}}', { size: 16, weight: 700, color: '#ffffff' }), text('{{business.website}}', { size: 8.5, color: '#c7d2fe' })], 2, { valign: 'middle' }),
				col([text('Invoice', { size: 22, weight: 600, color: '#ffffff', align: 'right' })], 1, { valign: 'middle' }),
			]),
		], { bg: '#4f46e5', pad: 18, radius: 6 }),
		space(20),
		cols([
			col([label('Billed to'), text('{{invoice.customer.name}}', { size: 11, weight: 600, mb: 2 }), muted('{{invoice.customer.address}}'), muted('{{invoice.customer.email}}')], 1.2),
			col([label('Invoice no.'), text('{{invoice.number}}', { weight: 600 }), label('Issued', { mt: 8 }), text('{{invoice.date | date}}')]),
			col([label('Due'), text('{{invoice.dueDate | date}}', { weight: 600 }), label('Amount due', { mt: 8 }), text('{{invoice.due | money}}', { weight: 700, color: '#4f46e5' })]),
		]),
		space(22),
		table('invoice.items', [
			tcol('Item', '{{item.description}}', 3.4),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'right'),
			tcol('Rate', '{{item.price | money}}', 1.2, 'right'),
			tcol('Amount', '{{item.amount | money}}', 1.3, 'right'),
		], { headerBg: '#eef2ff', headerColor: '#3730a3', zebra: true, lines: 'none', emptyText: 'No items', pad: 7 }),
		space(16),
		cols([
			col([box([label('Payment details'), text('{{business.note}}', { size: 9 }), muted('{{invoice.notes}}', { mt: 6 })], { border: 0.75, borderColor: '#e2e8f0', pad: 12, radius: 6 })], 1.2),
			col([
				fields([
					row('Subtotal', '{{invoice.subtotal | money}}'),
					row('Discount', '{{invoice.discount | money}}'),
					row('VAT', '{{invoice.tax | money}}'),
					row('Total', '{{invoice.total | money}}', { big: true, line: true }),
				], { align: 'right', hideEmpty: true, gap: 5 }),
			]),
		]),
	],
	footer,
	slots: invoiceSlots('invoice'),
	sample: invoiceSample('invoice'),
};

const bill = {
	key: 'bill-standard',
	name: 'Bill',
	description: 'A centred BILL heading, serial-numbered lines, the total in words and two signatures — the layout shops and agencies hand over in Bangladesh.',
	kind: 'bill',
	alias: 'bill',
	page: PAGE,
	style: { font: 'sans', size: 9.5, color: '#111111', muted: '#555555', accent: '#111111', lineHeight: 1.4 },
	header: [],
	body: [
		cols([
			col([image('{{business.logo}}', { height: 40 })], 1, { valign: 'middle' }),
			col([text('{{business.name}}', { size: 15, weight: 700, align: 'center' }), muted('{{business.address}}', { align: 'center' }), muted('{{business.phone}}  ·  {{business.email}}', { align: 'center' })], 3),
			col([], 1),
		]),
		space(10),
		line({ color: '#111111', thickness: 1.2 }),
		space(10),
		text('BILL', { size: 18, weight: 700, align: 'center', spacing: 4, mb: 12 }),
		cols([
			col([fields([row('To', '**{{bill.customer.name}}**'), row('Address', '{{bill.customer.address}}'), row('Phone', '{{bill.customer.phone}}')], { labelWidth: 0.22, hideEmpty: true })], 1.5),
			col([fields([row('Bill no.', '{{bill.number}}', { bold: true }), row('Date', '{{bill.date | date}}'), row('Due', '{{bill.dueDate | date}}')], { align: 'right', labelWidth: 0.45, hideEmpty: true })]),
		]),
		space(16),
		table('bill.items', [
			tcol('SL', '{{index}}', 0.4, 'center'),
			tcol('Description', '{{item.description}}', 3.2),
			tcol('Qty', '{{item.quantity | number}}', 0.6, 'center'),
			tcol('Rate', '{{item.price | number:2}}', 1.1, 'right'),
			tcol('Amount', '{{item.amount | number:2}}', 1.2, 'right'),
		], { headerBg: '#f1f1f1', lines: 'grid', emptyText: 'No items', pad: 6 }),
		cols([
			col([], 1.3),
			col([
				fields([
					row('Subtotal', '{{bill.subtotal | money}}'),
					row('Discount', '{{bill.discount | money}}'),
					row('VAT', '{{bill.tax | money}}'),
					row('Grand total', '{{bill.total | money}}', { bold: true, line: true }),
					row('Paid', '{{bill.paid | money}}'),
					row('Due', '{{bill.due | money}}', { bold: true }),
				], { align: 'right', hideEmpty: true, gap: 4 }),
			]),
		], { mt: 8 }),
		space(10),
		text('**In words:** {{bill.total | words}}', { size: 9.5 }),
		muted('{{bill.notes}}', { mt: 6 }),
		space(56),
		cols([
			col([line({ color: '#111111', mb: 4 }), muted('Received by', { align: 'center' })], 1),
			col([], 1.2),
			col([line({ color: '#111111', mb: 4 }), muted('For {{business.name}}', { align: 'center' })], 1),
		]),
	],
	footer: [cols([col([muted('Thank you for your business.', { size: 7.5 })], 3), col([muted('Page {{page}} of {{pages}}', { size: 7.5, align: 'right' })])])],
	slots: invoiceSlots('bill'),
	sample: invoiceSample('bill'),
};

const receipt = {
	key: 'receipt-standard',
	name: 'Receipt',
	description: 'Money received: who paid, the amount large and in words, how it was paid and what it was for, with a signature.',
	kind: 'receipt',
	alias: 'receipt',
	page: PAGE,
	style: { font: 'sans', size: 10, color: '#111827', muted: '#6b7280', accent: '#059669', lineHeight: 1.45 },
	header: [],
	body: [
		cols([
			col([image('{{business.logo}}', { height: 32, mb: 6 }), text('{{business.name}}', { size: 12.5, weight: 600 }), muted('{{business.address}}'), muted('{{business.phone}}   {{business.email}}')], 1.4),
			col([text('RECEIPT', { size: 24, weight: 700, align: 'right', spacing: 1.5, color: '#059669', mb: 6 }), fields([row('Receipt no.', '{{receipt.number}}', { bold: true }), row('Date', '{{receipt.date | date}}')], { align: 'right', labelWidth: 0.5 })]),
		]),
		space(26),
		box([
			muted('Received with thanks from', { size: 9 }),
			text('{{receipt.customer.name}}', { size: 14, weight: 600, mb: 12 }),
			muted('the sum of', { size: 9 }),
			text('{{receipt.amount | money}}', { size: 28, weight: 700, color: '#059669' }),
			muted('{{receipt.amount | words}}', { italic: true, size: 9.5 }),
		], { border: 1, borderColor: '#a7f3d0', bg: '#f0fdf4', pad: 18, radius: 8 }),
		space(18),
		fields([
			row('Paid by', '{{receipt.method}}'),
			row('Reference', '{{receipt.reference}}'),
			row('For invoice', '{{receipt.invoice.number}}'),
			row('Note', '{{receipt.notes}}'),
		], { labelWidth: 0.25, hideEmpty: true, gap: 5 }),
		space(60),
		cols([col([]), col([line({ color: '#111827', mb: 4 }), muted('Received by', { align: 'center' })], 0.8)]),
	],
	footer,
	slots: receiptSlots,
	sample: receiptSample,
};

const receiptCompact = {
	key: 'receipt-compact',
	name: 'Receipt — Compact (A5)',
	description: 'Half an A4 sheet: the business, the amount and how it was paid — quick to print and hand over.',
	kind: 'receipt',
	alias: 'receipt',
	page: { size: 'A5', orientation: 'portrait', margin: [30, 30, 30, 30] },
	style: { font: 'sans', size: 9, color: '#111827', muted: '#6b7280', accent: '#111827', lineHeight: 1.4 },
	header: [],
	body: [
		text('{{business.name}}', { size: 13, weight: 700, align: 'center' }),
		muted('{{business.address}}', { align: 'center' }),
		muted('{{business.phone}}', { align: 'center', mb: 10 }),
		line({ dashed: true, color: '#9ca3af', mb: 10 }),
		text('PAYMENT RECEIPT', { size: 11, weight: 600, align: 'center', spacing: 2, mb: 10 }),
		fields([
			row('Receipt no.', '{{receipt.number}}', { bold: true }),
			row('Date', '{{receipt.date | date}}'),
			row('From', '{{receipt.customer.name}}'),
			row('Paid by', '{{receipt.method}}'),
			row('Reference', '{{receipt.reference}}'),
			row('For invoice', '{{receipt.invoice.number}}'),
		], { labelWidth: 0.38, hideEmpty: true, gap: 4 }),
		space(10),
		line({ dashed: true, color: '#9ca3af', mb: 10 }),
		fields([row('Amount', '{{receipt.amount | money}}', { big: true })], { align: 'right', labelWidth: 0.4 }),
		muted('{{receipt.amount | words}}', { align: 'right', italic: true, mt: 2 }),
		space(16),
		muted('Thank you!', { align: 'center' }),
	],
	footer: [],
	slots: receiptSlots,
	sample: receiptSample,
};

export const STARTERS = [invoiceClassic, invoiceModern, bill, receipt, receiptCompact];
