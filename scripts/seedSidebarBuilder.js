import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Makes the sidebar builder (admin /sidebar-builder) reachable and usable:
 *
 * - the "Sidebar Builder" item, first under "Admin Sidebar", shown to the same
 *   roles as "Sidebar Items" (`view-sidebaritems`). The builder writes through
 *   the sidebaritems / sidebarcategories routes, so those permissions are what
 *   really gate it.
 * - the sidebarcategories `icon` field in the route's published RouteSettings
 *   copy. Like the settings file, it typed the field 'uri' with an image input,
 *   so the API refused every Lucide name ('folder', 'users') — the only thing
 *   the sidebar can draw. The copy is live over the file (see resolveRoute), so
 *   fixing the file alone changes nothing. Patched in the published data and
 *   in a pending draft, if there is one.
 *
 * Raw collections rather than dist models, so it runs without a build.
 *
 * Run with:  node scripts/seedSidebarBuilder.js
 *
 * Safe to re-run: the item is an upsert on `href`, and the patch only touches
 * a field that is still wrong.
 */

const CATEGORY_NAME = 'Admin Sidebar';

const item = {
	name: 'Sidebar Builder',
	description: 'Arrange the sidebar: sections, pages, order and who sees them',
	// Stored without a leading slash — the sidebar controller prefixes it.
	href: 'sidebar-builder',
	icon: 'panel-left',
	tooltip: 'Drag sections and pages into order, preview, then save',
	priority: 300,
	isActive: true,
	permissionProtected: true,
	permission: 'view-sidebaritems',
};

const ICON_FIELD = { title: 'Icon', type: 'string', edit: true, trim: true, schema: { type: 'icon' } };

const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_CONNECTION_URI);
		console.log(`Mongo DB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log(`error: ${error.message}`);
		process.exit(1);
	}
};

const seedItem = async db => {
	const category = await db.collection('sidebarcategories').findOne({ name: CATEGORY_NAME });
	if (!category) return console.log(`Category "${CATEGORY_NAME}" not found — sidebar item not seeded.`);

	const now = new Date();
	await db.collection('sidebaritems').updateOne(
		{ href: item.href },
		{ $set: { ...item, category: category._id, updatedAt: now }, $setOnInsert: { createdAt: now } },
		{ upsert: true }
	);
	console.log(`Sidebar item seeded: "${item.name}" -> /${item.href} under ${CATEGORY_NAME}`);
};

const fixIconField = async db => {
	const doc = await db.collection('routesettings').findOne({ route: 'sidebarcategories' });
	if (!doc) return console.log('No RouteSettings copy for sidebarcategories — the settings file is live, nothing to patch.');

	const patch = fields =>
		Array.isArray(fields)
			? fields.map(f => (f.key === 'icon' && f.type === 'uri' ? { ...f, ...ICON_FIELD, key: 'icon' } : f))
			: fields;

	const set = {};
	const data = patch(doc.data?.fields);
	if (JSON.stringify(data) !== JSON.stringify(doc.data?.fields)) set['data.fields'] = data;
	const draft = patch(doc.draft?.fields);
	if (doc.draft && JSON.stringify(draft) !== JSON.stringify(doc.draft?.fields)) set['draft.fields'] = draft;

	if (!Object.keys(set).length) return console.log('sidebarcategories icon field already correct.');
	await db.collection('routesettings').updateOne({ _id: doc._id }, { $set: set });
	console.log(`sidebarcategories icon field fixed in: ${Object.keys(set).join(', ')}`);
};

await connectDB();
try {
	const db = mongoose.connection.db;
	await seedItem(db);
	await fixIconField(db);
} catch (error) {
	console.log(`Error: ${error.message}`);
} finally {
	await mongoose.disconnect();
}
