import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';

dotenv.config();

/**
 * Seeds the "History" permission so it shows up as a checkbox group on the
 * Add/Edit Admin Role form and gates the /history routes (adminPermissions
 * checks for `view-history` — the `key` here must stay `history` to match the
 * `permission: 'history'` passed to defineRoutes).
 *
 * A role with `*` already sees the page without this; every other role needs
 * View ticked.
 *
 * Only `view` is offered on purpose. An audit trail nobody can create, edit or
 * delete through the API is the point — entries are written by the server, and
 * the History settings mark no field editable.
 *
 * Run with:  npm run build && node scripts/seedHistoryPermission.js
 *
 * Safe to re-run: it upserts on `key`.
 */

const permission = {
	name: 'History',
	description: 'View the activity log of every create, edit and delete',
	key: 'history',
	isActive: true,
	options: {
		create: false,
		view: true,
		edit: false,
		delete: false,
	},
};

const connectDB = async () => {
	const uri = process.env.MONGO_CONNECTION_URI;

	try {
		const conn = await mongoose.connect(uri);
		console.log(`Mongo DB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log(`error: ${error.message}`);
		process.exit(1);
	}
};

const seedHistoryPermission = async () => {
	try {
		const saved = await Permission.findOneAndUpdate({ key: permission.key }, permission, {
			upsert: true,
			new: true,
			setDefaultsOnInsert: true,
		});

		console.log(`Permission seeded: "${saved.name}" (key: ${saved.key})`);
		console.log(`  id: ${saved._id.toString()}`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedHistoryPermission();
