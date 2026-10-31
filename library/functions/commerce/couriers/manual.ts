import { Booked, CourierAdapter, Conn, Parcel, TestResult } from './types.js';
import { CourierRefusal } from './http.js';

/**
 * Manual courier (docs/couriers CR16, CR-15): any courier without an API —
 * Sundarban, a local rider, the shop's own van. The store lists the names it
 * uses (each with a tracking-link pattern if it has one); Send takes the
 * tracking code someone types, and the status is moved by hand on the
 * Delivery card. The same Delivery record, so every store tracks its parcels.
 */

/** "Sundarban | https://sundarban.example/track/{tracking}" per line → [{ name, link }]. */
export const manualCouriers = (settings: Record<string, any>) =>
	String(settings?.names || '')
		.split('\n')
		.map(l => l.split('|').map(x => x.trim()))
		.filter(([name]) => name)
		.slice(0, 30)
		.map(([name, link]) => ({ name: name.slice(0, 60), link: /^https?:\/\/\S+$/i.test(link || '') ? link : '' }));

const test = async (conn: Conn): Promise<TestResult> => {
	const list = manualCouriers(conn.settings);
	return list.length
		? { ok: true, message: `Ready — ${list.map(c => c.name).join(', ')}` }
		: { ok: false, message: 'Add the couriers you use, one per line (a name, and | its tracking link with {tracking} if it has one).' };
};

const book = async (conn: Conn, p: Parcel): Promise<Booked> => {
	const list = manualCouriers(conn.settings);
	const name = String(p.options?.name || list[0]?.name || '').trim();
	const c = list.find(x => x.name.toLowerCase() === name.toLowerCase());
	if (!c) throw new CourierRefusal(`Choose one of your couriers: ${list.map(x => x.name).join(', ') || 'add them in Store settings → Delivery'}`);
	const tracking = String(p.options?.tracking || '').trim().slice(0, 100);
	return {
		consignment: tracking || p.invoice,
		trackingCode: tracking,
		...(tracking && c.link && { trackingUrl: c.link.replace('{tracking}', encodeURIComponent(tracking)) }),
		courierStatus: 'handed-over',
		courierName: c.name,
	} as Booked;
};

export const manual: CourierAdapter = {
	id: 'manual',
	name: 'Manual courier',
	countries: ['*'],
	sandbox: false,
	ready: true,
	links: { signUp: '', keys: '' },
	credentials: [],
	settings: [
		{
			key: 'names',
			label: 'Couriers you use',
			kind: 'text',
			default: '',
			helper: 'One per line: a name, then | and its tracking link with {tracking} if it has one — Sundarban | https://…/{tracking}',
		},
	],
	test,
	book,
	normalise: s => (['booked', 'picked-up', 'in-transit', 'out-for-delivery', 'delivered', 'partly-delivered', 'on-hold', 'failed-attempt', 'returning', 'returned', 'cancelled', 'lost'].includes(s) ? (s as any) : null),
};
