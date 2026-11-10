import { clean, codeKey, normalise, normaliseQuery, stem, tokenise } from '../normalise';
import { phonKey, phonKeyByRules } from '../banglish';
import { BANGLISH_WORDS } from '../packs/banglishWords';

// docs/search SI-02: one normaliser for product text and shoppers' queries (SI6), and the Banglish key (SI7).

const words = (s: string) => normalise(s).words;
const stems = (s: string) => normalise(s).stems;

describe('clean (SI6)', () => {
	it.each([
		['Saree', 'saree'],
		['CAFÉ Crème', 'cafe creme'],
		['Ｓｈｉｒｔ', 'shirt'], // full-width letters
		['৫০০', '500'],
		['১২৩৪৫৬৭৮৯০', '1234567890'],
		['Men’s', 'mens'],
		["Women's", 'womens'],
		['1,500', '1500'],
		['12,000,000', '12000000'],
		['32"', '32 inch'],
		['55″ TV', '55 inch tv'],
		['zero​width', 'zerowidth'],
		['soft­hyphen', 'softhyphen'],
	])('%s → %s', (input, out) => expect(clean(input)).toBe(out));

	it('writes Bangla nukta letters one way', () => {
		// য় typed as one letter (U+09DF) or as য + nukta: the same after cleaning.
		expect(clean('য়')).toBe(clean('য়'));
		expect(clean('ড়')).toBe(clean('ড়'));
		expect(clean('ঢ়')).toBe(clean('ঢ়'));
		expect(clean('শাড়ি')).toBe(clean('শাড়ি'));
	});

	it('writes ৎ one way', () => {
		expect(clean('উৎসব')).toBe(clean('উত্‍সব'));
		expect(clean('ভবিষ্যত্')).toBe('ভবিষ্যৎ');
	});

	it('keeps Bangla vowel signs (they are marks, not accents)', () => {
		expect(clean('পাঞ্জাবি')).toBe('পাঞ্জাবি');
		expect(clean('কুর্তা')).toBe('কুর্তা');
	});
});

describe('tokens (SI6)', () => {
	it.each([
		['T-Shirt', ['tshirt']],
		['t shirt', ['tshirt']],
		['tshirt', ['tshirt']],
		['V-Neck Top', ['vneck', 'top']],
		['v neck', ['vneck']],
		['e-book', ['ebook']],
		['X-Ray', ['xray']],
		['High-Waist Jeans', ['high', 'waist', 'jeans']],
		['black/white', ['black', 'white']],
		['Black & White', ['black', 'white']],
		['a dress', ['a', 'dress']],
		['i phone', ['i', 'phone']],
		['Oxford Shirt (Slim)', ['oxford', 'shirt', 'slim']],
		['  lots   of    space  ', ['lots', 'of', 'space']],
		['dress, red; size: M', ['dress', 'red', 'size', 'm']],
		['টি-শার্ট', ['টিশার্ট']],
		['জামদানি শাড়ি', ['জামদানি', 'শাড়ি']],
		['শাড়ি।', ['শাড়ি']],
		['লাল শাড়ি, নীল ব্লাউজ', ['লাল', 'শাড়ি', 'নীল', 'ব্লাউজ']],
		['', []],
		['---', []],
		['!!!', []],
	])('%s', (input, out) => expect(words(input)).toEqual(out));
});

