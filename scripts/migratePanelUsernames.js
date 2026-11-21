import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PanelAdmin from '../dist/library/models/tenancy/panelAdmin.model.js';

dotenv.config();

/**
 * PU-08 (docs/panel-users): panel logins sign in with a username.
 *
 * 1. Every login without a username gets its email as its username, so the
 *    emails people already use keep signing in.
 * 2. The old `email_1` unique index (email required) is swapped for the
 *    model's partial ones: `username_unique` and `email_unique`, unique only
 *    where set, so a login may have no email.
 *
 * Needs `npm run build` first. Safe to re-run.
 *
 * Run with:  node scripts/migratePanelUsernames.js            (dry run)
 *            node scripts/migratePanelUsernames.js --apply
 */
const apply = process.argv.includes('--apply');

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const col = PanelAdmin.collection;

	const missing = await col.find({ $or: [{ username: { $exists: false } }, { username: null }, { username: '' }] }, { projection: { email: 1 } }).toArray();
	console.log(`${missing.length} login(s) without a username${apply ? ' — setting it to their email' : ''}`);
	let set = 0;
	for (const a of missing) {
		const username = String(a.email || '').trim().toLowerCase();
		if (!username) {
			console.log(`  skip ${a._id}: no email either`);
			continue;
		}
		const clash = await col.findOne({ _id: { $ne: a._id }, $or: [{ username }, { email: username }] }, { projection: { _id: 1 } });
		if (clash) {
			console.log(`  skip ${a._id}: "${username}" is already ${clash._id}'s`);
			continue;
		}
		console.log(`  ${a._id} → ${username}`);
		if (apply) {
			await col.updateOne({ _id: a._id }, { $set: { username } });
			set++;
		}
	}

	const indexes = await col.indexes();
	const old = indexes.find(i => i.name === 'email_1');
	console.log(old ? `email_1 index found${apply ? ' — dropping it' : ' (would drop)'}` : 'no email_1 index');
	if (apply) {
		if (old) await col.dropIndex('email_1');
		await PanelAdmin.createIndexes();
		console.log('indexes now:', (await col.indexes()).map(i => i.name).join(', '));
		console.log(`Done: ${set} username(s) set.`);
	} else console.log('Dry run — add --apply to write.');
	await mongoose.disconnect();
};

run().catch(async e => {
	console.error(e.message || e);
	await mongoose.disconnect();
	process.exit(1);
});
