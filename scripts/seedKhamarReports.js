import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runInScope, runUnscoped } from '../dist/library/functions/tenantScope.function.js';
import TenantProject from '../dist/library/models/tenancy/tenantProject.model.js';
import Organization from '../dist/library/models/tenancy/organization.model.js';
import ModelDefinition from '../dist/library/models/builder/modelDefinition.model.js';
import Report from '../dist/library/models/tenancy/report.model.js';
import { checkReport } from '../dist/routes-tenant/reports.router.js';

dotenv.config();

/**
 * RP-05 (docs/panel-users): the Khamar (cattle & goat farm) project's reports —
 * animal register, animals by shed, sold animals, milk, feed, health and
 * vaccines due, expenses, income, animal sales and dues. Each is checked
 * with the saved-reports router's own rules, and skipped when the project
 * lacks its model or a field it names. Needs `npm run build` first.
 *
 * Run with:  node scripts/seedKhamarReports.js --project mint-2-khamar          (dry run; the panel address or the project id)
 *            node scripts/seedKhamarReports.js --project mint-2-khamar --apply
 *
 * Safe to re-run: a report with the same name on the same model is updated, not doubled.
 */

const arg = (name) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > -1 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const slug = arg('project') || 'mint-2-khamar';

const c = (key, label) => (label ? { key, label } : { key });
const ALL = ['csv', 'xlsx', 'pdf'];