describe('units and numbers (SI6)', () => {
	it.each([
		['500 ml', ['500ml']],
		['500ml', ['500ml']],
		['500ML', ['500ml']],
		['500 mL', ['500ml']],
		['1.5 L', ['1.5l']],
		['1.5ltr', ['1.5l']],
		['2 litre', ['2l']],
		['2 liters', ['2l']],
		['250 gm', ['250g']],
		['250 grams', ['250g']],
		['250g', ['250g']],
		['5 kg', ['5kg']],
		['5kgs', ['5kg']],
		['32 inch', ['32inch']],
		['32 inches', ['32inch']],
		['32"', ['32inch']],
		['32inch', ['32inch']],
		['128 GB', ['128gb']],
		['10000 mAh', ['10000mah']],
		['65 W charger', ['65w', 'charger']],
		['2 pcs', ['2pcs']],
		['3 pieces', ['3pcs']],
		['৫০০ মিলি', ['500ml']],
		['২ লিটার', ['2l']],
		['১ কেজি', ['1kg']],
		['৫০০ গ্রাম', ['500g']],
		['৩২ ইঞ্চি', ['32inch']],
		['1000-2000', ['1000', '2000']],
		['2.5', ['2.5']],
		['1,500', ['1500']],
		['size 42', ['size', '42']],
		['l size', ['l', 'size']], // a lone "l" is a letter, not litres
	])('%s → %j', (input, out) => expect(words(input)).toEqual(out));

	it('marks numbers and units as numbers (no typos on them later)', () => {
		expect(tokenise('500 ml 42').map(t => t.kind)).toEqual(['num', 'num']);
		expect(tokenise('500 ml').map(t => t.kind)).toEqual(['num']);
		expect(tokenise('size 42').map(t => t.kind)).toEqual(['word', 'num']);
	});
});

describe('codes (SKUs, models)', () => {
	it.each([
		['AB-12.5', 'ab-12.5', 'ab125'],
		['SKU-0042', 'sku-0042', 'sku0042'],
		['iPhone15', 'iphone15', 'iphone15'],
		['RTX3060', 'rtx3060', 'rtx3060'],
		['A1/B2', 'a1/b2', 'a1b2'],
		['4K', '4k', '4k'],
	])('%s', (input, word, key) => {
		const [t] = tokenise(input);
		expect(t.word).toBe(word);
		expect(t.kind).toBe('code');
		expect(t.stem).toBe(key);
		expect(t.phon).toBe('');
	});

	it('compares codes without punctuation', () => {
		expect(codeKey('AB-12.5')).toBe(codeKey('ab125'));
		expect(codeKey('ab 12_5')).toBe('ab125');
	});

	it('gives the query its codes, typed whole or in parts', () => {
		expect(normaliseQuery('AB-12.5').codes).toContain('ab125');
		expect(normaliseQuery('8 901234 567890').codes).toContain('8901234567890'); // a barcode typed with spaces
	});
});

describe('stem (SI6)', () => {
	it.each([
		['shirts', 'shirt'],
		['shirt', 'shirt'],
		['dresses', 'dress'],
		['dress', 'dress'],
		['glasses', 'glass'],
		['sunglasses', 'sunglass'],
		['watches', 'watch'],
		['boxes', 'box'],
		['brushes', 'brush'],
		['shoes', 'shoe'],
		['shoe', 'shoe'],
		['tomatoes', 'tomato'],
		['potatoes', 'potato'],
		['jeans', 'jeans'],
		['lens', 'lens'],
		['accessories', 'accessory'],
		['accessory', 'accessory'],
		['batteries', 'battery'],
		['hoodies', 'hoodie'],
		['hoodie', 'hoodie'],
		['cookies', 'cookie'],
		['beanies', 'beanie'],
		['ties', 'tie'],
		['scarves', 'scarf'],
		['knives', 'knife'],
		['earrings', 'earring'],
		['earring', 'earring'],
		['rings', 'ring'],
		['ring', 'ring'],
		['clothing', 'cloth'],
		['clothes', 'cloth'],
		['printed', 'print'],
		['printing', 'print'],
		['knitted', 'knit'],
		['padded', 'pad'],
		['embroidered', 'embroider'],
		['scented', 'scent'],
		['speed', 'speed'],
		['red', 'red'],
		['bed', 'bed'],
		['wedding', 'wedding'],
		['string', 'string'],
		['leggings', 'legging'],
		['mens', 'men'],
		['womens', 'women'],
		['kids', 'kid'],
		['bags', 'bag'],
		['bus', 'bus'],
		['canvas', 'canvas'],
		['sofas', 'sofa'],
		['keys', 'key'],
		['children', 'child'],
	])('%s → %s', (w, s) => expect(stem(w)).toBe(s));

	it('makes a word and its plural meet', () => {
		for (const [a, b] of [
			['Oxford Shirts', 'oxford shirt'],
			['Silk Dresses', 'silk dress'],
			['Gold Earrings', 'gold earring'],
			['Leather Watches', 'leather watch'],
			['Hoodies', 'hoodie'],
			['Accessories', 'accessory'],
		])
			expect(stems(a)).toEqual(stems(b));
	});

	it('leaves Bangla, numbers and codes unstemmed', () => {
		expect(stem('শাড়ি')).toBe('শাড়ি');
		expect(stems('শাড়িগুলো')).toEqual(['শাড়িগুলো']);
		expect(stems('42')).toEqual(['42']);
	});
});

