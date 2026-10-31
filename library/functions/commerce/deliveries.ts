import CourierConnection from '../../models/tenancy/courierConnection.model.js';
import { TenancyError } from '../tenancy.function.js';
import { Store, roundFor } from './store.js';
import { isId } from './catalogue.js';
import { recordPayment, settleOrder } from './payments.js';
import { adapterOf } from './couriers/index.js';
import { CourierError, CourierRefusal, bdPhone } from './couriers/http.js';
import { usableConnection } from './connections.js';
import { applyUnmatched } from './courierWebhooks.js';
import { NEEDS_AREA, rememberAreas, suggestAreas } from './courierAreas.js';
import { fireAutomations } from '../automations.function.js';

/** A delivery's status changed: the project's automations on Deliveries run (CR17 — the store's two emails among them). */
const statusChanged = async (store: Store, id: any, actor: string) => {
	const doc: any = await store.M('delivery').findById(id).lean();
	if (doc) fireAutomations({ route: store.installed.delivery.route, event: 'update', doc, changes: [{ field: 'status' }], actor: { name: actor } });
};
import type { Booked, CourierEvent, NormalStatus, Parcel } from './couriers/types.js';

/**
 * Deliveries (docs/couriers CR-05): an order sent to a courier becomes a
 * Delivery; what the courier says — by webhook, a check, or a person — moves
 * it, and through it the order (CR7) and its cash on delivery (CR8). Booking
 * is safe to retry (CR13): the delivery is made first, the courier called
 * after, and a timeout looks the parcel up before saying it failed.
 */

/** A delivery that's done with: a new one may be sent for its order. */
export const ENDED: NormalStatus[] = ['cancelled', 'returned', 'lost'];
/** Statuses that never move again by themselves. */
export const FINAL: NormalStatus[] = ['delivered', 'partly-delivered', 'returned', 'cancelled', 'lost'];
/** Side states: an older event may still move a delivery into these (CR9). */
const SIDE: NormalStatus[] = ['on-hold', 'failed-attempt', 'returning', 'returned', 'cancelled', 'lost'];
/** Where a delivery is on the way there, for "never move back". */
const RANK: Partial<Record<NormalStatus, number>> = {
	draft: 0, booking: 1, error: 1, booked: 2, 'pickup-pending': 3, 'picked-up': 4, 'in-transit': 5, 'out-for-delivery': 6, delivered: 7, 'partly-delivered': 7,
};
const SHIPPED: NormalStatus[] = ['picked-up', 'in-transit', 'out-for-delivery'];

export const STATUS_LABEL: Record<string, string> = {
	draft: 'Draft', booking: 'Sending', booked: 'Booked', 'pickup-pending': 'Waiting for pickup', 'picked-up': 'Picked up', 'in-transit': 'On the way',
	'out-for-delivery': 'Out for delivery', delivered: 'Delivered', 'partly-delivered': 'Partly delivered', 'on-hold': 'On hold', 'failed-attempt': 'Delivery attempt failed',
	returning: 'Coming back', returned: 'Returned', cancelled: 'Cancelled', lost: 'Lost', error: 'Not sent',
};

const UNCERTAIN = 'booking-uncertain';
const isUncertain = (d: any) => d?.status === 'error' && (d.events || []).slice(-1)[0]?.courierStatus === UNCERTAIN;

const deliveryOn = (store: Store) => {
	if (!store.installed.delivery) throw new TenancyError(409, 'This store has no Deliveries yet — run the store upgrade');
	return store.M('delivery');
};

const orderFor = async (store: Store, id: any) => {
	const o: any = isId(id) ? await store.M('order').findById(id).lean() : null;
	if (!o || o.status === 'held') throw new TenancyError(404, 'Order not found');
	return o;
};

const activeFor = (store: Store, orderId: any) => deliveryOn(store).findOne({ order: orderId, status: { $nin: ENDED } }).sort({ createdAt: -1 }).lean();

/** The couriers this order can go with: turned on, connected, tested with the keys as they are, booking built. */
const couriersFor = async (store: Store, project: any) => {
	const ids: string[] = store.answers.delivery?.enabled ? store.answers.delivery.couriers || [] : [];
	const out: any[] = [];
	for (const id of ids) {
		const a = adapterOf(id);
		if (!a?.ready || !a.book) continue;
		const u = await usableConnection(project, id);
		if (u) out.push({ id, name: a.name, mode: u.conn.mode, settings: u.doc.settings || {}, canCancel: !!a.cancel, canQuote: !!a.quote });
	}
	return out;
};

