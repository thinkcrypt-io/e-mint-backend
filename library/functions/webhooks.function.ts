import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import ProjectWebhook from '../models/tenancy/projectWebhook.model.js';
import WebhookDelivery from '../models/tenancy/webhookDelivery.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import { compiledModel } from './dynamicModels.function.js';
import { currentScope, runInScope } from './tenantScope.function.js';

/**
 * A project's outgoing webhooks (docs/templates T-09). When a record of a
 * model is created, changed or deleted — in the panel (recordHistory) or
 * through the public API (routes-public) — every active webhook on that model
 * and event gets a POST:
 *
 *   { delivery, event, route, project: { id, slug, name }, source, at, record }
 *
 * with these headers, the signature over `<timestamp>.<raw body>`:
 *
 *   x-mint-event      create | update | delete | test
 *   x-mint-delivery   the delivery's id (the same on every retry)
 *   x-mint-timestamp  seconds since 1970
 *   x-mint-signature  sha256=<hex HMAC-SHA256 with the webhook's secret>
 *
 * A 2xx answer is a success. Anything else (or no answer in 10 seconds) is
 * tried 3 more times, waiting longer each time; every delivery is logged
 * (WebhookDelivery, the last 50 per webhook). Retries wait in this process —
 * a restart drops the ones not yet sent; the log shows them as unfinished.
 *
 * Addresses inside the server's own network are refused in production
 * (`WEBHOOK_ALLOW_PRIVATE=1` allows them); cloud metadata addresses always.
 */

const TIMEOUT_MS = 10_000;
const KEEP = 50;
const BODY_CAP = 8 * 1024;
/** Waits before retries 1–3: ×1, ×4, ×16 the base — 15 s, 1 min, 4 min in production. */
const retryBase = () => Number(process.env.WEBHOOK_RETRY_BASE_MS) || (process.env.NODE_ENV === 'production' ? 15_000 : 500);
const RETRY_STEPS = [1, 4, 16];

export const newWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;

