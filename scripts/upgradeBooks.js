import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runInScope, runUnscoped } from '../dist/library/functions/tenantScope.function.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import ModelDefinition from '../dist/library/models/builder/modelDefinition.model.js';
import { compiledByRoute, syncDynamicModels } from '../dist/library/functions/dynamicModels.function.js';
import { BOOKS_PLAN, BOOKS_VERSION } from '../dist/library/functions/accounting/blueprint.js';
import { seedBooks } from '../dist/library/functions/accounting/seed.js';
import { markBooks } from '../dist/library/functions/accounting/install.js';

dotenv.config();

/**
 * AC-02 (docs/accounting): every accounting project's books brought up to today's blueprint — its models marked as
 * the books' own with the engine's fields read-only, and the chart of accounts and defaults that are missing seeded.
 * `--adopt <slug>` makes a project whose models were built by hand from the same plans (the demo,
 * thinkcrypt-expense-management) an accounting project with ready books. Needs `npm run build` first.
 *
 * Run with:  node scripts/upgradeBooks.js                       (dry run: what each project would get)
 *            node scripts/upgradeBooks.js --apply
 *            node scripts/upgradeBooks.js --adopt <public address or slug> [--apply]
 *
 * Safe to re-run: what's there is left alone.
 */

const apply = process.argv.includes('--apply');
const adoptAt = process.argv.indexOf('--adopt');
const adopt = adoptAt > -1 ? process.argv[adoptAt + 1] : null;

/** A model whose `create` only reports in a dry run. */
const dryable = Model =>
	apply
		? Model
		: {
				findOne: (...a) => Model.findOne(...a),
				exists: (...a) => Model.exists(...a),
				create: async () => ({ _id: new mongoose.Types.ObjectId() }),
			};

const upgrade = async p => {
	const scope = { organization: p.organization, project: p._id };
	return runInScope(scope, async () => {
		await syncDynamicModels({ force: true });
		const missing = BOOKS_PLAN.steps.filter(s => !compiledByRoute(s.route)).map(s => s.route);
		if (missing.length) return { missing };
		const defs = await ModelDefinition.find({ route: { $in: BOOKS_PLAN.steps.map(s => s.route) } }, { route: 1, system: 1 }).lean();
		const unmarked = defs.filter(d => d.system !== 'accounting').map(d => d.route);
		if (apply) await markBooks(defs.map(d => ({ route: d.route, id: d._id })));
		const seeded = await seedBooks(route => dryable(compiledByRoute(route)), { name: p.name });
		return { unmarked, seeded };
	});
};

const report = (p, r) => {
	if (r.missing) return console.log(`${p.name}: can't — missing ${r.missing.join(', ')}`), false;
	const parts = [r.unmarked.length && `marks ${r.unmarked.length} model(s)`, r.seeded.length && `adds ${r.seeded.join(', ')}`].filter(Boolean);
	console.log(`${p.name}: ${parts.length ? parts.join('; ') : 'up to date'}`);
	return parts.length > 0;
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	let changed = 0;
	if (adopt) {
		// Its public address (unique, what links and connectors show) or its slug (unique only within its organization).
		const found = await runUnscoped(() => TenantProject.find({ $or: [{ publicSlug: adopt }, { slug: adopt }] }, { name: 1, organization: 1, type: 1, books: 1, publicSlug: 1 }).lean());
		const p = found.find(x => x.publicSlug === adopt) || (found.length === 1 ? found[0] : null);
		if (!p) throw new Error(found.length ? `${found.length} projects have the slug ${adopt} — use the public address: ${found.map(x => x.publicSlug).join(', ')}` : `No project ${adopt}`);
		console.log(`${p.name} (type ${p.type}${p.books?.status ? `, books ${p.books.status}` : ''}) → accounting`);
		const r = await upgrade(p);
		if (report(p, r) || p.type !== 'accounting') changed++;
		if (apply && !r.missing)
			await runUnscoped(() =>
				TenantProject.updateOne({ _id: p._id }, { $set: { type: 'accounting', books: { status: 'ready', version: BOOKS_VERSION, startedAt: new Date(), finishedAt: new Date() } } })
			);
	} else {
		const projects = await runUnscoped(() => TenantProject.find({ type: 'accounting' }, { name: 1, organization: 1, books: 1 }).lean());
		for (const p of projects) {
			if (p.books?.status !== 'ready') {
				console.log(`${p.name}: books ${p.books?.status || 'not set up'} — skipped`);
				continue;
			}
			try {
				if (report(p, await upgrade(p))) changed++;
				if (apply && p.books.version !== BOOKS_VERSION) await runUnscoped(() => TenantProject.updateOne({ _id: p._id }, { $set: { 'books.version': BOOKS_VERSION } }));
			} catch (e) {
				console.log(`${p.name}: FAILED — ${e?.message}`);
			}
		}
	}
	console.log(apply ? `\nDone — ${changed} project(s) changed.` : `\nDry run — nothing written. ${changed} project(s) would change. Add --apply to write.`);
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
