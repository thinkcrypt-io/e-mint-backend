import type { Answers } from './settings.js';

/**
 * The store's pre-built models (docs/ecommerce README §3, EC3): one feature
 * plan, built whole by the installer. Every model is built for every store —
 * the answers only choose what the sidebar shows and how the engine behaves —
 * so turning a feature on later is a switch, never a rebuild.
 *
 * Each model says which of its fields the engine alone writes (`engine`, EC5)
 * and whether its records are made only by the store (`engineOnly`: orders,
 * payments, returns… come from the POS and the order pages, never a plain
 * form). Every field listed here is a core field (EC4): it can't be deleted,
 * renamed or retyped; people add their own beside them.
 */

export type ModelKey =
	| 'outlet'
	| 'category'
	| 'brand'
	| 'taxRate'
	| 'product'
	| 'variant'
	| 'stock'
	| 'movement'
	| 'adjustment'
	| 'transfer'
	| 'customer'
	| 'coupon'
	| 'register'
	| 'shift'
	| 'order'
	| 'payment'
	| 'return'
	| 'credit';

export type ModelSpec = {
	key: ModelKey;
	/** Shown in the sidebar only while this answer is on (null: always). */
	shownWhen: ((a: Answers) => boolean) | null;
	/** Records made only by the store: no plain create, duplicate, import, merge or delete (EC5). */
	engineOnly?: boolean;
	/** Fields only the store writes (EC5): read-only in forms, refused on plain saves. */
	engine: string[];
	/** The store's own page shows it, so its plain table stays out of the sidebar (EC19). */
	ownPage?: string;
	step: any;
};

const opts = (...values: string[]) => values.map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1).replace(/-/g, ' ') }));
const money = (key: string, label: string, extra: any = {}) => ({ key, label, kind: 'number', min: 0, default: 0, ...extra });

export const MOVEMENT_REASONS = ['opening', 'sale', 'cancel', 'return', 'return-damaged', 'adjustment', 'count', 'transfer-out', 'transfer-in', 'receive'];
export const ORDER_STATUSES = ['held', 'open', 'completed', 'cancelled'];
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'partially-refunded', 'refunded'];
export const FULFILMENT = ['unfulfilled', 'fulfilled', 'shipped', 'delivered', 'returned', 'cancelled'];
export const RETURN_STATUSES = ['requested', 'approved', 'received', 'refunded', 'rejected', 'closed'];

