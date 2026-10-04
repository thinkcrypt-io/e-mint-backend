import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Permission from '../dist/library/models/permissions/model.js';
import SidebarCategory from '../dist/library/models/sidebarcategories/model.js';
import SidebarItem from '../dist/library/models/sidebaritems/model.js';

dotenv.config();

/**
 * Template Studio's permissions (docs/templates TD10). A role with '*' (the
 * super admin's) already has them all; any other role needs them ticked.
 *
 *   templates            view / create / edit / delete templates (drafts,
 *                        validation, previews)        → view-templates …
 *   template-publishing  edit: publish a version, archive it, change who
 *                        can use it — it reaches every tenant
 *                                                     → edit-template-publishing
 *   template-keys        view / create / delete the keys Claude connects to
 *                        the Templates MCP with       → view-template-keys …
 *
 * And the "Templates" sidebar item under Config (beside Routes and Models),
 * pointing at Template Studio (/templates), for roles with view-templates.
 *
 * Run with:  npm run build && node scripts/seedTemplateAccess.js
 * Safe to re-run: upserts.
 */

const permissions = [
	{
		name: 'Templates',
		description: 'Project templates in Template Studio: make and edit drafts, check and preview them',
		key: 'templates',
		isActive: true,
		options: { create: true, view: true, edit: true, delete: true },
	},
	{
		name: 'Template publishing',
		description: 'Publish a template version, choose who can use it, archive it — reaches every tenant',
		key: 'template-publishing',
		isActive: true,
		options: { create: false, view: false, edit: true, delete: false },
	},
	{
		name: 'Templates MCP keys',
		description: 'Create and revoke the keys Claude connects to the Templates MCP with',
		key: 'template-keys',
		isActive: true,
		options: { create: true, view: true, edit: false, delete: true },
	},
];

const CATEGORY_NAME = 'Config';

const item = {
	name: 'Templates',
	description: 'Template Studio: project templates tenants start from — apps, APIs and websites',
	// Stored without a leading slash — the sidebar controller prefixes it.
	href: 'templates',
	icon: 'layout-template',
	tooltip: 'Make, check, preview and publish project templates',
	priority: 97,
	isActive: true,
	permissionProtected: true,
	permission: 'view-templates',
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	try {
		for (const p of permissions) {
			const saved = await Permission.findOneAndUpdate({ key: p.key }, p, { upsert: true, new: true, setDefaultsOnInsert: true });
			console.log(`Permission seeded: "${saved.name}" (key: ${saved.key})`);
		}
		const category = await SidebarCategory.findOne({ name: CATEGORY_NAME });
		if (!category) console.log(`Category "${CATEGORY_NAME}" not found — sidebar item not seeded.`);
		else {
			await SidebarItem.findOneAndUpdate({ href: item.href }, { ...item, category: category._id }, { upsert: true, setDefaultsOnInsert: true });
			console.log(`Sidebar item seeded: "${item.name}" -> /${item.href} under ${CATEGORY_NAME}`);
		}
	} finally {
		await mongoose.disconnect();
	}
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
