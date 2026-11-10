/**
 * Store search — the Banglish key (docs/search SI7).
 *
 * Shoppers in Bangladesh type a product's name in Bangla script ("শাড়ি"), in Banglish ("shari", "sari") or in
 * English spelling ("saree"). `phonKey` turns any of them into one short key, so a Latin query finds a Bangla name
 * and the other way round.
 *
 * The key is the word's consonant skeleton: the sounds that both scripts write the same way, with vowels dropped
 * (they're spelt every which way in Banglish), except one class letter for a vowel the word starts with ('a' or 'i').
 *   শাড়ি · shari · sari · saree   → "sr"
 *   পাঞ্জাবি · panjabi · punjabi  → "pnjb"
 *   ওয়াচ · watch                  → "ac"
 * It is lossy on purpose ("shirt" and "short" share "srt"), so the engine uses it as a weak match (0.6, SI10),
 * never ahead of an exact or stemmed one. Words the rules get wrong ("ব্লাউজ" vs "blouse") are fixed by the
 * starter list in `packs/banglishWords.ts`: every spelling in a row gets the row's key.
 *
 * Input is expected to be cleaned by `normalise.ts` first (lower case, NFKC: nukta letters decomposed).
 */
import { BANGLISH_WORDS } from './packs/banglishWords.js';

const HASANTA = '\u09CD';
const NUKTA = '\u09BC';

/** Bangla consonants → the Latin sound both scripts share. */
const CONSONANT: Record<string, string> = {
	'ক': 'k', 'খ': 'k', 'গ': 'g', 'ঘ': 'g', 'ঙ': 'n',
	'চ': 'c', 'ছ': 'c', 'জ': 'j', 'ঝ': 'j', 'ঞ': 'n',
	'ট': 't', 'ঠ': 't', 'ড': 'd', 'ঢ': 'd', 'ণ': 'n',
	'ত': 't', 'থ': 't', 'দ': 'd', 'ধ': 'd', 'ন': 'n',
	'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'b', 'ম': 'm',
	'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 's', 'ষ': 's', 'স': 's', 'হ': 'h',
	'ৎ': 't', 'ং': 'n',
	// Precomposed nukta letters, in case a caller skipped NFKC.
	'\u09DC': 'r', '\u09DD': 'r', '\u09DF': '', // ড় ঢ় য় written as one letter
};
/** Independent vowels: kept only at the start of a word, as a class letter. */
const VOWEL: Record<string, string> = {
	'অ': 'a', 'আ': 'a', 'উ': 'a', 'ঊ': 'a', 'ও': 'a', 'ঔ': 'a',
	'ই': 'i', 'ঈ': 'i', 'এ': 'i', 'ঐ': 'i',
	'ঋ': 'r',
};
/** Vowel signs, chandrabindu and visarga are dropped — except ৃ, which says ri. */
const SIGN_R = '\u09C3';

const finish = (s: string) => {
	const k = s
		.replace(/(.)\1+/g, '$1') // ss → s, tt → t
		.replace(/ng/g, 'n') // ring = রিং, lungi = লুঙ্গি, bank = ব্যাংক
		.replace(/(.)\1+/g, '$1')
		.replace(/(.)h$/, '$1') // tasbih = তসবিহ
		.replace(/^(..+)s$/, '$1'); // a plural s: sneakers = স্নিকার্স = sneaker, sarees = saree
	return k.length >= 2 ? k : '';
};

/** The key of a word in Bangla script. */
const banglaKey = (word: string) => {
	const ch = [...word];
	let out = '';
	for (let i = 0; i < ch.length; i++) {
		const c = ch[i];
		if (i === 0 && VOWEL[c]) {
			out += VOWEL[c];
			continue;
		}
		if (c === SIGN_R) {
			out += 'r';
			continue;
		}
		if (c in CONSONANT) {
			const afterHasanta = ch[i - 1] === HASANTA;
			// য-ফলা (ব্যাগ, স্যান্ডেল) is a vowel colour, not a sound.
			if (afterHasanta && c === 'য') continue;
			// ব-ফলা (বিশ্ব, স্বাদ) doubles the consonant before it — except after ম (কম্বল: kombol).
			if (afterHasanta && c === 'ব' && ch[i - 2] !== 'ম') continue;
			if (ch[i + 1] === NUKTA) {
				if (c === 'ড' || c === 'ঢ') out += 'r';
				// য় is a glide between vowels: nothing.
				i++;
				continue;
			}
			out += CONSONANT[c];
		}
		// Vowel signs, hasanta, nukta, chandrabindu, anything else: nothing.
	}
	return finish(out);
};

const VOWELS = /[aeiouyw]/;

/** The key of a word in Latin letters (Banglish or English spelling). */
const latinKey = (word: string) => {
	let s = word.replace(/[^a-z]/g, '');
	if (!s) return '';
	s = s
		.replace(/^kn/, 'n')
		.replace(/^wr/, 'r')
		.replace(/^ps/, 's')
		.replace(/^gn/, 'n')
		.replace(/^wh/, 'w')
		.replace(/^x/, 's')
		.replace(/[ts]ion/g, 'sn') // lotion = লোশন, collection = কালেকশন
		.replace(/tch|chh|ch/g, 'C') // C: চ / ছ, kept apart from a hard c
		.replace(/sh/g, 's')
		.replace(/ph/g, 'f')
		.replace(/th/g, 't')
		.replace(/dh/g, 'd')
		.replace(/kh/g, 'k')
		.replace(/gh/g, 'g')
		.replace(/bh/g, 'b')
		.replace(/[jz]h/g, 'j')
		.replace(/ck/g, 'k')
		.replace(/qu?/g, 'k')
		.replace(/x/g, 'ks')
		.replace(/z/g, 'j') // জ / য are both z and j in Banglish
		.replace(/v/g, 'b') // ভ = bh = v
		.replace(/c(?=[eiy])/g, 's') // price, necklace
		.replace(/c/g, 'k')
		.replace(/C/g, 'c');
	// No soft-g rule: it would part lungi from লুঙ্গি. Words like charger = চার্জার are in the starter list.
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (VOWELS.test(c)) {
			if (i === 0) out += /[eiy]/.test(c) ? 'i' : 'a';
			continue;
		}
		out += c;
	}
	return finish(out);
};

const BANGLA = /[\u0980-\u09FF]/;

const rawKey = (word: string) => (BANGLA.test(word) ? banglaKey(word) : latinKey(word));

/** Every spelling in the starter list → its row's key (the first Latin spelling's). */
const OVERRIDES: Map<string, string> = (() => {
	const m = new Map<string, string>();
	for (const row of BANGLISH_WORDS) {
		const latin = row.find(w => !BANGLA.test(w));
		const key = latin ? latinKey(latin) : rawKey(row[0]);
		if (!key) continue;
		for (const w of row) m.set(w.normalize('NFKC').toLowerCase(), key);
	}
	return m;
})();

/**
 * The Banglish key of one cleaned word, or '' when the word is too short to say anything (one sound) or has no
 * letters. Numbers and codes never get a key (the caller skips them).
 */
export const phonKey = (word: string): string => {
	if (!word) return '';
	return OVERRIDES.get(word) ?? rawKey(word);
};

/** For tests: the key by the rules alone, without the starter list. */
export const phonKeyByRules = rawKey;
