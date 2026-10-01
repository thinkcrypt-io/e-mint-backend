import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';

dotenv.config();

/**
 * Multi-tenancy WO-16 (docs/multi-tenancy): the super admin's view of the
 * tenant platform — the `organizations`, `tenant-users` and `tenant-projects`
 * permission groups and a "Tenants" sidebar section with their tables.
 *
 * Run with:  npm run build && node scripts/seedTenancyAdmin.js
 *
 * Safe to re-run: it upserts on the permission `key`, the category `name` and
 * the item `href`. Runs with no tenant scope, so everything it writes is the
 * super admin's (organization: null).
 */

const permissions = [
	{ name: 'Organizations', key: 'organizations', description: 'Tenant organizations: their sign-up answers, plan, and switching them off' },
	{ name: 'Tenant users', key: 'tenant-users', description: 'People signed up to the tenant platform; switching them off' },
	{ name: 'Tenant projects', key: 'tenant-projects', description: 'Tenants’ apps and websites; archiving them' },
];

const items = [
	{ name: 'Organizations', href: 'organizations', icon: 'building-2', priority: 30, tooltip: 'Tenants and what they told us at sign-up' },
	{ name: 'Tenant users', href: 'tenant-users', icon: 'users-round', priority: 20, tooltip: 'Everyone signed up to the tenant platform' },
	{ name: 'Tenant projects', href: 'tenant-projects', icon: 'folder-kanban', priority: 10, tooltip: 'Tenants’ apps and websites' },
];

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	for (const p of permissions)
		await Permission.findOneAndUpdate(
			{ key: p.key },
			{ ...p, isActive: true, options: { create: false, view: true, edit: true, delete: false } },
			{ upsert: true, setDefaultsOnInsert: true }
		);
	console.log(`Permissions: ${permissions.map(p => p.key).join(', ')}`);

	let category = await SidebarCategory.findOne({ name: 'Tenants' });
	if (!category) {
		const top = await SidebarCategory.findOne({}, { priority: 1 }).sort({ priority: -1 }).lean();
		category = await SidebarCategory.create({ name: 'Tenants', icon: 'building-2', priority: (top?.priority || 0) + 1, isActive: true });
	}
	for (const it of items)
		await SidebarItem.findOneAndUpdate(
			{ href: it.href },
			{ ...it, category: category._id, isActive: true, permissionProtected: true, permission: `view-${it.href}` },
			{ upsert: true, setDefaultsOnInsert: true }
		);
	console.log(`Sidebar: "Tenants" (${category._id}) with ${items.map(i => i.href).join(', ')}`);
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
