import express from 'express';
import mongoose from 'mongoose';
import ProjectWebhook, { WEBHOOK_EVENTS } from '../library/models/tenancy/projectWebhook.model.js';
import WebhookDelivery from '../library/models/tenancy/webhookDelivery.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import ApiCall from '../library/models/tenancy/apiCall.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { newWebhookSecret, sendTestDelivery, webhookUrlProblem } from '../library/functions/webhooks.function.js';

/**
 * /tenant/api/p/:projectId/webhooks — a project's outgoing webhooks
 * (docs/templates T-09; sent by functions/webhooks.function.ts). Building
 * permission (`build`) for all of it: the addresses and secrets are the
 * project's plumbing.
 *
 *   GET    /                      the webhooks (never their secrets), with the models they can watch
 *   POST   /                      { route, events, url, note, active }   → { doc, secret } — the secret shown once
 *   PUT    /:id                   { route?, events?, url?, note?, active? }
 *   DELETE /:id                   the webhook and its log
 *   POST   /:id/secret            a new secret → { secret } (the old one stops working)
 *   POST   /:id/test              one signed test delivery, now → the log entry
 *   GET    /:id/deliveries        its last 50 deliveries, newest first
 *
 * And /tenant/api/p/:projectId/api-overview (overviewRouter) — what an API
 * project's dashboard shows: its endpoints, calls in the last day, the
 * latest calls and deliveries. Anyone who opens the project reads it.
 */
const router = express.Router();
router.use(tenantPermissions(['build']));

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const view = (w: any) => ({
	_id: String(w._id),
	route: w.route,
	events: w.events || [],
	url: w.url || '',
	note: w.note || '',
	active: !!w.active,
	lastDelivery: w.lastDelivery?.at ? w.lastDelivery : null,
	createdAt: w.createdAt,
	updatedAt: w.updatedAt,
});

const deliveryView = (d: any) => ({
	_id: String(d._id),
	delivery: d.delivery,
	event: d.event,
	route: d.route,
	record: d.record || null,
	source: d.source,
	url: d.url,
	body: d.body,
	ok: !!d.ok,
	pending: !!d.pending,
	status: d.status ?? null,
	response: d.response || '',
	error: d.error || '',
	attempts: d.attempts || 0,
	durationMs: d.durationMs ?? null,
	createdAt: d.createdAt,
	finishedAt: d.finishedAt || null,
});

const models = async () =>
	(await ModelDefinition.find({ active: { $ne: false } }, { route: 1, title: 1, name: 1 }).sort({ title: 1 }).lean()).map((d: any) => ({
		route: d.route,
		title: d.title || d.name,
	}));

/** The fields of a body that can be set, checked. `creating` needs a model. */
const read = async (body: any, creating: boolean, current?: any) => {
	const out: any = {};
	if (creating || body.route !== undefined) {
		const route = String(body.route || '').trim();
		if (!route || !(await ModelDefinition.exists({ route, active: { $ne: false } }))) throw new TenancyError(400, 'Pick one of the project’s models.');
		out.route = route;
	}
	if (creating || body.events !== undefined) {
		const events: string[] = [...new Set<string>((Array.isArray(body.events) ? body.events : []).map(String))].filter(e => (WEBHOOK_EVENTS as readonly string[]).includes(e));
		if (!events.length) throw new TenancyError(400, 'Pick when it’s sent: created, changed or deleted.');
		out.events = WEBHOOK_EVENTS.filter(e => events.includes(e));
	}
	if (creating || body.url !== undefined) {
		const url = String(body.url || '').trim().slice(0, 500);
		if (url) {
			const problem = await webhookUrlProblem(url);
			if (problem) throw new TenancyError(400, problem);
		}
		out.url = url;
	}
	if (body.note !== undefined) out.note = String(body.note || '').trim().slice(0, 300);
	if (creating || body.active !== undefined) out.active = body.active === undefined ? true : !!body.active;
	const url = out.url ?? current?.url ?? '';
	if (out.active ?? current?.active) if (!url) out.active = false;
	return out;
};

const titleOf = async (route: string) => {
	const d: any = await ModelDefinition.findOne({ route }, { title: 1, name: 1 }).lean();
	return d?.title || d?.name || route;
};

router.get(
	'/',
	handle(async () => {
		const [docs, choices] = await Promise.all([ProjectWebhook.find({}).sort({ createdAt: 1 }).lean(), models()]);
		return { doc: docs.map(view), models: choices, events: WEBHOOK_EVENTS };
	})
);

