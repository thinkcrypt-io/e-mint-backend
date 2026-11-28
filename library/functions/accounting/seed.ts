/**
 * The books' first records (docs/accounting D2; inventory § Accounts): DiziCashier's seeded chart of accounts, a tax,
 * a warehouse, units, the Cash payment method, Settings and Organization Info. Idempotent — what's there (by system
 * key, or by name) is left alone — so install, upgrade and adopting an existing project share it.
 */

type Row = [systemKey: string, name: string, type: 'asset' | 'liability' | 'income' | 'expense', group: string];

/** DiziCashier's seeded chart, in its order. The engine finds accounts by `systemKey` (posting.ts). */
export const CHART: Row[] = [
	['petty_cash', 'Petty Cash', 'asset', 'cash'],
	['accounts_receivable', 'Accounts Receivable', 'asset', 'receivable'],
	['cheque_clearing', 'Cheque on Clearing', 'asset', 'receivable'],
	['finished_goods', 'Finished Goods', 'asset', 'inventory'],
	['hire_items', 'Hire Items', 'asset', 'inventory'],
	['raw_materials', 'Raw Materials', 'asset', 'inventory'],
	['resale_items', 'Resale Items', 'asset', 'inventory'],
	['accounts_payable', 'Accounts Payable', 'liability', 'payable'],
	['cheque_payable', 'Cheque payble', 'liability', 'payable'],
	['hire_liability', 'Hire Liability', 'liability', 'payable'],
	['vendor_tax_liability', 'Vendor Tax Liability', 'liability', 'payable'],
	['tax_collected', 'Tax Collected', 'liability', 'tax'],
	['tax_deducted_payable', 'Tax Deducted Payable', 'liability', 'tax'],
	['tax_deducted_receivable', 'Tax Deducted Receivable', 'liability', 'tax'],
	['tax_paid', 'Tax Paid', 'liability', 'tax'],
	['current_year_earnings', 'Current Year Earnings', 'liability', 'equity'],
	['opening_customer_balance', 'Opening Customer Balance', 'liability', 'equity'],
	['opening_stock', 'Opening Stock', 'liability', 'equity'],
	['opening_supplier_balance', 'Opening Supplier Balance', 'liability', 'equity'],
	['owners_equity', 'Owners Equity', 'liability', 'equity'],
	['retained_earnings', 'Retained Earnings', 'liability', 'equity'],
	['sales', 'Sales', 'income', 'sales'],
	['daily_maintenance', 'Daily Maintenance', 'expense', 'expense'],
	['miscellaneous', 'Miscellaneous', 'expense', 'expense'],
	['office_rent', 'Showroom / Office Rent', 'expense', 'expense'],
	['staff_salary', 'Staff Salary', 'expense', 'expense'],
	['utility_bills', 'Utility Bills', 'expense', 'expense'],
	['purchases', 'Purchases', 'expense', 'purchase'],
	['cogs', 'Cost of Goods Sold', 'expense', 'cost_of_sales'],
	['stock_adjustment', 'Stock Adjustment', 'expense', 'inventory_expense'],
];

const UNITS: [string, string][] = [
	['Piece', 'pcs'],
	['Kilogram', 'kg'],
	['Litre', 'L'],
	['Box', 'box'],
];

/** What was added, for the installer's and the upgrade script's report. */
export const seedBooks = async (M: (route: string) => any, opts: { name?: string } = {}): Promise<string[]> => {
	const added: string[] = [];
	const ensure = async (route: string, match: Record<string, any>, doc: Record<string, any>, label: string) => {
		const Model = M(route);
		const found = await Model.findOne(match, { _id: 1 }).lean();
		if (found) return found._id;
		const made = await Model.create(doc);
		added.push(label);
		return made._id;
	};

	const ids: Record<string, any> = {};
	for (const [systemKey, name, type, group] of CHART)
		ids[systemKey] = await ensure('accounts', { systemKey }, { systemKey, name, type, group, balance: 0, isActive: true }, `account ${name}`);
	await ensure('tax-categories', { name: 'Tax Free' }, { name: 'Tax Free', percentage: 0 }, 'tax Tax Free');
	if (!(await M('warehouses').exists({}))) await ensure('warehouses', { name: 'Main' }, { name: 'Main', isDefault: true }, 'warehouse Main');
	for (const [name, symbol] of UNITS) await ensure('units', { name }, { name, symbol }, `unit ${name}`);
	await ensure('payment-methods', { name: 'Cash' }, { name: 'Cash', paymentType: 'cash', depositTo: ids.petty_cash, charge: 0, isActive: true }, 'payment method Cash');
	await ensure('accounting-settings', {}, { language: 'en', currency: '৳', costCentres: false }, 'settings');
	await ensure('organization-info', {}, { name: opts.name || 'My company' }, 'organization info');
	return added;
};
