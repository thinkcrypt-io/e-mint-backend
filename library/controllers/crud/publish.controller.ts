import { Response } from 'express';
import mongoose from 'mongoose';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { discardDraft, publishRecord, unpublishRecord } from '../../functions/drafts.function.js';
import recordHistory from '../../functions/recordHistory.function.js';
import { afterPublish } from '../../functions/publishEvents.function.js';

/**
 * Drafts and publishing on a page's records (docs/cms D5, CMS-05):
 *
 *   POST /:id/publish     the draft goes live (the public API and the site show it)
 *   POST /:id/unpublish   taken off; the draft stays
 *   POST /:id/discard     the draft's changes thrown away — back to what's live
 *   POST /bulk/publish    { ids } — each one published
 *
 * Only on a model with Drafts and publishing on; otherwise 400. Publishing and
 * taking off send the project's publish / unpublish webhooks and refresh its
 * site (publishEvents.function.ts).
 */

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const draftsOn = async (route?: string) => {
	if (!route) return false;
	const def: any = await ModelDefinition.findOne({ route }, { draftAndPublish: 1 }).lean();
	return !!def?.draftAndPublish;
};

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
		recordHistory({ req, action: 'update', model: Model.modelName, doc, note: action === 'publish' ? '— published it' : action === 'unpublish' ? '— took it off the site' : '— threw the draft’s changes away' } as any);
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
		}
		return res.json({ message: `${published} published`, published });
	} catch (e: any) {
		return res.status(500).json({ message: e?.message || 'Something went wrong' });
	}
};
