/**
 * Store search — one normaliser for documents and queries (docs/search SI6).
 *
 * Whatever a product is called and however a shopper types, both go through here, so they meet in the same words:
 *   "Men's T-Shirts"   → men · tshirt          (stems: men · tshirt)
 *   "t shirt", "tshirt" → tshirt
 *   "৫০০ মিলি", "500 ml", "500ML" → 500ml
 *   "Dresses"          → dresses               (stem: dress)
 *   "AB-12.5"          → ab-12.5               (a code: no stem, no typos, compared as "ab125")
 *
 * Pure functions, no database (unit tests in ./test). The engine (SI-04) indexes `words`, `stems` and `phon`;
 * typos, synonyms and query understanding (price, sizes…) come later, on top of these tokens.
 */
import { phonKey } from './banglish.js';

/** What a token is: an English / Banglish word, a Bangla word, a number (units joined), or a code (SKU, model). */
export type TokenKind = 'word' | 'bn' | 'num' | 'code';

export type Token = {
	/** The cleaned word, as shown and matched exactly. */
	word: string;
	/** The light English stem for a word; a code's compare form ("ab125"); otherwise the word itself. */
	stem: string;
	/** The Banglish key (SI7), '' for numbers, codes and words too short to have one. */
	phon: string;
	kind: TokenKind;
};

export type Normalised = {
	tokens: Token[];
	/** Every token's word, in order (for phrase matches). */
	words: string[];
	/** Each stem once. */
	stems: string[];
	/** Each Banglish key once. */
	phon: string[];
};

/* ----------------------------------------------------------- cleaning the text */

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const BANGLA = /[\u0980-\u09FF]/;
const LETTER = new RegExp('\\p{L}', 'u');
const DIGIT = /[0-9]/;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/**
 * The text before it is cut into words: NFKC (one form for look-alike letters, and Bangla's nukta letters য় ড় ঢ়
 * always as letter + nukta), lower case, accents off Latin letters, Bangla digits as 0–9, ৎ written one way,
 * zero-width joiners and soft hyphens gone, thousands commas out of numbers, an inch mark as "inch".
 */
