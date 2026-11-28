import { grants } from './tenantPermissions.function.js';
import type { SidebarItemType } from '../controllers/config/getAdminSidebar.controller.js';

/**
 * The accounting panel (docs/accounting): an accounting project's panel logins (`type: 'accounting'`, D1), signed in at
 * mint-accounting with `app: 'accounting'` (D7). They work the books — the blueprint's models (served at the project
 * root by the dynamic models dispatcher) and `/accounting/*` — and never the builder tools a project owner has.
 */

export const isAccountingProject = (project: any) => project?.type === 'accounting';

/**
 * What an accounting login never reaches inside its project (`req.path` on the project router). A blocklist, not an
 * allowlist like the SEO panel's: the books' own records live at `/<route>`, so every model the blueprint (or the
 * owner) adds just works.
 */
const BLOCKED = /^\/(people|builder|site-builder|site-contents|content|seo-setup|site-config|analytics|automations|webhooks|widgets|payments|commerce|mail-accounts|mail-designs|templates|api-overview|api-builder|access-users|panel-admins)(\/|$)/;

/** Express middleware for the project router: passes everyone who isn't an accounting project's panel login. */
export const accountingPanelGuard = (req: any, res: any, next: any) => {
	if (!req.panelAdmin || !isAccountingProject(req.project)) return next();
	if (BLOCKED.test(String(req.path || '/'))) return res.status(403).json({ message: 'The accounting panel doesn’t open this.', code: 'ACCOUNTING_PANEL_ONLY' });
	return next();
};

