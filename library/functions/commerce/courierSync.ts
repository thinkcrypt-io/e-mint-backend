import CourierConnection from '../../models/tenancy/courierConnection.model.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import { runInScope, runUnscoped } from '../tenantScope.function.js';
import { storeOf } from './store.js';
import { FINAL, refresh, settleFromPayout } from './deliveries.js';
import { adapterOf } from './couriers/index.js';
import { usableConnection } from './connections.js';

/**
 * The regular check (docs/couriers CR12, CR-11): webhooks get lost, so every
 * 15 minutes each store's parcels that haven't heard anything for 2 hours —
 * booked in the last 30 days, not finished — are asked about, a few per
 * connection each time. A parcel is claimed by moving its `lastSyncedAt`
 * first, so two servers never ask about the same one.
 */

const TICK_MS = () => Number(process.env.COURIER_SYNC_MS) || 15 * 60 * 1000;
const QUIET_MS = () => Number(process.env.COURIER_QUIET_MS) || 2 * 3600 * 1000;
const PER_CONNECTION = 10;
const DAY = 24 * 3600 * 1000;

/** One store: its quiet parcels with this courier, claimed and refreshed. */
const syncStore = async (project: any, courier: string) => {
	const store = await storeOf();
	if (!store.installed.delivery) return 0;
	const D = store.M('delivery');
	const now = Date.now();
	const quiet = new Date(now - QUIET_MS());
	const due: any[] = await D.find(
		{
			courier,
			status: { $nin: [...FINAL, 'error', 'draft'] },
			consignment: { $nin: [null, ''] },
			bookedAt: { $gte: new Date(now - 30 * DAY) },
			$and: [{ $or: [{ lastEventAt: null }, { lastEventAt: { $lt: quiet } }] }, { $or: [{ lastSyncedAt: null }, { lastSyncedAt: { $lt: quiet } }] }],
		},
		{ _id: 1, lastSyncedAt: 1 }
	)
		.sort({ lastSyncedAt: 1 })
		.limit(PER_CONNECTION)
		.lean();
	let n = 0;
	for (const d of due) {
		const claim = await D.updateOne({ _id: d._id, lastSyncedAt: d.lastSyncedAt ?? null }, { $set: { lastSyncedAt: new Date() } });
		if (!claim.modifiedCount) continue;
		await refresh(store, project, d._id).catch(() => undefined);
		n++;
	}
	return n;
};

/** Once a day per connection: the courier's payouts mark its delivered parcels paid out (CR11). */
const PAYOUT_MS = () => Number(process.env.COURIER_PAYOUT_MS) || DAY;
const syncPayouts = async (project: any, courier: string) => {
	const adapter = adapterOf(courier);
	if (!adapter?.payouts) return 0;
	const u = await usableConnection(project, courier);
	if (!u) return 0;
	const last = u.doc.cache?.payoutsAt ? new Date(u.doc.cache.payoutsAt) : null;
	if (last && Date.now() - last.getTime() < PAYOUT_MS()) return 0;
	const claim = await CourierConnection.updateOne({ _id: u.doc._id, 'cache.payoutsAt': u.doc.cache?.payoutsAt ?? null }, { $set: { 'cache.payoutsAt': new Date() } });
	if (!claim.modifiedCount) return 0;
	const store = await storeOf();
	let n = 0;
	for (const p of await adapter.payouts(u.conn, last || new Date(Date.now() - 30 * DAY))) n += await settleFromPayout(store, courier, p.ref, p.parcels);
	return n;
};

/** Every connected courier in every store, once. */
export const runCourierSync = async () => {
	const conns: any[] = await runUnscoped(() => CourierConnection.find({ 'test.ok': true }, { courier: 1, organization: 1, project: 1 }).lean());
	let asked = 0;
	for (const c of conns) {
		try {
			const project: any = await runUnscoped(() => TenantProject.findById(c.project).lean());
			if (!project || project.type !== 'ecommerce' || project.isActive === false) continue;
			asked += await runInScope({ organization: c.organization, project: c.project }, () => syncStore(project, c.courier));
			await runInScope({ organization: c.organization, project: c.project }, () => syncPayouts(project, c.courier)).catch((e: any) => console.error('courier payouts:', e?.message));
		} catch (e: any) {
			console.error('courier sync:', e?.message);
		}
	}
	return asked;
};

let running = false;
export const scheduleCourierSync = () => {
	setInterval(async () => {
		if (running) return;
		running = true;
		try {
			await runCourierSync();
		} finally {
			running = false;
		}
	}, TICK_MS()).unref();
};
