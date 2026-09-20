import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Backfills `icon` on every SidebarCategory row.
 *
 * The sidebar UI now shows a lucide icon next to each category heading (like
 * the items already have), but the categories were created before that field
 * was surfaced in the UI, so they're all unset. Matched by name, case
 * insensitive; a category with no entry here falls back to 'folder' in
 * getAdminSidebar.controller.ts, so it's safe to add new categories later
 * without re-running this.
 *
 * Run with:  npm run build && node scripts/seedSidebarCategoryIcons.js
 * Safe to re-run: it only sets `icon`, and only for names listed below.
 */

const ICONS = {
	Analytics: 'bar-chart-3',
	'Sales Management': 'trending-up',
	'Project Management': 'folder-kanban',
	Media: 'image',
	'Project Planning': 'clipboard-list',
	'Shop Management': 'store',
	Career: 'briefcase',
	'Data Management': 'database',
	'User Management': 'users',
	Services: 'server',
	'Thinkcrypt Website': 'globe',
	Misc: 'grip',
	'MINT Themes': 'palette',
	Documents: 'file-text',
	'Mint Commerce': 'shopping-cart',
	'Website Settings': 'settings',
	'Website Components': 'puzzle',
	'Website Blog': 'rss',
	HR: 'users-round',
	Accounts: 'wallet',
	'Framework Docs': 'book-open',
	Resources: 'folder-open',
	'Admin Management': 'shield',
	Config: 'sliders-horizontal',
	'Model Construction': 'boxes',
	'Admin Sidebar': 'panel-left',
	Settings: 'settings-2',
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

const seedSidebarCategoryIcons = async () => {
	try {
		let updated = 0;
		let missing = 0;

		for (const [name, icon] of Object.entries(ICONS)) {
			const category = await SidebarCategory.findOne({ name: new RegExp(`^${name}$`, 'i') });

			if (!category) {
				console.log(`Skipped: no category named "${name}"`);
				missing++;
				continue;
			}

			category.icon = icon;
			await category.save();
			console.log(`Set icon "${icon}" on "${category.name}"`);
			updated++;
		}

		const unmatched = await SidebarCategory.find({
			name: { $nin: Object.keys(ICONS).map(n => new RegExp(`^${n}$`, 'i')) },
		});
		if (unmatched.length) {
			console.log('\nCategories with no icon mapping (left unchanged):');
			unmatched.forEach(c => console.log(`  - ${c.name}`));
		}

		console.log(`\nDone. Updated ${updated} categories, ${missing} names not found.`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
};

const run = async () => {
	await connectDB();
	await seedSidebarCategoryIcons();
};

run();
