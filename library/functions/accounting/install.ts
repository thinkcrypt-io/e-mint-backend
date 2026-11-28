import express from 'express';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import { Feature } from '../../models/builder/_index.js';
import { deleteModelCore } from '../../controllers/builder/models.controller.js';
import { TEMPLATE_MAX_STEPS, buildFeature } from '../../controllers/builder/features.service.js';
import { planFromAi } from '../../controllers/builder/features.schema.js';
import { compiledByRoute, syncDynamicModels } from '../dynamicModels.function.js';
import { projectHooks } from '../projectHooks.function.js';
import { recordProjectEvent } from '../recordHistory.function.js';
import { runInScope } from '../tenantScope.function.js';
import { tenantPermissions } from '../tenantPermissions.function.js';
import { engineFieldsReadOnly } from '../commerce/install.js';
import { isAccountingProject } from '../accountingPanel.function.js';
import { BOOKS_PLAN, BOOKS_VERSION, ENGINE_FIELDS } from './blueprint.js';
import { seedBooks } from './seed.js';

/**
 * Installing the books (docs/accounting D2; WORK_ORDERS AC-02): when an accounting project is made, its models are
 * built from the blueprint as one feature plan in the background, marked as the books' own (`system: 'accounting'`,
 * every blueprint field locked), the engine's fields made read-only in forms, and the chart of accounts and defaults
 * seeded. All or nothing: a failure takes the models back and leaves `project.books.status = 'failed'` with why;
 * POST /accounting/books/retry tries again. The tenant and mint-accounting read the status from the project.
 */

const scopeOf = (project: any) => ({ organization: project.organization, project: project._id });

/** A built model of the books by route (throws if missing). */
export const booksModel = (route: string) => {
	const Model = compiledByRoute(route);
	if (!Model) throw new Error(`The books’ ${route} model is missing`);
	return Model;
};

/** Marks the blueprint's models as the books' own and its engine fields read-only. Also used to adopt a project. */
export const markBooks = async (models: { route: string; id: any }[]) => {
	for (const step of BOOKS_PLAN.steps) {
		const m = models.find(c => c.route === step.route);
		if (!m) continue;
		const keys: string[] = (step.fields || []).map((f: any) => f.key);
		await ModelDefinition.updateOne({ _id: m.id }, { $set: { system: 'accounting', systemFields: keys } });
		const engine = ENGINE_FIELDS[step.route];
		if (engine) await engineFieldsReadOnly(step.route, engine === '*' ? keys : engine);
	}
};

/** Builds the books in the current project scope; throws after undoing what it did. */
export const installBooks = async (req: any, project: any) => {
	const undo: (() => Promise<any>)[] = [];
	try {
		const built = await buildFeature(req, planFromAi(BOOKS_PLAN), { source: 'template', maxSteps: TEMPLATE_MAX_STEPS });
		undo.push(async () => {
			for (const m of [...built.created].reverse()) await deleteModelCore(req, m.id, { dropData: true, ignoreLinks: true, system: true }).catch(() => undefined);
			if (built.feature?._id) await Feature.deleteOne({ _id: built.feature._id });
		});
		const missing = BOOKS_PLAN.steps.filter((s: any) => !built.created.some(c => c.route === s.route)).map((s: any) => s.title);
		if (missing.length) throw Object.assign(new Error(`${missing.join(', ')} wasn’t built`), { problems: missing });
		await markBooks(built.created);
		await syncDynamicModels({ app: req.app, force: true });
		const seeded = await seedBooks(booksModel, { name: project.name });
		return { models: built.created.length, seeded };
	} catch (e: any) {
		for (const u of undo.reverse()) await u().catch((err: any) => console.error('Undoing the books:', err?.message));
		await syncDynamicModels({ app: req.app, force: true }).catch(() => undefined);
		throw e;
	}
};

/** Claims the install (new or failed only) and runs it in the background — 36 models take a while on a remote database. */
export const startBooks = async (req: any, project: any) => {
	const claimed = await TenantProject.updateOne(
		{ _id: project._id, $or: [{ 'books.status': { $exists: false } }, { 'books.status': 'failed' }] },
		{ $set: { books: { status: 'building', startedAt: new Date() } } }
	);
	if (!claimed.modifiedCount) return false;
	setImmediate(() =>
		runInScope(scopeOf(project), async () => {
			try {
				await installBooks(req, project);
				await TenantProject.updateOne({ _id: project._id }, { $set: { 'books.status': 'ready', 'books.version': BOOKS_VERSION, 'books.finishedAt': new Date() } });
				recordProjectEvent({ req, action: 'create', model: 'Books', modelPath: 'accounting', document: project._id, name: 'Books', text: 'set up the books' });
			} catch (e: any) {
				console.error('books setup:', e?.message, e?.problems || '');
				await TenantProject.updateOne(
					{ _id: project._id },
					{ $set: { 'books.status': 'failed', 'books.error': e?.message || 'The books couldn’t be set up', 'books.problems': e?.problems || [], 'books.finishedAt': new Date() } }
				);
			}
		}).catch((e: any) => console.error('books setup:', e?.message))
	);
	return true;
};

// A new accounting project gets its books (the hook runs inside the create request, after its Books sidebar category exists).
projectHooks.onCreated(async (req, project) => {
	if (isAccountingProject(project)) await startBooks(req, project);
});

/** /accounting/books on the project router: the install's status, and trying again after a failure. */
export const booksSetupRouter = () => {
	const router = express.Router();
	router.get('/', async (req: any, res: any) => {
		const p: any = await TenantProject.findById(req.project._id, { books: 1 }).lean();
		res.status(200).json({ status: p?.books?.status || (isAccountingProject(req.project) ? 'building' : 'none'), version: p?.books?.version, error: p?.books?.error, problems: p?.books?.problems || [] });
	});
	router.post('/retry', tenantPermissions(['build']), async (req: any, res: any) => {
		if (!isAccountingProject(req.project)) return res.status(400).json({ message: 'Only accounting projects have books' });
		const started = await startBooks(req, req.project);
		if (!started) return res.status(409).json({ message: 'The books are already set up or being set up' });
		res.status(202).json({ status: 'building' });
	});
	return router;
};
