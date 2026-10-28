import ApiEndpoint from '../../models/tenancy/apiEndpoint.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { updateModelCore } from '../../controllers/builder/models.controller.js';
import { listDefaultsOf } from '../apiEndpoints.function.js';
import { compiledModel, freeUid, inProjectCollection, uidOf } from '../dynamicModels.function.js';
import { MODEL_KEY } from '../projectIndexes.function.js';
import { engineFieldsReadOnly } from './install.js';
import { ModelKey, coreFieldsOf, modelSpecs } from './blueprint.js';
import { storeOf } from './store.js';

/**
 * A store built before the blueprint last changed, brought up to it
 * (docs/ecommerce EC-21): the fields added since, put on its models beside
 * the person's own and locked like the rest of the store's; a label or helper
 * renewed only where it's still the one MINT gave it. Then each change's own
 * fill-in for the records already there. Safe to run again — what's done is
 * left alone. Runs in the project's scope.
 */

/** Labels the blueprint used to give a field — renewed to today's when the store still has them. */
const OLD_LABELS: Partial<Record<ModelKey, Record<string, string[]>>> = {
	category: { sortOrder: ['Order on the POS'], image: ['Image'] },
};

type Change = { model: string; added: string[]; renewed: string[]; filled: string[] };

/** Today's blueprint fields missing from `have`, each put after the blueprint field before it. */
const merged = (have: any[], want: any[]) => {
	const out = [...have];
	const keys = () => new Set(out.map(f => f.key));
	const added: string[] = [];
	want.forEach((f, i) => {
		if (keys().has(f.key)) return;
		const before = want
			.slice(0, i)
			.reverse()
			.find(w => keys().has(w.key));
		const at = before ? out.findIndex(x => x.key === before.key) + 1 : 0;
		out.splice(at, 0, { ...f });
		added.push(f.key);
	});
	return { fields: out, added };
};

/**
 * The category fill-in (EC-21): every one shown on the POS and the website, a
 * website order, a web address made from its name. Straight to the collection
 * — the fields may not be compiled yet on a dry run.
 */
const fillCategories = async (def: any, apply: boolean, firstTime: boolean) => {
	const Category: any = compiledModel(def.name);
	if (!Category) return [];
	const own = inProjectCollection(def) ? { [MODEL_KEY]: def.name } : {};
	const col = Category.collection;
	const blank = { $in: [null, ''] };
	const filled: string[] = [];
	const statusless = await col.countDocuments({ ...own, $or: [{ posStatus: blank }, { webStatus: blank }] });
	if (statusless) filled.push(`${statusless} shown on the POS and website`);
	const nameless: any[] = await col.find({ ...own, slug: blank }, { projection: { name: 1 } }).toArray();
	if (nameless.length) filled.push(`${nameless.length} web address(es)`);
	// Order on POS ran lowest first before; now it's highest first. The first time, the numbers are
	// turned round so the order people set stays, and the website (which sorted by it) gets the same.
	const ordered: any[] = firstTime ? await col.find({ ...own, sortOrder: { $type: 'number' } }, { projection: { sortOrder: 1 } }).toArray() : [];
	const top = Math.max(0, ...ordered.map(c => c.sortOrder));
	if (ordered.some(c => c.sortOrder)) filled.push(`${ordered.length} order(s) turned round to highest first, the same on the website`);
	if (!apply) return filled;
	if (ordered.some(c => c.sortOrder))
		for (const c of ordered) await col.updateOne({ _id: c._id }, { $set: { sortOrder: top + 1 - c.sortOrder, webOrder: top + 1 - c.sortOrder } });
	await col.updateMany({ ...own, posStatus: blank }, { $set: { posStatus: 'active' } });
	await col.updateMany({ ...own, webStatus: blank }, { $set: { webStatus: 'active' } });
	await col.updateMany({ ...own, webOrder: null }, { $set: { webOrder: 0 } });
	for (const c of nameless) {
		const base = uidOf(c.name);
		if (base) await col.updateOne({ _id: c._id }, { $set: { slug: await freeUid(Category, 'slug', base, c._id) } });
	}
	return filled;
};

/** The website's rules on the store's own standard list endpoints (a Status on website, an Order on website). */
const fillEndpoints = async (def: any, apply: boolean) => {
	const want = listDefaultsOf(def);
	const ep: any = want && (await ApiEndpoint.findOne({ model: def.route, action: 'list', standard: true }).lean());
	if (!ep) return [];
	const set: any = {};
	const filters = ep.list?.filters || [];
	const missing = want!.filters.filter(w => !filters.some((f: any) => f?.field === w.field));
	if (missing.length) set['list.filters'] = [...filters, ...missing];
	// An empty sort, or the POS order the website used before it had its own.
	if (want!.sort && (!ep.list?.sort || ep.list.sort === 'sortOrder')) set['list.sort'] = want!.sort;
	if (!Object.keys(set).length) return [];
	if (apply) await ApiEndpoint.updateOne({ _id: ep._id }, { $set: set });
	return [`${ep.method} ${ep.path}: ${[missing.length && 'hides what’s inactive on the website', set['list.sort'] && `sorted ${set['list.sort']}`].filter(Boolean).join(', ')}`];
};

export const upgradeStore = async (req: any, { apply = false } = {}): Promise<Change[]> => {
	const store = await storeOf();
	const changes: Change[] = [];
	for (const spec of modelSpecs(store.answers)) {
		const m = store.installed[spec.key];
		if (!m) continue;
		const def: any = await ModelDefinition.findById(m.id).lean();
		if (!def) continue;
		const want: any[] = spec.step.fields || [];
		const { fields, added } = merged(def.fields || [], want);
		const renewed: string[] = [];
		for (const f of fields) {
			const w = want.find(x => x.key === f.key);
			if (!w || added.includes(f.key)) continue;
			const old = OLD_LABELS[spec.key]?.[f.key] || [];
			if (w.label !== f.label && old.includes(f.label)) {
				f.label = w.label;
				renewed.push(f.key);
			}
			// A web address typed by hand only, from before it was made from the name.
			if (w.kind === 'uid' && f.kind === 'uid' && w.from && !f.from) {
				f.from = w.from;
				if (!renewed.includes(f.key)) renewed.push(f.key);
			}
			if (w.helper && !f.helper && (old.includes(f.label) || f.label === w.label)) {
				f.helper = w.helper;
				if (!renewed.includes(f.key)) renewed.push(f.key);
			}
		}
		const core = [...new Set([...(def.systemFields || []), ...coreFieldsOf(spec.step)])];
		const change: Change = { model: def.title, added, renewed, filled: [] };
		if (apply && (added.length || renewed.length)) {
			await updateModelCore(req, def._id, { ...def, fields }, { note: 'Before the store’s upgrade' });
			await engineFieldsReadOnly(def.route, spec.engine);
		}
		if (apply && core.length !== (def.systemFields || []).length) await ModelDefinition.updateOne({ _id: def._id }, { $set: { systemFields: core } });
		if (spec.key === 'category') change.filled.push(...(await fillCategories(def, apply, added.includes('webOrder'))), ...(await fillEndpoints({ ...def, fields }, apply)));
		if (change.added.length || change.renewed.length || change.filled.length) changes.push(change);
	}
	return changes;
};