describe('Banglish key (SI7)', () => {
	const same = (...xs: string[]) => {
		const keys = xs.map(x => phonKey(tokenise(x)[0].kind === 'word' ? stem(clean(x)) : clean(x)));
		expect(keys[0]).not.toBe('');
		for (const k of keys) expect(k).toBe(keys[0]);
	};

	it.each([
		['শাড়ি', 'saree', 'sari', 'shari'],
		['পাঞ্জাবি', 'panjabi', 'punjabi'],
		['জুতা', 'juta', 'jutta'],
		['লুঙ্গি', 'lungi'],
		['কামিজ', 'kameez'],
		['কুর্তা', 'kurta'],
		['ওড়না', 'orna', 'urna'],
		['জামদানি', 'jamdani'],
		['সিল্ক', 'silk'],
		['কটন', 'cotton'],
		['টিশার্ট', 'tshirt'],
		['শার্ট', 'shirt'],
		['জিন্স', 'jeans'],
		['জ্যাকেট', 'jacket'],
		['স্যান্ডেল', 'sandal'],
		['স্নিকার্স', 'sneakers'],
		['ব্যাগ', 'bag'],
		['ওয়াচ', 'watch'],
		['রিং', 'ring'],
		['ইয়াররিং', 'earring'],
		['নেকলেস', 'necklace'],
		['ব্রেসলেট', 'bracelet'],
		['মোবাইল', 'mobile'],
		['ফোন', 'phone'],
		['চার্জার', 'charger'],
		['হেডফোন', 'headphone'],
		['ইয়ারফোন', 'earphone'],
		['ল্যাপটপ', 'laptop'],
		['ক্যামেরা', 'camera'],
		['লোশন', 'lotion'],
		['পারফিউম', 'perfume'],
		['লিপস্টিক', 'lipstick'],
		['কম্বল', 'kombol', 'kambal'],
		['মাংস', 'mangsho'],
		['পেঁয়াজ', 'peyaj', 'piyaj'],
		['মিষ্টি', 'mishti', 'misti'],
		['বিস্কুট', 'biscuit'],
		['লেহেঙ্গা', 'lehenga'],
		['বোরকা', 'borka', 'burka', 'burqa'],
		['হিজাব', 'hijab'],
	])('%s', (...xs) => same(...xs));

	it.each([
		['শাড়ি', 'saree'],
		['পাঞ্জাবি', 'punjabi'],
		['জুতা', 'jutta'],
		['লুঙ্গি', 'lungi'],
		['কটন', 'cotton'],
		['ওয়াচ', 'watch'],
		['লোশন', 'lotion'],
		['কম্বল', 'kambal'],
		['ইয়াররিং', 'earring'],
		['স্নিকার্স', 'sneakers'],
		['মাংস', 'mangsho'],
	])('the sound rules alone join %s and %s', (bn, latin) => {
		expect(phonKeyByRules(clean(bn))).toBe(phonKeyByRules(latin));
		expect(phonKeyByRules(latin)).not.toBe('');
	});

	it('is the same for documents and queries', () => {
		const doc = normalise('Jamdani Saree — হাতে বোনা');
		const q = normaliseQuery('জামদানি শাড়ি');
		for (const k of q.phon) expect(doc.phon).toContain(k);
	});

	it('finds the plural of a Banglish word', () => {
		expect(normalise('sarees').phon).toEqual(normalise('saree').phon);
	});

	it('gives nothing for numbers, codes or one sound', () => {
		expect(phonKey('')).toBe('');
		expect(tokenise('500ml')[0].phon).toBe('');
		expect(tokenise('AB-12')[0].phon).toBe('');
		expect(phonKeyByRules('tea')).toBe('');
		expect(phonKeyByRules('a')).toBe('');
	});

	it('drops vowels, keeping one class letter for a starting vowel', () => {
		expect(phonKeyByRules('orna')).toBe('arn');
		expect(phonKeyByRules('earring')).toBe('irn');
		expect(phonKeyByRules('saree')).toBe('sr');
		expect(phonKeyByRules('shari')).toBe('sr');
	});
});

