import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { MODEL_KEY, projectCollection, syncProjectIndexes } from '../dist/library/functions/projectIndexes.function.js';

dotenv.config();

/**
 * Multi-tenancy WO-43 (docs/multi-tenancy, D21): one collection per tenant
 * project. Moves each project model's records from its own collection
 * (`t_<projectId>_<route>`) into its project's `t_<projectId>`, marked
 * `_model: <name>`, then points the model at it.
 *
 * Run with (after `npm run build` — it uses the server's index manager):
 *   node scripts/migrateProjectCollections.js                     dry run: what would move
 *   node scripts/migrateProjectCollections.js --apply             move every project
 *   node scripts/migrateProjectCollections.js --apply --project <id>
 *   node scripts/migrateProjectCollections.js --drop-old          drop old collections whose records all moved
 *
 * Projects only. A super-admin model (no organization) is never selected, and
 * nothing outside `t_<projectId>…` is read or written — the platform's models,
 * collections, indexes and documents stay exactly as they are.
 *
 * Per model: every record is copied with its `_id` (an upsert, so a re-run
 * refreshes what changed and copies what's missing; a record removed from the
 * old collection since an earlier run is removed from the copy). Records
 * changed while the copy ran are copied again. Only when the counts match is
 * the model switched over (`collectionName`, `version` bumped so every server
 * recompiles it); otherwise it stays on its old collection and keeps working.
 * Then the project's indexes are built. Old collections stay until
 * `--drop-old`, which drops one only when every record in it is in the new
 * collection, as its model's (records added since are fine).
 *
 * Deploy the WO-43 backend first (it refuses to run before), back up
 * (mongodump), and run it with the app stopped: a write to an old collection
 * after its model switched over would be missed.
 */

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dropOld = args.includes('--drop-old');
const projectArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
const BATCH = 1000;

const fail = message => {
	console.error(message);
	process.exit(1);
};

if (apply && dropOld) fail('Run --apply and --drop-old separately: check the move first.');
if (projectArg !== null && !/^[a-f0-9]{24}$/i.test(projectArg || '')) fail('--project takes a project id');

const db = () => mongoose.connection.db;
const exists = async name => (await db().listCollections({ name }, { nameOnly: true }).toArray()).length > 0;

/** The project models to look at: tenant ones only. */
const tenantDefs = async () => {
	const filter = { organization: { $ne: null }, project: { $ne: null } };
	if (projectArg) filter.project = new mongoose.Types.ObjectId(projectArg);
	return db().collection('modeldefinitions').find(filter).sort({ project: 1, name: 1 }).toArray();
};

/** Upserts a batch into the project's collection; an `_id` held by another model's record is an error. */
const writeBatch = async (target, name, docs) => {
	if (!docs.length) return;
	await target.bulkWrite(
		docs.map(doc => ({ replaceOne: { filter: { _id: doc._id, [MODEL_KEY]: name }, replacement: { ...doc, [MODEL_KEY]: name }, upsert: true } })),
		{ ordered: false }
	);
};

const copy = async (source, target, name, filter = {}) => {
	let batch = [];
	let n = 0;
	for await (const doc of source.find(filter)) {
		batch.push(doc);
		if (batch.length === BATCH) {
			await writeBatch(target, name, batch);
			n += batch.length;
			batch = [];
		}
	}
	await writeBatch(target, name, batch);
	return n + batch.length;
};

/** Records copied by an earlier run whose original has since gone. */
const removeGone = async (source, target, name) => {
	const ids = new Set((await source.distinct('_id')).map(String));
	const gone = [];
	for await (const d of target.find({ [MODEL_KEY]: name }, { projection: { _id: 1 } })) if (!ids.has(String(d._id))) gone.push(d._id);
	if (gone.length) await target.deleteMany({ _id: { $in: gone }, [MODEL_KEY]: name });
	return gone.length;
};

const moveModel = async def => {
	const pid = String(def.project);
	const to = projectCollection(pid);
	const from = def.collectionName;
	const source = db().collection(from);
	const target = db().collection(to);
	const before = (await exists(from)) ? await source.countDocuments() : 0;
	const line = `  ${def.name.padEnd(28)} ${from} → ${to}`;

	if (!apply) {
		const already = await target.countDocuments({ [MODEL_KEY]: def.name });
		console.log(`${line}  ${before} record(s)${already ? `, ${already} already copied` : ''}`);
		return { def, moved: false };
	}

	const startedAt = new Date();
	const removed = before ? await removeGone(source, target, def.name) : 0;
	const copied = before ? await copy(source, target, def.name) : 0;
	// Changed while the copy ran.
	const again = before ? await copy(source, target, def.name, { updatedAt: { $gte: startedAt } }) : 0;
	const now = (await exists(from)) ? await source.countDocuments() : 0;
	const after = await target.countDocuments({ [MODEL_KEY]: def.name });
	if (now !== after) {
		console.log(`${line}  NOT MOVED: ${now} in the old collection, ${after} copied — run again (app stopped)`);
		return { def, moved: false, problem: true };
	}
	await db()
		.collection('modeldefinitions')
		.updateOne({ _id: def._id, collectionName: from }, { $set: { collectionName: to, version: (def.version || 1) + 1, updatedAt: new Date() } });
	console.log(`${line}  moved ${after} record(s)${again ? ` (${again} copied again)` : ''}${removed ? ` (${removed} gone since an earlier run removed)` : ''}`);
	return { def: { ...def, collectionName: to }, moved: true, copied };
};

