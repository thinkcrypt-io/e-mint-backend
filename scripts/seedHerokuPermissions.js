import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';

dotenv.config();

/**
 * Seeds the two Heroku permission groups.
 *
 * The Permission model only has four fixed booleans (create/view/edit/delete)
 * per `key`, which is why this is two documents instead of one:
 *
 *  - key `heroku`        -> create-heroku / view-heroku / edit-heroku / delete-heroku
 *                           (account CRUD — connect, list, edit details, remove)
 *  - key `heroku-config` -> view-heroku-config (read an app's config vars) and
 *                           create-heroku-config, relabelled "Download" here —
 *                           there is no dedicated download slot on this model,
 *                           and reusing `edit`/`delete` would read as though
 *                           granting download rights also grants change/removal
 *                           rights, which is worse. `create-heroku-config` is
 *                           the option this model has that a delete/edit slot
 *                           would not be able to unambiguously stand in for.
 *                           `edit`/`delete` are left off entirely: read-only by
 *                           scope, see HEROKU_INTEGRATION_WORK_ORDER.md.
 *
 * Run with:  npm run build && node scripts/seedHerokuPermissions.js
 *
 * Safe to re-run: it upserts on `key`.
 */

const permissions = [
	{
		name: 'Heroku Accounts',
		description: 'Connect, view, edit and remove stored Heroku accounts',
		key: 'heroku',
		isActive: true,
		options: {
			create: true,
			view: true,
			edit: true,
			delete: true,
		},
	},
	{
		name: 'Heroku Config Vars',
		description:
			'Read and download a connected Heroku app’s live config vars. "Create" here means Download.',
		key: 'heroku-config',
		isActive: true,
		options: {
			create: true,
			view: true,
			edit: false,
			delete: false,
		},
	},
];

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

const seedHerokuPermissions = async () => {
	try {
		for (const permission of permissions) {
			const saved = await Permission.findOneAndUpdate({ key: permission.key }, permission, {
				upsert: true,
				new: true,
				setDefaultsOnInsert: true,
			});

			console.log(`Permission seeded: "${saved.name}" (key: ${saved.key}) id: ${saved._id.toString()}`);
		}
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedHerokuPermissions();
