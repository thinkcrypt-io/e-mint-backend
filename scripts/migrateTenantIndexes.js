import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Multi-tenancy WO-03 (docs/multi-tenancy): names and routes in the builder's
 * collections become unique per scope — the super admin's, or one tenant
 * project's — instead of globally. This drops the old single-field unique
 * indexes and creates the compound ones the models now declare.
 *
 * Run with:  node scripts/migrateTenantIndexes.js          (dry run)
 *            node scripts/migrateTenantIndexes.js --apply
 *
 * Safe to re-run. Before dropping an old index it checks that no scope already
 * holds duplicates the new index would refuse (there can't be any yet: every
 * existing document is the super admin's).
 */

const apply = process.argv.includes('--apply');

const PLAN = [
	{
		collection: 'modeldefinitions',
		drop: ['name_1', 'route_1'],
		create: [
			[{ organization: 1, project: 1, name: 1 }, { unique: true }],
			[{ organization: 1, project: 1, route: 1 }, { unique: true }],
		],
	},
	{ collection: 'routesettings', drop: ['route_1'], create: [[{ organization: 1, project: 1, route: 1 }, { unique: true }]] },
	{ collection: 'routeconfigs', drop: ['route_1'], create: [[{ organization: 1, project: 1, route: 1 }, { unique: true }]] },
	{ collection: 'dashboardconfigs', drop: ['key_1'], create: [[{ organization: 1, project: 1, key: 1 }, { unique: true }]] },
];

// Lookups the plugin adds to every query.
const SCOPE_INDEXES = [
	'modeldefinitions',
	'routesettings',
	'routeconfigs',
	'routeversions',
	'sidebarcategories',
	'sidebaritems',
	'dashboardconfigs',
	'apikeys',
	'builtfeatures',
];

const describe = idx => `${idx.name}${idx.unique ? ' (unique)' : ''}`;

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
	console.log(apply ? 'APPLYING' : 'DRY RUN — pass --apply to change indexes');

	for (const step of PLAN) {
		if (!existing.has(step.collection)) {
			console.log(`\n${step.collection}: no collection yet — the model creates its indexes on first use`);
			continue;
		}
		const col = db.collection(step.collection);
		const before = await col.indexes();
		console.log(`\n${step.collection}: ${before.map(describe).join(', ')}`);

		for (const [keys, opts] of step.create) {
			const fields = Object.keys(keys);
			const dupes = await col
				.aggregate([
					{ $group: { _id: Object.fromEntries(fields.map(f => [f, `$${f}`])), n: { $sum: 1 } } },
					{ $match: { n: { $gt: 1 } } },
					{ $limit: 5 },
				])
				.toArray();
			if (dupes.length) {
				console.log(`  ✗ duplicates for ${JSON.stringify(keys)} — fix these first:`, JSON.stringify(dupes));
				process.exitCode = 1;
				continue;
			}
			const name = fields.map(f => `${f}_1`).join('_');
			if (before.some(i => i.name === name)) console.log(`  = ${name} exists`);
			else {
				console.log(`  + ${name}${opts.unique ? ' (unique)' : ''}`);
				if (apply) await col.createIndex(keys, { ...opts, name });
			}
		}
		for (const name of step.drop) {
			const idx = before.find(i => i.name === name);
			if (!idx) console.log(`  = ${name} already gone`);
			else if (!idx.unique) console.log(`  = ${name} is not unique — kept`);
			else {
				console.log(`  - ${name}`);
				if (apply && !process.exitCode) await col.dropIndex(name);
			}
		}
	}

	for (const name of SCOPE_INDEXES) {
		if (!existing.has(name)) continue;
		const col = db.collection(name);
		const have = new Set((await col.indexes()).map(i => i.name));
		for (const f of ['organization', 'project'])
			if (!have.has(`${f}_1`)) {
				console.log(`${name}: + ${f}_1`);
				if (apply) await col.createIndex({ [f]: 1 }, { name: `${f}_1` });
			}
	}

	if (apply)
		for (const step of PLAN)
			if (existing.has(step.collection))
				console.log(`\n${step.collection} after: ${(await db.collection(step.collection).indexes()).map(describe).join(', ')}`);

	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
