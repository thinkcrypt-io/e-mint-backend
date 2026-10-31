import Automation from '../../models/tenancy/automation.model.js';
import { checkAutomation } from '../automations.function.js';

/**
 * The store's two delivery emails (docs/couriers CR17, CR-14): automations on
 * Deliveries, installed switched off — the owner turns them on in
 * Automations. They go to the order's email (a website buyer's), when the
 * courier picks the parcel up and when it's delivered.
 */
const READY = (route: string) => [
	{
		name: 'Tell the customer it’s on the way',
		description: 'Emails the buyer when the courier picks the parcel up — with its tracking link. Installed by the store, off until you turn it on.',
		enabled: false,
		route,
		on: ['update'],
		changed: ['status'],
		when: [{ field: 'status', op: 'is', value: 'picked-up' }],
		actions: [
			{
				type: 'email',
				to: { fields: ['order.email'] },
				subject: 'Your order is on its way',
				body: 'Hello,\n\nYour order {{order}} is with {{courierName}} and on its way to you.\n\nTracking code: {{trackingCode}}\n{{trackingUrl}}\n\nThank you for shopping with us.',
			},
		],
	},
	{
		name: 'Tell the customer it’s delivered',
		description: 'Emails the buyer when the courier delivers the parcel. Installed by the store, off until you turn it on.',
		enabled: false,
		route,
		on: ['update'],
		changed: ['status'],
		when: [{ field: 'status', op: 'is', value: 'delivered' }],
		actions: [
			{
				type: 'email',
				to: { fields: ['order.email'] },
				subject: 'Your order has been delivered',
				body: 'Hello,\n\n{{courierName}} has delivered your order {{order}}. We hope you enjoy it — reply to this email if anything isn’t right.',
			},
		],
	},
];

/** Puts the two in, where missing (by name on Deliveries). Safe to run again. */
export const ensureDeliveryAutomations = async (installed: Record<string, any>, { apply = true } = {}) => {
	const route = installed.delivery?.route;
	if (!route) return [];
	const added: string[] = [];
	for (const body of READY(route)) {
		if (await Automation.exists({ route, name: body.name })) continue;
		added.push(body.name);
		if (!apply) continue;
		try {
			await Automation.create(await checkAutomation(body));
		} catch (e: any) {
			console.error('delivery automations:', body.name, e?.message, e?.extra || '');
		}
	}
	return added;
};
