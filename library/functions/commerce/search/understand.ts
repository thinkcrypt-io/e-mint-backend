/**
 * Store search — what a query asks for besides its words (docs/search SI8). Pure.
 *
 *   "red dress under 2k"        → words "dress" · price ≤ 2000 · Colour red (a lift: a red dress first)
 *   "cheapest aarong saree"     → words "saree" · sort price · brand Aarong
 *   "polo size m"               → words "polo" · Size M (a filter: asked for by name)
 *   "৫০০ টাকার নিচে কুর্তা"      → words "কুর্তা" · price ≤ 500
 *   "shoes for men in stock"    → words "shoes men" · in stock
 *
 * What it recognises is taken out of the words. Prices, sorting and "in stock" / "on sale" are always the
 * shopper's; option values and brands come only from what the store actually sells. A size or colour named outright
 * ("size m", "colour red") is a filter; one that's just a word ("red") only lifts the products that have it, so "red
 * berry candle" still finds the candle. A category named in the query lifts its products a little, never filters.
 */
import { clean, normalise } from './normalise.js';

export type Knowledge = {
	/** Option name key ("size") → its name as written, and value key ("m") → value as written. */
	options: Map<string, { name: string; values: Map<string, string> }>;
	/** Brands: their normalised words and id. */
	brands: { _id: string; name: string; words: string[] }[];
	/** Categories: their normalised words and id. */
	categories: { _id: string; name: string; words: string[] }[];
};

export type Understood = {
	/** The words left to match. */
	text: string;
	price?: { gte?: number; lte?: number };
	sort?: 'price' | '-price' | 'newest' | 'popular';
	inStock?: boolean;
	onSale?: boolean;
	/** Option values found: `filter` when asked for by name, else `boost`. */
	options: { key: string; name: string; value: string; label: string; as: 'filter' | 'boost' }[];
	brand?: { _id: string; name: string };
	category?: { _id: string; name: string };
	/** Words dropped as filler ("for", "the", "চাই"). */
	dropped: string[];
};

export const emptyKnowledge = (): Knowledge => ({ options: new Map(), brands: [], categories: [] });

/* ------------------------------------------------------------------- prices */

const CURRENCY = '(?:৳|tk\\.?|taka|bdt|টাকা(?:র)?)';
const NUM = '(\\d+(?:\\.\\d+)?)\\s*(k|hajar|হাজার)?';
const amount = (n: string, k?: string) => Math.round(Number(n) * (k ? 1000 : 1));
const re = (s: string) => new RegExp(s, 'iu');
// Word edges that also work next to Bangla letters (\b doesn't).
const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

const PRICE_RULES: { re: RegExp; set: (m: RegExpMatchArray) => { gte?: number; lte?: number } }[] = [
	// between 1000 and 2000 · 1000 to 2000 · 1k-2k · ৳1000–2000
	{ re: re(`${B}(?:between\\s+|from\\s+)?${CURRENCY}?\\s*${NUM}\\s*${CURRENCY}?\\s*(?:-|–|to|and|থেকে)\\s*${CURRENCY}?\\s*${NUM}\\s*${CURRENCY}?${E}`), set: m => ({ gte: amount(m[1], m[2]), lte: amount(m[3], m[4]) }) },
	// under 2000 · below ৳1500 · less than 1k · up to 2,000 · within 500 · max 900
	{ re: re(`${B}(?:under|below|less\\s+than|lower\\s+than|up\\s*to|upto|within|max(?:imum)?|cheaper\\s+than|<)\\s*${CURRENCY}?\\s*${NUM}\\s*${CURRENCY}?${E}`), set: m => ({ lte: amount(m[1], m[2]) }) },
	// over 5000 · above ৳1000 · more than 2k · min 500 · from 800
	{ re: re(`${B}(?:over|above|more\\s+than|higher\\s+than|min(?:imum)?|from|>)\\s*${CURRENCY}?\\s*${NUM}\\s*${CURRENCY}?${E}`), set: m => ({ gte: amount(m[1], m[2]) }) },
	// ৫০০ টাকার নিচে · 500 এর নিচে · 500 এর মধ্যে · 500 টাকার কমে
	{ re: re(`${B}${NUM}\\s*(?:${CURRENCY}|এর)?\\s*(?:নিচে|নীচে|মধ্যে|কমে|কম)${E}`), set: m => ({ lte: amount(m[1], m[2]) }) },
	// 500 এর বেশি · 500 টাকার উপরে
	{ re: re(`${B}${NUM}\\s*(?:${CURRENCY}|এর)?\\s*(?:বেশি|উপরে|ওপরে)${E}`), set: m => ({ gte: amount(m[1], m[2]) }) },
	// 2000 taka · ৳1500 · 2k tk — a price on its own: up to it
	{ re: re(`${B}${CURRENCY}\\s*${NUM}${E}|${B}${NUM}\\s*${CURRENCY}${E}`), set: m => ({ lte: m[1] ? amount(m[1], m[2]) : amount(m[3], m[4]) }) },
];

