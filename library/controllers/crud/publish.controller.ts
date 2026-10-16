import { Response } from 'express';
import mongoose from 'mongoose';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { discardDraft, publishRecord, unpublishRecord } from '../../functions/drafts.function.js';
import recordHistory from '../../functions/recordHistory.function.js';
import { afterPublish } from '../../functions/publishEvents.function.js';
import { ScheduleError, setSchedule } from '../../functions/contentSchedule.function.js';

/**
 * Drafts and publishing on a page's records (docs/cms D5, CMS-05):
 *
 *   POST /:id/publish     the draft goes live (the public API and the site show it)
 *   POST /:id/unpublish   taken off; the draft stays
 *   POST /:id/discard     the draft's changes thrown away — back to what's live
 *   POST /bulk/publish    { ids } — each one published
 *   POST /:id/schedule    { publishAt?, unpublishAt? } — a time (ISO) sets or moves it, null clears it (CMS-11)
 *
 * Only on a model with Drafts and publishing on; otherwise 400. Publishing and
 * taking off send the project's publish / unpublish webhooks and refresh its
 * site (publishEvents.function.ts).
 */

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const draftsDef = async (route?: string) => {
	if (!route) return null;
	const def: any = await ModelDefinition.findOne({ route }).lean();
	return def?.draftAndPublish ? def : null;
};
const draftsOn = async (route?: string) => !!(await draftsDef(route));

/** The History sentence for each (recordHistory's `did`). */
export const DID = { publish: 'published {it}', unpublish: 'took {it} off the site', discard: 'threw away the draft’s changes to {it}' } as const;

const OFF = 'Drafts and publishing is off for this page — records are live as soon as they’re saved.';

export const publishAction = (Model: mongoose.Model<any>, route: string | undefined, action: 'publish' | 'unpublish' | 'discard') => async (req: any, res: Response) => {
	try {
		if (!(await draftsOn(route))) return res.status(400).json({ message: OFF });
		if (!isId(req.params.id)) return res.status(404).json({ message: 'Record not found' });
		const out: any =
			action === 'publish' ? await publishRecord(Model, req.params.id, req.user) : action === 'unpublish' ? await unpublishRecord(Model, req.params.id) : await discardDraft(Model, req.params.id);
		if (!out) return res.status(404).json({ message: 'Record not found' });
		if (out.error) return res.status(400).json({ message: out.error });
		const doc: any = await Model.findById(req.params.id).lean();
		if (action !== 'discard') afterPublish(Model, action, action === 'publish' ? out.doc : doc);
		recordHistory({ req, action: 'update', model: Model.modelName, doc, did: DID[action] });
		return res.json({ message: action === 'publish' ? 'Published' : action === 'unpublish' ? 'Taken off the site' : 'Changes discarded', ...out, doc });
	} catch (e: any) {
		return res.status(500).json({ message: e?.message || 'Something went wrong' });
	}
};

export const bulkPublish = (Model: mongoose.Model<any>, route: string | undefined) => async (req: any, res: Response) => {
	try {
		if (!(await draftsOn(route))) return res.status(400).json({ message: OFF });
		const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter(isId).slice(0, 500);
		if (!ids.length) return res.status(400).json({ message: 'Pick the records to publish' });
		let published = 0;
		for (const id of ids) {
			const out = await publishRecord(Model, id, req.user);
			if (!out) continue;
			published++;
			afterPublish(Model, 'publish', out.doc);
			recordHistory({ req, action: 'update', model: Model.modelName, doc: out.doc, did: DID.publish });
		}
		return res.json({ message: `${published} published`, published });
	} catch (e: any) {
		return res.status(500).json({ message: e?.message || 'Something went wrong' });
	}
};

/** Publish at / take off at (docs/cms D7): applied by the minute tick (contentSchedule.function.ts). */
export const scheduleAction = (Model: mongoose.Model<any>, route: string | undefined) => async (req: any, res: Response) => {
	try {
		const def = await draftsDef(route);
		if (!def) return res.status(400).json({ message: OFF });
		if (!isId(req.params.id)) return res.status(404).json({ message: 'Record not found' });
		const schedule = await setSchedule(def, Model, req.params.id, { publishAt: req.body?.publishAt, unpublishAt: req.body?.unpublishAt }, req.user);
		const set = schedule.publishAt || schedule.unpublishAt;
		return res.json({ message: set ? 'Scheduled' : 'Schedule cleared', schedule });
	} catch (e: any) {
		if (e instanceof ScheduleError) return res.status(e.message === 'Record not found' ? 404 : 400).json({ message: e.message });
		return res.status(500).json({ message: e?.message || 'Something went wrong' });
	}
};