const REPORTS = [
	// Animals
	{ category: 'Animals', name: 'Animal register', description: 'Every animal with its breed, shed, status and cost', route: 'animals', type: 'list',
		columns: [c('tagId'), c('name'), c('species'), c('category'), c('breed'), c('gender'), c('shed'), c('weight'), c('source'), c('purchaseDate'), c('totalCost'), c('status')],
		sort: 'tagId', totals: ['weight', 'totalCost'], dateField: 'createdAt', range: 'all', formats: ALL },
	{ category: 'Animals', name: 'Animals by shed', description: 'How many animals each shed holds, their weight and cost', route: 'animals', type: 'summary',
		groupBy: 'shed', sums: [{ field: 'weight', label: 'Weight (kg)' }, { field: 'totalCost', label: 'Total cost' }],
		filters: [{ field: 'status', op: 'eq', value: 'active' }], dateField: 'createdAt', range: 'all', formats: ALL },
	{ category: 'Animals', name: 'Animals by species', description: 'Cows and goats: how many and what they cost', route: 'animals', type: 'summary',
		groupBy: 'species', sums: [{ field: 'totalCost', label: 'Total cost' }], dateField: 'createdAt', range: 'all', formats: ALL },
	{ category: 'Animals', name: 'Sold animals', description: 'Animals marked sold', route: 'animals', type: 'list',
		columns: [c('tagId'), c('name'), c('species'), c('breed'), c('purchaseDate'), c('totalCost')],
		filters: [{ field: 'status', op: 'eq', value: 'sold' }], sort: '-updatedAt', totals: ['totalCost'], dateField: 'createdAt', range: 'all', formats: ALL },

	// Milk
	{ category: 'Milk', name: 'Milk collection', description: 'Every milking, morning and evening', route: 'milkrecords', type: 'list',
		columns: [c('date'), c('animal'), c('session'), c('litres'), c('fat')], sort: '-date', totals: ['litres'], dateField: 'date', range: '30d', formats: ALL },
	{ category: 'Milk', name: 'Milk per day', description: 'Litres collected each day', route: 'milkrecords', type: 'timeline',
		interval: 'day', sums: [{ field: 'litres', label: 'Litres' }], dateField: 'date', range: '30d', formats: ALL },
	{ category: 'Milk', name: 'Milk per month', description: 'Litres collected each month', route: 'milkrecords', type: 'timeline',
		interval: 'month', sums: [{ field: 'litres', label: 'Litres' }], dateField: 'date', range: 'year', formats: ALL },
	{ category: 'Milk', name: 'Milk by cow', description: 'Litres from each cow', route: 'milkrecords', type: 'summary',
		groupBy: 'animal', sums: [{ field: 'litres', label: 'Litres' }], dateField: 'date', range: 'month', formats: ALL },

	// Feed
	{ category: 'Feed', name: 'Feed usage', description: 'Feed given, by batch and shed, with its cost', route: 'feedusages', type: 'list',
		columns: [c('date'), c('feedBatch'), c('shed'), c('animal'), c('quantity'), c('cost')], sort: '-date', totals: ['quantity', 'cost'], dateField: 'date', range: '30d', formats: ALL },
	{ category: 'Feed', name: 'Feed cost by shed', description: 'Feed and its cost per shed', route: 'feedusages', type: 'summary',
		groupBy: 'shed', sums: [{ field: 'quantity', label: 'Quantity' }, { field: 'cost', label: 'Cost' }], dateField: 'date', range: 'month', formats: ALL },
	{ category: 'Feed', name: 'Feed cost per month', description: 'What feed cost each month', route: 'feedusages', type: 'timeline',
		interval: 'month', sums: [{ field: 'quantity', label: 'Quantity' }, { field: 'cost', label: 'Cost' }], dateField: 'date', range: 'year', formats: ALL },

	// Health
	{ category: 'Health', name: 'Health & vaccination', description: 'Vaccines, treatments and vet visits', route: 'healthrecords', type: 'list',
		columns: [c('date'), c('animal'), c('recordType'), c('treatment'), c('vet'), c('cost'), c('nextDueDate')], sort: '-date', totals: ['cost'], dateField: 'date', range: '90d', formats: ALL },
	{ category: 'Health', name: 'Vaccines & doses due', description: 'What is due next, soonest first', route: 'healthrecords', type: 'list',
		columns: [c('nextDueDate'), c('animal'), c('recordType'), c('treatment'), c('vet')], filters: [{ field: 'nextDueDate', op: 'exists', value: true }],
		sort: 'nextDueDate', dateField: 'nextDueDate', range: 'all', formats: ALL },
	{ category: 'Health', name: 'Health cost by type', description: 'Vaccines, treatments, deworming: how many and their cost', route: 'healthrecords', type: 'summary',
		groupBy: 'recordType', sums: [{ field: 'cost', label: 'Cost' }], dateField: 'date', range: 'year', formats: ALL },

	// Money
	{ category: 'Money', name: 'Expenses', description: 'Daily farm costs', route: 'expenses', type: 'list',
		columns: [c('date'), c('title'), c('category'), c('amount'), c('shed'), c('animal'), c('paidTo'), c('paymentMethod')], sort: '-date', totals: ['amount'], dateField: 'date', range: 'month', formats: ALL },
	{ category: 'Money', name: 'Expenses by category', description: 'Where the money went', route: 'expenses', type: 'summary',
		groupBy: 'category', sums: [{ field: 'amount', label: 'Amount' }], dateField: 'date', range: 'month', formats: ALL },
	{ category: 'Money', name: 'Expenses per month', description: 'Farm costs month by month', route: 'expenses', type: 'timeline',
		interval: 'month', sums: [{ field: 'amount', label: 'Amount' }], dateField: 'date', range: 'year', formats: ALL },
	{ category: 'Money', name: 'Income', description: 'Milk, animal, manure and other sales', route: 'incomes', type: 'list',
		columns: [c('date'), c('title'), c('source'), c('buyer'), c('quantity'), c('rate'), c('amount'), c('received'), c('due')], sort: '-date', totals: ['amount', 'received', 'due'], dateField: 'date', range: 'month', formats: ALL },
	{ category: 'Money', name: 'Income by source', description: 'Milk, animals, manure: what each brought in', route: 'incomes', type: 'summary',
		groupBy: 'source', sums: [{ field: 'amount', label: 'Amount' }, { field: 'received', label: 'Received' }, { field: 'due', label: 'Due' }], dateField: 'date', range: 'year', formats: ALL },
	{ category: 'Money', name: 'Income per month', description: 'Income month by month', route: 'incomes', type: 'timeline',
		interval: 'month', sums: [{ field: 'amount', label: 'Amount' }, { field: 'received', label: 'Received' }], dateField: 'date', range: 'year', formats: ALL },
	{ category: 'Money', name: 'Animal sales', description: 'Animals sold, to whom and for how much', route: 'incomes', type: 'list',
		columns: [c('date'), c('title'), c('animal'), c('buyer'), c('buyerPhone'), c('amount'), c('received'), c('due')],
		filters: [{ field: 'source', op: 'eq', value: 'animal' }], sort: '-date', totals: ['amount', 'received', 'due'], dateField: 'date', range: 'year', formats: ALL },
	{ category: 'Money', name: 'Money owed by buyers', description: 'Sales not yet fully paid', route: 'incomes', type: 'list',
		columns: [c('date'), c('title'), c('buyer'), c('buyerPhone'), c('amount'), c('received'), c('due')],
		filters: [{ field: 'due', op: 'gt', value: 0 }], sort: '-due', totals: ['amount', 'received', 'due'], dateField: 'date', range: 'all', formats: ALL },
];

