import DashboardConfig from '../../models/builder/dashboardConfig.model.js';
import { normalizeWidget } from '../../controllers/dashboard/dashboard.controller.js';
import type { Installed } from './install.js';

/**
 * A store's home dashboard (docs/ecommerce EC-27): the numbers a shop looks at
 * first — sales and orders against the period before, the average order, what
 * is unpaid or new on the website — a sales chart, orders by origin and by
 * stage, the latest orders, and quick actions to the pages used most. Each
 * widget reads the store's own routes, so it follows the person's permissions.
 */
const LIVE = [{ field: 'status', op: 'in', value: ['open', 'completed'] }];

export const storeDashboard = (installed: Installed) => {
	const order = installed.order?.route || 'orders';
	const actions = [
		{ label: 'New sale', href: '/store/pos', icon: 'scan-barcode' },
		{ label: 'Add a product', href: `/t/${installed.product?.route || 'products'}/create`, icon: 'package-plus' },
		{ label: 'Website orders', href: '/store/website-orders', icon: 'globe' },
		{ label: 'Orders', href: '/store/orders', icon: 'receipt' },
		{ label: 'Stock', href: `/t/${installed.stock?.route || 'stock'}`, icon: 'warehouse' },
		{ label: 'Customers', href: `/t/${installed.customer?.route || 'customers'}`, icon: 'users' },
	];
	const raw: any[] = [
		{ type: 'actions', title: 'Quick actions', size: 'full', items: actions },
		{ type: 'stat', route: order, title: 'Sales today', metric: 'sum', field: 'total', range: 'today', compare: true, filters: LIVE },
		{ type: 'stat', route: order, title: 'Sales (30 days)', metric: 'sum', field: 'total', range: '30d', compare: true, filters: LIVE },
		{ type: 'stat', route: order, title: 'Orders (30 days)', metric: 'count', range: '30d', compare: true, filters: LIVE },
		{ type: 'stat', route: order, title: 'Average order (30 days)', metric: 'avg', field: 'total', range: '30d', filters: LIVE },
		{ type: 'stat', route: order, title: 'New website orders', metric: 'count', range: 'all', size: 'md', filters: [{ field: 'channel', value: 'website' }, { field: 'status', value: 'open' }, { field: 'fulfilment', value: 'unfulfilled' }] },
		{ type: 'stat', route: order, title: 'Unpaid orders', metric: 'count', range: 'all', size: 'md', filters: [{ field: 'status', value: 'open' }, { field: 'paymentStatus', op: 'in', value: ['unpaid', 'partial'] }] },
		{ type: 'stat', route: order, title: 'Returns (30 days)', metric: 'count', range: '30d', size: 'md', filters: [{ field: 'returnedItems', op: 'ne', value: 0 }] },
		{ type: 'chart', route: order, title: 'Sales', group: 'time', chart: 'bar', metric: 'sum', field: 'total', range: '30d', interval: 'day', size: 'xl', filters: LIVE },
		{ type: 'chart', route: order, title: 'Orders by origin', group: 'field', chart: 'donut', by: 'channel', metric: 'count', range: '30d', size: 'md', filters: LIVE },
		{ type: 'chart', route: order, title: 'Orders by stage', group: 'field', chart: 'donut', by: 'fulfilment', metric: 'count', range: '30d', size: 'md', filters: LIVE },
		{ type: 'recent', route: order, title: 'Latest orders', columns: ['code', 'channel', 'total', 'paymentStatus', 'fulfilment'], limit: 8, size: 'xl' },
	];
	return raw.map((w, i) => normalizeWidget(w, i)).flatMap((r: any) => (r.widget ? [r.widget] : []));
};

/** Gives a store the dashboard when it has none of its own — never replaces one someone built. */
export const seedStoreDashboard = async (installed: Installed, { apply = true } = {}): Promise<string[]> => {
	const doc: any = await DashboardConfig.findOne({ key: 'default' }).lean();
	if (doc?.widgets?.length) return [];
	if (apply) await DashboardConfig.findOneAndUpdate({ key: 'default' }, { $set: { widgets: storeDashboard(installed) } }, { upsert: true });
	return ['the store’s home dashboard: sales, orders, charts, latest orders and quick actions'];
};