/**
 * Our invoice for a parcel (CR13): the order number, -2 / -3 on a resend, and a tag for the store — a courier account
 * refuses an invoice it has seen, and every store numbers its website orders WEB-00001…, so two stores on one account
 * (or an account that books from elsewhere too) would otherwise clash. WEB-00001_7F3A.
 */
export const invoiceFor = (project: any, code: string, earlier: number) => `${earlier ? `${code}-${earlier + 1}` : code}_${String(project?._id || '').slice(-4).toUpperCase()}`;

const itemsOf = (o: any) => Math.max(1, (o.items || []).reduce((s: number, i: any) => s + Math.max(0, (Number(i.quantity) || 0) - (Number(i.returned) || 0)), 0));
const wholeDue = (o: any) => Math.max(0, Math.ceil(Number(o.balance) || 0));

/** GET orders/:id/send — what the Send to courier dialog starts with. */
export const sendPrefill = async (store: Store, project: any, orderId: any) => {
	const o = await orderFor(store, orderId);
	const couriers = await couriersFor(store, project);
	const active: any = await activeFor(store, o._id);
	const to = { name: o.delivery?.name || '', area: o.delivery?.area || '', city: o.delivery?.city || '', address: o.delivery?.address || '' };
	// Each courier's area picks for this address: remembered, or matched from its lists (CR14).
	for (const c of couriers) c.areas = await suggestAreas(c.id, to);
	return {
		order: { _id: o._id, code: o.code, total: o.total, balance: o.balance, fulfilment: o.fulfilment, status: o.status },
		couriers,
		active: active ? { _id: active._id, code: active.code, courier: active.courier, status: active.status, error: active.error || '', uncertain: isUncertain(active) } : null,
		prefill: {
			courier: couriers[0]?.id || '',
			recipient: { name: o.delivery?.name || '', phone: o.delivery?.phone || '', address: o.delivery?.address || '', area: o.delivery?.area || '', city: o.delivery?.city || '', email: o.delivery?.email || o.email || '' },
			cod: wholeDue(o),
			maxCod: wholeDue(o),
			weight: Number(couriers[0]?.settings?.defaultWeight) || 0.5,
			items: itemsOf(o),
			note: '',
		},
	};
};