/* -------------------------------------------------------------- sort, filters */

const SORT_RULES: { re: RegExp; sort: Understood['sort'] }[] = [
	{ re: re(`${B}(?:cheapest|lowest\\s+price|low\\s+price|cheap|budget|সস্তা|কম\\s+দাম(?:ের|ে)?)${E}`), sort: 'price' },
	{ re: re(`${B}(?:most\\s+expensive|highest\\s+price|premium|luxury|দামি)${E}`), sort: '-price' },
	{ re: re(`${B}(?:newest|latest|new\\s+arrivals?|new\\s+in|নতুন)${E}`), sort: 'newest' },
	{ re: re(`${B}(?:best\\s*sell(?:ing|ers?)|bestsellers?|popular|trending|top\\s+selling|জনপ্রিয়)${E}`), sort: 'popular' },
];
const STOCK = re(`${B}(?:in\\s+stock|available|স্টকে(?:\\s+আছে)?)${E}`);
const SALE = re(`${B}(?:on\\s+sale|on\\s+offer|discounted|ছাড়ে|অফারে)${E}`);

/** Filler words: dropped unless they're all there is. */
const STOP = new Set(
	'the a an for of with and or in on to at by my me i we want need show find buy get please some any looking look something this that these those is are best good nice new size colour color এর জন্য ও এবং আর দাও চাই কিছু একটা দেখাও'.split(' ')
);

/** "size m" · "size: 42" · "colour red" (name first) and "m size" · "red colour" (value first) → an option value. */
const NAME_FIRST = (names: string[]) => new RegExp(`${B}(${names.join('|')})\\s*:?\\s*([\\p{L}\\p{N}]+)${E}`, 'giu');
const VALUE_FIRST = (names: string[]) => new RegExp(`${B}([\\p{L}\\p{N}]+)\\s+(${names.join('|')})${E}`, 'giu');
const COLOUR_KEYS = ['colour', 'color', 'রং', 'রঙ'];

const words = (s: string) => normalise(s).words;
const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i]);
/** Where `needle` sits in `hay`, as whole words; -1 when it doesn't. */
const findWords = (hay: string[], needle: string[]) => {
	if (!needle.length) return -1;
	for (let i = 0; i + needle.length <= hay.length; i++) if (sameWords(hay.slice(i, i + needle.length), needle)) return i;
	return -1;
};