const run = async () => {
	if (!process.env.MONGO_CONNECTION_URI) fail('MONGO_CONNECTION_URI is not set');
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	console.log(`Database: ${db().databaseName}${apply ? '' : dropOld ? '  (--drop-old)' : '  (dry run — nothing is changed; --apply to move)'}`);
	// Only after the WO-43 backend is live: its first boot replaces the global
	// unique collectionName_1 (tenantIndexes.function.ts). Before that, the
	// running code would read a shared collection without the `_model` filter.
	if ((await db().collection('modeldefinitions').indexes()).some(i => i.name === 'collectionName_1'))
		fail('modeldefinitions still has collectionName_1: deploy the WO-43 backend first (its boot replaces it), then run this.');
	const platform = await db().collection('modeldefinitions').countDocuments({ organization: null });
	console.log(`Super-admin models: ${platform} — not touched (one collection each, as before)\n`);

	const defs = await tenantDefs();
	const byProject = new Map();
	for (const d of defs) {
		const pid = String(d.project);
		const ok = d.collectionName === projectCollection(pid) || d.collectionName.startsWith(`t_${pid}_`);
		// Anything else isn't a project model's collection: refuse rather than guess.
		if (!ok) fail(`${d.name} (project ${pid}) uses "${d.collectionName}", not t_${pid}_… — stopped, nothing more done.`);
		if (!byProject.has(pid)) byProject.set(pid, []);
		byProject.get(pid).push(d);
	}

	let problems = 0;
	if (dropOld) {
		let dropped = 0;
		for (const [pid, list] of byProject) {
			const target = db().collection(projectCollection(pid));
			const left = await db().listCollections({ name: { $regex: `^t_${pid}_` } }, { nameOnly: true }).toArray();
			for (const { name } of left) {
				const def = list.find(d => d.collectionName === projectCollection(pid) && name === `t_${pid}_${d.route}`);
				if (!def) {
					console.log(`  ${name}: no moved model uses it — left as it is`);
					continue;
				}
				const ids = await db().collection(name).distinct('_id');
				let found = 0;
				for (let i = 0; i < ids.length; i += BATCH)
					found += await target.countDocuments({ _id: { $in: ids.slice(i, i + BATCH) }, [MODEL_KEY]: def.name });
				if (found !== ids.length) {
					problems++;
					console.log(`  ${name}: kept — ${ids.length - found} of its ${ids.length} record(s) aren't in ${projectCollection(pid)}`);
					continue;
				}
				const old = ids.length;
				await db().dropCollection(name);
				dropped++;
				console.log(`  ${name}: dropped (${old} record(s), all in ${projectCollection(pid)})`);
			}
		}
		console.log(`\n${dropped} old collection(s) dropped${problems ? `, ${problems} kept (counts differ)` : ''}.`);
	} else {
		let moved = 0;
		let waiting = 0;
		for (const [pid, list] of byProject) {
			const todo = list.filter(d => d.collectionName !== projectCollection(pid));
			console.log(`Project ${pid}: ${list.length} model(s), ${todo.length} to move`);
			const done = list.filter(d => d.collectionName === projectCollection(pid));
			for (const def of todo) {
				const r = await moveModel(def);
				if (r.moved) {
					moved++;
					done.push(r.def);
				} else if (r.problem) problems++;
				else waiting++;
			}
			// The project's indexes: shared ones once, then each moved model's own.
			if (apply)
				for (const def of done) {
					const warnings = await syncProjectIndexes(def);
					for (const w of warnings) {
						problems++;
						console.log(`  ${def.name}: ${w}`);
					}
				}
		}
		console.log(
			apply
				? `\n${moved} model(s) moved${problems ? `, ${problems} problem(s) above` : ''}. Old collections are kept — check, then --drop-old.`
				: `\n${waiting} model(s) would move. Back up first, stop the app, then --apply.`
		);
	}
	await mongoose.disconnect();
	if (problems) process.exit(1);
};

run().catch(e => {
	console.error(e);
	process.exit(1);
});
