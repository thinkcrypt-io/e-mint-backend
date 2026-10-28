import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runInScope, runUnscoped } from '../dist/library/functions/tenantScope.function.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import CommerceSettings from '../dist/library/models/tenancy/commerceSettings.model.js';
import { upgradeStore } from '../dist/library/functions/commerce/upgrade.js';

dotenv.config();

/**
 * EC-21 (docs/ecommerce): every built store brought up to today's blueprint —
 * the fields added since it was set up (Categories: web address, status and
 * order on the POS and the website, more images) put on its models, the
 * records already there filled in, the Categories list endpoint hiding what's
 * inactive on the website. Needs `npm run build` first.
 *
 * Run with:  node scripts/upgradeStores.js          (dry run: what each store would get)
 *            node scripts/upgradeStores.js --apply
 *
 * Safe to re-run: what's done is left alone.
 */

const apply = process.argv.includes('--apply');
const req = { user: { _id: null, name: 'Store upgrade' } };

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const projects = await runUnscoped(() => TenantProject.find({ type: 'ecommerce' }, { name: 1, organization: 1 }).lean());
	let stores = 0;
	for (const p of projects) {
		const scope = { organization: p.organization, project: p._id };
		try {
			const s = await runInScope(scope, () => CommerceSettings.findOne({}, { status: 1 }).lean());
			if (s?.status !== 'ready') {
				console.log(`${p.name}: no built store (${s?.status || 'not set up'})`);
				continue;
			}
			const changes = await runInScope(scope, () => upgradeStore(req, { apply }));
			if (!changes.length) {
				console.log(`${p.name}: up to date`);
				continue;
			}
			stores++;
			console.log(`${p.name}:`);
			for (const c of changes)
				console.log(
					`  ${c.model} — ${[c.added.length && `adds ${c.added.join(', ')}`, c.renewed.length && `renews ${c.renewed.join(', ')}`, ...c.filled].filter(Boolean).join('; ')}`
				);
		} catch (e) {
			console.log(`${p.name}: FAILED — ${e?.message}${e?.problems ? ` (${e.problems.join('; ')})` : ''}`);
		}
	}
	console.log(apply ? `\nDone — ${stores} store(s) upgraded.` : `\nDry run — nothing written. ${stores} store(s) would change. Add --apply to upgrade them.`);
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
