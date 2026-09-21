import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Adds "Heroku Guide" to the admin sidebar, right under Heroku Accounts —
 * where to get an API key and how to use each part of the feature.
 *
 * Gated on the same `view-heroku` permission as the accounts list itself:
 * nobody who cannot open the feature needs a link to its instructions.
 *
 * Run with:  npm run build && node scripts/seedHerokuDocSidebarItem.js
 *
 * Safe to re-run: it upserts on `href`.
 */

const CATEGORY_NAME = 'Project Management';

const item = {
	name: 'Heroku Guide',
	description: 'Where to get a Heroku API key, and how to use the Heroku Accounts page',
	href: 'heroku-doc',
	icon: 'book-open',
	tooltip: 'How to connect an account and read config vars',
	priority: 27,
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

const seedHerokuDocSidebarItem = async () => {
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
await seedHerokuDocSidebarItem();
