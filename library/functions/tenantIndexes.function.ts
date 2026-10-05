import mongoose from 'mongoose';
import { PLATFORM_COLLECTION_INDEX } from '../models/builder/modelDefinition.model.js';

/**
 * Names and routes in the builder's collections are unique per scope — the
 * super admin's, or one tenant project's (docs/multi-tenancy WO-03, D6) — so
 * every project can have its own `Client` (Mongoose `T<projectId>_Client`,
 * collection `t_<projectId>`, D21). A database that predates multi-tenancy
 * still carries the old single-field unique indexes (`name_1`, `route_1`…),
 * which refuse a project's `Client` because the platform, or another project,
 * already has one.
 *
 * Run once at boot: for each collection, create the scoped unique index, then
 * drop the global one it replaces. Index changes only — no document is
 * touched — and a no-op once done. A global unique index can't hold
 * duplicates, so the scoped one (stricter on nothing) always builds.
 * scripts/migrateTenantIndexes.js does the same by hand, with a dry run.
 */
const PLAN: { collection: string; drop: string[]; scoped: string[] }[] = [
	{ collection: 'modeldefinitions', drop: ['name_1', 'route_1'], scoped: ['name', 'route'] },
	{ collection: 'routesettings', drop: ['route_1'], scoped: ['route'] },
	{ collection: 'routeconfigs', drop: ['route_1'], scoped: ['route'] },
	{ collection: 'dashboardconfigs', drop: ['key_1'], scoped: ['key'] },
	{ collection: 'folders', drop: ['slug_1'], scoped: ['slug'] },
];

export const ensureTenantIndexes = async () => {
	const db = mongoose.connection.db;
	if (!db) return;
	const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));

	for (const step of PLAN) {
		// A new collection gets the scoped indexes from its model on first use.
		if (!existing.has(step.collection)) continue;
		const col = db.collection(step.collection);
		const indexes = await col.indexes();
		const legacy = step.drop.filter(name => indexes.some(i => i.name === name && i.unique));
		if (!legacy.length) continue;

		for (const field of step.scoped) {
			const name = `organization_1_project_1_${field}_1`;
			if (!indexes.some(i => i.name === name))
				await col.createIndex({ organization: 1, project: 1, [field]: 1 }, { unique: true, name });
		}
		for (const name of legacy) await col.dropIndex(name);
		console.log(`Tenancy: ${step.collection} — ${legacy.join(', ')} now unique per project`);
	}

	// A tenant project's models all share one collection (D21, WO-43): the
	// global unique collectionName_1 becomes unique among super-admin models only.
	// The partial index is made first, so the platform's are never unguarded.
	if (existing.has('modeldefinitions')) {
		const col = db.collection('modeldefinitions');
		const indexes = await col.indexes();
		if (indexes.some(i => i.name === 'collectionName_1')) {
			if (!indexes.some(i => i.name === PLATFORM_COLLECTION_INDEX))
				await col.createIndex(
					{ collectionName: 1 },
					{ unique: true, partialFilterExpression: { organization: null }, name: PLATFORM_COLLECTION_INDEX }
				);
			await col.dropIndex('collectionName_1');
			console.log('Tenancy: modeldefinitions — collectionName now unique among super-admin models only');
		}
	}
};