/** The models, in the order their links need (targets first). */
export const modelSpecs = (a: Answers): ModelSpec[] => [
	{
		key: 'outlet',
		shownWhen: null,
		engine: [],
		step: {
			name: 'Outlet',
			title: 'Outlets',
			route: 'outlets',
			description: 'Your shops and warehouses — each keeps its own stock',
			rationale: 'Every sale, stock count and transfer happens at an outlet.',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true },
				{ key: 'outletCode', label: 'Code', kind: 'text', required: true, unique: true, helper: 'Short, on receipts and order numbers (MAIN, DHK-1)' },
				{ key: 'kind', label: 'Kind', kind: 'select', options: [{ value: 'store', label: 'Store (sells)' }, { value: 'warehouse', label: 'Warehouse (keeps stock)' }], default: 'store', required: true },
				{ key: 'active', label: 'Active', kind: 'boolean', default: true },
				{ key: 'phone', label: 'Phone', kind: 'text' },
				{ key: 'address', label: 'Address', kind: 'textarea' },
				{ key: 'receiptHeader', label: 'Receipt header', kind: 'textarea', helper: 'Printed at the top of this outlet’s receipts' },
			],
			table: ['name', 'outletCode', 'kind', 'active', 'phone'],
			filters: ['kind', 'active'],
		},
	},
	{
		key: 'category',
		shownWhen: null,
		engine: [],
		step: {
			name: 'Category',
			title: 'Categories',
			route: 'categories',
			description: 'How products are grouped — on the POS too',
			rationale: 'The POS shows products by category.',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true },
				{ key: 'parent', label: 'Parent category', kind: 'reference', ref: 'Category' },
				{ key: 'image', label: 'Image', kind: 'image' },
				{ key: 'sortOrder', label: 'Order on the POS', kind: 'number', default: 0 },
			],
			table: ['name', 'parent', 'sortOrder'],
		},
	},
	{
		key: 'brand',
		shownWhen: x => x.products.brands,
		engine: [],
		step: {
			name: 'Brand',
			title: 'Brands',
			route: 'brands',
			description: 'Who makes the products',
			rationale: 'Products can carry a brand.',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true },
				{ key: 'logo', label: 'Logo', kind: 'image' },
			],
		},
	},
	{
		key: 'taxRate',
		shownWhen: x => x.pos.tax.mode !== 'none',
		engine: [],
		step: {
			name: 'TaxRate',
			title: 'Tax rates',
			route: 'tax-rates',
			description: 'The taxes products are sold with',
			rationale: 'A product may carry its own rate; otherwise the default applies.',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true },
				{ key: 'rate', label: 'Rate (%)', kind: 'number', min: 0, max: 100, required: true },
				{ key: 'isDefault', label: 'Default', kind: 'boolean', default: false },
			],
			table: ['name', 'rate', 'isDefault'],
		},
	},
	{
		key: 'product',
		shownWhen: null,
		engine: ['totalStock'],
		step: {
			name: 'Product',
			title: 'Products',
			route: 'products',
			description: 'What you sell',
			rationale: 'Products are sold through their variants (one, hidden, when variations are off).',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
				{ key: 'status', label: 'Status', kind: 'select', options: opts('active', 'draft', 'archived'), default: 'active', required: true },
				{ key: 'category', label: 'Category', kind: 'reference', ref: 'Category' },
				{ key: 'brand', label: 'Brand', kind: 'reference', ref: 'Brand' },
				money('price', 'Price', { required: true, helper: 'Each variant’s price unless it has its own' }),
				money('compareAtPrice', 'Compare-at price', { default: undefined, helper: 'The old price, shown struck out' }),
				money('cost', 'Cost', { default: undefined, helper: 'What it costs you — for profit reports' }),
				{ key: 'sku', label: 'SKU', kind: 'text', searchable: true, helper: 'Without variations: the product’s own' },
				{ key: 'barcode', label: 'Barcode', kind: 'text', searchable: true, helper: 'Without variations: scanned at the POS' },
				{ key: 'taxRate', label: 'Tax rate', kind: 'reference', ref: 'TaxRate', helper: 'Empty: the default rate' },
				{ key: 'trackStock', label: 'Track stock', kind: 'boolean', default: a.products.trackStock },
				{
					key: 'options',
					label: 'Options',
					kind: 'sectionlist',
					addLabel: 'Add an option',
					helper: 'What it varies by (Size: S, M, L) — the variants are made from these',
					fields: [
						{ key: 'name', label: 'Option', kind: 'text' },
						{ key: 'values', label: 'Values (comma separated)', kind: 'text' },
					],
				},
				{ key: 'images', label: 'Images', kind: 'images' },
				{ key: 'description', label: 'Description', kind: 'textarea' },
				{ key: 'totalStock', label: 'In stock (all outlets)', kind: 'number', default: 0 },
			],
			table: ['name', 'category', 'price', 'totalStock', 'status'],
			filters: ['status', 'category'],
		},
	},
	{
		key: 'variant',
		shownWhen: x => x.products.variations,
		engine: ['isDefault', 'totalStock'],
		step: {
			name: 'Variant',
			title: 'Variants',
			route: 'variants',
			description: 'Each size, colour or version of a product — what’s sold, stocked and scanned',
			rationale: 'Every sale, stock level and return names a variant.',
			displayField: 'title',
			fields: [
				{ key: 'product', label: 'Product', kind: 'reference', ref: 'Product', required: true },
				{ key: 'title', label: 'Variant', kind: 'text', required: true, searchable: true, helper: 'M / Red' },
				{ key: 'optionValues', label: 'Option values', kind: 'sectionlist', fields: [{ key: 'name', label: 'Option', kind: 'text' }, { key: 'value', label: 'Value', kind: 'text' }] },
				{ key: 'sku', label: 'SKU', kind: 'text', searchable: true },
				{ key: 'barcode', label: 'Barcode', kind: 'text', searchable: true },
				money('price', 'Price', { default: undefined, helper: 'Empty: the product’s price' }),
				money('compareAtPrice', 'Compare-at price', { default: undefined }),
				money('cost', 'Cost', { default: undefined }),
				{ key: 'active', label: 'Sold', kind: 'boolean', default: true },
				{ key: 'isDefault', label: 'The product’s only variant', kind: 'boolean', default: false },
				{ key: 'totalStock', label: 'In stock (all outlets)', kind: 'number', default: 0 },
			],
			table: ['title', 'product', 'sku', 'price', 'totalStock', 'active'],
			filters: ['product', 'active'],
		},
	},
	{
		key: 'stock',
		shownWhen: null,
		engineOnly: true,
		engine: ['variant', 'product', 'outlet', 'onHand', 'label'],
		step: {
			name: 'StockLevel',
			title: 'Stock',
			route: 'stock',
			description: 'How many of each variant every outlet has — changed only by sales, returns, counts, adjustments and transfers',
			rationale: 'Stock is kept per variant per outlet (EC8).',
			displayField: 'label',
			fields: [
				{ key: 'label', label: 'Item', kind: 'text', searchable: true },
				{ key: 'variant', label: 'Variant', kind: 'reference', ref: 'Variant', required: true },
				{ key: 'product', label: 'Product', kind: 'reference', ref: 'Product' },
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet', required: true },
				{ key: 'onHand', label: 'On hand', kind: 'number', default: 0 },
				{ key: 'reorderPoint', label: 'Reorder at', kind: 'number', min: 0, helper: 'Shown as low stock at or below this' },
			],
			table: ['label', 'outlet', 'onHand', 'reorderPoint'],
			filters: ['outlet', 'product'],
		},
	},
	{
		key: 'movement',
		shownWhen: null,
		engineOnly: true,
		engine: ['variant', 'product', 'outlet', 'change', 'after', 'reason', 'reference', 'by', 'label'],
		step: {
			name: 'StockMovement',
			title: 'Stock movements',
			route: 'stock-movements',
			description: 'Every change to stock, and why',
			rationale: 'A log the store writes for every stock change.',
			displayField: 'code',
			code: { enabled: true, prefix: 'MOV', padding: 6 },
			fields: [
				{ key: 'label', label: 'Item', kind: 'text', searchable: true },
				{ key: 'variant', label: 'Variant', kind: 'reference', ref: 'Variant' },
				{ key: 'product', label: 'Product', kind: 'reference', ref: 'Product' },
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet' },
				{ key: 'change', label: 'Change', kind: 'number' },
				{ key: 'after', label: 'On hand after', kind: 'number' },
				{ key: 'reason', label: 'Reason', kind: 'select', options: opts(...MOVEMENT_REASONS) },
				{ key: 'reference', label: 'Reference', kind: 'text', searchable: true, helper: 'The order, return, count or transfer' },
				{ key: 'by', label: 'By', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'label', 'outlet', 'change', 'after', 'reason', 'reference'],
			filters: ['reason', 'outlet'],
		},
	},
	{
		key: 'adjustment',
		shownWhen: null,
		engine: ['status', 'appliedAt', 'by'],
		step: {
			name: 'StockAdjustment',
			title: 'Stock adjustments',
			route: 'stock-adjustments',
			description: 'Damaged, found or counted stock — applied once, as movements',
			rationale: 'Corrections to stock are records of their own, so every change has a reason.',
			displayField: 'code',
			code: { enabled: true, prefix: 'ADJ', padding: 4 },
			fields: [
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet', required: true },
				{ key: 'reason', label: 'Reason', kind: 'select', options: opts('count', 'damage', 'found', 'opening', 'other'), default: 'count', required: true },
				{
					key: 'lines',
					label: 'Items',
					kind: 'sectionlist',
					addLabel: 'Add an item',
					fields: [
						{ key: 'variant', label: 'Variant id', kind: 'text' },
						{ key: 'label', label: 'Item', kind: 'text' },
						{ key: 'sku', label: 'SKU', kind: 'text' },
						{ key: 'change', label: 'Change (+/−)', kind: 'number' },
						{ key: 'counted', label: 'Counted', kind: 'number' },
					],
				},
				{ key: 'status', label: 'Status', kind: 'select', options: opts('draft', 'applied'), default: 'draft' },
				{ key: 'appliedAt', label: 'Applied', kind: 'date' },
				{ key: 'by', label: 'Applied by', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'outlet', 'reason', 'status', 'appliedAt'],
			filters: ['status', 'outlet', 'reason'],
		},
	},
	{
		key: 'transfer',
		shownWhen: x => x.outlets.length > 1,
		engine: ['status', 'sentAt', 'receivedAt', 'by'],
		step: {
			name: 'StockTransfer',
			title: 'Stock transfers',
			route: 'stock-transfers',
			description: 'Stock moved from one outlet to another',
			rationale: 'Sending takes stock out of one outlet; receiving puts it into the other.',
			displayField: 'code',
			code: { enabled: true, prefix: 'TRF', padding: 4 },
			fields: [
				{ key: 'from', label: 'From', kind: 'reference', ref: 'Outlet', required: true },
				{ key: 'to', label: 'To', kind: 'reference', ref: 'Outlet', required: true },
				{
					key: 'lines',
					label: 'Items',
					kind: 'sectionlist',
					addLabel: 'Add an item',
					fields: [
						{ key: 'variant', label: 'Variant id', kind: 'text' },
						{ key: 'label', label: 'Item', kind: 'text' },
						{ key: 'sku', label: 'SKU', kind: 'text' },
						{ key: 'quantity', label: 'Quantity', kind: 'number' },
					],
				},
				{ key: 'status', label: 'Status', kind: 'select', options: opts('draft', 'sent', 'received', 'cancelled'), default: 'draft' },
				{ key: 'sentAt', label: 'Sent', kind: 'date' },
				{ key: 'receivedAt', label: 'Received', kind: 'date' },
				{ key: 'by', label: 'By', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'from', 'to', 'status', 'sentAt', 'receivedAt'],
			filters: ['status', 'from', 'to'],
		},
	},
	{
		key: 'customer',
		shownWhen: null,
		engine: ['storeCredit', 'ordersCount', 'spent', 'lastOrderAt'],
		step: {
			name: 'StoreCustomer',
			title: 'Customers',
			route: 'store-customers',
			description: 'Who buys from you — their orders, returns and store credit',
			rationale: 'Orders, returns and store credit belong to a customer.',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
				{ key: 'phone', label: 'Phone', kind: 'text', searchable: true },
				{ key: 'email', label: 'Email', kind: 'email', searchable: true },
				{ key: 'address', label: 'Address', kind: 'textarea' },
				{ key: 'notes', label: 'Notes', kind: 'textarea' },
				{ key: 'storeCredit', label: 'Store credit', kind: 'number', default: 0 },
				{ key: 'ordersCount', label: 'Orders', kind: 'number', default: 0 },
				{ key: 'spent', label: 'Spent', kind: 'number', default: 0 },
				{ key: 'lastOrderAt', label: 'Last order', kind: 'date' },
			],
			table: ['name', 'phone', 'email', 'ordersCount', 'spent', 'storeCredit'],
		},
	},
	{
		key: 'coupon',
		shownWhen: x => x.pos.coupons,
		engine: ['used'],
		step: {
			name: 'Coupon',
			title: 'Coupons',
			route: 'coupons',
			description: 'Codes that take money off an order',
			rationale: 'Typed at the POS or on an order; checked by the store.',
			displayField: 'couponCode',
			fields: [
				{ key: 'couponCode', label: 'Code', kind: 'text', required: true, unique: true, searchable: true },
				{ key: 'type', label: 'Type', kind: 'select', options: [{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Amount off' }], default: 'percent', required: true },
				{ key: 'value', label: 'Value', kind: 'number', min: 0, required: true },
				money('minOrder', 'Minimum order', { default: undefined }),
				{ key: 'startsAt', label: 'Starts', kind: 'date' },
				{ key: 'endsAt', label: 'Ends', kind: 'date' },
				{ key: 'usageLimit', label: 'Can be used (times)', kind: 'number', min: 0, helper: 'Empty: no limit' },
				{ key: 'appliesTo', label: 'Applies to', kind: 'select', options: [{ value: 'all', label: 'Everything' }, { value: 'categories', label: 'Some categories' }, { value: 'products', label: 'Some products' }], default: 'all' },
				{ key: 'categories', label: 'Categories', kind: 'references', ref: 'Category' },
				{ key: 'products', label: 'Products', kind: 'references', ref: 'Product' },
				{ key: 'active', label: 'Active', kind: 'boolean', default: true },
				{ key: 'used', label: 'Used', kind: 'number', default: 0 },
			],
			table: ['couponCode', 'type', 'value', 'used', 'usageLimit', 'endsAt', 'active'],
			filters: ['active', 'type'],
		},
	},
	{
		key: 'register',
		shownWhen: x => x.pos.shifts,
		engine: [],
		step: {
			name: 'Register',
			title: 'Registers',
			route: 'registers',
			description: 'The tills at each store — a shift is opened on one',
			rationale: 'Cash is counted per register, shift by shift.',
			displayField: 'name',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true },
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet', required: true },
				{ key: 'active', label: 'Active', kind: 'boolean', default: true },
			],
			table: ['name', 'outlet', 'active'],
		},
	},
	{
		key: 'shift',
		shownWhen: x => x.pos.shifts,
		engineOnly: true,
		engine: ['register', 'outlet', 'status', 'openedBy', 'openedAt', 'openingFloat', 'cashMoves', 'totals', 'expectedCash', 'countedCash', 'difference', 'closedBy', 'closedAt'],
		step: {
			name: 'Shift',
			title: 'Shifts',
			route: 'shifts',
			description: 'A register opened and closed: the cash it started with, took and ended with',
			rationale: 'Opened and closed at the POS.',
			displayField: 'code',
			code: { enabled: true, prefix: 'SHF', padding: 5 },
			fields: [
				{ key: 'register', label: 'Register', kind: 'reference', ref: 'Register' },
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet' },
				{ key: 'status', label: 'Status', kind: 'select', options: opts('open', 'closed'), default: 'open' },
				{ key: 'openedBy', label: 'Opened by', kind: 'text' },
				{ key: 'openedAt', label: 'Opened', kind: 'date' },
				money('openingFloat', 'Opening cash'),
				{
					key: 'cashMoves',
					label: 'Cash in / out',
					kind: 'sectionlist',
					fields: [
						{ key: 'type', label: 'In or out', kind: 'select', options: opts('in', 'out') },
						{ key: 'amount', label: 'Amount', kind: 'number' },
						{ key: 'reason', label: 'Reason', kind: 'text' },
						{ key: 'by', label: 'By', kind: 'text' },
						{ key: 'at', label: 'At', kind: 'date' },
					],
				},
				{
					key: 'totals',
					label: 'Takings by method',
					kind: 'sectionlist',
					fields: [
						{ key: 'method', label: 'Method', kind: 'text' },
						{ key: 'label', label: 'Name', kind: 'text' },
						{ key: 'sales', label: 'Taken', kind: 'number' },
						{ key: 'refunds', label: 'Refunded', kind: 'number' },
					],
				},
				{ key: 'expectedCash', label: 'Expected cash', kind: 'number' },
				{ key: 'countedCash', label: 'Counted cash', kind: 'number' },
				{ key: 'difference', label: 'Over / short', kind: 'number' },
				{ key: 'closedBy', label: 'Closed by', kind: 'text' },
				{ key: 'closedAt', label: 'Closed', kind: 'date' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'register', 'status', 'openedBy', 'openedAt', 'expectedCash', 'countedCash', 'difference'],
			filters: ['status', 'outlet', 'register'],
		},
	},
	{
		key: 'order',
		shownWhen: null,
		engineOnly: true,
		ownPage: '/store/orders',
		engine: [
			'channel', 'status', 'outlet', 'items', 'subtotal', 'discount', 'orderDiscount', 'coupon', 'couponCode', 'tax', 'shipping', 'total',
			'paid', 'refunded', 'balance', 'paymentStatus', 'register', 'shift', 'cashier', 'completedAt', 'courier', 'returnedItems',
		],
		step: {
			name: 'Order',
			title: 'Orders',
			route: 'orders',
			description: 'Sales at the POS and orders taken by phone or by hand',
			rationale: 'Made by the POS and the Orders page; totals, payments and returns are kept by the store.',
			displayField: 'code',
			code: { enabled: true, prefix: a.store.orderPrefix || 'ORD', padding: 5 },
			fields: [
				{ key: 'channel', label: 'Channel', kind: 'select', options: [{ value: 'pos', label: 'POS' }, { value: 'manual', label: 'Phone / by hand' }], default: 'manual' },
				{ key: 'status', label: 'Status', kind: 'select', options: opts(...ORDER_STATUSES), default: 'open' },
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet' },
				{ key: 'customer', label: 'Customer', kind: 'reference', ref: 'StoreCustomer' },
				{
					key: 'items',
					label: 'Items',
					kind: 'sectionlist',
					fields: [
						{ key: 'variant', label: 'Variant id', kind: 'text' },
						{ key: 'product', label: 'Product id', kind: 'text' },
						{ key: 'name', label: 'Item', kind: 'text' },
						{ key: 'sku', label: 'SKU', kind: 'text' },
						{ key: 'quantity', label: 'Quantity', kind: 'number' },
						{ key: 'unitPrice', label: 'Unit price', kind: 'number' },
						{ key: 'discount', label: 'Discount', kind: 'number' },
						{ key: 'tax', label: 'Tax', kind: 'number' },
						{ key: 'total', label: 'Total', kind: 'number' },
						{ key: 'returned', label: 'Returned', kind: 'number' },
					],
				},
				money('subtotal', 'Subtotal'),
				money('discount', 'Discount'),
				money('orderDiscount', 'Order discount'),
				{ key: 'coupon', label: 'Coupon', kind: 'reference', ref: 'Coupon' },
				{ key: 'couponCode', label: 'Coupon code', kind: 'text' },
				money('tax', 'Tax'),
				money('shipping', 'Shipping'),
				money('total', 'Total'),
				money('paid', 'Paid'),
				money('refunded', 'Refunded'),
				{ key: 'balance', label: 'Balance due', kind: 'number', default: 0 },
				{ key: 'paymentStatus', label: 'Payment', kind: 'select', options: opts(...PAYMENT_STATUSES), default: 'unpaid' },
				{ key: 'fulfilment', label: 'Fulfilment', kind: 'select', options: opts(...FULFILMENT), default: 'unfulfilled' },
				{ key: 'returnedItems', label: 'Items returned', kind: 'number', default: 0 },
				{
					key: 'delivery',
					label: 'Delivery',
					kind: 'section',
					fields: [
						{ key: 'name', label: 'Recipient', kind: 'text' },
						{ key: 'phone', label: 'Phone', kind: 'text' },
						{ key: 'address', label: 'Address', kind: 'textarea' },
						{ key: 'area', label: 'Area / city', kind: 'text' },
						{ key: 'rate', label: 'Shipping rate', kind: 'text' },
					],
				},
				{
					key: 'courier',
					label: 'Courier',
					kind: 'section',
					fields: [
						{ key: 'provider', label: 'Courier', kind: 'text' },
						{ key: 'consignment', label: 'Consignment', kind: 'text' },
						{ key: 'tracking', label: 'Tracking code', kind: 'text' },
						{ key: 'status', label: 'Status', kind: 'text' },
						{ key: 'cod', label: 'Cash to collect', kind: 'number' },
						{ key: 'bookedAt', label: 'Booked', kind: 'date' },
						{ key: 'updatedAt', label: 'Last update', kind: 'date' },
					],
				},
				{ key: 'register', label: 'Register', kind: 'reference', ref: 'Register' },
				{ key: 'shift', label: 'Shift', kind: 'reference', ref: 'Shift' },
				{ key: 'cashier', label: 'Sold by', kind: 'text' },
				{ key: 'completedAt', label: 'Completed', kind: 'date' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'customer', 'outlet', 'total', 'paymentStatus', 'fulfilment', 'status'],
			filters: ['status', 'paymentStatus', 'fulfilment', 'channel', 'outlet'],
		},
	},
	{
		key: 'payment',
		shownWhen: null,
		engineOnly: true,
		engine: ['order', 'type', 'method', 'methodLabel', 'amount', 'tendered', 'change', 'status', 'gatewayRef', 'outlet', 'shift', 'returnRef', 'customer', 'by'],
		step: {
			name: 'OrderPayment',
			title: 'Payments',
			route: 'order-payments',
			description: 'Money in and out — payments and refunds',
			rationale: 'One ledger: an order’s paid and refunded amounts add up from here (EC9).',
			displayField: 'code',
			code: { enabled: true, prefix: 'PAY', padding: 6 },
			fields: [
				{ key: 'order', label: 'Order', kind: 'reference', ref: 'Order' },
				{ key: 'type', label: 'Type', kind: 'select', options: opts('payment', 'refund'), default: 'payment' },
				{ key: 'method', label: 'Method', kind: 'text' },
				{ key: 'methodLabel', label: 'Paid with', kind: 'text' },
				{ key: 'amount', label: 'Amount', kind: 'number' },
				{ key: 'tendered', label: 'Handed over', kind: 'number', helper: 'Cash: what the customer gave' },
				{ key: 'change', label: 'Change given', kind: 'number' },
				{ key: 'reference', label: 'Reference', kind: 'text', searchable: true, helper: 'Card slip, wallet transaction id…' },
				{ key: 'status', label: 'Status', kind: 'select', options: opts('pending', 'completed', 'failed'), default: 'completed' },
				{ key: 'gatewayRef', label: 'Gateway reference', kind: 'text' },
				{ key: 'outlet', label: 'Outlet', kind: 'reference', ref: 'Outlet' },
				{ key: 'shift', label: 'Shift', kind: 'reference', ref: 'Shift' },
				{ key: 'returnRef', label: 'Return', kind: 'reference', ref: 'Return' },
				{ key: 'customer', label: 'Customer', kind: 'reference', ref: 'StoreCustomer' },
				{ key: 'by', label: 'By', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'order', 'type', 'methodLabel', 'amount', 'status', 'createdAt'],
			filters: ['type', 'method', 'status', 'outlet'],
		},
	},
	{
		key: 'return',
		shownWhen: x => x.returns.allowed,
		engineOnly: true,
		ownPage: '/store/returns',
		engine: ['order', 'customer', 'outlet', 'lines', 'refundDue', 'refunded', 'status', 'by', 'restocked'],
		step: {
			name: 'Return',
			title: 'Returns',
			route: 'returns',
			description: 'Items brought back — all of an order or part of it — and what was refunded',
			rationale: 'Made from an order; the refund is worked out from what was paid (EC10).',
			displayField: 'code',
			code: { enabled: true, prefix: 'RET', padding: 5 },
			fields: [
				{ key: 'order', label: 'Order', kind: 'reference', ref: 'Order', required: true },
				{ key: 'customer', label: 'Customer', kind: 'reference', ref: 'StoreCustomer' },
				{ key: 'outlet', label: 'Back to outlet', kind: 'reference', ref: 'Outlet' },
				{
					key: 'lines',
					label: 'Items',
					kind: 'sectionlist',
					fields: [
						{ key: 'line', label: 'Order line', kind: 'number' },
						{ key: 'variant', label: 'Variant id', kind: 'text' },
						{ key: 'name', label: 'Item', kind: 'text' },
						{ key: 'sku', label: 'SKU', kind: 'text' },
						{ key: 'quantity', label: 'Quantity', kind: 'number' },
						{ key: 'unitRefund', label: 'Refund each', kind: 'number' },
						{ key: 'total', label: 'Refund', kind: 'number' },
						{ key: 'reason', label: 'Why', kind: 'select', options: opts('changed-mind', 'wrong-size', 'damaged', 'not-as-described', 'other') },
						{ key: 'condition', label: 'Condition', kind: 'select', options: opts('sellable', 'damaged') },
						{ key: 'restock', label: 'Back to stock', kind: 'boolean' },
					],
				},
				money('refundDue', 'Refund due'),
				money('refunded', 'Refunded'),
				{ key: 'restocked', label: 'Restocked', kind: 'boolean', default: false },
				{ key: 'status', label: 'Status', kind: 'select', options: opts(...RETURN_STATUSES), default: 'requested' },
				{ key: 'by', label: 'Taken by', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'order', 'customer', 'refundDue', 'refunded', 'status', 'createdAt'],
			filters: ['status', 'outlet'],
		},
	},
	{
		key: 'credit',
		shownWhen: x => x.returns.storeCredit,
		engineOnly: true,
		engine: ['customer', 'amount', 'reason', 'reference', 'by', 'balance'],
		step: {
			name: 'StoreCredit',
			title: 'Store credit',
			route: 'store-credit',
			description: 'Credit given to and spent by customers',
			rationale: 'A customer’s credit is the sum of these (EC15).',
			displayField: 'code',
			code: { enabled: true, prefix: 'CR', padding: 5 },
			fields: [
				{ key: 'customer', label: 'Customer', kind: 'reference', ref: 'StoreCustomer', required: true },
				{ key: 'amount', label: 'Amount (+ given, − spent)', kind: 'number' },
				{ key: 'balance', label: 'Balance after', kind: 'number' },
				{ key: 'reason', label: 'Why', kind: 'select', options: opts('refund', 'sale', 'manual', 'reversal') },
				{ key: 'reference', label: 'Reference', kind: 'text' },
				{ key: 'by', label: 'By', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'textarea' },
			],
			table: ['code', 'customer', 'amount', 'balance', 'reason', 'reference', 'createdAt'],
			filters: ['reason'],
		},
	},
];

/** The feature plan the installer builds: every model, in the E-commerce sidebar category. */
export const storePlan = (a: Answers, sidebarCategory: string) => ({
	title: 'Store',
	summary: 'Products, variants, stock per outlet, orders, payments, returns and store credit — set up by the store wizard.',
	sidebarCategory,
	steps: modelSpecs(a).map(s => ({ action: 'create', ...s.step })),
});

/** The core fields of a step (EC4): every field it was built with, a section's own by `parent.child`. */
export const coreFieldsOf = (step: any): string[] => (step.fields || []).map((f: any) => f.key);
