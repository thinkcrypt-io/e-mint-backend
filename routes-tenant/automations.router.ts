import express from 'express';
import mongoose from 'mongoose';
import Automation from '../library/models/tenancy/automation.model.js';
import AutomationRun from '../library/models/tenancy/automationRun.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { checkAutomation, dryRun, newAutomationSecret } from '../library/functions/automations.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/automations — the project's automations
 * (docs/automations AU-02). Everything here needs Build (A2).
 *
 *   GET    /                    every automation, newest first
 *   GET    /runs?status&limit   recent runs of all of them
 *   GET    /:id                 one, with its webhook secret
 *   GET    /:id/runs            its recent runs
 *   POST   /                    { name, route, on, changed, when, match, actions, enabled }
 *   PUT    /:id                 the same, whole
 *   PATCH  /:id                 { enabled }   the on/off switch
 *   POST   /:id/test            { record, event }   a dry run on a record — nothing sent or written
 *   DELETE /:id
 *
 * A bad automation answers 400 with `on`, the path of the input at fault
 * ("actions.1.url"), so the panel shows the message under it.
 */
const router = express.Router({ mergeParams: true });
router.use(tenantPermissions(['build']));

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const view = (a: any, withSecret = false) => ({
	_id: String(a._id),
	name: a.name,
	description: a.description || '',
	enabled: a.enabled !== false,
	route: a.route,
	on: a.on || [],
	changed: a.changed || [],
	when: a.when || [],
	match: a.match || 'all',
	actions: a.actions || [],
	stats: a.stats || { runs: 0, failures: 0 },
	...(withSecret && { secret: a.secret || '' }),
	createdAt: a.createdAt,
	updatedAt: a.updatedAt,
});

const runView = (r: any) => ({
	_id: String(r._id),
	automation: r.automation ? String(r.automation) : null,
	name: r.name,
	route: r.route,
	record: r.record ? String(r.record) : null,
	recordName: r.recordName || '',
	event: r.event,
	status: r.status,
	steps: r.steps || [],
	error: r.error || '',
	depth: r.depth || 1,
	actorName: r.actorName || '',
	createdAt: r.createdAt,
});

const load = async (id: any, secret = false) => {
	if (!isId(id)) throw new TenancyError(404, 'Automation not found');
	const q = Automation.findById(id);
	const a: any = await (secret ? q.select('+secret') : q).lean();
	if (!a) throw new TenancyError(404, 'Automation not found');
	return a;
};

const limitOf = (v: any, d = 50) => Math.min(Math.max(parseInt(String(v), 10) || d, 1), 200);

router.get(
	'/',
	handle(async () => {
		const docs = await Automation.find({}).sort({ createdAt: -1 }).limit(200).lean();
		return { doc: docs.map(a => view(a)), total: docs.length };
	})
);

router.get(
	'/runs',
	handle(async req => {
		const q: any = {};
		if (['success', 'failed', 'skipped'].includes(String(req.query.status))) q.status = String(req.query.status);
		if (isId(req.query.automation)) q.automation = req.query.automation;
		const docs = await AutomationRun.find(q).sort({ createdAt: -1 }).limit(limitOf(req.query.limit)).lean();
		return { doc: docs.map(runView) };
	})
);

router.get(
	'/:id',
	handle(async req => view(await load(req.params.id, true), true))
);

router.get(
	'/:id/runs',
	handle(async req => {
		const a = await load(req.params.id);
		const docs = await AutomationRun.find({ automation: a._id }).sort({ createdAt: -1 }).limit(limitOf(req.query.limit)).lean();
		return { doc: docs.map(runView) };
	})
);

router.post(
	'/',
	handle(async (req, res) => {
		if ((await Automation.countDocuments({})) >= 200) throw new TenancyError(400, 'This project has 200 automations — delete one first');
		const body = await checkAutomation(req.body);
		const a: any = await Automation.create({ ...body, secret: newAutomationSecret(), createdBy: req.user._id, updatedBy: req.user._id });
		recordProjectEvent({ req, action: 'create', model: 'Automation', modelPath: 'automations', document: a._id, name: a.name, text: `created the automation “${a.name}”` });
		res.status(201);
		return view(a.toObject(), true);
	})
);

router.put(
	'/:id',
	handle(async req => {
		const a: any = await load(req.params.id);
		const body = await checkAutomation(req.body);
		await Automation.updateOne({ _id: a._id }, { $set: { ...body, updatedBy: req.user._id } });
		recordProjectEvent({ req, model: 'Automation', modelPath: 'automations', document: a._id, name: body.name, text: `changed the automation “${body.name}”` });
		return view(await load(a._id, true), true);
	})
);

router.patch(
	'/:id',
	handle(async req => {
		const a: any = await load(req.params.id);
		if (typeof req.body?.enabled !== 'boolean') throw new TenancyError(400, 'Send enabled: true or false');
		await Automation.updateOne({ _id: a._id }, { $set: { enabled: req.body.enabled, updatedBy: req.user._id } });
		recordProjectEvent({ req, model: 'Automation', modelPath: 'automations', document: a._id, name: a.name, text: `turned the automation “${a.name}” ${req.body.enabled ? 'on' : 'off'}` });
		return view(await load(a._id));
	})
);

router.post(
	'/:id/test',
	handle(async req => {
		const a: any = await load(req.params.id, true);
		return dryRun(a, String(req.body?.record || ''), String(req.body?.event || ''));
	})
);

router.delete(
	'/:id',
	handle(async req => {
		const a: any = await load(req.params.id);
		await Automation.deleteOne({ _id: a._id });
		await AutomationRun.deleteMany({ automation: a._id });
		recordProjectEvent({ req, action: 'delete', model: 'Automation', modelPath: 'automations', document: a._id, name: a.name, text: `deleted the automation “${a.name}”` });
		return { message: `Deleted “${a.name}”` };
	})
);

export default router;
