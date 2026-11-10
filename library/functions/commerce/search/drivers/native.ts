/**
 * Store search — the native driver (docs/search SI3): plain MongoDB over `searchdocs`, on any tier, locally too.
 * Candidates come from the indexed `terms` / `prefixes` / `phon` / `codes` arrays (each indexed with the project);
 * ranking happens in Node (rank.ts). Runs in the store's scope: the tenant plugin adds the project to every query.
 */
import mongoose from 'mongoose';
import SearchDoc from '../../../../models/tenancy/searchDoc.model.js';
import { currentScope } from '../../../tenantScope.function.js';
import type { Filters } from '../facets.js';
import { makeVocab } from '../vocab.js';
import type { BrowseSpec, CandidateSpec, Cond, SearchDriver } from './types.js';

const SCORED = { product: 1, fields: 1, facets: 1, signals: 1, card: 1, codes: 1 };
const SHOWN = ['name', 'brand', 'category', 'collection', 'option', 'keyword', 'custom'];

const oid = (v: any) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const oids = (xs: any[] = []) => xs.map(oid).filter(Boolean);

const condQuery = (c: Cond) => ({
	$or: [
		...(c.terms.length ? [{ terms: { $in: c.terms } }] : []),
		...(c.prefix ? [{ prefixes: c.prefix }] : []),
		...(c.phon ? [{ phon: c.phon }] : []),
		...(c.code ? [{ codes: c.code }] : []),
	],
});
const usable = (c: Cond) => c.terms.length || c.prefix || c.phon || c.code;

const baseQuery = (hideOutOfStock: boolean) => ({ status: 'active', ...(hideOutOfStock && { 'facets.inStock': true }) });

/** Filters as a MongoDB query (browse). */
export const filterQuery = (f: Filters) => {
	const and: any[] = [];
	if (f.categories?.length) and.push({ 'facets.categories': { $in: oids(f.categories) } });
	if (f.collections?.length) and.push({ 'facets.collections': { $in: oids(f.collections) } });
	if (f.brands?.length) and.push({ 'facets.brand': { $in: oids(f.brands) } });
	if (f.price) and.push({ 'facets.price': { ...(f.price.gte != null && { $gte: f.price.gte }), ...(f.price.lte != null && { $lte: f.price.lte }) } });
	if (f.inStock) and.push({ 'facets.inStock': true });
	if (f.onSale) and.push({ 'facets.onSale': true });
	for (const [name, values] of Object.entries(f.opts || {})) and.push({ 'facets.opts': { $in: values.map(v => `${name}=${v}`) } });
	return and.length ? { $and: and } : {};
};

const SORTS: Record<BrowseSpec['sort'], Record<string, 1 | -1>> = {
	popular: { 'signals.sold30': -1, 'signals.views': -1, 'signals.wishes': -1 },
	price: { 'facets.price': 1 },
	'-price': { 'facets.price': -1 },
	newest: { 'signals.createdAt': -1 },
	name: { 'card.name': 1 },
};

export const nativeDriver = (): SearchDriver => {
	const project = currentScope()?.project;
	if (!project) throw new Error('Store search runs in a store’s scope');
	return {
		key: String(project),

		async vocabulary() {
			const shown = { $setUnion: SHOWN.flatMap(p => [{ $ifNull: [`$fields.${p}.words`, []] }, { $ifNull: [`$fields.${p}.stems`, []] }]) };
			const [r]: any[] = await SearchDoc.aggregate([
				{ $match: { status: 'active' } },
				{ $project: { terms: 1, phon: 1, shown } },
				{
					$facet: {
						n: [{ $count: 'n' }],
						df: [{ $unwind: '$terms' }, { $group: { _id: '$terms', df: { $sum: 1 } } }],
						shown: [{ $unwind: '$shown' }, { $group: { _id: '$shown' } }],
						phon: [{ $unwind: '$phon' }, { $group: { _id: '$phon' } }],
					},
				},
			]).allowDiskUse(true);
			return makeVocab(
				r?.n?.[0]?.n || 0,
				(r?.df || []).map((x: any) => [x._id, x.df]),
				(r?.shown || []).map((x: any) => x._id),
				(r?.phon || []).map((x: any) => x._id)
			);
		},

		async candidates(spec: CandidateSpec) {
			const base = baseQuery(spec.hideOutOfStock);
			const all = spec.all.filter(usable);
			const whole: any[] = [];
			if (all.length) whole.push(all.length === 1 ? condQuery(all[0]) : { $and: all.map(condQuery) });
			if (spec.codes.length) whole.push({ codes: { $in: spec.codes } });
			if (!whole.length) return [];
			const first: any[] = await SearchDoc.find({ ...base, $or: whole }, SCORED).limit(spec.cap).lean();
			if (first.length >= spec.partialBelow || all.length < 2) return first;
			const seen = first.map(d => d._id);
			const more: any[] = await SearchDoc.find({ ...base, _id: { $nin: seen }, $or: all.map(condQuery) }, SCORED)
				.limit(Math.min(spec.partialCap, spec.cap - first.length))
				.lean();
			return [...first, ...more];
		},

		async browse(spec: BrowseSpec) {
			const base = baseQuery(spec.hideOutOfStock);
			const query = { ...base, ...filterQuery(spec.filters) };
			const sort = { ...(spec.hideOutOfStock ? {} : { 'facets.inStock': -1 as const }), ...SORTS[spec.sort], _id: 1 as const };
			const [docs, total, facetDocs] = await Promise.all([
				SearchDoc.find(query, SCORED).sort(sort).skip(spec.skip).limit(spec.limit).lean(),
				SearchDoc.countDocuments(query),
				// Counts: over the category picked (so its sub-categories are counted), every other filter left to facetCounts.
				spec.facets ? SearchDoc.find({ ...base, ...filterQuery({ categories: spec.filters.categories }) }, { facets: 1 }).lean() : Promise.resolve(undefined),
			]);
			return { docs, total, facetDocs };
		},
	};
};
