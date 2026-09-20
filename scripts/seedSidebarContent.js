import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Adds the "Content" link to the admin sidebar.
 *
 * The sidebar is served from the database when NEXT_PUBLIC_SIDEBAR_TYPE=server
 * (see library/controllers/config/getAdminSidebar.controller.ts), so the static
 * list in library/data/sidebar.data.ts has no effect on that deployment — the
 * link has to exist as a SidebarItem row.
 *
 * The item points at /contents, the admin page for Content documents. That is
 * where the `billing-profile` document lives, which supplies the company name,
 * address and web address printed on every invoice — so without this link there
 * is no way to edit them from admin.
 *
 * Run with:  node scripts/seedSidebarContent.js
 *
 * Safe to re-run: it upserts on `href`, so a second run refreshes the existing
 * row rather than adding a duplicate.
 */

const CATEGORY_NAME = 'Website Settings';

const item = {
	name: 'Content',
	href: 'contents', // no leading slash — the controller prepends one
	icon: 'file-text', // lucide name; the sidebar resolves these dynamically
	tooltip: 'Site content and settings documents, looked up by slug',
	// Sits above the rest of Website Settings, and shares that section's
	// permission so anyone who can already see Team Members or Services can see
	// it too. Narrow it to its own key later if content needs separate access.
	priority: 110,
	permissionProtected: true,
	permission: 'view-website',
	isActive: true,
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

const seedSidebarContent = async () => {
	try {
		const category = await SidebarCategory.findOne({
			name: new RegExp(`^${CATEGORY_NAME}$`, 'i'),
		});

		if (!category) {
			console.log(
				`Error: no "${CATEGORY_NAME}" sidebar category found. Create it under Admin Sidebar > Categories first, then re-run.`
			);
			return;
		}

		const saved = await SidebarItem.findOneAndUpdate(
			{ href: item.href },
			{ ...item, category: category._id },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);

		console.log(`Sidebar item seeded: "${saved.name}" -> /${saved.href}`);
		console.log(`  id       : ${saved._id.toString()}`);
		console.log(`  category : ${category.name} (${category._id.toString()})`);
		console.log(`  priority : ${saved.priority}`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seedSidebarContent();