export const clean = (text: string): string => {
	let s = String(text ?? '').normalize('NFKC').toLowerCase();
	// Accents off Latin letters only: Bangla vowel signs are marks too, and must stay.
	s = s.normalize('NFD').replace(/[\u0300-\u036F]/g, '').normalize('NFKC');
	s = s.replace(/[০-৯]/g, d => String(BANGLA_DIGITS.indexOf(d)));
	// ৎ: also typed as ত + hasanta + zero-width joiner, or a word-final ত + hasanta.
	s = s.replace(/\u09A4\u09CD\u200D/g, '\u09CE').replace(/\u09A4\u09CD(?![\u0980-\u09FF])/g, '\u09CE');
	s = s.replace(ZERO_WIDTH, '');
	s = s.replace(/[’'`´]/g, ''); // men's → mens
	s = s.replace(/(\d),(?=\d{3}\b)/g, '$1'); // 1,500 → 1500
	s = s.replace(/(\d)\s*(?:"|”|″|′′|''|inches\b|inch\b)/g, '$1 inch'); // NFKC writes ″ as ′′
	return s;
};

/* --------------------------------------------------------------------- units */

/** Unit spellings → one form. Only after a number ("500 ml", "500ml"); on its own "l" or "g" is just a letter. */
const UNITS: Record<string, string> = {
	ml: 'ml', mls: 'ml', 'মিলি': 'ml', 'এমএল': 'ml', milliliter: 'ml', millilitre: 'ml',
	l: 'l', ltr: 'l', ltrs: 'l', liter: 'l', litre: 'l', liters: 'l', litres: 'l', 'লিটার': 'l',
	g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gr: 'g', 'গ্রাম': 'g',
	kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', 'কেজি': 'kg',
	mg: 'mg',
	inch: 'inch', 'ইঞ্চি': 'inch',
	cm: 'cm', mm: 'mm', ft: 'ft', feet: 'ft', foot: 'ft', 'ফুট': 'ft', yard: 'yard', yards: 'yard', 'গজ': 'yard',
	oz: 'oz',
	gb: 'gb', tb: 'tb', mb: 'mb', mah: 'mah', mp: 'mp',
	w: 'w', watt: 'w', watts: 'w', 'ওয়াট': 'w', kw: 'kw', v: 'v', volt: 'v', volts: 'v', hz: 'hz',
	pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', 'পিস': 'pcs', pack: 'pack', packs: 'pack',
};
const unitOf = (s: string) => UNITS[s.normalize('NFKC')];

/* ------------------------------------------------------------ the stemmer */

/** Whole-word forms the rules would get wrong. */
const STEM_WORDS: Record<string, string> = {
	shoes: 'shoe', toes: 'toe',
	jeans: 'jeans', lens: 'lens', news: 'news', series: 'series', species: 'species',
	canvas: 'canvas', atlas: 'atlas', gas: 'gas', christmas: 'christmas', xmas: 'xmas', alias: 'alias',
	knives: 'knife', wives: 'wife', leaves: 'leaf', scarves: 'scarf', shelves: 'shelf', halves: 'half', wolves: 'wolf',
	clothes: 'cloth', children: 'child', feet: 'foot', teeth: 'tooth', mice: 'mouse',
	mens: 'men', womens: 'women',
};
/** Nouns that end in -ie, so "-ies" → "-ie", not "-y". */
const IE_NOUNS = new Set([
	'hoodie', 'cookie', 'movie', 'beanie', 'bootie', 'onesie', 'brownie', 'smoothie', 'selfie', 'zombie', 'goodie',
	'rookie', 'sweetie', 'pixie', 'calorie', 'genie', 'magpie', 'veggie', 'nightie', 'boogie', 'birdie', 'collie',
	'freebie', 'groupie', 'indie', 'junkie', 'kiddie', 'newbie', 'auntie', 'bestie', 'lassie', 'prairie', 'cowrie',
]);
const VOWEL = /[aeiouy]/;

const undouble = (s: string) => (/([b-df-hj-np-rtv-xz])\1$/.test(s) && !/(ll|ss|zz)$/.test(s) ? s.slice(0, -1) : s);

/**
 * A light English stemmer (plurals, then -ing / -ed) — not Porter, which is far too eager for product names
 * ("university" → "univers"). It only has to make a word and its plural meet; documents and queries both use it.
 */
export const stem = (w: string): string => {
	if (w.length <= 3 || !/^[a-z]+$/.test(w)) return w;
	if (STEM_WORDS[w]) return STEM_WORDS[w];
	let s = w;
	if (s.endsWith('ies') && s.length > 5) s = IE_NOUNS.has(s.slice(0, -1)) ? s.slice(0, -1) : s.slice(0, -3) + 'y';
	else if (/(sses|xes|ches|shes|zzes)$/.test(s)) s = s.slice(0, -2);
	else if (s.endsWith('oes') && s.length > 5) s = s.slice(0, -2);
	else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
	if (s.endsWith('ing') && s.length - 3 >= 5 && VOWEL.test(s.slice(0, -3))) s = undouble(s.slice(0, -3));
	else if (s.endsWith('ed') && !s.endsWith('eed') && s.length - 2 >= 4 && VOWEL.test(s.slice(0, -2))) s = undouble(s.slice(0, -2));
	return s;
};

/** A code compared without its punctuation: "AB-12.5" and "ab125" are the same SKU. */
export const codeKey = (s: string) => s.toLowerCase().replace(/[-./\s_]/g, '');

/* --------------------------------------------------------------- tokens */

const SEPARATOR = new RegExp('[^\\p{L}\\p{M}\\p{N}\\-./]+', 'u');
const LETTERS_ONLY = new RegExp('^[\\p{L}\\p{M}]+$', 'u');
const NUMBER = /^\d+(?:\.\d+)?$/;
const NUMBER_UNIT = new RegExp('^(\\d+(?:\\.\\d+)?)([\\p{L}\\p{M}]+)$', 'u');

const trimPunct = (s: string) => s.replace(/^[-./]+|[-./]+$/g, '');
const short = (s: string) => [...s].length <= 2;

/** One chunk between spaces / punctuation → its raw pieces. */
const pieces = (chunk: string): string[] => {
	const c = trimPunct(chunk);
	if (!c) return [];
	if (DIGIT.test(c)) {
		if (LETTER.test(c)) return [c]; // a code or "500ml": kept whole
		// Numbers only: 1000-2000 → two numbers; 2.5 stays.
		return c.split(/[-/]+/).map(trimPunct).filter(Boolean);
	}
	// Letters only: split on dots and slashes (black/white); a hyphen joins a short side (t-shirt, v-neck, e-book)
	// and splits two long ones (high-waist → high · waist).
	const out: string[] = [];
	for (const part of c.split(/[./]+/).filter(Boolean)) {
		const bits = part.split('-').filter(Boolean);
		let cur = bits[0] ?? '';
		for (let i = 1; i < bits.length; i++) {
			if (short(cur) || short(bits[i])) cur += bits[i];
			else {
				out.push(cur);
				cur = bits[i];
			}
		}
		if (cur) out.push(cur);
	}
	return out;
};

const kindOf = (w: string): TokenKind => {
	if (NUMBER.test(w)) return 'num';
	if (NUMBER_UNIT.test(w) && unitOf(w.match(NUMBER_UNIT)![2])) return 'num';
	if (DIGIT.test(w)) return 'code';
	return BANGLA.test(w) ? 'bn' : 'word';
};

const toToken = (word: string): Token => {
	const kind = kindOf(word);
	if (kind === 'num') return { word, stem: word, phon: '', kind };
	if (kind === 'code') return { word, stem: codeKey(word), phon: '', kind };
	if (kind === 'bn') return { word, stem: word, phon: phonKey(word), kind };
	const s = stem(word);
	return { word, stem: s, phon: phonKey(s) || phonKey(word), kind };
};

/** Cleaned text → tokens, with the joins of SI6 (t shirt → tshirt, 500 ml → 500ml). */
export const tokenise = (text: string): Token[] => {
	const raw = clean(text).split(SEPARATOR).flatMap(pieces);
	const out: string[] = [];
	for (let i = 0; i < raw.length; i++) {
		let w = raw[i];
		// "500ml", "1.5ltr", "32inch": one unit spelling.
		const nu = w.match(NUMBER_UNIT);
		if (nu && unitOf(nu[2])) w = nu[1] + unitOf(nu[2]);
		// "500 ml": the number takes the unit.
		if (NUMBER.test(w) && raw[i + 1] && unitOf(raw[i + 1])) {
			out.push(w + unitOf(raw[i + 1]));
			i++;
			continue;
		}
		// "t shirt", "v neck", "e book", "x ray": these letters join the word after them. Others stay ("l size").
		if (/^[tvex]$/.test(w) && raw[i + 1] && /^[a-z]+$/.test(raw[i + 1])) {
			out.push(w + raw[i + 1]);
			i++;
			continue;
		}
		out.push(w);
	}
	return out.filter(w => LETTERS_ONLY.test(w) || DIGIT.test(w)).map(toToken);
};

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** A text → its tokens, words, stems and Banglish keys. */
export const normalise = (text: string): Normalised => {
	const tokens = tokenise(text);
	return {
		tokens,
		words: tokens.map(t => t.word),
		stems: unique(tokens.map(t => t.stem)),
		phon: unique(tokens.map(t => t.phon)),
	};
};

/**
 * A shopper's query: the same tokens, plus the text as typed (trimmed, at most 100 characters) for the parts that
 * read it whole — price phrases and exact SKU / barcode hits (SI8, docs/search SI-09).
 */
export const normaliseQuery = (q: string): Normalised & { raw: string; codes: string[] } => {
	const raw = String(q ?? '').trim().slice(0, 100);
	const n = normalise(raw);
	const codes = unique([...n.tokens.filter(t => t.kind === 'code' || t.kind === 'num').map(t => codeKey(t.word)), raw ? codeKey(clean(raw)) : '']);
	return { ...n, raw, codes };
};