/** Reads a query. `k`: what the store sells (option values, brands, categories). */
export const understand = (raw: string, k: Knowledge = emptyKnowledge()): Understood => {
	let s = clean(String(raw ?? '').slice(0, 100)).replace(/,/g, ' ');
	const out: Understood = { text: '', options: [], dropped: [] };
	const take = (r: RegExp) => {
		const m = s.match(r);
		if (m) s = (s.slice(0, m.index) + ' ' + s.slice((m.index || 0) + m[0].length)).replace(/\s+/g, ' ').trim();
		return m;
	};

	for (const rule of PRICE_RULES) {
		const m = take(rule.re);
		if (m) {
			const p = rule.set(m);
			if (p.gte != null && p.lte != null && p.gte > p.lte) [p.gte, p.lte] = [p.lte, p.gte];
			out.price = p;
			break;
		}
	}
	for (const rule of SORT_RULES)
		if (take(rule.re)) {
			out.sort = rule.sort;
			break;
		}
	if (take(STOCK)) out.inStock = true;
	if (take(SALE)) out.onSale = true;

	// Options asked for by name: the store's option names, plus colour spellings for a Colour option.
	const optionByName = new Map<string, string>(); // a word naming an option → its key
	for (const [key, o] of k.options) {
		optionByName.set(key, key);
		for (const w of words(o.name)) optionByName.set(w, key);
		if (COLOUR_KEYS.includes(key)) for (const c of COLOUR_KEYS) optionByName.set(c, key);
	}
	if (optionByName.size) {
		const names = [...optionByName.keys()].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		// Each "size m" / "m size" whose value the store sells; any other stays as words.
		const found: { at: number; len: number; key: string; value: string; label: string }[] = [];
		const consider = (nameWord: string, valueText: string, at: number, len: number) => {
			const key = optionByName.get(nameWord.toLowerCase());
			const value = words(valueText).join('');
			const label = key ? k.options.get(key)?.values.get(value) : undefined;
			if (key && label && !found.some(f => at < f.at + f.len && f.at < at + len)) found.push({ at, len, key, value, label });
		};
		for (const m of s.matchAll(NAME_FIRST(names))) consider(m[1], m[2], m.index!, m[0].length);
		for (const m of s.matchAll(VALUE_FIRST(names))) consider(m[2], m[1], m.index!, m[0].length);
		for (const f of found.sort((a, b) => b.at - a.at)) s = (s.slice(0, f.at) + ' ' + s.slice(f.at + f.len)).replace(/\s+/g, ' ').trim();
		for (const f of found.sort((a, b) => a.at - b.at).slice(0, 3)) out.options.push({ key: f.key, name: k.options.get(f.key)!.name, value: f.value, label: f.label, as: 'filter' });
	}

	let ws = words(s);

	// A brand named in full (its words together): the brand, and its words leave the query.
	const brand = [...k.brands].sort((a, b) => b.words.length - a.words.length).find(b => findWords(ws, b.words) >= 0);
	if (brand && ws.length > brand.words.length) {
		const at = findWords(ws, brand.words);
		ws = [...ws.slice(0, at), ...ws.slice(at + brand.words.length)];
		out.brand = { _id: brand._id, name: brand.name };
	}

	// Option values said as plain words (2+ letters, e.g. "red", "xl"): a lift, and the word stays to match.
	for (const w of ws) {
		if ([...w].length < 2) continue;
		for (const [key, o] of k.options) {
			const label = o.values.get(w);
			if (label && !out.options.some(x => x.key === key && x.value === w)) out.options.push({ key, name: o.name, value: w, label, as: 'boost' });
		}
	}

	// A category named in the query: a lift.
	const cat = [...k.categories].sort((a, b) => b.words.length - a.words.length).find(c => findWords(ws, c.words) >= 0);
	if (cat) out.category = { _id: cat._id, name: cat.name };

	// Filler words go, unless that's all there is.
	const kept = ws.filter(w => !STOP.has(w));
	if (kept.length) {
		out.dropped = ws.filter(w => STOP.has(w));
		ws = kept;
	}
	out.text = ws.join(' ');
	return out;
};

/** Whether anything besides the words was understood. */
export const understoodAnything = (u: Understood) => !!(u.price || u.sort || u.inStock || u.onSale || u.options.length || u.brand || u.category);
