import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';

dotenv.config();

/**
 * Support tickets: the `support-tickets` permission group (the team's table;
 * `edit-support-tickets` also lets its holder answer every ticket's thread)
 * and the sidebar entry for that table, placed in the same category as Issues.
 *
 * The /support page itself needs neither — any signed-in admin can open tickets.
 *
 * Run with:  npm run build && node scripts/seedSupportTickets.js
 *
 * Safe to re-run: it upserts on the permission `key` and the item `href`.
 */

const permission = {
	name: 'Support Tickets',
	description: 'Work the support queue: view, answer, assign and close every admin’s tickets',
	key: 'support-tickets',
	isActive: true,
	options: { create: true, view: true, edit: true, delete: true },
};

const item = {
	name: 'Support Tickets',
	description: 'Tickets opened from the Support page, with their reply threads',
	href: 'support-tickets',
	icon: 'life-buoy',
	tooltip: 'Answer and track support tickets',
	priority: 27,
	isActive: true,
	permissionProtected: true,
	permission: 'view-support-tickets',
};

const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_CONNECTION_URI);
		console.log(`Mongo DB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log(`error: ${error.message}`);
		process.exit(1);
	}
};

const seed = async () => {
	try {
		const saved = await Permission.findOneAndUpdate({ key: permission.key }, permission, {
			upsert: true,
			new: true,
			setDefaultsOnInsert: true,
		});
		console.log(`Permission seeded: "${saved.name}" (key: ${saved.key})`);

		const issues = await SidebarItem.findOne({ href: 'issues' }).select('category').lean();
		if (!issues?.category) {
			console.log('No "issues" sidebar item to take a category from — sidebar item not seeded.');
			return;
		}
		const sidebar = await SidebarItem.findOneAndUpdate(
			{ href: item.href },
			{ ...item, category: issues.category },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);
		console.log(`Sidebar item seeded: "${sidebar.name}" -> /${sidebar.href} (category ${issues.category})`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seed();
