import Country from '../models/tenancy/country.model.js';
import Organization from '../models/tenancy/organization.model.js';
import { COUNTRIES } from '../data/countries.js';
import { COUNTRY_ASSETS } from '../data/countryAssets.js';

/**
 * Countries (docs/widgets W-02): the built-in list added to the database at
 * boot, and a small in-memory copy of the active ones so every organization
 * response can say which payment providers it's offered without a query.
 */

export type CountryView = {
	code: string;
	code3: string;
	name: string;
	nativeName: string;
	dialCode: string;
	flag: string;
	currency: { code?: string; symbol?: string; name?: string };
	region: string;
	paymentProviders: string[];
	priority: number;
};

const view = (c: any): CountryView => ({
	code: c.code,
	code3: c.code3 || '',
	name: c.name,
	nativeName: c.nativeName || '',
	dialCode: c.dialCode || '',
	flag: c.flag || '',
	currency: c.currency || {},
	region: c.region || '',
	paymentProviders: c.paymentProviders || [],
	priority: c.priority || 0,
});

const byPriority = (a: CountryView, b: CountryView) => b.priority - a.priority || a.name.localeCompare(b.name);

/** Until the database answers, the built-in list stands in. */
let cache: CountryView[] = COUNTRIES.map(c => view(c)).sort(byPriority);
let loadedAt = 0;
const TTL_MS = 5 * 60 * 1000;

/** The active countries, highest priority first, then by name. */
export const listCountries = async (force = false): Promise<CountryView[]> => {
	if (!force && Date.now() - loadedAt < TTL_MS) return cache;
	const docs = await Country.find({ active: true }).lean();
	if (docs.length) cache = docs.map(view).sort(byPriority);
	loadedAt = Date.now();
	return cache;
};

/** An active country by its code, from the cached list. */
export const countryByCode = (code: any): CountryView | null => {
	const c = String(code || '').toUpperCase();
	return cache.find(x => x.code === c) || null;
};

/** The payment providers offered to an organization in `code`'s country — Stripe when it has none on file. */
export const providersFor = (code: any): string[] => countryByCode(code)?.paymentProviders || (code ? ['stripe'] : []);

/**
 * Adds each built-in country that's missing (by code), with its flag and map;
 * existing countries are left as edited, apart from pictures they don't have
 * yet. Then fills the cache.
 */
export const seedCountries = async () => {
	try {
		const have = new Map<string, any>((await Country.find({}, { code: 1, flagSvg: 1, mapSvg: 1 }).select('+flagSvg +mapSvg').lean()).map((c: any) => [c.code, c]));
		let added = 0;
		for (const c of COUNTRIES) {
			const assets = COUNTRY_ASSETS[c.code] || { flagSvg: '', mapSvg: '' };
			const existing = have.get(c.code);
			if (!existing) {
				await Country.create({ ...c, ...assets });
				added++;
			} else if ((!existing.flagSvg && assets.flagSvg) || (!existing.mapSvg && assets.mapSvg)) {
				await Country.updateOne(
					{ _id: existing._id },
					{ $set: { ...(!existing.flagSvg && { flagSvg: assets.flagSvg }), ...(!existing.mapSvg && { mapSvg: assets.mapSvg }) } }
				);
			}
		}
		if (added) console.log(`Countries: ${added} added`);
		await listCountries(true);
		await backfillOrganizations();
	} catch (e: any) {
		console.error(`Countries: ${e.message}`);
	}
};

/** One country's flag or map, as SVG text; null when it has none. */
export const countryPicture = async (code: string, which: 'flag' | 'map'): Promise<string | null> => {
	const field = which === 'flag' ? 'flagSvg' : 'mapSvg';
	const doc: any = await Country.findOne({ code: String(code).toUpperCase(), active: true }).select(`+${field}`).lean();
	return doc?.[field] || null;
};

/**
 * Organizations made before countries were asked for: where the old free-text
 * answer (onboarding.country) names a country we have — "Bangladesh", "bd",
 * "বাংলাদেশ" — it becomes the organization's country. The rest pick one in
 * their settings.
 */
const backfillOrganizations = async () => {
	const orgs: any[] = await Organization.find({ country: { $in: [null, ''] }, 'onboarding.country': { $nin: [null, ''] } }, { 'onboarding.country': 1 }).lean();
	let set = 0;
	for (const o of orgs) {
		const said = String(o.onboarding?.country || '').trim().toLowerCase();
		const c = cache.find(x => [x.name, x.nativeName, x.code, x.code3].some(v => v && v.toLowerCase() === said));
		if (!c) continue;
		await Organization.updateOne({ _id: o._id }, { $set: { country: c.code } });
		set++;
	}
	if (set) console.log(`Countries: ${set} organization(s) given their country from the sign-up answer`);
};
