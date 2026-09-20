import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Adds "History" to the admin sidebar.
 *
 * The sidebar is data, not code — GET /sidebar/crm/:type reads SidebarItem
 * documents — so a new page needs a row here to become reachable.
 *
 * `permissionProtected` with `view-history` mirrors the API gate exactly: the
 * link only shows for someone who can actually open the page (or for a role
 * holding '*'), so nobody is offered a link that 403s. That permission is
 * seeded by seedHistoryPermission.js.
 *
 * Run with:  npm run build && node scripts/seedHistorySidebarItem.js
 *
 * Safe to re-run: it upserts on `href`.
 */

const CATEGORY_NAME = 'Admin Management';

const item = {
	name: 'History',
	description: 'Activity log of every create, edit and delete',
	// Stored without a leading slash — the sidebar controller prefixes it.
	href: 'history',
	icon: 'history',
	tooltip: 'Who changed what, and when',
	priority: 10,
	isActive: true,
	permissionProtected: true,
	permission: 'view-history',
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

const seedHistorySidebarItem = async () => {
	try {
		// Looked up by name rather than a hardcoded id, so this script still
		// works against another environment's database.
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
await seedHistorySidebarItem();
