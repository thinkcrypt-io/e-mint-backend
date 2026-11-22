import crypto from 'crypto';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PanelAdmin from '../dist/library/models/tenancy/panelAdmin.model.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';

dotenv.config();

/**
 * Demo logins (docs/panel-users/DEMO_LOGINS.md) for the demo stores the websites show. Each store's demo
 * login gets the same access as its shared login (the email the sites used to print), and its link is
 * printed: <commerce panel>/demo/<key>. A store that has a demo login already keeps it (its link is printed).
 *
 * Needs `npm run build` first. Safe to re-run.
 *
 * A store with no shared login is named by its project instead: `project:<name>` (store admin access).
 *
 * Run with:  node scripts/makeDemoLogins.js admin1@mintapp.site project:Footshop …            (dry run)
 *            node scripts/makeDemoLogins.js --apply admin1@mintapp.site …
 */
const apply = process.argv.includes('--apply');
const emails = process.argv.slice(2).filter(a => !a.startsWith('--'));
const COMMERCE = (process.env.COMMERCE_URL || 'https://commerce.mintapp.site').replace(/\/+$/, '');
const PANEL = (process.env.PANEL_URL || 'https://panel.tcrypt.site').replace(/\/+$/, '');

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const out = [];
	for (const email of emails) {
		let shared = null;
		if (email.startsWith('project:')) {
			const named = await TenantProject.find({ name: email.slice(8), type: 'ecommerce' }).lean();
			if (named.length !== 1) {
				console.log(`${email}: ${named.length} store projects by that name — skipped`);
				continue;
			}
			const [p] = named;
			shared = { project: p._id, organization: p.organization, createdBy: p.createdBy, role: null, superAdmin: false };
		} else shared = await PanelAdmin.findOne({ $or: [{ email }, { username: email }] }).lean();
		if (!shared) {
			console.log(`${email}: no such login — skipped`);
			continue;
		}
		const project = await TenantProject.findById(shared.project).lean();
		const app = project?.type === 'ecommerce' ? COMMERCE : PANEL;
		let demo = await PanelAdmin.findOne({ project: shared.project, demo: true }).select('+demoKey').lean();
		const access = shared.superAdmin ? 'super admin' : shared.role ? `role ${shared.role}` : 'store admin';
		if (demo) {
			console.log(`${email} → ${project?.name}: has a demo login already`);
		} else if (apply) {
			demo = (
				await PanelAdmin.create({
					name: 'Demo',
					username: `demo-${crypto.randomBytes(6).toString('hex')}`,
					demo: true,
					demoKey: crypto.randomBytes(24).toString('base64url'),
					role: shared.role || undefined,
					superAdmin: !!shared.superAdmin,
					organization: shared.organization,
					project: shared.project,
					createdBy: shared.createdBy,
				})
			).toObject();
			console.log(`${email} → ${project?.name}: demo login made (${access})`);
		} else {
			console.log(`${email} → ${project?.name} (${project?.type}): would make a demo login (${access})`);
			continue;
		}
		out.push({ email, project: project?.name, slug: project?.publicSlug, demoUrl: `${app}/demo/${demo.demoKey}` });
	}
	if (out.length) console.log(JSON.stringify(out, null, 1));
	if (!apply) console.log('Dry run — add --apply to write.');
	await mongoose.disconnect();
};

run().catch(async e => {
	console.error(e);
	await mongoose.disconnect();
	process.exit(1);
});