export const signWebhook = (secret: string, timestamp: number | string, body: string) =>
	`sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

/* ------------------------------------------------------------ addresses */

const allowPrivate = () => process.env.NODE_ENV !== 'production' || process.env.WEBHOOK_ALLOW_PRIVATE === '1';

const v4 = (ip: string) => ip.split('.').map(Number);

/** Link-local — where cloud metadata lives. Never reachable from a webhook. */
const isLinkLocal = (ip: string): boolean => {
	if (net.isIPv4(ip)) return v4(ip)[0] === 169 && v4(ip)[1] === 254;
	const low = ip.toLowerCase();
	if (low.startsWith('::ffff:')) return isLinkLocal(low.slice(7));
	return /^fe[89ab]/.test(low);
};

const isPrivate = (ip: string): boolean => {
	if (net.isIPv4(ip)) {
		const [a, b] = v4(ip);
		return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
	}
	const low = ip.toLowerCase();
	if (low.startsWith('::ffff:')) return isPrivate(low.slice(7));
	return low === '::' || low === '::1' || /^f[cd]/.test(low) || /^ff/.test(low);
};

/** Why `raw` can't be a webhook's address, or null when it can. Looks the host up. */
export const webhookUrlProblem = async (raw: string): Promise<string | null> => {
	let u: URL;
	try {
		u = new URL(String(raw || '').trim());
	} catch {
		return 'Give a full address, starting with https://';
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'The address must start with https:// or http://';
	if (u.username || u.password) return 'Leave the user name and password out of the address — check the signature instead.';
	const host = u.hostname.replace(/^\[|\]$/g, '');
	let ips: string[];
	try {
		ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
	} catch {
		return `No server answers to ${host}.`;
	}
	if (!ips.length) return `No server answers to ${host}.`;
	if (ips.some(isLinkLocal)) return 'That address isn’t allowed.';
	if (!allowPrivate() && ips.some(isPrivate)) return 'That address is inside a private network — webhooks go to servers on the internet.';
	return null;
};

/* --------------------------------------------------------------- records */

const HIDDEN_KINDS = new Set(['password', 'section', 'sectionlist']);

/** The record as the public API shapes it, minus password fields. */
export const webhookRecord = (def: any, doc: any) => {
	if (!doc) return null;
	const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
	const out: any = { _id: d._id != null ? String(d._id) : undefined };
	for (const k of ['code', 'createdAt', 'updatedAt']) if (d[k] !== undefined) out[k] = d[k];
	for (const f of def?.fields || []) if (!HIDDEN_KINDS.has(f.kind) && d[f.key] !== undefined) out[f.key] = d[f.key];
	return out;
};

/* -------------------------------------------------------------- sending */

type Payload = { delivery: string; event: string; route: string; project: { id: string; slug: string; name: string }; source: string; at: string; record: any };

const projectInfo = async (): Promise<Payload['project']> => {
	const id = currentScope()?.project;
	const p: any = id ? await TenantProject.findById(id, { publicSlug: 1, name: 1 }).lean() : null;
	return { id: String(id || ''), slug: p?.publicSlug || '', name: p?.name || '' };
};

const tryOnce = async (hook: any, payload: Payload) => {
	const problem = await webhookUrlProblem(hook.url);
	if (problem) return { ok: false, status: undefined, response: '', error: problem, final: true };
	const body = JSON.stringify(payload);
	const timestamp = Math.floor(Date.now() / 1000);
	try {
		const res = await fetch(hook.url, {
			method: 'POST',
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: {
				'content-type': 'application/json',
				'user-agent': 'e-mint-webhooks/1',
				'x-mint-event': payload.event,
				'x-mint-delivery': payload.delivery,
				'x-mint-timestamp': String(timestamp),
				'x-mint-signature': signWebhook(hook.secret, timestamp, body),
			},
			body,
		});
		const text = (await res.text().catch(() => '')).slice(0, 1024);
		const ok = res.status >= 200 && res.status < 300;
		return { ok, status: res.status, response: text, error: ok ? '' : `Answered ${res.status}`, final: false };
	} catch (e: any) {
		const error = e?.name === 'TimeoutError' ? `No answer in ${TIMEOUT_MS / 1000} seconds` : `Couldn’t reach it: ${e?.cause?.code || e?.message || 'unknown error'}`;
		return { ok: false, status: undefined, response: '', error, final: false };
	}
};

const prune = async (webhook: any) => {
	const old = await WebhookDelivery.find({ webhook }, { _id: 1 }).sort({ createdAt: -1 }).skip(KEEP).lean();
	if (old.length) await WebhookDelivery.deleteMany({ _id: { $in: old.map(o => o._id) } });
};

const finish = async (hook: any, delivery: any, r: any, attempts: number, started: number, test: boolean) => {
	const done = await WebhookDelivery.findByIdAndUpdate(
		delivery._id,
		{ $set: { ok: r.ok, pending: false, status: r.status, response: r.response, error: r.error, attempts, durationMs: Date.now() - started, finishedAt: new Date() } },
		{ new: true }
	).lean();
	await ProjectWebhook.updateOne(
		{ _id: hook._id },
		{ $set: { lastDelivery: { at: new Date(), event: delivery.event, ok: r.ok, status: r.status, error: r.error, test } } }
	);
	await prune(hook._id);
	return done;
};

/**
 * One delivery: logged, sent, and — unless `once` — retried on failure.
 * Resolves after the first try (with retries still waiting) or, with `once`,
 * with the finished log entry.
 */
const deliver = async (hook: any, payload: Payload, source: string, { once = false } = {}) => {
	const started = Date.now();
	const body = JSON.stringify(payload);
	const delivery: any = await WebhookDelivery.create({
		webhook: hook._id,
		delivery: payload.delivery,
		event: payload.event,
		route: payload.route,
		record: payload.record?._id,
		source,
		url: hook.url,
		body: body.length > BODY_CAP ? `${body.slice(0, BODY_CAP)}…` : body,
	});
	const scope = currentScope();
	let attempts = 1;
	let r = await tryOnce(hook, payload);
	if (r.ok || r.final || once) return finish(hook, delivery, r, attempts, started, source === 'test');
	await WebhookDelivery.updateOne({ _id: delivery._id }, { $set: { attempts, status: r.status, error: r.error } });

	const retry = (step: number) =>
		setTimeout(
			() =>
				runInScope(scope!, async () => {
					// Deleted, switched off or moved since: stop. A new secret or address is used from now on.
					const now: any = await ProjectWebhook.findById(hook._id).select('+secret').lean();
					if (!now || !now.active || !now.url)
						return finish(hook, delivery, { ok: false, status: r.status, response: r.response, error: 'Stopped: the webhook was switched off or deleted' }, attempts, started, false);
					attempts += 1;
					r = await tryOnce(now, payload);
					if (r.ok || r.final || step === RETRY_STEPS.length - 1) return finish(hook, delivery, r, attempts, started, false);
					await WebhookDelivery.updateOne({ _id: delivery._id }, { $set: { attempts, status: r.status, error: r.error } });
					retry(step + 1);
				}).catch((e: any) => console.error('webhook retry:', e?.message)),
			retryBase() * RETRY_STEPS[step]
		).unref?.();
	retry(0);
	return delivery;
};

const payloadOf = async (event: string, route: string, source: string, record: any): Promise<Payload> => ({
	delivery: crypto.randomUUID(),
	event,
	route,
	project: await projectInfo(),
	source,
	at: new Date().toISOString(),
	record,
});

/**
 * Sends `event` on a record to the project's webhooks — after the response,
 * never failing the change that caused it. Name the model by `route`, or by
 * the name it was compiled under (`T<projectId>_Client` or `Client`).
 */
export const fireWebhooks = ({ route, model, event, doc, source }: { route?: string; model?: string; event: string; doc: any; source: 'panel' | 'api' }) => {
	const scope = currentScope();
	if (!scope?.project || !['create', 'update', 'delete'].includes(event) || !doc) return;
	const snapshot = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
	setImmediate(() =>
		runInScope(scope, async () => {
			const hooks: any[] = await ProjectWebhook.find({ active: true, events: event, url: { $ne: '' } }).select('+secret').lean();
			if (!hooks.length) return;
			const name = model ? String(model).replace(/^T[a-f0-9]{24}_/, '') : undefined;
			const def: any = await ModelDefinition.findOne(route ? { route } : { name }, { route: 1, fields: 1 }).lean();
			if (!def) return;
			const mine = hooks.filter(h => h.route === def.route);
			if (!mine.length) return;
			const record = webhookRecord(def, snapshot);
			for (const hook of mine) await deliver(hook, await payloadOf(event, def.route, source, record), source);
		}).catch((e: any) => console.error('webhooks:', e?.message))
	);
};

/** "Send test": one try, now, with the model's newest record (or an example). Resolves with the log entry. */
export const sendTestDelivery = async (hookId: any) => {
	const hook: any = await ProjectWebhook.findById(hookId).select('+secret').lean();
	if (!hook) return null;
	const def: any = await ModelDefinition.findOne({ route: hook.route }, { route: 1, name: 1, fields: 1 }).lean();
	const Model = def ? compiledModel(def.name) : null;
	const latest: any = Model ? await Model.findOne({}).sort({ createdAt: -1 }).lean() : null;
	const record = latest ? webhookRecord(def, latest) : { _id: '000000000000000000000000', note: 'An example — this model has no records yet.' };
	return deliver(hook, await payloadOf('test', hook.route, 'test', record), 'test', { once: true });
};
