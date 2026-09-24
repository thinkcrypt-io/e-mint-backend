import dotenv from 'dotenv';
import mongoose from 'mongoose';
import express from 'express';

dotenv.config();

/**
 * Copies every admin route's code files into the builder's documents, as
 * published version 1:
 *
 *   settings file  -> RouteSettings.data  { fields: [{ key, ...settings }] }
 *   config file    -> RouteConfig.data    { fields, table, form, route, filters }
 *
 * and folds in what was already configured in the DB before the builder:
 *   FilterConfig   -> RouteConfig.data.filters
 *   TableConfig    -> RouteConfig.data.table, and its export / add-button
 *                     toggles onto RouteConfig.data.route
 *
 * Routes are found by walking the admin router (collectResourceRoutes for
 * defineRoutes routes, collectFilterRoutes for custom ones with a filter row),
 * keyed exactly as a live request keys them. Custom routes get a RouteConfig
 * holding only filters; they have no settings the builder can change.
 *
 * Each seeded copy is also run through the builder's own validation, so
 * anything in the code files that couldn't be re-published is reported now.
 *
 * Run with:  npm run build && node scripts/seedRouteBuilder.js
 *   --dry-run     report what would be written, write nothing
 *   --overwrite   replace existing RouteSettings / RouteConfig documents
 *
 * Safe to re-run: without --overwrite it only inserts routes that have no
 * document yet, so anything published from the builder is left alone.
 */

const DRY_RUN = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');

const { default: adminRouter } = await import('../dist/routes-admin/admin.router.js');
const { RouteSettings, RouteConfig, RouteVersion } = await import(
	'../dist/library/models/builder/_index.js'
);
const { default: FilterConfig } = await import('../dist/library/models/filterconfigs/model.js');
const { default: TableConfig } = await import('../dist/library/models/tableconfig/model.js');
const { collectResourceRoutes, collectFilterRoutes, settingsToData, configToData, ADMIN_API_PREFIX } =
	await import('../dist/library/functions/routeRegistry.function.js');
const { validateDraft, checkSettings } = await import('../dist/library/controllers/builder/validate.js');

const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_CONNECTION_URI);
		console.log(`Mongo DB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log(`error: ${error.message}`);
		process.exit(1);
	}
};

/** TableConfig's column order and page toggles, applied to config data. */
const applyTableConfig = (data, tc) => {
	if (!tc || !data.route) return [];
	const applied = [];
	if (tc.fields?.length) {
		data.table = tc.fields;
		applied.push(`table(${tc.fields.length})`);
	}
	if (typeof tc.showExport === 'boolean') {
		data.route.export = tc.showExport;
		applied.push(`export=${tc.showExport}`);
	}
	if (tc.showAddButton === false) {
		delete data.route.button;
		data.route.isModal = false;
		applied.push('no add button');
	}
	return applied;
};

const seed = async () => {
	const app = express();
	app.use(ADMIN_API_PREFIX, adminRouter);

	const resources = new Map(collectResourceRoutes(app).map(e => [e.route, e]));
	const filterRoutes = new Map(collectFilterRoutes(app).map(e => [e.route, e]));
	const routes = [...new Set([...resources.keys(), ...filterRoutes.keys()])].sort();

	const filterConfigs = new Map((await FilterConfig.find().lean()).map(d => [d.route, d]));
	const tableConfigs = new Map((await TableConfig.find().lean()).map(d => [d.path, d]));

	const stats = { settings: { inserted: 0, skipped: 0 }, config: { inserted: 0, skipped: 0 } };
	const problems = [];

	const write = async (Model, kind, route, modelName, data, label) => {
		const existing = await Model.findOne({ route });
		if (existing && !OVERWRITE) {
			stats[kind].skipped++;
			return;
		}
		stats[kind].inserted++;
		console.log(`${existing ? 'replace' : 'insert '} ${kind.padEnd(8)} ${route}  ${label}`);
		if (DRY_RUN) return;

		const now = new Date();
		const version = (existing?.version || 0) + 1;
		await Model.findOneAndUpdate(
			{ route },
			{ route, model: modelName, data, draft: null, version, publishedAt: now },
			{ upsert: true }
		);
		await RouteVersion.create({ route, kind, version, data, note: 'Seeded from code' });
	};

	for (const route of routes) {
		const resource = resources.get(route);
		const filterEntry = filterRoutes.get(route);
		const Model = resource?.source.Model || filterEntry?.source.baseModel;
		const modelName = Model?.modelName;

		// Settings — defineRoutes routes only.
		if (resource) {
			const data = settingsToData(resource.source.settings);
			const { error } = validateDraft('settings', data);
			if (error) problems.push(`${route} settings: ${error.join('; ')}`);
			const unsafe = checkSettings({ route, data, model: Model, codeSettings: resource.source.settings });
			// Protected routes always report here; that's expected, not a problem.
			if (unsafe.length && !unsafe[0].includes("can't be changed from the builder"))
				problems.push(`${route} settings: ${unsafe.join('; ')}`);
			await write(RouteSettings, 'settings', route, modelName, data, `${data.fields.length} fields`);
		}

		// Config — every route: its config file (if any) and its filters.
		const role = filterEntry?.source.role;
		const codeFilters = (filterEntry?.source.filters || []).filter(
			f => !f?.roles?.length || !role || f.roles.includes(role)
		);
		const data = configToData(resource?.source.frontendConfig, codeFilters);
		const notes = [];

		const fc = filterConfigs.get(route);
		if (fc) {
			data.filters = fc.filters || [];
			notes.push(`filters from FilterConfig(${data.filters.length})`);
		} else notes.push(`filters from code(${data.filters.length})`);
		notes.push(...applyTableConfig(data, tableConfigs.get(route)));

		const { error } = validateDraft('config', data);
		if (error) problems.push(`${route} config: ${error.join('; ')}`);

		await write(RouteConfig, 'config', route, modelName, data, notes.join(', '));
	}

	console.log('');
	console.log(`${routes.length} admin routes (${resources.size} defineRoutes, ${routes.length - resources.size} custom)`);
	for (const kind of ['settings', 'config'])
		console.log(
			`  ${kind}: ${stats[kind].inserted} ${DRY_RUN ? 'to insert' : 'inserted'}, ${stats[kind].skipped} already present${OVERWRITE ? '' : ' (pass --overwrite to replace)'}`
		);
	if (problems.length) {
		console.log(`\n${problems.length} seeded copies would fail the builder's validation on republish:`);
		problems.forEach(p => console.log(`  - ${p}`));
	} else console.log('\nEvery seeded copy passes the builder validation.');
};

await connectDB();
try {
	await seed();
} catch (error) {
	console.log(`Error: ${error.stack || error.message}`);
} finally {
	await mongoose.disconnect();
	process.exit(0);
}
