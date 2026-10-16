import express from 'express';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { compiledModel, displayFieldOf, syncDynamicModels } from '../library/functions/dynamicModels.function.js';
import { statusOf } from '../library/functions/drafts.function.js';
import { KIT_ROUTES } from '../library/siteBuilder/kit.js';
import { upcoming } from '../library/functions/contentSchedule.function.js';

/**
 * /tenant/api/p/:projectId/content — the content manager's home (docs/cms
 * CMS-07): the project's content in one place. Single types first (each one's
 * record and where it stands), then the collections whose records are drafts
 * until published — how many, how many not live, the last edit — and, in a
 * website, its Contents — and what's scheduled to publish or come off next
 * (CMS-11). Only the models the member may see.
 *
 *   GET /    { website, singles: [...], collections: [...], scheduled: [{ route, title, record, name, action, at, byName }] }
 */
const router = express.Router({ mergeParams: true });

/** Where a model's records stand: all, drafts never published, changed since publishing. */
const counts = async (Model: any) => {
	const changed = { $gt: ['$updatedAt', '$_publishedFrom'] };
	const [total, draft, modified] = await Promise.all([
		Model.countDocuments({ archivedAt: null }),
		Model.countDocuments({ archivedAt: null, _publishedAt: null }),
		Model.countDocuments({ archivedAt: null, _publishedAt: { $ne: null }, $expr: changed }),
	]);
	return { total, draft, modified, waiting: draft + modified };
};

router.get(
	'/',
	handle(async (req: any) => {
		await syncDynamicModels({ app: req.app });
		const defs: any[] = await ModelDefinition.find({ active: { $ne: false }, $or: [{ draftAndPublish: true }, { kind: 'single' }] }).sort({ title: 1 }).lean();
		const mine = defs.filter(d => grants(req.permissions, [`view-${d.route}`]));
		const out: any = { website: null, singles: [], collections: [], scheduled: [] };
		for (const d of mine) {
			const Model: any = compiledModel(d.name);
			if (!Model) continue;
			const drafts = !!d.draftAndPublish;
			const display = displayFieldOf(d);
			const last: any = await Model.findOne({ archivedAt: null }).sort({ updatedAt: -1 }).select(`${display} updatedAt _publishedAt _publishedFrom`).lean();
			const base = { route: d.route, title: d.title, description: d.description || '', drafts, canPublish: grants(req.permissions, [`publish-${d.route}`]) };
			if (d.kind === 'single') {
				out.singles.push({ ...base, exists: !!last, status: drafts && last ? statusOf(last) : last ? 'live' : null, updatedAt: last?.updatedAt || null });
				continue;
			}
			const c = await counts(Model);
			const item = { ...base, ...c, last: last ? { _id: String(last._id), name: String(last[display] ?? ''), updatedAt: last.updatedAt, status: statusOf(last) } : null };
			if (req.project?.type === 'website' && d.route === KIT_ROUTES.contents) out.website = item;
			else out.collections.push(item);
		}
		// Coming up: the waiting publishes and take-offs on the models they may see, soonest first.
		const titles = new Map(mine.map(d => [String(d._id), d]));
		const jobs: any[] = await upcoming(100);
		out.scheduled = jobs
			.filter(j => titles.has(String(j.modelDef)))
			.slice(0, 20)
			.map(j => ({ route: titles.get(String(j.modelDef)).route, title: titles.get(String(j.modelDef)).title, record: String(j.record), name: j.name, action: j.action, at: j.at, byName: j.byName }));
		return out;
	})
);

export default router;
