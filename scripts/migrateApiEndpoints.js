import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { ensureEndpoints } from '../dist/library/functions/apiEndpoints.function.js';
import { runInScope } from '../dist/library/functions/tenantScope.function.js';
import ApiEndpoint from '../dist/library/models/tenancy/apiEndpoint.model.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import { runUnscoped } from '../dist/library/functions/tenantScope.function.js';

dotenv.config();

/**
 * API builder D9 (docs/api-builder): every project's public API as endpoints —
 * each model whose `publicApi` is on gets its standard endpoints (/<route>,
 * /<route>/:id) with the same rules. The server does the same lazily on a
 * project's first API call or API page, so this only makes the deploy
 * complete at once. Needs `npm run build` first (it uses dist/).
 *
 * Run with:  node scripts/migrateApiEndpoints.js          (dry run: what each project would get)
 *            node scripts/migrateApiEndpoints.js --apply
 *
 * Safe to re-run: a project already in step is left as it is.
 */

const apply = process.argv.includes('--apply');

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const projects = await runUnscoped(() => TenantProject.find({}, { name: 1, organization: 1 }).lean());
	let made = 0;
	for (const p of projects) {
		const scope = { organization: p.organization, project: p._id };
		const publicModels = await db
			.collection('modeldefinitions')
			.countDocuments({ organization: p.organization, project: p._id, 'publicApi.enabled': true, active: { $ne: false } });
		if (!publicModels) continue;
		const before = await runInScope(scope, () => ApiEndpoint.countDocuments({ standard: true }));
		if (!apply) {
			console.log(`${p.name}: ${publicModels} model(s) with a public API, ${before} standard endpoint(s) now`);
			continue;
		}
		await runInScope(scope, () => ensureEndpoints());
		const after = await runInScope(scope, () => ApiEndpoint.countDocuments({ standard: true }));
		made += after - before;
		console.log(`${p.name}: ${after} standard endpoint(s)${after > before ? ` (+${after - before})` : ''}`);
	}
	console.log(apply ? `\nDone — ${made} endpoint(s) made.` : '\nDry run — nothing written. Add --apply to make them.');
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
