import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Autofill rework (docs/autofill, AF-10): autofill is a setting on a field, not
 * a field type. Fields saved as the old `autofill` / `autofillreadonly` kinds
 * become the kind they copy (their `fills`: text, number, date, yes/no) and
 * keep `fillFrom`, with `readonly: true` for the read-only one:
 *
 *   model builder   { kind: 'autofillreadonly', fills: 'text', fillFrom }   → { kind: 'text', fillFrom: { …, readonly: true } }
 *   page settings   { schema: { type: 'autofill', fills: 'date', fillFrom } } → { schema: { type: 'date', fillFrom } }
 *   list rows       { name, type: 'autofillreadonly', kind, fills, fillFrom } → the same, as the row's own kind
 *
 * Covers model definitions, route settings (published and draft), their
 * version snapshots, features and project templates. Records need nothing —
 * the stored values don't change.
 *
 * Run with:  node scripts/migrateAutofill.js            (dry run: what would change)
 *            node scripts/migrateAutofill.js --apply
 *
 * Safe to re-run: a document with none of the old kinds is left alone.
 */

const apply = process.argv.includes('--apply');
const OLD = new Set(['autofill', 'autofillreadonly']);
// The kind a copy holds, and the input that types it in a page's settings.
const KIND = { text: 'text', number: 'number', date: 'date', boolean: 'boolean' };
const INPUT = { text: 'text', number: 'number', date: 'date', boolean: 'checkbox' };
const COLLECTIONS = ['modeldefinitions', 'routesettings', 'routeversions', 'features', 'projecttemplates'];

let changes = 0;
const withReadonly = (fillFrom, ro) => (fillFrom && typeof fillFrom === 'object' ? { ...fillFrom, ...(ro && { readonly: true }) } : fillFrom);

/** Rewrites every old autofill field inside `node`, in place. */
const fix = node => {
	if (Array.isArray(node)) return node.forEach(fix);
	if (!node || typeof node !== 'object') return;
	// A model builder field.
	if (OLD.has(node.kind) && typeof node.key === 'string') {
		const ro = node.kind === 'autofillreadonly';
		const fills = KIND[node.fills] ? node.fills : 'text';
		node.kind = KIND[fills];
		node.fillFrom = withReadonly(node.fillFrom, ro);
		delete node.fills;
		if (ro) (delete node.required, delete node.unique);
		changes++;
	}
	// A page settings field.
	else if (node.schema && typeof node.schema === 'object' && OLD.has(node.schema.type)) {
		const ro = node.schema.type === 'autofillreadonly';
		const fills = KIND[node.schema.fills] ? node.schema.fills : 'text';
		node.schema.type = INPUT[fills];
		node.schema.fillFrom = withReadonly(node.schema.fillFrom, ro);
		delete node.schema.fills;
		if (ro) node.edit = false;
		changes++;
	}
	// A list row (the section's dataModel): `type` is the input, `kind` the builder's kind.
	else if (typeof node.name === 'string' && (OLD.has(node.type) || OLD.has(node.kind))) {
		const ro = node.type === 'autofillreadonly' || node.kind === 'autofillreadonly';
		const fills = KIND[node.fills] ? node.fills : 'text';
		node.type = INPUT[fills];
		if ('kind' in node) node.kind = KIND[fills];
		node.fillFrom = withReadonly(node.fillFrom, ro);
		delete node.fills;
		changes++;
	}
	for (const v of Object.values(node)) fix(v);
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const have = new Set((await db.listCollections().toArray()).map(c => c.name));
	let docs = 0;
	for (const name of COLLECTIONS.filter(c => have.has(c))) {
		let n = 0;
		for await (const doc of db.collection(name).find({})) {
			const before = changes;
			const { _id, ...rest } = doc;
			fix(rest);
			if (changes === before) continue;
			n++;
			if (apply) await db.collection(name).replaceOne({ _id }, rest);
		}
		docs += n;
		console.log(`${name}: ${n} document(s) ${apply ? 'rewritten' : 'would change'}`);
	}
	console.log(apply ? `\nDone — ${changes} field(s) in ${docs} document(s).` : `\nDry run — ${changes} field(s) in ${docs} document(s); nothing written. Add --apply to rewrite them.`);
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
