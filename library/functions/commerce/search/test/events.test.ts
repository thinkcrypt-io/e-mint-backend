import { cleanQuery, newSearchId, normalisedOf, visitorIdOf } from '../events';

describe('cleanQuery: no emails, phones or card numbers in the log (SI17)', () => {
	test.each([
		['rafi@example.com', '[email]'],
		['order for rafi.k+shop@mail.example.co.uk please', 'order for [email] please'],
		['01712345678', '[phone]'],
		['017 1234 5678', '[phone]'],
		['01712-345678', '[phone]'],
		['+8801712345678', '[phone]'],
		['008801712345678', '[phone]'],
		['8801712345678', '[phone]'],
		['০১৭১২৩৪৫৬৭৮', '[phone]'],
		['call +44 20 7946 0958', 'call [phone]'],
		['+14155552671', '[phone]'],
		['4111 1111 1111 1111', '[number]'],
		['4111-1111-1111-1111', '[number]'],
		['5555555555554444', '[number]'],
		['card 378282246310005 shirt', 'card [number] shirt'],
		['rafi@example.com 01712345678', '[email] [phone]'],
	])('%s → %s', (q, out) => expect(cleanQuery(q)).toBe(out));

	test.each([
		'red shirt',
		'iphone 15',
		'500ml',
		'size 42',
		'2k to 3k',
		'SKU-12345',
		'ab-125',
		// Barcodes are searched by: an EAN-13 that fails the card check stays.
		'8901234567891',
		'012345678905',
		'sharee 1500',
		'লাল শাড়ি',
		'01234',
		'017123',
	])('%s stays', q => expect(cleanQuery(q)).toBe(q));

	test('spaces folded, trimmed, at most 100 characters', () => {
		expect(cleanQuery('  red   shirt ')).toBe('red shirt');
		expect(cleanQuery('a'.repeat(300))).toHaveLength(100);
		expect(cleanQuery(null)).toBe('');
		expect(cleanQuery(undefined)).toBe('');
	});
});

describe('normalisedOf: one key per query, whatever the spelling', () => {
	test('plurals and case are one', () => {
		expect(normalisedOf('Shirts')).toBe(normalisedOf('shirt'));
		expect(normalisedOf('Red  T-Shirts')).toBe(normalisedOf('red t-shirt'));
	});
	test('placeholders kept as they are', () => {
		expect(normalisedOf('[phone]')).toBe('[phone]');
		expect(normalisedOf('order [email] shirts')).toBe(`${normalisedOf('order')} [email] ${normalisedOf('shirts')}`);
	});
	test('Bangla stays Bangla', () => expect(normalisedOf('শাড়ি')).not.toBe(''));
	test('nothing to say: empty', () => expect(normalisedOf('')).toBe(''));
});

describe('ids', () => {
	test('search ids are new each time and URL-safe', () => {
		const a = newSearchId();
		expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/);
		expect(newSearchId()).not.toBe(a);
	});
	test("visitor ids as track.js makes them; anything else is dropped", () => {
		expect(visitorIdOf('k3j4h5g6f7d8mabc')).toBe('k3j4h5g6f7d8mabc');
		expect(visitorIdOf('short')).toBeNull();
		expect(visitorIdOf('has space in it')).toBeNull();
		expect(visitorIdOf({ $ne: null })).toBeNull();
		expect(visitorIdOf('x'.repeat(65))).toBeNull();
	});
});
