import mongoose from 'mongoose';

/**
 * One collection per tenant project (docs/multi-tenancy D21, WO-43): every
 * model a project builds keeps its records in `t_<projectId>`, each record
 * naming its model in `_model`. The project's models are Mongoose
 * discriminators of one base model (dynamicModels.function.ts), so every query
 * through a model is confined to its own records. Super-admin built models are
 * not affected: one collection each, as before.
 *
 * `Model.syncIndexes()` can't be used on a shared collection — it drops every
 * index its own model doesn't declare, i.e. every other model's. This keeps
 * the indexes by name instead: the collection's shared `p_*` ones, and each
 * model's own `m_<Name>_<field>`, which only that model's sync creates or drops.
 */

export const MODEL_KEY = '_model';

/** A tenant project's records collection. */
export const projectCollection = (projectId: any) => `t_${projectId}`;

/**
 * The filter that confines a direct collection call to one model's records:
 * `{ _model: 'Booking' }` for a project model on its project's collection,
 * nothing for a model with a collection of its own (the super admin's, or a
 * project model not migrated yet).
 */
export const ownRecordsOf = (Model: mongoose.Model<any> | null | undefined): Record<string, string> => {
	const m: any = (Model?.schema as any)?.discriminatorMapping;
	return m && !m.isRoot ? { [m.key]: m.value } : {};
};

type IndexSpec = { name: string; key: Record<string, 1 | -1>; unique?: boolean; partialFilterExpression?: Record<string, any> };

const present = (field: string) => ({ [field]: { $exists: true } });

/** Indexes every project collection has: the default sort, codes, owners and access lists. */
const SHARED: IndexSpec[] = [
	{ name: 'p_model_createdAt', key: { [MODEL_KEY]: 1, createdAt: -1 } },
	{ name: 'p_model_code', key: { [MODEL_KEY]: 1, code: 1 }, unique: true, partialFilterExpression: present('code') },
	{ name: 'p_model_customer', key: { [MODEL_KEY]: 1, _customer: 1 }, partialFilterExpression: present('_customer') },
	{ name: 'p_model_addedBy', key: { [MODEL_KEY]: 1, addedBy: 1 }, partialFilterExpression: present('addedBy') },
	{ name: 'p_model_access', key: { [MODEL_KEY]: 1, access: 1 }, partialFilterExpression: present('access') },
];

const prefixOf = (modelName: string) => `m_${modelName}_`;

type FieldLike = { key: string; kind?: string; unique?: boolean; index?: boolean; required?: boolean; fields?: FieldLike[] };

/**
 * A model's own indexes: one per unique or indexed field (a section's fields
 * as `section.field`), always within the model's records. A unique field that
 * isn't required only counts records that have it — `sparse` before WO-43.
 */
export const modelIndexSpecs = (def: { name: string; fields: FieldLike[] }): IndexSpec[] => {
	const specs: IndexSpec[] = [];
	const add = (path: string, f: FieldLike) => {
		if (!f.unique && !f.index) return;
		specs.push({
			name: `${prefixOf(def.name)}${path}`,
			key: { [MODEL_KEY]: 1, [path]: 1 },
			...(f.unique && { unique: true }),
			partialFilterExpression: { [MODEL_KEY]: def.name, ...(f.unique && !f.required && present(path)) },
		});
	};
	for (const f of def.fields || []) {
		if (f.kind === 'section' || f.kind === 'sectionlist') (f.fields || []).forEach(sub => add(`${f.key}.${sub.key}`, sub));
		else add(f.key, f);
	}
	return specs;
};

const sameIndex = (ix: any, spec: IndexSpec) =>
	JSON.stringify(ix.key) === JSON.stringify(spec.key) &&
	!!ix.unique === !!spec.unique &&
	JSON.stringify(ix.partialFilterExpression || null) === JSON.stringify(spec.partialFilterExpression || null);

const indexesOf = async (collection: string): Promise<any[]> =>
	mongoose.connection
		.collection(collection)
		.indexes()
		.catch((e: any) => {
			// No collection yet: nothing to compare against.
			if (e?.code === 26 || /ns does not exist|ns not found/i.test(e?.message || '')) return [];
			throw e;
		});

const warningOf = (e: any) =>
	/duplicate key|E11000/i.test(e?.message || '')
		? 'A unique field couldn’t be enforced: existing records already share a value. Fix the duplicates and save again.'
		: `Indexes weren’t updated: ${e?.message}`;

/**
 * Brings one model's indexes on its project's collection in line, plus the
 * collection's shared ones if they're missing. Never touches another model's
 * `m_*` index. Failures come back as warnings, as `syncIndexes` did.
 */
export const syncProjectIndexes = async (def: { name: string; collectionName: string; fields: FieldLike[] }): Promise<string[]> => {
	const col = mongoose.connection.collection(def.collectionName);
	const warnings: string[] = [];
	const own = modelIndexSpecs(def);
	const existing = await indexesOf(def.collectionName);
	const kept = new Set<string>();

	for (const ix of existing) {
		if (!String(ix.name).startsWith(prefixOf(def.name))) {
			kept.add(ix.name);
			continue;
		}
		const want = own.find(s => s.name === ix.name);
		if (want && sameIndex(ix, want)) kept.add(ix.name);
		else await col.dropIndex(ix.name).catch((e: any) => warnings.push(warningOf(e)));
	}

	for (const spec of [...SHARED, ...own]) {
		if (kept.has(spec.name)) continue;
		const { name, key, unique, partialFilterExpression } = spec;
		await col
			.createIndex(key, { name, ...(unique && { unique }), ...(partialFilterExpression && { partialFilterExpression }) })
			.catch((e: any) => warnings.push(warningOf(e)));
	}
	return [...new Set(warnings)];
};

/** A deleted model's own indexes on its project's collection. */
export const dropModelIndexes = async (def: { name: string; collectionName: string }) => {
	const col = mongoose.connection.collection(def.collectionName);
	for (const ix of await indexesOf(def.collectionName))
		if (String(ix.name).startsWith(prefixOf(def.name))) await col.dropIndex(ix.name).catch(() => undefined);
};