router.post(
	'/',
	handle(async (req, res) => {
		if ((await ProjectWebhook.countDocuments({})) >= 50) throw new TenancyError(400, 'A project has at most 50 webhooks.');
		const fields = await read(req.body || {}, true);
		const secret = newWebhookSecret();
		const doc: any = await ProjectWebhook.create({ ...fields, secret, createdBy: req.user?._id });
		recordProjectEvent({ req, action: 'create', model: 'Webhook', modelPath: 'webhooks', document: doc._id, name: await titleOf(doc.route), text: `added a webhook for ${await titleOf(doc.route)}` });
		res.status(201);
		return { doc: view(doc.toObject()), secret };
	})
);

const find = async (id: string, secret = false) => {
	if (!isId(id)) throw new TenancyError(404, 'Webhook not found');
	const q = ProjectWebhook.findById(id);
	const doc: any = await (secret ? q.select('+secret') : q);
	if (!doc) throw new TenancyError(404, 'Webhook not found');
	return doc;
};

router.put(
	'/:id',
	handle(async req => {
		const doc = await find(req.params.id);
		doc.set(await read(req.body || {}, false, doc));
		await doc.save();
		recordProjectEvent({ req, model: 'Webhook', modelPath: 'webhooks', document: doc._id, name: await titleOf(doc.route), text: `changed the webhook for ${await titleOf(doc.route)}` });
		return view(doc.toObject());
	})
);

router.delete(
	'/:id',
	handle(async req => {
		const doc = await find(req.params.id);
		await WebhookDelivery.deleteMany({ webhook: doc._id });
		await ProjectWebhook.deleteOne({ _id: doc._id });
		recordProjectEvent({ req, action: 'delete', model: 'Webhook', modelPath: 'webhooks', document: doc._id, name: await titleOf(doc.route), text: `deleted the webhook for ${await titleOf(doc.route)}` });
		return { message: 'Deleted' };
	})
);

router.post(
	'/:id/secret',
	handle(async req => {
		const doc = await find(req.params.id, true);
		const secret = newWebhookSecret();
		doc.secret = secret;
		await doc.save();
		recordProjectEvent({ req, model: 'Webhook', modelPath: 'webhooks', document: doc._id, name: await titleOf(doc.route), text: `replaced the secret of the webhook for ${await titleOf(doc.route)}` });
		return { secret };
	})
);

router.post(
	'/:id/test',
	handle(async req => {
		const doc = await find(req.params.id);
		if (!doc.url) throw new TenancyError(400, 'Give the webhook an address first.');
		const delivery = await sendTestDelivery(doc._id);
		return deliveryView(delivery);
	})
);

router.get(
	'/:id/deliveries',
	handle(async req => {
		const doc = await find(req.params.id);
		const list = await WebhookDelivery.find({ webhook: doc._id }).sort({ createdAt: -1 }).limit(50).lean();
		return { doc: list.map(deliveryView) };
	})
);

export default router;

/* ------------------------------------------------------- the API overview */

export const overviewRouter = express.Router();

overviewRouter.get(
	'/',
	handle(async () => {
		const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const [defs, calls, total, failed, hooks, deliveries] = await Promise.all([
			ModelDefinition.find({ active: { $ne: false }, 'publicApi.enabled': true }, { route: 1, title: 1, name: 1, publicApi: 1 }).sort({ title: 1 }).lean(),
			ApiCall.find({}).sort({ createdAt: -1 }).limit(20).lean(),
			ApiCall.countDocuments({ createdAt: { $gte: day } }),
			ApiCall.countDocuments({ createdAt: { $gte: day }, status: { $gte: 400 } }),
			ProjectWebhook.find({}, { route: 1, active: 1, url: 1 }).lean(),
			WebhookDelivery.find({}).sort({ createdAt: -1 }).limit(5).lean(),
		]);
		return {
			endpoints: defs.map((d: any) => ({
				route: d.route,
				title: d.title || d.name,
				actions: d.publicApi?.actions || [],
				auth: d.publicApi?.auth || 'none',
				ownerOnly: !!d.publicApi?.ownerOnly,
				note: d.publicApi?.note || '',
			})),
			calls: calls.map((c: any) => ({ method: c.method, path: c.path, route: c.route, status: c.status, ms: c.ms, customer: !!c.customer, at: c.createdAt })),
			day: { calls: total, failed },
			webhooks: { total: hooks.length, active: hooks.filter((h: any) => h.active && h.url).length },
			deliveries: deliveries.map(deliveryView),
		};
	})
);
