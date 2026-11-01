import os from 'os';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Automation from '../models/tenancy/automation.model.js';
import AutomationDue from '../models/tenancy/automationDue.model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { compiledModel, syncDynamicModels } from './dynamicModels.function.js';
import { runFor } from './automations.function.js';
import { runInScope, runUnscoped } from './tenantScope.function.js';

/**
 * "When a date is reached" automations (docs/ecommerce/DISCOUNTS.md DS6, EC-42): any project's automation can run
 * on a record's date — a discount's end, a subscription's renewal, a task's due date — or so long before or after.
 *
 * Each record's next run is one AutomationDue job. Saving a record moves its jobs to its dates (queueDates, from
 * fireAutomations), clearing a date or deleting the record drops them, and a date already passed when saved is
 * not run. A minute tick, on one server at a time (a lock in `locks`):
 *   1. queues again every date automation that was added, changed or switched on since it last looked (`dueSig`) —
 *      every record whose date is still ahead — and drops the jobs of one switched off, deleted or changed away;
 *   2. claims each due job on its own and runs the automation on the record as it is then (event `date`): its
 *      conditions are checked then, and a run shows in Runs like any other.
 * A server that was down runs what came due meanwhile when it's back.
 *
 *   queueDates(def, doc, event)     a record was created, changed or deleted (inside its scope)
 *   scheduleAutomationDue()         at boot (server.ts)
 *   runDueAutomations()             one tick — tests call it through AUTOMATION_TICK_MS
 */

const TICK_MS = () => Number(process.env.AUTOMATION_TICK_MS) || 60 * 1000;
/** A claimed job not finished after this (the server stopped mid-way) is tried again… */
const STALE_MS = 5 * 60 * 1000;
/** …this many times in all. */
const MAX_TRIES = 3;
/** Jobs per tick (the rest wait for the next one). */
const BATCH = 200;
/** Records queued per automation when it's (re)queued. */
const MAX_QUEUE = 20000;
/** A job whose time no longer matches its record's date by more than this was moved: it's left to the newer job. */
const DRIFT_MS = 60 * 1000;

const UNIT_MS: Record<string, number> = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 };

/** How far the run is from the date: negative before it. */
const offsetMs = (a: any) => {
	const d = a?.date || {};
	const ms = (Number(d.amount) || 0) * (UNIT_MS[d.unit] || UNIT_MS.days);
	return d.when === 'before' ? -ms : ms;
};

/** When this record's run is due, or null (no date). */
const fireAt = (a: any, doc: any): { at: Date; date: Date } | null => {
	const raw = doc?.[a?.date?.field];
	if (raw === undefined || raw === null || raw === '') return null;
	const date = new Date(raw);
	if (isNaN(date.getTime())) return null;
	return { at: new Date(date.getTime() + offsetMs(a)), date };
};

/** Puts this record's job at its date — or drops it when the date is gone or already passed. Inside the project's scope. */
const queueOne = async (a: any, route: string, doc: any, now = Date.now()) => {
	const when = fireAt(a, doc);
	if (!when || when.at.getTime() <= now) {
		await AutomationDue.deleteMany({ automation: a._id, record: doc._id, state: 'pending' });
		return false;
	}
	const had: any = await AutomationDue.findOne({ automation: a._id, record: doc._id, state: 'pending' }, { at: 1 }).lean();
	if (had) {
		if (had.at.getTime() !== when.at.getTime()) await AutomationDue.updateOne({ _id: had._id }, { $set: { at: when.at, date: when.date, route } });
	} else
		await AutomationDue.create({ automation: a._id, route, record: doc._id, at: when.at, date: when.date }).catch((e: any) => {
			if (e?.code !== 11000) throw e; // queued meanwhile by another save
		});
	return true;
};

/** A record of `def` was created, changed or deleted: the page's date automations move, add or drop its jobs. */
export const queueDates = async (def: any, doc: any, event: string) => {
	if (!doc?._id) return;
	if (event === 'delete') {
		await AutomationDue.deleteMany({ record: doc._id, state: 'pending' });
		return;
	}
	const list: any[] = await Automation.find({ route: def.route, enabled: true, on: 'date' }, { date: 1 }).lean();
	for (const a of list) await queueOne(a, def.route, doc);
};

/** What the queue depends on: a change to any of it means queueing the automation's records again. */
const sigOf = (a: any) => (a.enabled !== false && a.on?.includes('date') ? JSON.stringify([a.route, a.date?.field, a.date?.amount, a.date?.unit, a.date?.when]) : 'off');

/** One automation's jobs made again: every record whose run is still ahead (none when it's off or not on a date). */
const requeue = async (a: any) => {
	await AutomationDue.deleteMany({ automation: a._id, state: 'pending' });
	if (sigOf(a) === 'off') return 0;
	await syncDynamicModels();
	const def: any = await ModelDefinition.findOne({ route: a.route }, { name: 1, route: 1, active: 1 }).lean();
	const Model: any = def && def.active !== false ? compiledModel(def.name) : null;
	if (!Model) return 0;
	const field = a.date.field;
	// The date is ahead of now by more than the offset moves it back.
	const from = new Date(Date.now() - offsetMs(a));
	let n = 0;
	for await (const doc of Model.find({ [field]: { $gt: from } }, { [field]: 1 }).limit(MAX_QUEUE).lean().cursor()) if (await queueOne(a, def.route, doc)) n++;
	return n;
};

