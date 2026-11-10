/**
 * Store search — a store's search settings with their defaults (docs/search §4). They live in
 * `CommerceSettings.search` next to the indexer's `index` state; the panel edits them in SI-06.
 */
export type Dial = 'off' | 'low' | 'normal' | 'high';

export type SearchSettings = {
	enabled: boolean;
	typos: 'off' | 'normal' | 'loose';
	/** The store decides (README §8.4): show = listed after the in-stock products; hide = left out. */
	outOfStock: 'show' | 'hide';
	dials: { popularity: Dial; freshness: Dial; sale: Dial; learned: Dial };
	learning: boolean;
	banglish: boolean;
};

export const SEARCH_DEFAULTS: SearchSettings = {
	enabled: true,
	typos: 'normal',
	outOfStock: 'show',
	dials: { popularity: 'normal', freshness: 'normal', sale: 'normal', learned: 'normal' },
	learning: true,
	banglish: true,
};

const DIALS: Dial[] = ['off', 'low', 'normal', 'high'];
const dial = (v: any, d: Dial): Dial => (DIALS.includes(v) ? v : d);

/** The saved settings (anything missing or unknown → its default). */
export const searchSettingsOf = (raw: any): SearchSettings => {
	const s = raw && typeof raw === 'object' ? raw : {};
	const d = s.dials && typeof s.dials === 'object' ? s.dials : {};
	return {
		enabled: s.enabled !== false,
		typos: ['off', 'normal', 'loose'].includes(s.typos) ? s.typos : SEARCH_DEFAULTS.typos,
		outOfStock: s.outOfStock === 'hide' ? 'hide' : 'show',
		dials: {
			popularity: dial(d.popularity, 'normal'),
			freshness: dial(d.freshness, 'normal'),
			sale: dial(d.sale, 'normal'),
			learned: dial(d.learned, 'normal'),
		},
		learning: s.learning !== false,
		banglish: s.banglish !== false,
	};
};

/** A dial as a strength: off 0, low 0.5, normal 1, high 1.5. */
export const dialStrength = (d: Dial) => ({ off: 0, low: 0.5, normal: 1, high: 1.5 })[d];
