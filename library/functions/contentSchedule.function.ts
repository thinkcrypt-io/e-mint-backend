import os from 'os';
import crypto from 'crypto';
import mongoose from 'mongoose';
import ContentSchedule from '../models/tenancy/contentSchedule.model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { compiledModel, displayFieldOf, syncDynamicModels } from './dynamicModels.function.js';
import { publishRecord, unpublishRecord } from './drafts.function.js';
import { afterPublish } from './publishEvents.function.js';
import recordHistory from './recordHistory.function.js';
import { notifyTenant, projectHrefFor } from './tenantNotify.function.js';
import { runInScope, runUnscoped, withoutScope } from './tenantScope.function.js';

/**
 * Scheduling (docs/cms D7, CMS-11): a drafts record can be set to publish at a
 * time, to come off at a time, or both. Each waiting one is a ContentSchedule
 * job; a tick every minute applies the due ones — what's published is the
 * draft as it is then — as the person who set it: the webhooks, the site's
 * refresh and History follow as for a Publish click, and that person hears how
 * it went (the bell). One server at a time runs the tick (a lock document in
 * `locks`), and each job is claimed on its own, so two can never apply one.
 *
 *   setSchedule(def, Model, id, { publishAt?, unpublishAt? }, user)   null clears; absent leaves
 *   scheduleOf(id)                                                    { publishAt, unpublishAt, by }
 *   scheduleContentTick()                                             at boot (server.ts)
 *
 * A server that was down applies what came due meanwhile when it's back.
 */

export class ScheduleError extends Error {
	constructor(message: string) {
		super(message);
	}
}

/** How far ahead a time may be. */
const MAX_AHEAD_MS = 2 * 365 * 24 * 60 * 60 * 1000;
/** A claimed job not finished after this (the server stopped mid-way) is tried again… */
const STALE_MS = 5 * 60 * 1000;
/** …this many times in all. */
const MAX_TRIES = 3;
/** Jobs per tick (the rest wait a minute). */
const BATCH = 100;
const TICK_MS = () => Number(process.env.CONTENT_TICK_MS) || 60 * 1000;

type Times = { publishAt?: any; unpublishAt?: any };
export type Schedule = { publishAt: Date | null; unpublishAt: Date | null; publishBy: string; unpublishBy: string };

/** The record's waiting publish and take-off. */
export const scheduleOf = async (record: any): Promise<Schedule> => {
	const jobs: any[] = await ContentSchedule.find({ record, state: 'pending' }, { action: 1, at: 1, byName: 1 }).lean();
	const of = (a: string) => jobs.find(j => j.action === a);
	return { publishAt: of('publish')?.at || null, unpublishAt: of('unpublish')?.at || null, publishBy: of('publish')?.byName || '', unpublishBy: of('unpublish')?.byName || '' };
};

/** A time as sent: a Date, null (clear), or undefined (leave) — or why it won't do. */
const timeOf = (v: any, what: string, now: number): Date | null | undefined => {
	if (v === undefined) return undefined;
	if (v === null || v === '') return null;
	const d = new Date(v);
	if (typeof v === 'boolean' || isNaN(d.getTime())) throw new ScheduleError(`${what} isn’t a date and time`);
	if (d.getTime() <= now) throw new ScheduleError(`${what} has to be in the future`);
	if (d.getTime() > now + MAX_AHEAD_MS) throw new ScheduleError(`${what} can be at most two years ahead`);
	return d;
};

/**
 * Sets, moves or clears a record's publish and take-off times. Checked as a
 * whole: take-off after publish, and a take-off needs something live (or
 * a publish before it). Answers the schedule as it now is.
 */
export const setSchedule = async (def: any, Model: any, id: any, times: Times, user?: any): Promise<Schedule> => {
	const now = Date.now();
	const publishAt = timeOf(times.publishAt, 'Publish at', now);
	const unpublishAt = timeOf(times.unpublishAt, 'Take off at', now);
	if (publishAt === undefined && unpublishAt === undefined) throw new ScheduleError('Send publishAt or unpublishAt (a date and time, or null to clear it)');
	const doc: any = await Model.findById(id, { _publishedAt: 1, [displayFieldOf(def)]: 1 }).lean();
	if (!doc) throw new ScheduleError('Record not found');

	const before = await scheduleOf(doc._id);
	const pub = publishAt === undefined ? before.publishAt : publishAt;
	const off = unpublishAt === undefined ? before.unpublishAt : unpublishAt;
	if (pub && off && off.getTime() <= pub.getTime()) throw new ScheduleError('Take off at has to come after Publish at');
	if (off && !pub && !doc._publishedAt) throw new ScheduleError('It isn’t on the site yet — publish it, or set a time to publish it first');

	const name = String(doc[displayFieldOf(def)] ?? '').slice(0, 200);
	const put = async (action: 'publish' | 'unpublish', at: Date | null | undefined) => {
		if (at === undefined) return;
		if (at === null) return ContentSchedule.deleteOne({ record: doc._id, action, state: 'pending' });
		const job: any = await ContentSchedule.findOne({ record: doc._id, action, state: 'pending' });
		const fields = { modelDef: def._id, route: def.route, name, at, by: user?._id, byName: user?.name || '' };
		if (job) {
			job.set(fields);
			return job.save();
		}
		return ContentSchedule.create({ record: doc._id, action, ...fields });
	};
	await put('publish', publishAt);
	await put('unpublish', unpublishAt);
	return scheduleOf(doc._id);
};

