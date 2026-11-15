import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Think Tech (mint-2-think-tech) specifications, 2026-11-16 (docs/key-values).
 *
 * Think Tech's products kept their specs in the description ("## Display" then "Size: 15.6 inch" rows).
 * The store now has Specifications records (name, description, keys) and each Category lists its own in
 * `specifications`. The Product model's Key-value pairs field `specs` (from: category, via: specifications)
 * shows those groups as sections. This fills `specs` on every product from its description, so the values
 * people see in the panel come from the category's specs.
 *
 * Each group's values come from the description section that has all the group's keys (the groups were made
 * from those sections), else from any row with that key. Descriptions are left as they are.
 *
 * Run (after the Key-value pairs backend is deployed and `specs` is on Product):
 *   node scripts/fillThinkTechSpecs.js           dry run: what would be written, one sample
 *   node scripts/fillThinkTechSpecs.js --apply
 *   add --force to refill products that already have specs
 *
 * Touches only Think Tech's Product records (their `specs`). Safe to re-run.
 */

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const DEFS = { product: '6af9d90fb59f4e650e283fc8', category: '6af9d90eb59f4e650e283f7c', spec: '6afa0fc9b59f4e650e2a0ae0' };
const FIELD = 'specs';

const lc = s => String(s ?? '').trim().toLowerCase();

/** "## Title" sections of "Key: Value" rows. */
const sectionsOf = description => {
	const out = [];
	for (const raw of String(description || '').split('\n')) {
		const l = raw.trim();
		if (l.startsWith('## ')) out.push({ title: l.slice(3).trim(), rows: new Map() });
		else if (out.length && /^[^:]{1,40}:\s+/.test(l)) {
			const k = l.indexOf(':');
			const key = lc(l.slice(0, k));
			if (!out.at(-1).rows.has(key)) out.at(-1).rows.set(key, l.slice(k + 1).trim());
		}
	}
	return out.filter(s => s.rows.size);
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	const defs = db.collection('modeldefinitions');
	const [product, category, spec] = await Promise.all(Object.values(DEFS).map(id => defs.findOne({ _id: new mongoose.Types.ObjectId(id) })));
	if (!product || !category || !spec) throw new Error('Think Tech models not found');
	const field = product.fields.find(f => f.key === FIELD);
	if (field?.kind !== 'keyvalue') {
		const msg = `Product has no Key-value pairs field “${FIELD}” yet — deploy the backend and add it first`;
		if (apply) throw new Error(msg);
		console.log(`(${msg}; dry run only)`);
	}

	const col = def => ({ c: db.collection(def.collectionName), q: def.collectionName?.startsWith('t_') ? { _model: def.name } : {} });
	const P = col(product), C = col(category), S = col(spec);

	const specs = new Map((await S.c.find({ ...S.q, archivedAt: null }).toArray()).map(s => [String(s._id), s]));
	const cats = new Map((await C.c.find(C.q, { projection: { name: 1, specifications: 1 } }).toArray()).map(c => [String(c._id), c]));

	let write = 0, skipped = 0, noCat = 0, empty = 0, sample;
	const ops = [];
	for await (const p of P.c.find(P.q, { projection: { name: 1, category: 1, description: 1, [FIELD]: 1 } })) {
		if (!force && Array.isArray(p[FIELD]) && p[FIELD].length) {
			skipped++;
			continue;
		}
		const cat = p.category && cats.get(String(p.category));
		const groups = (cat?.specifications || []).map(id => specs.get(String(id))).filter(Boolean);
		if (!groups.length) {
			noCat++;
			continue;
		}
		const sections = sectionsOf(p.description);
		const anyRow = key => sections.find(s => s.rows.has(key))?.rows.get(key);
		const value = groups
			.map(g => {
				const keys = (g.keys || []).map(String);
				const home = sections.find(s => keys.every(k => s.rows.has(lc(k))));
				const items = keys.map(key => ({ key, value: home?.rows.get(lc(key)) ?? anyRow(lc(key)) ?? '' })).filter(i => i.value);
				return { group: String(g._id), title: g.name, ...(g.description && { description: g.description }), items };
			})
			.filter(s => s.items.length);
		if (!value.length) {
			empty++;
			continue;
		}
		sample ??= { name: p.name, category: cat.name, [FIELD]: value };
		write++;
		ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { [FIELD]: value } } } });
	}

	console.log(`${apply ? 'Writing' : 'Would write'} specs on ${write} products; already filled ${skipped}, no category specs ${noCat}, nothing matched ${empty}`);
	if (sample) console.log('Sample:', JSON.stringify(sample, null, 1));
	if (apply && ops.length) {
		const r = await P.c.bulkWrite(ops, { ordered: false });
		console.log(`Updated ${r.modifiedCount}`);
	}
	await mongoose.disconnect();
};

run().catch(async e => {
	console.error(e.message || e);
	await mongoose.disconnect();
	process.exit(1);
});
