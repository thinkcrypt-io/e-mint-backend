import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Makes PDF templates (admin /pdf-templates, docs/pdf-templates) reachable: the
 * "PDF Templates" item under "Admin Sidebar", just below "Dashboard Builder",
 * shown to roles with `view-builder` (saving templates needs edit-builder).
 *
 * Raw collections rather than dist models, so it runs without a build.
 *
 * Run with:  node scripts/seedPdfTemplates.js
 *
 * Safe to re-run: the item is an upsert on `href`.
 */

const CATEGORY_NAME = 'Admin Sidebar';

const item = {
	name: 'PDF Templates',
	description: 'Design the invoices, bills and receipts records download as PDFs',
	// Stored without a leading slash — the sidebar controller prefixes it.
	href: 'pdf-templates',
	icon: 'file-text',
	tooltip: 'Start from a starter, match your fields, design, then Download PDF on any record',
	// Below Dashboard Builder (250), above Page Route (200) — higher comes first.
	priority: 240,
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
