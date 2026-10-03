import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';

dotenv.config();

/**
 * Waitlist: the `waitlist` permission group and the sidebar entry for the
 * table of early-access sign-ups from the marketing website (mint-webpage,
 * POST /public/waitlist), placed in the same category as Leads.
 *
 * Run with:  npm run build && node scripts/seedWaitlist.js
 *
 * Safe to re-run: it upserts on the permission `key` and the item `href`.
 */

const permission = {
	name: 'Waitlist',
	description: 'See and work the early-access sign-ups from the website: invite people, mark them joined',
	key: 'waitlist',
	isActive: true,
	options: { create: true, view: true, edit: true, delete: true },
};

const item = {
	name: 'Waitlist',
	description: 'Early-access sign-ups from the website',
	href: 'waitlist',
	icon: 'list-checks',
	tooltip: 'People who joined the waitlist',
	priority: 28,
	isActive: true,
	permissionProtected: true,
	permission: 'view-waitlist',
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

		const near =
			(await SidebarItem.findOne({ href: 'leads' }).select('category').lean()) ||
			(await SidebarItem.findOne({ href: 'support-tickets' }).select('category').lean());
		if (!near?.category) {
			console.log('No "leads" or "support-tickets" sidebar item to take a category from — sidebar item not seeded.');
			return;
		}
		const sidebar = await SidebarItem.findOneAndUpdate(
			{ href: item.href },
			{ ...item, category: near.category },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);
		console.log(`Sidebar item seeded: "${sidebar.name}" -> /${sidebar.href} (category ${near.category})`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await connectDB();
await seed();