/** The order's courier section: an engine-written summary of its current delivery (CR2). */
const summarise = async (store: Store, orderId: any) => {
	const D = deliveryOn(store);
	const cur: any = (await D.findOne({ order: orderId, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean()) || (await D.findOne({ order: orderId }).sort({ createdAt: -1 }).lean());
	const courier = cur
		? {
				provider: cur.courierName || cur.courier,
				consignment: cur.consignment || '',
				tracking: cur.trackingCode || '',
				status: STATUS_LABEL[cur.status] || cur.status,
				cod: Number(cur.cod) || 0,
				bookedAt: cur.bookedAt || null,
				lastUpdate: cur.lastEventAt || cur.updatedAt || new Date(),
				delivery: cur.code || '',
				trackingUrl: cur.trackingUrl || '',
		  }
		: {};
	await store.M('order').updateOne({ _id: orderId }, { $set: { courier } });
};

const event = (status: string, courierStatus: string, message: string, source: 'webhook' | 'sync' | 'staff', by = '', at = new Date()) => ({ at, status, courierStatus, message: String(message || '').slice(0, 500), source, by });

/** Wrong keys: the connection is untested until someone fixes them (and Steadfast never gets them again). */
const keysRefused = (courier: string, message: string) =>
	CourierConnection.updateOne({ courier }, { $set: { 'test.ok': false, 'test.rejected': true, 'test.message': message, 'test.at': new Date() } });

type SendInput = { courier?: string; recipient?: any; cod?: any; weight?: any; items?: any; note?: any; options?: any; confirmNotBooked?: boolean };

/** Checks an order and makes (or reopens) its delivery in `booking`, ready for the courier — the first half of a send. */
const prepare = async (store: Store, project: any, orderId: any, input: SendInput, by: string) => {
	const D = deliveryOn(store);
	const o = await orderFor(store, orderId);
	if (o.status === 'cancelled' || o.fulfilment === 'cancelled') throw new TenancyError(409, 'This order is cancelled');
	if (['delivered', 'returned'].includes(o.fulfilment)) throw new TenancyError(409, `This order is ${o.fulfilment} already`);
	const id = String(input.courier || '');
	const adapter = adapterOf(id);
	if (!adapter?.book || !adapter.ready) throw new TenancyError(400, 'Choose a courier');
	const usable = await usableConnection(project, id);
	if (!usable) throw new TenancyError(409, `Connect and test ${adapter.name} in Store settings → Delivery first`, 'courier_not_connected');

	// One parcel on its way per order: an earlier one that failed is tried again, anything else is refused.
	let d: any = await activeFor(store, o._id);
	if (d && !(d.status === 'error' && d.courier === id)) throw new TenancyError(409, `Already with ${d.courierName || d.courier} — ${d.code}`, 'delivery_open');
	if (d && isUncertain(d) && !input.confirmNotBooked)
		throw new TenancyError(409, `${adapter.name} may have booked it already — check the ${adapter.name} panel for ${d.invoice}, then confirm it isn’t there`, 'delivery_uncertain');

	const r = input.recipient || {};
	const recipient = {
		name: String(r.name ?? o.delivery?.name ?? '').trim().slice(0, 100),
		phone: String(r.phone ?? o.delivery?.phone ?? '').trim(),
		address: String(r.address ?? o.delivery?.address ?? '').trim().slice(0, 500),
		area: String(r.area ?? o.delivery?.area ?? '').trim().slice(0, 100),
		city: String(r.city ?? o.delivery?.city ?? '').trim().slice(0, 100),
		email: String(r.email ?? o.delivery?.email ?? o.email ?? '').trim().slice(0, 100),
	};
	const problems: string[] = [];
	if (recipient.name.length < 2) problems.push('Who it goes to');
	if (adapter.countries.includes('BD') && !bdPhone(recipient.phone)) problems.push('A Bangladeshi mobile number (01XXXXXXXXX)');
	if (recipient.address.length < 10) problems.push('The address (10 characters or more)');
	const due = wholeDue(o);
	const cod = input.cod === undefined || input.cod === '' ? due : Number(input.cod);
	if (!Number.isFinite(cod) || cod < 0 || cod > due || Math.round(cod) !== cod) problems.push(`Cash to collect: a whole number from 0 to ${due}`);
	const weight = input.weight === undefined || input.weight === '' ? Number(usable.doc.settings?.defaultWeight) || 0.5 : Number(input.weight);
	if (!Number.isFinite(weight) || weight <= 0 || weight > 50) problems.push('Weight: more than 0, in kg');
	const items = input.items === undefined || input.items === '' ? itemsOf(o) : Math.round(Number(input.items));
	if (!Number.isFinite(items) || items < 1) problems.push('Items: 1 or more');
	if (problems.length) {
		const e: any = new TenancyError(400, `Check: ${problems.join('; ')}`, 'delivery_input');
		e.extra = { problems };
		throw e;
	}
	const note = String(input.note || '').trim().slice(0, 480);
	const options = { ...(usable.doc.settings || {}), ...(input.options && typeof input.options === 'object' ? input.options : {}) };
	const pick = (k: string) => (options[k] !== undefined && options[k] !== null ? String(options[k]) : '');

	if (d) {
		// Tried again: the same invoice (a refusal or an unanswered call never took it).
		await D.updateOne({ _id: d._id }, { $set: { status: 'booking', recipient, cod, weight, items, note, error: '', options: { store: pick('store'), city: pick('city'), zone: pick('zone'), area: pick('area'), deliveryType: pick('deliveryType'), itemType: pick('itemType') } }, $push: { events: event('booking', 'retry', 'Sent again', 'staff', by) } });
	} else {
		const n = await D.countDocuments({ order: o._id });
		d = await D.create({
			order: o._id,
			courier: id,
			courierName: adapter.name,
			status: 'booking',
			invoice: invoiceFor(project, o.code, n),
			cod,
			recipient,
			weight,
			items,
			note,
			outlet: o.outlet,
			options: { store: pick('store'), city: pick('city'), zone: pick('zone'), area: pick('area'), deliveryType: pick('deliveryType'), itemType: pick('itemType') },
			events: [event('booking', '', `Sending to ${adapter.name}`, 'staff', by)],
		});
		d = d.toObject();
		// Two sends at once: the later one gives way.
		const rivals: any[] = await D.find({ order: o._id, status: { $nin: ENDED } }, { _id: 1, code: 1 }).sort({ _id: 1 }).lean();
		if (rivals.length > 1 && String(rivals[0]._id) !== String(d._id)) {
			await D.deleteOne({ _id: d._id });
			throw new TenancyError(409, `Already being sent — ${rivals[0].code}`, 'delivery_open');
		}
	}

	const parcel: Parcel = {
		invoice: d.invoice,
		recipient,
		cod,
		value: Math.max(0, Math.round(Number(o.total) || 0)),
		weight,
		items,
		note,
		description: (o.items || []).map((i: any) => `${i.quantity} × ${i.name}`).join(', ').slice(0, 250),
		options,
	};
	const fail = async (message: string, courierStatus = 'refused') => {
		await D.updateOne({ _id: d._id }, { $set: { status: 'error', error: message }, $push: { events: event('error', courierStatus, message, 'staff', by) } });
		await summarise(store, o._id);
	};
	return { D, o, d, id, adapter, usable, parcel, recipient, input, fail };
};
type Prepared = Awaited<ReturnType<typeof prepare>>;

/** A booking the courier answered: the delivery booked, the order's summary, the area remembered — the second half. */
const finish = async (store: Store, ctx: Prepared, booked: Booked, by: string) => {
	const { D, d, o, id, adapter, recipient, input } = ctx;
	const now = new Date();
	await D.updateOne(
		{ _id: d._id },
		{
			$set: {
				status: booked.pending ? 'booking' : 'booked',
				consignment: booked.consignment,
				trackingCode: booked.trackingCode,
				trackingUrl: booked.trackingUrl || '',
				courierStatus: booked.courierStatus,
				courierMessage: '',
				...(booked.charge !== undefined && { charge: booked.charge }),
				bookedAt: now,
				lastEventAt: now,
				error: '',
			},
			$push: { events: event(booked.pending ? 'booking' : 'booked', booked.courierStatus, `Booked with ${adapter.name}${booked.trackingCode ? ` — ${booked.trackingCode}` : ''}`, 'staff', by, now) },
		}
	);
	// The area picked for this address, for the next order from there (CR14).
	if (input.options?.area) await rememberAreas(id, recipient, input.options).catch(() => undefined);
	// What the courier said about it before the booking answered (Pathao's order.created).
	if (booked.consignment || d.invoice) await applyUnmatched(id, d._id, booked.consignment, d.invoice).catch((e: any) => console.error('courier unmatched:', e?.message));
	await summarise(store, o._id);
	await statusChanged(store, d._id, by);
};

/** POST orders/:id/deliveries — sends the order to a courier (CR13). */
export const send = async (store: Store, project: any, orderId: any, input: SendInput, by: string) => {
	const ctx = await prepare(store, project, orderId, input, by);
	const { d, id, adapter, usable, parcel, fail } = ctx;
	if (!adapter.book) throw new TenancyError(400, 'Choose a courier');
	let booked: Booked | null = null;
	try {
		booked = await adapter.book(usable.conn, parcel);
	} catch (e: any) {
		if (e instanceof CourierRefusal) {
			if (e.rejected) await keysRefused(id, e.message);
			await fail(e.message);
			throw new TenancyError(400, e.message, 'courier_refused');
		}
		if (!(e instanceof CourierError)) {
			await fail(`${adapter.name} couldn’t be reached — try again`);
			throw e;
		}
		// No answer: it may have been booked. Look it up before saying it failed.
		if (adapter.find)
			for (const wait of [3000, 5000]) {
				await new Promise(r => setTimeout(r, wait));
				booked = await adapter.find(usable.conn, d.invoice).catch(() => null);
				if (booked) break;
			}
		if (!booked) {
			const msg = adapter.find
				? `${adapter.name} didn’t answer and doesn’t have it — send it again`
				: `${adapter.name} didn’t answer — it may have been booked. Check the ${adapter.name} panel for ${d.invoice} before sending again`;
			await fail(msg, adapter.find ? 'no-answer' : UNCERTAIN);
			throw new TenancyError(502, msg, 'courier_no_answer');
		}
	}
	await finish(store, ctx, booked!, by);
	return deliveryDetail(store, d._id);
};

/**
 * POST deliveries/bulk — { orders: [ids, ≤ 100], courier, weight?, note? } (CR-12): each order through the same
 * checks as one send; Steadfast's bulk API books them in one call, the others 3 at a time. Areas only from earlier
 * picks (never a guess). Answers each order's result.
 */
export const sendMany = async (store: Store, project: any, input: { orders?: any[]; courier?: string; weight?: any; note?: any }, by: string) => {
	const ids = [...new Set((Array.isArray(input.orders) ? input.orders : []).map(String))].filter(isId);
	if (!ids.length) throw new TenancyError(400, 'Pick the orders to send');
	if (ids.length > 100) throw new TenancyError(400, 'Up to 100 orders at a time');
	const courier = String(input.courier || '');
	const adapter = adapterOf(courier);
	if (!adapter?.ready || !adapter.book) throw new TenancyError(400, 'Choose a courier');
	if (!(await usableConnection(project, courier))) throw new TenancyError(409, `Connect and test ${adapter.name} in Store settings → Delivery first`, 'courier_not_connected');
	const results: Record<string, { ok: boolean; code?: string; delivery?: string; error?: string }> = {};
	const optsFor = async (orderId: string) => {
		const o: any = await store.M('order').findById(orderId, { delivery: 1, code: 1 }).lean();
		if (!o) return null;
		const { picks } = await suggestAreas(courier, { ...(o.delivery || {}) }, { match: false });
		if (NEEDS_AREA.has(courier) && !picks.area) return { error: `Choose the ${adapter.name} area once for “${o.delivery?.area || o.delivery?.city || 'this address'}” — send this one on its own` };
		return { options: picks };
	};
	const base = { courier, ...(input.weight !== undefined && input.weight !== '' && { weight: input.weight }), ...(input.note && { note: input.note }) };

	if (adapter.bookMany && courier === 'steadfast') {
		const ready: Prepared[] = [];
		for (const id of ids) {
			try {
				ready.push(await prepare(store, project, id, { ...base }, by));
			} catch (e: any) {
				results[id] = { ok: false, error: e.message };
			}
		}
		if (ready.length) {
			const usable = ready[0].usable;
			let answers: Awaited<ReturnType<NonNullable<typeof adapter.bookMany>>> = [];
			try {
				answers = await adapter.bookMany(usable.conn, ready.map(r => r.parcel));
			} catch (e: any) {
				// The whole call failed: none was taken (Steadfast refuses a reused invoice, so sending again is safe).
				for (const r of ready) {
					await r.fail(e.message || `${adapter.name} couldn’t be reached`);
					results[String(r.o._id)] = { ok: false, code: r.o.code, delivery: r.d.code, error: e.message };
				}
				answers = [];
			}
			for (const [i, a] of answers.entries()) {
				const r = ready[i];
				const key = String(r.o._id);
				if (a.ok) {
					await finish(store, r, a.booked, by);
					results[key] = { ok: true, code: r.o.code, delivery: r.d.code };
				} else {
					await r.fail(a.error);
					results[key] = { ok: false, code: r.o.code, delivery: r.d.code, error: a.error };
				}
			}
		}
	} else {
		const queue = [...ids];
		const worker = async () => {
			for (let id = queue.shift(); id; id = queue.shift()) {
				try {
					const o = await optsFor(id);
					if (!o) throw new TenancyError(404, 'Order not found');
					if ('error' in o) throw new TenancyError(400, o.error as string);
					const out = await send(store, project, id, { ...base, options: o.options }, by);
					results[id] = { ok: true, code: (out.order as any)?.code, delivery: out.delivery.code };
				} catch (e: any) {
					results[id] = { ok: false, error: e.message };
				}
			}
		};
		await Promise.all([worker(), worker(), worker()]);
	}
	const list = ids.map(id => ({ order: id, ...results[id] }));
	return { results: list, sent: list.filter(x => x.ok).length, failed: list.filter(x => !x.ok).length };
};

/** The order follows its delivery (CR7). Never a plain save: from the store's own rules. */
const orderEffects = async (store: Store, d: any, to: NormalStatus) => {
	const Order = store.M('order');
	const o: any = await Order.findById(d.order).lean();
	if (!o || o.status === 'cancelled') return;
	const from = o.fulfilment || 'unfulfilled';
	if (SHIPPED.includes(to) && ['unfulfilled', 'confirmed', 'fulfilled'].includes(from)) await Order.updateOne({ _id: o._id, fulfilment: from }, { $set: { fulfilment: 'shipped' } });
	if ((to === 'delivered' || to === 'partly-delivered') && from !== 'delivered')
		await Order.updateOne(
			{ _id: o._id },
			{
				$set: {
					fulfilment: 'delivered',
					status: 'completed',
					completedAt: new Date(),
					...(to === 'partly-delivered' && { note: [o.note, `${d.courierName}: partly delivered — the rest is coming back (${d.code})`].filter(Boolean).join('\n') }),
				},
			}
		);
	if (to === 'returned' && from !== 'returned') await Order.updateOne({ _id: o._id }, { $set: { fulfilment: 'returned' } });
};

/** Cash on delivery collected (CR8): one payment per delivery, through the ledger, so the order shows paid. */
const codPayment = async (store: Store, d: any, collected: number | undefined, by: string) => {
	if (d.payment) return null;
	const round = roundFor(store.answers.store.currency);
	const o: any = await store.M('order').findById(d.order, { balance: 1, outlet: 1, customer: 1 }).lean();
	const amount = round(Math.min(Math.max(0, Number(collected ?? d.cod) || 0), Math.max(0, Number(o?.balance) || 0)));
	if (!o || amount <= 0) return null;
	const p: any = await recordPayment(store, {
		order: d.order,
		type: 'payment',
		method: 'courier-cod',
		methodLabel: `Cash on delivery (${d.courierName})`,
		amount,
		reference: d.consignment || d.code,
		outlet: o.outlet,
		...(o.customer && { customer: o.customer }),
		by,
		note: `Collected by ${d.courierName} — ${d.code}`,
	});
	await settleOrder(store, d.order);
	return p._id;
};

/**
 * One thing the courier said, applied to its delivery (CR6, CR9): the
 * timeline always gets it; the status moves unless it's older than what we
 * have (side states excepted) or the delivery is done; the order follows.
 */
export const applyEvent = async (store: Store, deliveryId: any, ev: CourierEvent, source: 'webhook' | 'sync' | 'staff', by = '') => {
	const D = deliveryOn(store);
	const d: any = await D.findById(deliveryId).lean();
	if (!d) return { applied: false, reason: 'no-delivery' };
	const who = by || (source === 'webhook' ? `${d.courierName} (webhook)` : source === 'sync' ? `${d.courierName} (check)` : '');
	const at = ev.at instanceof Date && !Number.isNaN(ev.at.getTime()) ? ev.at : new Date();
	const set: any = {};
	if (source === 'sync') set.lastSyncedAt = new Date();

	// A check that says what we know already changes nothing but when we last asked.
	const same = ev.kind === 'status' && ev.courierStatus === d.courierStatus;
	if (same && source !== 'webhook') {
		await D.updateOne({ _id: d._id }, { $set: set });
		return { applied: false, reason: 'unchanged' };
	}
	if ((d.events || []).some((x: any) => x.courierStatus === ev.courierStatus && new Date(x.at).getTime() === at.getTime() && (x.message || '') === String(ev.message || '').slice(0, 500)))
		return { applied: false, reason: 'duplicate' };

	let to: NormalStatus | null = ev.kind === 'status' ? ev.status : null;
	// Older than the last thing the courier itself said (never our own booking time: its clock may be behind ours).
	const lastCourier = Math.max(0, ...(d.events || []).filter((x: any) => x.source !== 'staff').map((x: any) => new Date(x.at).getTime() || 0));
	// A check is the courier's word now, whatever the clocks say; it still never moves a parcel back (RANK).
	const older = source !== 'sync' && lastCourier > 0 && at.getTime() < lastCourier;
	if (to) {
		const cur = d.status as NormalStatus;
		const backwards = (RANK[to] ?? 99) < (RANK[cur] ?? -1) && !SIDE.includes(to);
		if (FINAL.includes(cur) && !(cur === 'delivered' && ['returning', 'returned'].includes(to)) && !(cur === 'partly-delivered' && to === 'returned')) to = null;
		else if ((older && !SIDE.includes(to)) || backwards) to = null;
		else if (to === cur) to = null;
	}
	const message =
		ev.message ||
		(ev.awaitingApproval ? `The rider says ${ev.courierStatus.replace(/_approval_pending$/, '').replace(/_/g, ' ')} — waiting for ${d.courierName} to confirm` : '') ||
		(ev.kind === 'status' ? STATUS_LABEL[ev.status || ''] || ev.courierStatus : ev.courierStatus.replace(/[_.]/g, ' '));
	if (ev.kind === 'status' && !older) {
		set.courierStatus = ev.courierStatus;
		set.courierMessage = message;
	}
	if (!older) set.lastEventAt = at;
	if (ev.charge !== undefined) set.charge = ev.charge;
	// The courier names the parcel we sent without an answer: it was booked after all.
	if (!d.consignment && ev.consignment) {
		Object.assign(set, { consignment: String(ev.consignment), trackingCode: d.trackingCode || String(ev.consignment), error: '', bookedAt: d.bookedAt || at });
		if (!to || (RANK[to] ?? 0) < 2) to = 'booked';
	}
	if (ev.collected !== undefined && (to === 'delivered' || to === 'partly-delivered' || d.status === 'delivered' || d.status === 'partly-delivered')) set.collected = ev.collected;
	// Delivered with no amount said: the cash it was sent to collect.
	else if (to === 'delivered') set.collected = Number(d.cod) || 0;
	if (ev.settled) Object.assign(set, { settled: true, ...(ev.settled.ref && { payoutRef: ev.settled.ref }) });
	if (ev.changed) {
		const c = ev.changed;
		if (c.cod_amount !== undefined) set.cod = Number(c.cod_amount) || 0;
		if (c.recipient_name) set['recipient.name'] = String(c.recipient_name);
		if (c.recipient_phone) set['recipient.phone'] = String(c.recipient_phone);
		if (c.recipient_address) set['recipient.address'] = String(c.recipient_address);
	}
	if (to) {
		set.status = to;
		if (to === 'picked-up' && !d.pickedAt) set.pickedAt = at;
		if ((to === 'delivered' || to === 'partly-delivered') && !d.deliveredAt) set.deliveredAt = at;
		if (to === 'booked' && !d.bookedAt) set.bookedAt = at;
	}
	await D.updateOne({ _id: d._id }, { $set: set, $push: { events: event(to || d.status, ev.courierStatus, message, source, who, at) } });
	if (to) {
		await orderEffects(store, d, to);
		if (to === 'delivered' || to === 'partly-delivered') {
			// Partly delivered: only what the courier says it collected.
			const pid = await codPayment(store, { ...d, ...set }, to === 'partly-delivered' ? ev.collected ?? 0 : ev.collected, who);
			if (pid) await D.updateOne({ _id: d._id }, { $set: { payment: pid } });
		}
	}
	await summarise(store, d.order);
	if (to) await statusChanged(store, d._id, who);
	return { applied: true, status: to || d.status };
};

/** Finds the delivery an event is about: by the courier's id, else by our invoice — in this store only. */
export const deliveryForEvent = async (store: Store, courier: string, ev: CourierEvent) => {
	const D = deliveryOn(store);
	const byId = ev.consignment ? await D.findOne({ courier, consignment: String(ev.consignment) }).lean() : null;
	if (byId) return byId;
	// A parcel we haven't an id for yet (Pathao's bulk, a booking that timed out): our invoice names it.
	return ev.invoice ? D.findOne({ courier, invoice: String(ev.invoice), consignment: { $in: [null, ''] } }).lean() : null;
};

/** POST deliveries/:id/refresh — asks the courier where it is. */
export const refresh = async (store: Store, project: any, id: any) => {
	const d: any = isId(id) ? await deliveryOn(store).findById(id).lean() : null;
	if (!d) throw new TenancyError(404, 'Delivery not found');
	const adapter = adapterOf(d.courier);
	if (!d.consignment || !adapter?.status) return deliveryDetail(store, d._id);
	const usable = await usableConnection(project, d.courier);
	if (!usable) throw new TenancyError(409, `Connect and test ${adapter.name} in Store settings → Delivery first`, 'courier_not_connected');
	try {
		const ev = await adapter.status(usable.conn, { consignment: d.consignment, invoice: d.invoice });
		await applyEvent(store, d._id, ev, 'sync');
	} catch (e: any) {
		if (e instanceof CourierRefusal || e instanceof CourierError) {
			if ((e as any).rejected) await keysRefused(d.courier, e.message);
			await deliveryOn(store).updateOne({ _id: d._id }, { $set: { lastSyncedAt: new Date(), error: e.message } });
			throw new TenancyError(502, e.message, 'courier_error');
		}
		throw e;
	}
	return deliveryDetail(store, d._id);
};

/** POST deliveries/:id/cancel — stops a parcel before it's delivered (or forgets one that never went). */
export const cancelDelivery = async (store: Store, project: any, id: any, reason: string, by: string) => {
	const D = deliveryOn(store);
	const d: any = isId(id) ? await D.findById(id).lean() : null;
	if (!d) throw new TenancyError(404, 'Delivery not found');
	if (FINAL.includes(d.status) || d.status === 'returning') throw new TenancyError(409, `It’s ${STATUS_LABEL[d.status].toLowerCase()} — it can’t be cancelled now`);
	const adapter = adapterOf(d.courier);
	const why = String(reason || '').trim().slice(0, 255) || 'Cancelled by the shop';
	// Never booked (refused, or no answer and not found): nothing to tell the courier.
	if (!d.consignment) {
		if (isUncertain(d)) throw new TenancyError(409, `${adapter?.name || 'The courier'} may have it — check its panel for ${d.invoice} first, then cancel it there or here once you know`, 'delivery_uncertain');
		await D.updateOne({ _id: d._id }, { $set: { status: 'cancelled', error: '' }, $push: { events: event('cancelled', '', `Cancelled: ${why}`, 'staff', by) } });
		await summarise(store, d.order);
		return deliveryDetail(store, d._id);
	}
	if (!adapter?.cancel) throw new TenancyError(409, `${adapter?.name || 'The courier'} can’t be cancelled from here — cancel it in the ${adapter?.name || 'courier’s'} panel, then press Refresh`, 'courier_no_cancel');
	const usable = await usableConnection(project, d.courier);
	if (!usable) throw new TenancyError(409, `Connect and test ${adapter.name} in Store settings → Delivery first`, 'courier_not_connected');
	let r;
	try {
		r = await adapter.cancel(usable.conn, { consignment: d.consignment, invoice: d.invoice }, why);
	} catch (e: any) {
		if (e instanceof CourierRefusal || e instanceof CourierError) throw new TenancyError(e instanceof CourierRefusal ? 409 : 502, e.message, 'courier_refused');
		throw e;
	}
	if (r.async) await D.updateOne({ _id: d._id }, { $push: { events: event(d.status, 'cancel-requested', `${r.message} (${why})`, 'staff', by) } });
	else await applyEvent(store, d._id, { courierStatus: 'cancelled', status: 'cancelled', message: `Cancelled: ${why}`, at: new Date(), kind: 'status', key: `cancel:${d._id}` }, 'staff', by);
	await summarise(store, d.order);
	return deliveryDetail(store, d._id);
};

/** A delivery with its order's number, as the Delivery card shows it. */
export const deliveryDetail = async (store: Store, id: any) => {
	const d: any = isId(id) ? await deliveryOn(store).findById(id).lean() : null;
	if (!d) throw new TenancyError(404, 'Delivery not found');
	const o: any = await store.M('order').findById(d.order, { code: 1, balance: 1, total: 1 }).lean();
	const a = adapterOf(d.courier);
	return {
		delivery: { ...d, statusLabel: STATUS_LABEL[d.status] || d.status, uncertain: isUncertain(d) },
		order: o ? { _id: o._id, code: o.code, balance: o.balance, total: o.total } : null,
		can: {
			refresh: !!(d.consignment && a?.status),
			cancel: !FINAL.includes(d.status) && d.status !== 'returning' && (!d.consignment || !!a?.cancel),
			sendAgain: ENDED.includes(d.status) || d.status === 'error',
		},
	};
};

/** An order's deliveries, current first — for the order page. */
export const deliveriesOf = async (store: Store, orderId: any) => {
	if (!store.installed.delivery) return [];
	const list: any[] = await store.M('delivery').find({ order: orderId }).sort({ createdAt: -1 }).lean();
	return list.map(d => ({ ...d, statusLabel: STATUS_LABEL[d.status] || d.status, uncertain: isUncertain(d) }));
};

export const DELIVERY_VIEWS: Record<string, any> = {
	all: {},
	problems: { status: 'error' },
	pickup: { status: { $in: ['booking', 'booked', 'pickup-pending'] } },
	moving: { status: { $in: ['picked-up', 'in-transit', 'out-for-delivery', 'on-hold', 'failed-attempt'] } },
	delivered: { status: { $in: ['delivered', 'partly-delivered'] } },
	returning: { status: 'returning' },
	returned: { status: 'returned' },
	cancelled: { status: { $in: ['cancelled', 'lost'] } },
};

/** GET deliveries — the Deliveries page: a page of them, each view's count, and the cash couriers hold for the store. */
export const listDeliveries = async (store: Store, q: any) => {
	const D = deliveryOn(store);
	const view = DELIVERY_VIEWS[q.view] ? q.view : 'all';
	const filter: any = { ...DELIVERY_VIEWS[view] };
	if (q.courier) filter.courier = String(q.courier);
	if (q.settled === '1' || q.settled === '0') filter.settled = q.settled === '1' ? true : { $ne: true };
	if (q.q) {
		const w = String(q.q).trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		filter.$or = ['code', 'invoice', 'consignment', 'trackingCode', 'recipient.phone', 'recipient.name'].map(k => ({ [k]: { $regex: w, $options: 'i' } }));
	}
	const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
	const page = Math.max(1, Number(q.page) || 1);
	const [docs, total, counts, cash] = await Promise.all([
		D.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
		D.countDocuments(filter),
		Promise.all(Object.entries(DELIVERY_VIEWS).map(async ([k, f]) => [k, await D.countDocuments(f)])),
		D.aggregate([{ $match: { status: { $in: ['delivered', 'partly-delivered'] }, settled: { $ne: true } } }, { $group: { _id: '$courier', amount: { $sum: '$collected' }, n: { $sum: 1 } } }]),
	]);
	const orders: any[] = await store.M('order').find({ _id: { $in: docs.map((d: any) => d.order) } }, { code: 1 }).lean();
	const code = new Map(orders.map(o => [String(o._id), o.code]));
	return {
		doc: docs.map((d: any) => ({ ...d, statusLabel: STATUS_LABEL[d.status] || d.status, orderCode: code.get(String(d.order)) || '' })),
		total,
		page,
		totalPages: Math.max(1, Math.ceil(total / limit)),
		views: Object.fromEntries(counts),
		cashWithCouriers: { total: cash.reduce((s: number, c: any) => s + c.amount, 0), byCourier: cash.map((c: any) => ({ courier: c._id, amount: c.amount, deliveries: c.n })) },
	};
};
