import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Makes the dashboard builder (admin /dashboard-builder) reachable: the
 * "Dashboard Builder" item under "Admin Sidebar", just below "Sidebar Builder",
 * shown to roles with `view-builder` (saving the dashboard needs edit-builder).
 *
 * Raw collections rather than dist models, so it runs without a build.
 *
 * Run with:  node scripts/seedDashboardBuilder.js
 *
 * Safe to re-run: the item is an upsert on `href`.
 */

const CATEGORY_NAME = 'Admin Sidebar';

const item = {
	name: 'Dashboard Builder',
	description: 'Choose the numbers, charts and recent-item lists on the dashboard',
	// Stored without a leading slash — the sidebar controller prefixes it.
	href: 'dashboard-builder',
	icon: 'layout-dashboard',
	tooltip: 'Add numbers, charts and lists to the dashboard, preview, then save',
	// Below Sidebar Builder (300), above Page Route (200) — higher comes first.
	priority: 250,
	isActive: true,
	permissionProtected: true,
	permission: 'view-builder',
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const category = await db.collection('sidebarcategories').findOne({ name: CATEGORY_NAME });
	if (!category) {
		console.log(`Category "${CATEGORY_NAME}" not found — sidebar item not seeded.`);
	} else {
		const now = new Date();
		await db.collection('sidebaritems').updateOne(
			{ href: item.href },
			{ $set: { ...item, category: category._id, updatedAt: now }, $setOnInsert: { createdAt: now } },
			{ upsert: true }
		);
		console.log(`Sidebar item seeded: "${item.name}" -> /${item.href} under ${CATEGORY_NAME}`);
	}
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e.message);
	process.exit(1);
});