const item = (title: string, href: string, icon: string, section?: [string, string]): SidebarItemType => ({
	title,
	href,
	icon,
	path: href.replace(/^\//, '').replace(/[/?=&]/g, '-') || 'home',
	...(section && { startOfSection: true, sectionTitle: section[0], sectionIcon: section[1] }),
});

/** A sidebar group: its first item opens the section (DIZICASHIER_INVENTORY § Shell). */
const group = (title: string, icon: string, items: [string, string, string][]): SidebarItemType[] =>
	items.map(([t, href, i], n) => item(t, href, i, n === 0 ? [title, icon] : undefined));

/** DiziCashier's reports, in its sidebar's order (inventory § Reports). The key is the mint-accounting page. */
export const ACCOUNTING_REPORTS: { key: string; title: string; group: string }[] = [
	['customer-statement', 'Customer Statement', 'Customer/Supplier'],
	['customer-detail-statement', 'Customer Detail Statement', 'Customer/Supplier'],
	['supplier-statement', 'Supplier Statement', 'Customer/Supplier'],
	['supplier-detail-statement', 'Supplier Detail Statement', 'Customer/Supplier'],
	['customer-collection', 'Customer Collection', 'Customer/Supplier'],
	['aged-receivable', 'Aged Accounts Receivable', 'Customer/Supplier'],
	['aged-payable', 'Aged Accounts Payable', 'Customer/Supplier'],
	['customer-ledger', 'Customer Ledger', 'Customer/Supplier'],
	['supplier-ledger', 'Supplier Ledger', 'Customer/Supplier'],
	['receivable', 'Receivable Report', 'Customer/Supplier'],
	['payable', 'Payable Report', 'Customer/Supplier'],
	['top-customers', 'Top Customer Report', 'Customer/Supplier'],
	['sales-register', 'Sales Register', 'Sales'],
	['month-to-date-sales', 'Month to Date Sales', 'Sales'],
	['sale-wise-profit-loss', 'Sale-wise Profit Loss Report', 'Sales'],
	['product-wise-sales', 'Product-wise Sales Report', 'Sales'],
	['representative-wise-sales', 'Representative-wise Sales Report', 'Sales'],
	['supplier-wise-sales', 'Supplier-wise Sales Report', 'Sales'],
	['product-sale-summary', 'Product Sale Summary', 'Sales'],
	['warehouse-wise-product-sale-summary', 'Warehouse-wise Product Sale Summary', 'Sales'],
	['customer-wise-product-profit', 'Customer-wise Product Profit Report', 'Sales'],
	['top-sold-products', 'Top Sold Products', 'Sales'],
	['discount', 'Discount Report', 'Sales'],
	['purchase-register', 'Purchase Register Report', 'Purchase'],
	['supplier-wise-purchase', 'Supplier-wise Purchase Report', 'Purchase'],
	['product-wise-purchase', 'Product-wise Purchase Report', 'Purchase'],
	['profit-loss', 'Profit Loss Statement', 'Financial'],
	['todays-transactions', 'Todays Transaction Report', 'Financial'],
	['cash-book', 'Cash Book Report', 'Financial'],
	['day-closing', 'Day Closing', 'Financial'],
	['cashier-wise-cash-summary', 'Cashier Wise Cash Summary Report', 'Financial'],
	['balance-sheet', 'Balance Sheet', 'Financial'],
	['trial-balance', 'Trial Balance', 'Financial'],
	['expense-detail', 'Expense Detail Report', 'Expense'],
	['expense-summary', 'Expense Summary Report', 'Expense'],
	['stock', 'Stock Report', 'Stock'],
	['stock-batch', 'Stock Batch Report', 'Stock'],
	['stock-product-summary', 'Stock Product Summary Report', 'Stock'],
	['stock-transactions', 'Stock Transaction Report', 'Stock'],
	['stock-transfers', 'Stock Transfer Report', 'Stock'],
	['tax-computation', 'Tax Computation', 'Tax'],
].map(([key, title, group]) => ({ key, title, group }));

/**
 * The accounting panel's sidebar: DiziCashier's eleven groups and page names (inventory § Shell). Addresses are
 * mint-accounting's pages. Until roles land (AC-18) everyone signed in sees it all; the backend still checks each
 * record's permission keys.
 */
export const accountingNav = (permissions: string[]): SidebarItemType[] => {
	const can = (key: string) => grants(permissions, [key]);
	return [
		item('Dashboard', '/', 'house'),
		...group('Accounts', 'calculator', [
			['Chart of Accounts', '/accounts', 'list-tree'],
			['Account Statement', '/accounts/statement', 'file-text'],
			['Payment Methods', '/payment-methods', 'credit-card'],
		]),
		...group('Products/ Services', 'package', [
			['Product List', '/products', 'package'],
			['Service List', '/services', 'wrench'],
			['Product Categories', '/product-categories', 'folder-tree'],
			['Measurement Units', '/units', 'ruler'],
			['Change Products Price', '/products/prices', 'tags'],
			['Import Products', '/products/import', 'file-up'],
			['Print Barcode/ Serial No', '/products/barcode', 'barcode'],
		]),
		...group('Sales', 'receipt', [
			['Sales', '/sales', 'receipt'],
			['Make Sale', '/sales/new', 'circle-plus'],
			['Quotation', '/quotations', 'file-pen'],
			['Make Quotation', '/quotations/new', 'circle-plus'],
			['Return sold product', '/sale-returns', 'undo-2'],
			['Return customer product', '/product-returns', 'package-x'],
			['Exchange sold product', '/exchanges', 'repeat'],
			['Customers', '/customers', 'users'],
		]),
		...group('Purchases', 'shopping-cart', [
			['Purchase', '/purchases', 'shopping-cart'],
			['Make Purchase', '/purchases/new', 'circle-plus'],
			['Purchase Order', '/purchase-orders', 'clipboard-list'],
			['Make Purchase Order', '/purchase-orders/new', 'circle-plus'],
			['Purchase Return', '/purchase-returns', 'undo-2'],
			['Suppliers', '/suppliers', 'truck'],
		]),
		...group('Payments', 'wallet', [
			['Supplier Payment', '/payments/supplier', 'arrow-up-right'],
			['Customer Payment', '/payments/customer', 'arrow-down-left'],
		]),
		...group('Traders', 'briefcase', [
			['Customers', '/customers', 'users'],
			['Suppliers', '/suppliers', 'truck'],
			['Import Traders', '/traders/import', 'file-up'],
		]),
		...group('Stocks', 'warehouse', [
			['Warehouse', '/warehouses', 'warehouse'],
			['Stock List', '/stocks', 'boxes'],
			['Stock Adjustment', '/stock-adjustments', 'sliders-horizontal'],
			['Stock Transfer', '/stock-transfers', 'arrow-right-left'],
			['Production', '/productions', 'factory'],
			['Production Template', '/production-templates', 'clipboard-list'],
		]),
		...group('Transactions', 'circle-dollar-sign', [
			['Vouchers', '/vouchers', 'book-open'],
			['Withdraw/Deposit/Transfer/Cash Out', '/transfers', 'arrow-right-left'],
			['Pay Expense', '/expenses', 'wallet'],
			['Incomes', '/incomes', 'piggy-bank'],
			['Clearing Cheque', '/cheques', 'banknote'],
		]),
		...group('Tools', 'wrench', [
			...(can('manage-panel-users')
				? ([
						['Users', '/panel-users', 'user-cog'],
						['Roles', '/panel-roles', 'shield-check'],
				  ] as [string, string, string][])
				: []),
			['Taxes', '/taxes', 'percent'],
			['Dashboard Settings', '/dashboard-settings', 'layout-dashboard'],
			['Settings', '/settings', 'settings'],
			['Organization Info', '/organization', 'building-2'],
			['Activity Log', '/activity', 'history'],
		]),
		...group('Reports', 'file-chart-column', [['All Reports', '/reports', 'file-chart-column'], ...ACCOUNTING_REPORTS.map(r => [r.title, `/reports/${r.key}`, 'file-text'] as [string, string, string])]),
	];
};
