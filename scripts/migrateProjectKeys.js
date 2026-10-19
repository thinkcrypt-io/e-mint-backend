import dotenv from 'dotenv';
import mongoose from 'mongoose';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import { newProjectKey } from '../dist/library/functions/projectKey.function.js';
import { runUnscoped } from '../dist/library/functions/tenantScope.function.js';

dotenv.config();

/**
 * API builder D14 (docs/api-builder AB-08): every project gets its project key —
 * the public API finds a project by it (/public/api/<route>?apiKey=…) and no
 * longer by its name. New projects get one when they're made, and the server
 * makes one for an older project the first time a panel page or the site
 * renderer asks; this gives them all one at once, so the panels show keys from
 * the first visit after the deploy. Needs `npm run build` first (it uses dist/).
 * It also builds the unique index on `apiKey`.
 *
 * Run with:  node scripts/migrateProjectKeys.js          (dry run: how many have none)
 *            node scripts/migrateProjectKeys.js --apply
 *
 * Safe to re-run: a project that has a key keeps it.
 */

const apply = process.argv.includes('--apply');

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const missing = await runUnscoped(() => TenantProject.find({ apiKey: null }, { name: 1 }).lean());
	console.log(`${missing.length} project(s) without a project key`);
	if (!apply) {
		for (const p of missing.slice(0, 20)) console.log(`- ${p.name}`);
		console.log('Dry run — add --apply to give them one.');
		return;
	}
	await TenantProject.createIndexes();
	let made = 0;
	for (const p of missing) {
		const r = await runUnscoped(() => TenantProject.updateOne({ _id: p._id, apiKey: null }, { $set: { apiKey: newProjectKey() } }));
		made += r.modifiedCount || 0;
	}
	console.log(`Gave ${made} project(s) a key.`);
};

run()
	.catch(e => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(() => mongoose.disconnect());