describe('the starter list', () => {
	it('has a Bangla spelling first and a Latin one after, in every row', () => {
		for (const row of BANGLISH_WORDS) {
			expect(row[0]).toMatch(/[ঀ-৿]/);
			expect(row.slice(1).length).toBeGreaterThan(0);
			for (const w of row.slice(1)) expect(w).toMatch(/^[a-z]+$/);
		}
	});

	it('gives every spelling in a row the same key', () => {
		for (const row of BANGLISH_WORDS) {
			const keys = row.map(w => phonKey(clean(w)));
			expect(new Set(keys).size).toBe(1);
			expect(keys[0]).not.toBe('');
		}
	});

	it('never lists one spelling in two rows', () => {
		const seen = new Map<string, number>();
		BANGLISH_WORDS.forEach((row, i) =>
			row.forEach(w => {
				const k = clean(w);
				if (seen.has(k) && seen.get(k) !== i) throw new Error(`"${w}" is in two rows`);
				seen.set(k, i);
			})
		);
	});

	it('mends spellings the sound rules part', () => {
		expect(phonKey(clean('ব্লাউজ'))).toBe(phonKey('blouse'));
		expect(phonKey(clean('ফ্রিজ'))).toBe(phonKey('fridge'));
		expect(phonKey(clean('এসি'))).toBe(phonKey('ac'));
		expect(phonKey(clean('মেশিন'))).toBe(phonKey('machine'));
		expect(phonKey(clean('চার্জার'))).toBe(phonKey('charger'));
	});
});

describe('whole names (what the HINT catalogue holds)', () => {
	it.each([
		["Men's Oxford Shirt — Slim Fit", ['men', 'oxford', 'shirt', 'slim', 'fit']],
		['Emerald Stone Ring', ['emerald', 'stone', 'ring']],
		['Gold Hoop Earrings', ['gold', 'hoop', 'earring']],
		['Classic Trench Coat', ['classic', 'trench', 'coat']],
		['Scented Soy Candle 200g', ['scent', 'soy', 'candle', '200g']],
		['Mirrorless Camera Body', ['mirrorless', 'camera', 'body']],
		['50mm f/1.8 Lens', ['50mm', 'f18', 'lens']], // f/1.8 is one code
	])('%s', (name, out) => expect(stems(name)).toEqual(out));

	it('keeps words in order for phrase matches', () => {
		expect(words('Leather Chelsea Boots')).toEqual(['leather', 'chelsea', 'boots']);
		expect(stems('Leather Chelsea Boots')).toEqual(['leather', 'chelsea', 'boot']);
	});

	it('handles long and odd input without falling over', () => {
		expect(normalise('x'.repeat(10000)).words).toHaveLength(1);
		expect(normalise(null as any).words).toEqual([]);
		expect(normaliseQuery('a'.repeat(500)).raw).toHaveLength(100);
		expect(normalise('🔥 Sale 🔥 shirts').stems).toEqual(['sale', 'shirt']);
	});
});
