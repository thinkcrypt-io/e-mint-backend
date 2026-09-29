import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/**
 * Seeds the lookups of the Enterprise Survey feature (built with the feature
 * builder over MCP): the 20 ANZSIC industries, the 10 size bands and the 9
 * measures of the Annual Enterprise Survey (2025 financial year, provisional,
 * size bands). Survey figures link to them, so they must exist before the
 * survey CSV is bulk-uploaded on /surveyfigures — its industry_code_ANZSIC,
 * rme_size_grp and variable columns are matched to these codes and names.
 *
 * Raw collections rather than dist models, so it runs without a build. Each
 * model's collection is read from its ModelDefinition.
 *
 * Run with:  node scripts/seedEnterpriseSurvey.js
 *
 * Safe to re-run: rows are upserted on their code / name and only filled in
 * when new, so edits made in the admin are kept.
 */

const INDUSTRIES = [
	['A', 'Agriculture, Forestry and Fishing'],
	['B', 'Mining'],
	['C', 'Manufacturing'],
	['D', 'Electricity, Gas, Water and Waste Services'],
	['E', 'Construction'],
	['F', 'Wholesale Trade'],
	['G', 'Retail Trade'],
	['H', 'Accommodation and Food Services'],
	['I', 'Transport, Postal and Warehousing'],
	['J', 'Information Media and Telecommunications'],
	['K', 'Financial and Insurance Services'],
	['L', 'Rental, Hiring and Real Estate Services'],
	['M', 'Professional, Scientific and Technical Services'],
	['N', 'Administrative and Support Services'],
	['O', 'Public Administration and Safety'],
	['P', 'Education and Training'],
	['Q', 'Health Care and Social Assistance'],
	['R', 'Arts and Recreation Services'],
	['S', 'Other Services'],
	['all', 'All Industries'],
].map(([anzsicCode, name], i) => ({ anzsicCode, name, isTotal: anzsicCode === 'all', sortOrder: (i + 1) * 10 }));

const SIZE_BANDS = [
	['a_0', '0 employees', 0, 0],
	['b_1-5', '1–5 employees', 1, 5],
	['c_6-9', '6–9 employees', 6, 9],
	['d_10-19', '10–19 employees', 10, 19],
	['e_20-49', '20–49 employees', 20, 49],
	['f_50-99', '50–99 employees', 50, 99],
	['g_100-199', '100–199 employees', 100, 199],
	['h_200+', '200+ employees', 200, null],
	['i_Industry_Total', 'Industry total', null, null],
	['j_Grand_Total', 'Grand total', null, null],
].map(([bandCode, label, minEmployees, maxEmployees], i) => ({
	bandCode,
	label,
	...(minEmployees !== null && { minEmployees }),
	...(maxEmployees !== null && { maxEmployees }),
	sortOrder: (i + 1) * 10,
	isTotal: String(bandCode).startsWith('i_') || String(bandCode).startsWith('j_'),
}));

const COUNT = 'COUNT';
const MILLIONS = 'DOLLARS(millions)';
const MEASURES = [
	['Activity unit', COUNT, 'activity', 'Number of economically significant enterprises (activity units)'],
	['Rolling mean employees', COUNT, 'employment', 'Average number of employees over the year'],
	['Salaries and wages paid', MILLIONS, 'expenditure', ''],
	['Sales, government funding, grants and subsidies', MILLIONS, 'income', ''],
	['Total income', MILLIONS, 'income', ''],
	['Total expenditure', MILLIONS, 'expenditure', ''],
	['Operating profit before tax', MILLIONS, 'profit', ''],
	['Total assets', MILLIONS, 'assets', ''],
	['Fixed tangible assets', MILLIONS, 'assets', ''],
].map(([name, unit, category, description], i) => ({ name, unit, category, ...(description && { description }), sortOrder: (i + 1) * 10 }));

const SEEDS = [
	{ model: 'SurveyIndustry', key: 'anzsicCode', rows: INDUSTRIES },
	{ model: 'SizeBand', key: 'bandCode', rows: SIZE_BANDS },
	{ model: 'SurveyMeasure', key: 'name', rows: MEASURES },
];

const run = async () => {
	await mongoose.connect(process.env.MONGO_CONNECTION_URI);
	const db = mongoose.connection.db;
	for (const { model, key, rows } of SEEDS) {
		const def = await db.collection('modeldefinitions').findOne({ name: model });
		if (!def) {
			console.log(`${model} isn't built yet — build the Enterprise Survey feature first. Skipped.`);
			continue;
		}
		const now = new Date();
		const r = await db.collection(def.collectionName).bulkWrite(
			rows.map(row => ({
				updateOne: {
					filter: { [key]: row[key] },
					update: { $setOnInsert: { ...row, createdAt: now, updatedAt: now } },
					upsert: true,
				},
			}))
		);
		console.log(`${model} (${def.collectionName}): ${r.upsertedCount} added, ${rows.length - r.upsertedCount} already there`);
	}
	await mongoose.disconnect();
};

run().catch(e => {
	console.error(e.message);
	process.exit(1);
});
