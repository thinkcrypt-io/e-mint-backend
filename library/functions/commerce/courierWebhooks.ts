import mongoose from 'mongoose';
import CourierConnection from '../../models/tenancy/courierConnection.model.js';
import CourierWebhookEvent from '../../models/tenancy/courierEvent.model.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import { open } from '../../../lib/crypto/secret.js';
import { runInScope, runUnscoped } from '../tenantScope.function.js';
import { adapterOf } from './couriers/index.js';
import { storeOf } from './store.js';
import { applyEvent, deliveryForEvent } from './deliveries.js';
import type { CourierEvent, WebhookIn } from './couriers/types.js';

/**
 * POST /public/couriers/:provider/:connection (docs/couriers CR9, CR-06): a
 * courier telling a store about its parcels. The connection's id says whose
 * it is; the courier's own check (Steadfast's signature, Pathao's secret,
 * RedX's token in the address) against that connection's secret says it's
 * the courier. Each event is stored once (its key), the courier is answered
 * straight away, and the events are applied after — so a slow store never
 * makes a courier retry, and a 5xx only when nothing could be stored.
 */

const MAX_BODY = 100 * 1024;
const PER_MINUTE = 300;
const calls = new Map<string, { at: number; n: number }>();
const tooMany = (id: string) => {
	const now = Date.now();
	const b = calls.get(id);
	if (!b || now - b.at > 60000) {
		if (calls.size > 5000) calls.clear();
		calls.set(id, { at: now, n: 1 });
		return false;
	}
	return ++b.n > PER_MINUTE;
};

/** Headers worth keeping beside the body — never the ones carrying the secret. */
const keptHeaders = (h: Record<string, any>) =>
	Object.fromEntries(Object.entries(h || {}).filter(([k]) => /^(content-type|user-agent|idempotency-key|x-request-id|x-signature)$/i.test(k)));

type Reply = { status: number; headers?: Record<string, string>; body: any };

export const courierWebhook = async (provider: string, connectionId: string, req: { headers: any; rawBody?: Buffer; body: any; query: any }): Promise<Reply> => {
	const adapter = adapterOf(provider);
	if (!adapter?.webhook || !mongoose.isValidObjectId(connectionId)) return { status: 404, body: { message: 'Not found' } };
	const conn: any = await runUnscoped(() => CourierConnection.findOne({ _id: connectionId, courier: provider }).select('+webhookSecret').lean());
	if (!conn) return { status: 404, body: { message: 'Not found' } };
	const project: any = await runUnscoped(() => TenantProject.findById(conn.project, { type: 1, isActive: 1, organization: 1 }).lean());
	if (!project || project.type !== 'ecommerce' || project.isActive === false) return { status: 404, body: { message: 'Not found' } };
	const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
	if (raw.length > MAX_BODY) return { status: 413, body: { message: 'Too large' } };
	if (tooMany(String(conn._id))) return { status: 429, body: { message: 'Too many calls' } };

	let secret = '';
	try {
		secret = conn.webhookSecret ? open(conn.webhookSecret) : '';
	} catch {
		secret = '';
	}
	const input: WebhookIn = { headers: req.headers || {}, raw, body: req.body || {}, query: req.query || {} };
	if (!adapter.webhook.verify(input, secret)) {
		await runUnscoped(() => CourierConnection.updateOne({ _id: conn._id }, { $inc: { refusedCalls: 1 } }));
		return { status: 401, body: { message: 'Not signed by this store’s courier account' } };
	}

	let events: CourierEvent[] = [];
	try {
		events = adapter.webhook.parse(input);
	} catch {
		events = [];
	}
	const scope = { organization: project.organization, project: project._id };
	const fresh: any[] = [];
	await runInScope(scope, async () => {
		for (const ev of events) {
			try {
				const doc = await CourierWebhookEvent.create({
					courier: provider,
					connection: conn._id,
					key: String(ev.key).slice(0, 300),
					kind: ev.kind,
					consignment: ev.consignment || '',
					invoice: ev.invoice || '',
					courierStatus: ev.courierStatus,
					parsed: ev,
					raw: raw.slice(0, MAX_BODY),
					headers: keptHeaders(req.headers),
					state: ev.kind === 'handshake' ? 'ignored' : 'new',
				});
				if (ev.kind !== 'handshake') fresh.push(doc);
			} catch (e: any) {
				if (e?.code !== 11000) throw e; // the courier's retry of one we have
			}
		}
		await CourierConnection.updateOne({ _id: conn._id }, { $set: { lastWebhookAt: new Date() } });
	});

	if (fresh.length) setImmediate(() => runInScope(scope, () => applyStored(provider, fresh)).catch((e: any) => console.error('courier webhook apply:', e?.message)));
	const reply = adapter.webhook.reply?.(conn.settings || {}) || { status: 200 };
	return { status: reply.status, headers: reply.headers, body: { ok: true, received: events.length } };
};

/** Each stored event to its delivery, in the order the courier says they happened. */
const applyStored = async (courier: string, docs: any[]) => {
	const store = await storeOf();
	const sorted = [...docs].sort((a, b) => new Date(a.parsed?.at).getTime() - new Date(b.parsed?.at).getTime());
	for (const doc of sorted) {
		const ev: CourierEvent = { ...doc.parsed, at: new Date(doc.parsed?.at) };
		try {
			const d: any = await deliveryForEvent(store, courier, ev);
			if (!d) {
				await CourierWebhookEvent.updateOne({ _id: doc._id }, { $set: { state: 'unmatched' } });
				continue;
			}
			await applyEvent(store, d._id, ev, 'webhook');
			await CourierWebhookEvent.updateOne({ _id: doc._id }, { $set: { state: 'applied', delivery: d._id } });
		} catch (e: any) {
			await CourierWebhookEvent.updateOne({ _id: doc._id }, { $set: { state: 'failed', error: String(e?.message || e).slice(0, 300) } });
		}
	}
};

/** A booking just landed: events the courier sent about it before (Pathao's order.created first) are applied now. */
export const applyUnmatched = async (courier: string, deliveryId: any, consignment: string, invoice: string) => {
	const or: any[] = [...(consignment ? [{ consignment }] : []), ...(invoice ? [{ invoice }] : [])];
	if (!or.length) return 0;
	const waiting: any[] = await CourierWebhookEvent.find({ courier, state: 'unmatched', $or: or }).lean();
	if (!waiting.length) return 0;
	const store = await storeOf();
	for (const doc of waiting.sort((a, b) => new Date(a.parsed?.at).getTime() - new Date(b.parsed?.at).getTime())) {
		await applyEvent(store, deliveryId, { ...doc.parsed, at: new Date(doc.parsed?.at) }, 'webhook');
		await CourierWebhookEvent.updateOne({ _id: doc._id }, { $set: { state: 'applied', delivery: deliveryId } });
	}
	return waiting.length;
};

/** GET deliveries/:id/webhooks — what the courier sent about one parcel (support: "did Steadfast tell us?"). */
export const webhooksOf = async (deliveryId: any) =>
	CourierWebhookEvent.find({ delivery: deliveryId }, { raw: 1, headers: 1, courierStatus: 1, state: 1, createdAt: 1, kind: 1 }).sort({ createdAt: 1 }).lean();