/** Step 1 of the tick: the date automations added, changed, switched on or off — and deleted ones' jobs dropped. */
const syncChanged = async () => {
	const list: any[] = await runUnscoped(() => Automation.find({ $or: [{ on: 'date' }, { dueSig: { $exists: true } }] }, { on: 1, enabled: 1, route: 1, date: 1, organization: 1, project: 1 }).select('+dueSig').lean());
	for (const a of list) {
		const sig = sigOf(a);
		if (a.dueSig === sig) continue;
		await runInScope({ organization: a.organization, project: a.project }, async () => {
			await requeue(a);
			await Automation.updateOne({ _id: a._id }, sig === 'off' ? { $unset: { dueSig: 1 } } : { $set: { dueSig: sig } }, { timestamps: false });
		}).catch((e: any) => console.error('automation dates (queue):', e?.message));
	}
	// Jobs left by a deleted automation.
	const ids: any[] = await runUnscoped(() => AutomationDue.distinct('automation', { state: 'pending' }));
	if (ids.length) {
		const alive = new Set((await runUnscoped(() => Automation.find({ _id: { $in: ids } }, { _id: 1 }).lean())).map((x: any) => String(x._id)));
		const gone = ids.filter(id => !alive.has(String(id)));
		if (gone.length) await runUnscoped(() => AutomationDue.deleteMany({ automation: { $in: gone }, state: 'pending' }));
	}
};

const finish = (job: any, error = '') => runUnscoped(() => AutomationDue.updateOne({ _id: job._id }, { $set: { state: error ? 'failed' : 'done', doneAt: new Date(), error } }));

/** One due job, in its project: the automation run on the record as it is now — unless that no longer fits. */
const runJob = async (job: any) => {
	if (job.tries > MAX_TRIES) return finish(job, `Stopped after ${MAX_TRIES} tries`);
	const problem = await runInScope({ organization: job.organization, project: job.project }, async () => {
		const a: any = await Automation.findById(job.automation).select('+secret').lean();
		if (!a || a.enabled === false || !a.on?.includes('date')) return 'The automation was switched off, changed or deleted.';
		await syncDynamicModels();
		const def: any = await ModelDefinition.findOne({ route: a.route }).lean();
		const Model: any = def && def.active !== false ? compiledModel(def.name) : null;
		if (!Model) return 'Its page isn’t there any more.';
		const doc: any = await Model.findById(job.record).lean();
		if (!doc) return 'The record was deleted.';
		// Its date moved since this was queued: the job at the new date does it.
		const when = fireAt(a, doc);
		if (!when || Math.abs(when.at.getTime() - new Date(job.at).getTime()) > DRIFT_MS) {
			await queueOne(a, def.route, doc);
			return 'The record’s date changed — moved to the new one.';
		}
		await runFor({ automation: a, def, Model, snapshot: doc, event: 'date' });
		return '';
	});
	await finish(job, problem);
};

const LOCK = 'automation-due';
const me = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;

/** Whether this server runs the tick: it holds the lock, or takes it once it's run out. */
const lead = async () => {
	const now = new Date();
	try {
		await mongoose.connection
			.collection<any>('locks')
			.updateOne({ _id: LOCK, $or: [{ until: { $lt: now } }, { holder: me }] }, { $set: { holder: me, until: new Date(now.getTime() + 3 * TICK_MS()) } }, { upsert: true });
		return true;
	} catch (e: any) {
		if (e?.code === 11000) return false; // someone else holds it
		throw e;
	}
};

let running = false;

/** One tick: queue what changed, then claim and run what's due, one job at a time. */
export const runDueAutomations = async () => {
	if (running || mongoose.connection.readyState !== 1) return 0;
	running = true;
	let n = 0;
	try {
		if (!(await lead())) return 0;
		await syncChanged();
		const now = Date.now();
		for (; n < BATCH; n++) {
			const job: any = await runUnscoped(() =>
				AutomationDue.findOneAndUpdate(
					{ $or: [{ state: 'pending', at: { $lte: new Date(now) } }, { state: 'running', claimedAt: { $lt: new Date(now - STALE_MS) } }] },
					{ $set: { state: 'running', claimedAt: new Date() }, $inc: { tries: 1 } },
					{ sort: { at: 1 }, new: true }
				).lean()
			);
			if (!job) break;
			await runJob(job).catch(async (e: any) => {
				console.error('automation dates:', e?.message);
				await finish(job, e?.message || 'Something went wrong');
			});
		}
	} catch (e: any) {
		console.error('automation dates tick:', e?.message);
	} finally {
		running = false;
	}
	return n;
};

/** Every minute from boot (AUTOMATION_TICK_MS for tests). */
export const scheduleAutomationDue = () => {
	setInterval(() => void runDueAutomations(), TICK_MS()).unref();
};
