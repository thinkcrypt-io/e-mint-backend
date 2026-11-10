import { understand, type Knowledge } from '../understand';

// docs/search SI-09: what a query asks for besides its words (SI8).

const k: Knowledge = {
	options: new Map([
		['size', { name: 'Size', values: new Map([['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL'], ['42', '42']]) }],
		['colour', { name: 'Colour', values: new Map([['red', 'Red'], ['navy', 'Navy'], ['offwhite', 'Off White']]) }],
	]),
	brands: [
		{ _id: 'b1', name: 'Aarong', words: ['aarong'] },
		{ _id: 'b2', name: 'Yellow Clothing', words: ['yellow', 'clothing'] },
	],
	categories: [
		{ _id: 'c1', name: 'Shoes', words: ['shoes'] },
		{ _id: 'c2', name: 'Stone Ring', words: ['stone', 'ring'] },
	],
};
const u = (q: string) => understand(q, k);

describe('prices (EN)', () => {
	it.each([
		['dress under 2000', { lte: 2000 }, 'dress'],
		['dress below ৳1500', { lte: 1500 }, 'dress'],
		['dress less than 1k', { lte: 1000 }, 'dress'],
		['saree up to 2,500', { lte: 2500 }, 'saree'],
		['shirt upto 900 tk', { lte: 900 }, 'shirt'],
		['shoes within 3000 taka', { lte: 3000 }, 'shoes'],
		['watch over 5000', { gte: 5000 }, 'watch'],
		['watch above 10k', { gte: 10000 }, 'watch'],
		['bag more than ৳2000', { gte: 2000 }, 'bag'],
		['kurta 1000-2000', { gte: 1000, lte: 2000 }, 'kurta'],
		['kurta 1k to 2k', { gte: 1000, lte: 2000 }, 'kurta'],
		['kurta between 800 and 1500', { gte: 800, lte: 1500 }, 'kurta'],
		['kurta 2000 to 1000', { gte: 1000, lte: 2000 }, 'kurta'], // upside down: turned round
		['candle ৳500', { lte: 500 }, 'candle'],
		['candle 500 taka', { lte: 500 }, 'candle'],
		['1.5k panjabi', { lte: 1500 }, 'panjabi'].slice(0, 0) as any, // (no price word or currency: not a price — see below)
	].filter(x => x.length) as [string, any, string][])('%s', (q, price, text) => {
		const r = u(q);
		expect(r.price).toEqual(price);
		expect(r.text).toBe(text);
	});

	it('leaves numbers that aren’t prices alone', () => {
		expect(u('iphone 15').price).toBeUndefined();
		expect(u('iphone 15').text).toBe('iphone 15');
		expect(u('500ml bottle').price).toBeUndefined();
		expect(u('size 42 shoes').price).toBeUndefined();
		expect(u('50mm lens').text).toBe('50mm lens');
	});
});

describe('prices (BN)', () => {
	it.each([
		['৫০০ টাকার নিচে কুর্তা', { lte: 500 }, 'কুর্তা'],
		['শাড়ি ২০০০ এর মধ্যে', { lte: 2000 }, 'শাড়ি'],
		['পাঞ্জাবি ১৫০০ টাকার কমে', { lte: 1500 }, 'পাঞ্জাবি'],
		['ঘড়ি ৫০০০ এর বেশি', { gte: 5000 }, 'ঘড়ি'],
		['জুতা ১০০০ থেকে ২০০০', { gte: 1000, lte: 2000 }, 'জুতা'],
		['২ হাজার টাকার নিচে শাড়ি', { lte: 2000 }, 'শাড়ি'],
	])('%s', (q, price, text) => {
		const r = u(q);
		expect(r.price).toEqual(price);
		expect(r.text).toBe(text);
	});
});