const BUILT_IN = new Set(['_id', 'createdAt', 'updatedAt', 'code']);

/** The fields a report names that its model does not have. */
const missingFields = (r, def) => {
	const have = new Set([...(def.fields || []).map((f) => f.key || f.name), ...BUILT_IN]);
	const named = [
		...(r.columns || []).map((x) => x.key),
		...(r.totals || []),
		...(r.sums || []).map((s) => s.field),
		...(r.filters || []).map((f) => f.field),
		r.groupBy,
		r.dateField,
		(r.sort || '').replace(/^-/, ''),
	].filter(Boolean);
	return [...new Set(named.filter((k) => !have.has(k.split('.')[0])))];
};

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	// The project's address (<organisation slug>-<project slug>, as in its panel link) or its id.
	const projects = await runUnscoped(async () => {
		if (mongoose.isValidObjectId(slug)) return TenantProject.find({ _id: slug }, { name: 1, organization: 1 }).lean();
		const orgs = await Organization.find({}, { slug: 1 }).lean();
		const matches = [];
		for (const o of orgs.filter((o) => slug.startsWith(`${o.slug}-`))) {
			const rest = slug.slice(o.slug.length + 1);
			matches.push(...(await TenantProject.find({ organization: o._id, slug: rest }, { name: 1, organization: 1 }).lean()));
		}
		return matches;
	});
	if (projects.length !== 1) throw new Error(`${projects.length} projects are at "${slug}" — need exactly one`);
	const p = projects[0];
	const scope = { organization: p.organization, project: p._id };
	console.log(`${p.name} (${p._id}) — ${apply ? 'writing' : 'dry run'}`);

	let made = 0, updated = 0, skipped = 0;
	await runInScope(scope, async () => {
		for (const [i, raw] of REPORTS.entries()) {
			const def = await ModelDefinition.findOne({ route: raw.route }).lean();
			if (!def) {
				console.log(`  skip  ${raw.name}: no "${raw.route}" model`);
				skipped++;
				continue;
			}
			const gone = missingFields(raw, def);
			if (gone.length) {
				console.log(`  skip  ${raw.name}: ${raw.route} has no ${gone.join(', ')}`);
				skipped++;
				continue;
			}
			const doc = { ...checkReport({ ...raw, order: i }) };
			const existing = await Report.findOne({ name: doc.name, route: doc.route }, { _id: 1 }).lean();
			console.log(`  ${existing ? 'update' : 'add   '} ${doc.category} › ${doc.name} (${doc.type} on ${doc.route})`);
			if (!apply) continue;
			if (existing) {
				await Report.updateOne({ _id: existing._id }, { $set: doc });
				updated++;
			} else {
				await Report.create(doc);
				made++;
			}
		}
	});
	console.log(apply ? `Done: ${made} added, ${updated} updated, ${skipped} skipped.` : `Dry run — add --apply to write. ${skipped} would be skipped.`);
	await mongoose.disconnect();
};

run().catch(async (e) => {
	console.error(e.message || e);
	await mongoose.disconnect();
	process.exit(1);
});
