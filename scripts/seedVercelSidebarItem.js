import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Adds "Vercel Accounts" to the admin sidebar, next to Heroku Accounts.
 *
 * Gated on `view-vercel`, seeded by seedVercelPermissions.js — the link only
 * shows for a role that can actually open the list.
 *
 * No `sectionIcon` here: the sidebar draws its lucide glyph from the *category*
 * document, and items no longer carry one.
 *
 * Run with:  npm run build && node scripts/seedVercelSidebarItem.js
 *
 * Safe to re-run: it upserts on `href`.
 */

const CATEGORY_NAME = 'Project Management';

const item = {
	name: 'Vercel Accounts',
	description: 'Connected Vercel accounts, their projects, deployments and environment',
	href: 'vercels',
	icon: 'triangle',
	tooltip: 'Projects, deployments, environment variables and domains',
	priority: 28,
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

const seedVercelSidebarItem = async () => {
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
await seedVercelSidebarItem();