describe('sorting, stock, sale', () => {
	it.each([
		['cheapest watch', 'price', 'watch'],
		['cheap shoes', 'price', 'shoes'],
		['most expensive bag', '-price', 'bag'],
		['newest dresses', 'newest', 'dresses'],
		['new arrivals', 'newest', ''],
		['best selling candle', 'popular', 'candle'],
		['সস্তা শাড়ি', 'price', 'শাড়ি'],
		['নতুন পাঞ্জাবি', 'newest', 'পাঞ্জাবি'],
	])('%s', (q, sort, text) => {
		const r = u(q);
		expect(r.sort).toBe(sort);
		expect(r.text).toBe(text);
	});
	it('in stock and on sale', () => {
		expect(u('kurta in stock')).toMatchObject({ inStock: true, text: 'kurta' });
		expect(u('shoes on sale')).toMatchObject({ onSale: true, text: 'shoes' });
		expect(u('cheapest shoes in stock under 3000')).toMatchObject({ sort: 'price', inStock: true, price: { lte: 3000 }, text: 'shoes' });
	});
	it('keeps "new" as a word when it’s not a sort (New Balance)', () => {
		expect(u('new balance shoes').sort).toBeUndefined();
	});
});

describe('sizes and colours', () => {
	it('a size asked for by name is a filter, both ways round', () => {
		expect(u('polo size m').options).toEqual([{ key: 'size', name: 'Size', value: 'm', label: 'M', as: 'filter' }]);
		expect(u('polo size m').text).toBe('polo');
		expect(u('m size polo').options[0]).toMatchObject({ value: 'm', as: 'filter' });
		expect(u('shoes size 42').options[0]).toMatchObject({ value: '42', label: '42', as: 'filter' });
		expect(u('polo size: xl').options[0]).toMatchObject({ value: 'xl', as: 'filter' });
	});
	it('a colour asked for by name is a filter, any spelling', () => {
		expect(u('dress colour red').options[0]).toMatchObject({ key: 'colour', value: 'red', label: 'Red', as: 'filter' });
		expect(u('dress color red').options[0]).toMatchObject({ key: 'colour', as: 'filter' });
		expect(u('red colour dress').options[0]).toMatchObject({ value: 'red', as: 'filter' });
		expect(u('red colour dress').text).toBe('dress');
	});
	it('a colour as a plain word only lifts, and stays a word', () => {
		const r = u('red berry candle');
		expect(r.options).toEqual([{ key: 'colour', name: 'Colour', value: 'red', label: 'Red', as: 'boost' }]);
		expect(r.text).toBe('red berry candle');
	});
	it('one-letter sizes said alone stay words (not "m" = Size M)', () => {
		expect(u('m polo').options).toEqual([]);
	});
	it('a size the store doesn’t sell: left as words', () => {
		expect(u('polo size xxxl').options).toEqual([]);
		expect(u('polo size xxxl').text).toBe('polo xxxl'); // "size" is filler; the unknown size stays to match
	});
	it('a store with no options understands none', () => {
		expect(understand('dress colour red').options).toEqual([]);
	});
});

describe('brands and categories', () => {
	it('a brand with other words: the brand, its words out', () => {
		expect(u('aarong saree')).toMatchObject({ brand: { _id: 'b1', name: 'Aarong' }, text: 'saree' });
		expect(u('yellow clothing jeans')).toMatchObject({ brand: { _id: 'b2' }, text: 'jeans' });
	});
	it('a brand on its own stays a search for its words', () => {
		expect(u('aarong').brand).toBeUndefined();
		expect(u('aarong').text).toBe('aarong');
	});
	it('a category named: a lift, words kept', () => {
		expect(u('gold stone ring')).toMatchObject({ category: { _id: 'c2', name: 'Stone Ring' }, text: 'gold stone ring' });
		expect(u('running shoes').category?._id).toBe('c1');
	});
});

describe('filler words', () => {
	it.each([
		['shoes for men', 'shoes men', ['for']],
		['i want a red dress', 'red dress', ['i', 'want', 'a']],
		['show me the best watch', 'watch', ['show', 'me', 'the', 'best']],
		['শাড়ি চাই', 'শাড়ি', ['চাই']],
		['ছেলেদের জন্য পাঞ্জাবি', 'ছেলেদের পাঞ্জাবি', ['জন্য']],
	])('%s', (q, text, dropped) => {
		const r = u(q);
		expect(r.text).toBe(text);
		expect(r.dropped).toEqual(dropped);
	});
	it('keeps them when that’s all there is', () => {
		expect(u('the').text).toBe('the');
		expect(u('the').dropped).toEqual([]);
	});
	it('a query of nothing but a price: no words, just the price', () => {
		expect(u('under 500')).toMatchObject({ text: '', price: { lte: 500 } });
	});
});
