import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Adds "Heroku Accounts" to the admin sidebar, next to Credentials.
 *
 * Gated on `view-heroku` (not the bare `heroku` string Credentials happens to
 * use) so the link only shows for a role that can actually open the list —
 * seeded by seedHerokuPermissions.js.
 *
 * Run with:  npm run build && node scripts/seedHerokuSidebarItem.js
 *
 * Safe to re-run: it upserts on `href`.
 */

const CATEGORY_NAME = 'Project Management';

const item = {
	name: 'Heroku Accounts',
	description: 'Connected Heroku accounts, their apps, and app config vars',
	href: 'herokus',
	icon: 'cloud',
	tooltip: 'View and download Heroku app config vars',
	priority: 26,
	isActive: true,
	permissionProtected: true,
	permission: 'view-heroku',
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

const seedHerokuSidebarItem = async () => {
	try {
		const category = await SidebarCategory.findOne({ name: CATEGORY_NAME });

		if (!category) {
			console.log(`Category "${CATEGORY_NAME}" not found — nothing seeded.`);
			return;
		}

		const saved = await SidebarItem.findOneAndUpdate(
			{ href: item.href },
			{ ...item, category: category._id },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);

		console.log(`Sidebar item seeded: "${saved.name}" -> /${saved.href}`);
		console.log(`  category: ${CATEGORY_NAME} (${category._id.toString()})`);
		console.log(`  permission: ${saved.permission} (protected: ${saved.permissionProtected})`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedHerokuSidebarItem();
