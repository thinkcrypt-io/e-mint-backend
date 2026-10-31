import CourierAreaMap from '../../models/tenancy/courierAreaMap.model.js';
import { optionsFor } from './connections.js';
import type { Choice } from './couriers/types.js';

/**
 * Courier areas for Send to courier (docs/couriers CR14, CR-10): Pathao takes
 * city → zone → area ids, RedX one area id; Steadfast reads the address. The
 * order's area and city are matched against the courier's own lists (kept a
 * day), and a pick someone made is remembered for the next order from there.
 */

export type Picks = { city?: string; cityName?: string; zone?: string; zoneName?: string; area?: string; areaName?: string };

/** "Mirpur-10 ", "mirpur 10" → "mirpur 10". */
export const plain = (s: any) =>
	String(s ?? '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

export const keyOf = (r: { area?: string; city?: string }) => [plain(r.area), plain(r.city)].filter(Boolean).join(' | ');

/** The one choice that matches: the same name, else starting with it, else containing it — never a tie. */
export const matchChoice = (choices: Choice[], text: string): Choice | null => {
	const w = plain(text);
	if (!w || !choices.length) return null;
	for (const test of [(l: string) => l === w, (l: string) => l.startsWith(w) || w.startsWith(l), (l: string) => l.includes(w) || w.includes(l)]) {
		const hits = choices.filter(c => test(plain(c.label)));
		if (hits.length === 1) return hits[0];
		if (hits.length > 1) return null;
	}
	return null;
};

/** Words to try for each level: the order's area first, then its city, then each part of the address. */
const words = (r: { area?: string; city?: string; address?: string }) =>
	[r.area, r.city, ...String(r.address || '').split(/[,\n]/)].map(x => String(x || '').trim()).filter(x => x.length > 1);

const pick = (choices: Choice[], tries: string[]) => {
	for (const t of tries) {
		const c = matchChoice(choices, t);
		if (c) return c;
	}
	return null;
};

/** Couriers that need area ids. */
export const NEEDS_AREA = new Set(['pathao', 'redx']);

/**
 * The picks for one order's recipient: remembered first, else matched from the courier's lists.
 * `remembered: false` lists only (bulk send), never a guess.
 */
export const suggestAreas = async (courier: string, recipient: any, { match = true } = {}): Promise<{ picks: Picks; from: 'remembered' | 'matched' | 'none' }> => {
	if (!NEEDS_AREA.has(courier)) return { picks: {}, from: 'none' };
	const key = keyOf(recipient);
	if (key) {
		const kept: any = await CourierAreaMap.findOne({ courier, key }).lean();
		if (kept?.picks?.area) return { picks: kept.picks, from: 'remembered' };
	}
	if (!match) return { picks: {}, from: 'none' };
	const tries = words(recipient);
	try {
		if (courier === 'pathao') {
			const cities = (await optionsFor(courier, 'cities')).choices;
			const city = pick(cities, [recipient.city, ...tries].filter(Boolean)) || (cities.length === 1 ? cities[0] : null);
			if (!city) return { picks: {}, from: 'none' };
			const out: Picks = { city: city.value, cityName: city.label };
			const zone = pick((await optionsFor(courier, 'zones', city.value)).choices, tries);
			if (zone) {
				Object.assign(out, { zone: zone.value, zoneName: zone.label });
				const area = pick((await optionsFor(courier, 'areas', zone.value)).choices, tries);
				if (area) Object.assign(out, { area: area.value, areaName: area.label });
			}
			return { picks: out, from: 'matched' };
		}
		// RedX: the flat list, narrowed by the city (its district) when there is one.
		const list = (await optionsFor(courier, 'areas', recipient.city || undefined)).choices;
		const area = pick(list, tries);
		return area ? { picks: { area: area.value, areaName: area.label }, from: 'matched' } : { picks: {}, from: 'none' };
	} catch {
		return { picks: {}, from: 'none' };
	}
};

/** A send's picks remembered for the next order from the same area and city. */
export const rememberAreas = async (courier: string, recipient: any, picks: Picks) => {
	const key = keyOf(recipient);
	if (!NEEDS_AREA.has(courier) || !key || !picks?.area) return;
	const clean: Picks = Object.fromEntries(Object.entries(picks).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v).slice(0, 120)]));
	await CourierAreaMap.updateOne({ courier, key }, { $set: { picks: clean, lastUsedAt: new Date() }, $inc: { uses: 1 } }, { upsert: true });
};
