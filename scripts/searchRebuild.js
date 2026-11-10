import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runInScope, runUnscoped } from '../dist/library/functions/tenantScope.function.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import CommerceSettings from '../dist/library/models/tenancy/commerceSettings.model.js';
import { storeOf } from '../dist/library/functions/commerce/store.js';
import { rebuildSearch, searchIndexStatus } from '../dist/library/functions/commerce/search/indexer.js';

dotenv.config();

/**
 * Store search (docs/search SI5): every built store's search documents, built again from its products. A server
 * does this by itself for a store never indexed (its first sweep) and for a store whose count drifts (daily); this
 * script is for doing it now — after a deploy that changes what a document holds, say. Needs `npm run build` first.
 *
 * Run with:  node scripts/searchRebuild.js                  (dry run: each store's documents against its products)
 *            node scripts/searchRebuild.js --apply
 *            node scripts/searchRebuild.js --apply <projectId>   (one store)
 */

const apply = process.argv.includes('--apply');
const only = process.argv.slice(2).find(a => /^[a-f0-9]{24}$/i.test(a));

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const projects = await runUnscoped(() => TenantProject.find({ type: 'ecommerce', ...(only && { _id: only }) }, { name: 1, organization: 1 }).lean());
	let n = 0;
	for (const p of projects) {
		const scope = { organization: p.organization, project: p._id };
		try {
			const s = await runInScope(scope, () => CommerceSettings.findOne({}, { status: 1 }).lean());
			if (s?.status !== 'ready') {
				console.log(`${p.name}: no built store (${s?.status || 'not set up'})`);
				continue;
			}
			const before = await runInScope(scope, async () => searchIndexStatus(await storeOf()));
			if (!apply) {
				console.log(`${p.name}: ${before.docs} search documents for ${before.products} findable products, ${before.queued} queued${before.builtAt ? `, built ${new Date(before.builtAt).toISOString()}` : ', never built'}`);
				continue;
			}
			const r = await runInScope(scope, async () => rebuildSearch(await storeOf(), { reason: 'script' }));
			if (r.skipped) console.log(`${p.name}: a rebuild is already running — skipped`);
			else console.log(`${p.name}: ${r.products} products read, ${r.docs} documents, ${r.dropped} dropped`), n++;
		} catch (e) {
			console.log(`${p.name}: FAILED — ${e?.message}`);
		}
	}
	console.log(apply ? `\nDone — ${n} store(s) rebuilt.` : '\nDry run — nothing written. Add --apply to rebuild.');
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
