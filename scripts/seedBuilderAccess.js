import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';

dotenv.config();

/**
 * Makes the route builder reachable:
 *
 * - the "Builder" permission (`view-builder`, `edit-builder`), which gates
 *   /admin/api/builder. It is separate from 'models' because publishing a
 *   route's settings changes what the admin API accepts and returns. A role
 *   with '*' already has it; every other role needs it ticked.
 * - the "Routes" sidebar item under Config, pointing at /builder and shown
 *   only to roles that can open it. It replaces the earlier item that pointed
 *   at /filterconfigs, which is updated in place rather than duplicated.
 * - the "Models" item beside it, for the model builder (/model-builder),
 *   behind the same permission.
 *
 * Run with:  npm run build && node scripts/seedBuilderAccess.js
 *
 * Safe to re-run: both are upserts.
 */

const CATEGORY_NAME = 'Config';

const permission = {
	name: 'Builder',
	description: 'Configure admin routes: settings, table, filters, form and view — draft and publish',
	key: 'builder',
	isActive: true,
	options: { create: false, view: true, edit: true, delete: false },
};

const item = {
	name: 'Routes',
	description: 'Settings, table, filters and header buttons of each admin route',
	// Stored without a leading slash — the sidebar controller prefixes it.
	href: 'builder',
	icon: 'blocks',
	tooltip: 'Configure any admin route — changes go live when published',
	priority: 95,
	isActive: true,
	permissionProtected: true,
	permission: 'view-builder',
};

const modelsItem = {
	name: 'Models',
	description: 'Build database models from fields — each gets its own admin page',
	href: 'model-builder',
	icon: 'blocks',
	tooltip: 'Create a model without code; it is registered and gets a table, form and view',
	priority: 96,
	isActive: true,
	permissionProtected: true,
	permission: 'view-builder',
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	try {
		const saved = await Permission.findOneAndUpdate({ key: permission.key }, permission, {
			upsert: true,
			new: true,
			setDefaultsOnInsert: true,
		});
		console.log(`Permission seeded: "${saved.name}" (key: ${saved.key})`);

		const category = await SidebarCategory.findOne({ name: CATEGORY_NAME });
		if (!category) {
			console.log(`Category "${CATEGORY_NAME}" not found — sidebar item not seeded.`);
			return;
		}
		const sidebar = await SidebarItem.findOneAndUpdate(
			{ href: { $in: ['filterconfigs', item.href] } },
			{ ...item, category: category._id },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);
		console.log(`Sidebar item seeded: "${sidebar.name}" -> /${sidebar.href} (${sidebar.permission})`);

		const models = await SidebarItem.findOneAndUpdate(
			{ href: modelsItem.href },
			{ ...modelsItem, category: category._id },
			{ upsert: true, new: true, setDefaultsOnInsert: true }
		);
		console.log(`Sidebar item seeded: "${models.name}" -> /${models.href} (${models.permission})`);
	} catch (error) {
		console.log(`Error: ${error.message}`);
	} finally {
		await mongoose.disconnect();
	}
};

await run();
