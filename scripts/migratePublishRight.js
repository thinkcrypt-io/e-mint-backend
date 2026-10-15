import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * CMS D11 (docs/cms): Publish is a right of its own — `records:publish` on an
 * organization role, `publish-<route>` on a project's own role. Before it,
 * whoever could edit a record could publish it; this gives every role that
 * could edit the new right, so nobody loses what they could do:
 *   - organization roles (Member, Developer, Full access and custom ones) with
 *     `records:edit` get `records:publish`;
 *   - a project's own roles with `edit-<route>` get `publish-<route>` for the
 *     project's models with Drafts and publishing on.
 * New organizations get it from the role defaults.
 *
 * Run once, at the deploy that ships it:
 *            node scripts/migratePublishRight.js          (dry run)
 *            node scripts/migratePublishRight.js --apply
 */

const apply = process.argv.includes('--apply');

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const roles = mongoose.connection.db.collection('organizationroles');
	const models = mongoose.connection.db.collection('modeldefinitions');

	const orgRoles = await roles.find({ project: null, permissions: 'records:edit', 'permissions.0': { $ne: '*' } }).toArray();
	const orgTodo = orgRoles.filter(r => !r.permissions.includes('records:publish'));
	console.log(`Organization roles: ${orgTodo.length} of ${orgRoles.length} that edit records get Publish`);
	if (apply && orgTodo.length) await roles.updateMany({ _id: { $in: orgTodo.map(r => r._id) } }, { $addToSet: { permissions: 'records:publish' } });

	let projectGiven = 0;
	for (const r of await roles.find({ project: { $ne: null } }).toArray()) {
		const drafts = await models.find({ project: r.project, draftAndPublish: true }, { projection: { route: 1 } }).toArray();
		const add = drafts.map(m => m.route).filter(route => r.permissions.includes(`edit-${route}`) && !r.permissions.includes(`publish-${route}`));
		if (!add.length) continue;
		projectGiven += add.length;
		console.log(`  ${r.name}: ${add.map(x => `publish-${x}`).join(', ')}`);
		if (apply) await roles.updateOne({ _id: r._id }, { $addToSet: { permissions: { $each: add.map(x => `publish-${x}`) } } });
	}
	console.log(`Project roles: ${projectGiven} model(s) get Publish`);
	console.log(apply ? '\nDone.' : '\nDry run — nothing written. Add --apply to give it.');
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
