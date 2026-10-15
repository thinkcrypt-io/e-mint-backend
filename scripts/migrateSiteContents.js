import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runInScope, runUnscoped } from '../dist/library/functions/tenantScope.function.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import { ensureTypedContents } from '../dist/library/siteBuilder/contentTypes.js';
import { migrateSiteContents } from '../dist/library/siteBuilder/migrateContents.js';

dotenv.config();

/**
 * CMS-06c (docs/cms §6): every website's Contents as typed records — the
 * content types made, Contents able to hold them (drafts until published,
 * what's there published), and each site's one-word records moved into one
 * typed record per section. The server does the same lazily when a site's
 * builder opens; this makes the deploy complete at once. The old records stay
 * for the live site until its next Publish. Needs `npm run build` first.
 *
 * Run with:  node scripts/migrateSiteContents.js          (dry run: what each site would get)
 *            node scripts/migrateSiteContents.js --apply
 *
 * Safe to re-run: a site already moved is left as it is.
 */

const apply = process.argv.includes('--apply');
const req = { user: { _id: null, name: 'Content types migration' } };

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const projects = await runUnscoped(() => TenantProject.find({ type: 'website' }, { name: 1, organization: 1 }).lean());
	let records = 0;
	for (const p of projects) {
		const scope = { organization: p.organization, project: p._id };
		try {
			if (apply) await runInScope(scope, () => ensureTypedContents(req));
			const out = await runInScope(scope, () => migrateSiteContents(req, { apply }));
			if (out.skipped) {
				console.log(`${p.name}: ${out.skipped}`);
				continue;
			}
			records += out.records;
			console.log(`${p.name}: ${out.records} typed record(s) for ${out.old} old one(s)${out.pages.length ? ` — ${out.pages.map(x => `${x.name} ${x.records}`).join(', ')}` : ''}`);
		} catch (e) {
			console.log(`${p.name}: FAILED — ${e?.message}`);
		}
	}
	console.log(apply ? `\nDone — ${records} typed record(s) made.` : '\nDry run — nothing written. Add --apply to move the sites.');
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
