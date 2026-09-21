import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Adds "Vercel Guide" to the admin sidebar, right under Vercel Accounts.
 *
 * Gated on the same `view-vercel` permission as the accounts list itself:
 * nobody who cannot open the feature needs a link to its instructions.
 *
 * Run with:  npm run build && node scripts/seedVercelDocSidebarItem.js
 *
 * Safe to re-run: it upserts on `href`.
 */

const CATEGORY_NAME = 'Project Management';

const item = {
	name: 'Vercel Guide',
	description: 'Creating a token, deploying, environment variables, and what the usage figures mean',
	href: 'vercel-doc',
	icon: 'book-open',
	tooltip: 'How to connect an account, deploy, and read the usage numbers',
	priority: 29,
	isActive: true,
	permissionProtected: true,
	permission: 'view-vercel',
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

const seedVercelDocSidebarItem = async () => {
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

		console.log(`Sidebar item seeded: "${saved.name}" -> /${saved.href} id: ${saved._id.toString()}`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedVercelDocSidebarItem();