/** The waiting jobs of this scope, soonest first — the content manager's list. */
export const upcoming = (limit = 20) => ContentSchedule.find({ state: 'pending' }).sort({ at: 1 }).limit(limit).lean();

/* ------------------------------------------------------------------ the tick */

const LOCK = 'content-schedule';
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
		// Someone else holds it: the upsert met their document.
		if (e?.code === 11000) return false;
		throw e;
	}
};

const WORDS = { publish: 'Published', unpublish: 'Taken off the site' } as const;

/** The person who set it hears how it went (tenant projects; the bell). */
const tell = async (job: any, failed?: string) => {
	if (!job.project || !job.by) return;
	const what = `${job.name ? `“${job.name}”` : 'A record'} on /${job.route}`;
	await notifyTenant([
		{
			recipient: job.by,
			organization: job.organization,
			project: job.project,
			type: failed ? 'schedule-failed' : 'schedule-done',
			title: failed ? `Couldn’t ${job.action === 'publish' ? 'publish' : 'take off'} ${what} as scheduled` : `${WORDS[job.action as 'publish' | 'unpublish']} as scheduled: ${what}`,
			message: failed || undefined,
			href: await projectHrefFor(job.project, `/${job.route}/${job.record}`).catch(() => ''),
			route: job.route,
			record: job.record,
		},
	]);
};

/** A deleted record's job just ends — whoever deleted it knows. */
const GONE = 'The record was deleted.';

const finish = (job: any, error = '') =>
	runUnscoped(() => ContentSchedule.updateOne({ _id: job._id }, { $set: { state: error ? 'failed' : 'done', doneAt: new Date(), error } }));

/** One due job, in its project: published or taken off as its person — or failed, with why. */
const apply = async (job: any) => {
	if (job.tries > MAX_TRIES) {
		await finish(job, `Stopped after ${MAX_TRIES} tries`);
		return tell(job, `It was tried ${MAX_TRIES} times and didn’t finish.`);
	}
	const scope = job.organization ? { organization: job.organization, project: job.project } : null;
	const inScope = <T>(fn: () => Promise<T>) => (scope ? runInScope(scope, fn) : withoutScope(fn));
	const problem = await inScope(async () => {
		await syncDynamicModels();
		const def: any = await ModelDefinition.findById(job.modelDef).lean();
		const Model: any = def && def.active !== false ? compiledModel(def.name) : null;
		if (!Model) return 'Its page isn’t there any more.';
		if (!def.draftAndPublish) return 'Drafts and publishing was turned off on its page.';
		const user = { _id: job.by, name: job.byName || 'Someone' };
		const out: any = job.action === 'publish' ? await publishRecord(Model, job.record, user) : await unpublishRecord(Model, job.record);
		if (!out) return GONE;
		const doc: any = await Model.findById(job.record).lean();
		// Told by its name now, not when it was scheduled.
		job.name = String(doc?.[displayFieldOf(def)] ?? '') || job.name;
		afterPublish(Model, job.action, job.action === 'publish' ? out.doc : doc, { source: 'schedule' });
		recordHistory({ req: { user }, action: 'update', model: Model.modelName, modelPath: def.route, doc, did: job.action === 'publish' ? 'published {it}' : 'took {it} off the site', note: 'as scheduled' });
		return '';
	});
	await finish(job, problem);
	if (problem !== GONE) await tell(job, problem || undefined);
};

let running = false;

/** Claims and applies what's due, one job at a time. */
export const runDueSchedules = async () => {
	if (running || mongoose.connection.readyState !== 1) return 0;
	running = true;
	let n = 0;
	try {
		if (!(await lead())) return 0;
		const now = Date.now();
		for (; n < BATCH; n++) {
			const job: any = await runUnscoped(() =>
				ContentSchedule.findOneAndUpdate(
					{ $or: [{ state: 'pending', at: { $lte: new Date(now) } }, { state: 'running', claimedAt: { $lt: new Date(now - STALE_MS) } }] },
					{ $set: { state: 'running', claimedAt: new Date() }, $inc: { tries: 1 } },
					{ sort: { at: 1 }, new: true }
				).lean()
			);
			if (!job) break;
			await apply(job).catch(async (e: any) => {
				console.error('content schedule:', e?.message);
				await finish(job, e?.message || 'Something went wrong');
				await tell(job, 'Something went wrong — try publishing it yourself.').catch(() => undefined);
			});
		}
	} catch (e: any) {
		console.error('content schedule tick:', e?.message);
	} finally {
		running = false;
	}
	return n;
};

/** Every minute from boot (CONTENT_TICK_MS for tests). */
export const scheduleContentTick = () => {
	setInterval(() => void runDueSchedules(), TICK_MS()).unref();
};
