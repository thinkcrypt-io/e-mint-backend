import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Makes the Login sessions page (admin /sessions) reachable and assignable:
 *   - the "Login sessions" permission (key `sessions`: View → view-sessions
 *     sees everyone's signed-in devices, Delete → delete-sessions signs them
 *     out), a checkbox group on the Add/Edit Admin Role form;
 *   - the "Login Sessions" sidebar item under "Admin Sidebar", shown to
 *     roles with view-sessions (a `*` super admin sees it anyway).
 *
 * Every admin sees their own devices in Settings without any of this.
 *
 * Raw collections rather than dist models, so it runs without a build.
 *
 * Run with:  node scripts/seedSessionsPage.js
 *
 * Safe to re-run: upserts on the permission key and the item's href.
 */

const CATEGORY_NAME = 'Admin Sidebar';

const permission = {
	name: 'Login sessions',
	description: 'See where every admin is signed in, and sign their devices out',
	key: 'sessions',
	isActive: true,
	options: { create: false, view: true, edit: false, delete: true },
};

const item = {
	name: 'Login Sessions',
	description: 'Where every admin is signed in, and when each device was last active',
	href: 'sessions',
	icon: 'monitor-smartphone',
	tooltip: 'See every admin’s signed-in devices and sign any of them out',
	priority: 245,
	isActive: true,
	permissionProtected: true,
	permission: 'view-sessions',
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const now = new Date();

	await db
		.collection('permissions')
		.updateOne({ key: permission.key }, { $set: { ...permission, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
	console.log(`Permission seeded: "${permission.name}" (key: ${permission.key})`);

	const category = await db.collection('sidebarcategories').findOne({ name: CATEGORY_NAME });
	if (!category) {
		console.log(`Category "${CATEGORY_NAME}" not found — sidebar item not seeded.`);
	} else {
		await db
			.collection('sidebaritems')
			.updateOne({ href: item.href }, { $set: { ...item, category: category._id, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
		console.log(`Sidebar item seeded: "${item.name}" -> /${item.href} under ${CATEGORY_NAME}`);
	}
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e.message);
	process.exit(1);
});
