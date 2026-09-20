const ONES = [
	'',
	'One',
	'Two',
	'Three',
	'Four',
	'Five',
	'Six',
	'Seven',
	'Eight',
	'Nine',
	'Ten',
	'Eleven',
	'Twelve',
	'Thirteen',
	'Fourteen',
	'Fifteen',
	'Sixteen',
	'Seventeen',
	'Eighteen',
	'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const CURRENCY_NAMES: Record<string, string> = {
	BDT: 'Taka',
	USD: 'Dollars',
	EUR: 'Euros',
	GBP: 'Pounds',
	INR: 'Rupees',
};

const threeDigitsToWords = (n: number): string => {
	const parts: string[] = [];
	if (n >= 100) {
		parts.push(ONES[Math.floor(n / 100)], 'Hundred');
		n %= 100;
	}
	if (n >= 20) {
		parts.push(TENS[Math.floor(n / 10)]);
		n %= 10;
		if (n) parts.push(ONES[n]);
	} else if (n > 0) {
		parts.push(ONES[n]);
	}
	return parts.join(' ');
};

/** Converts a non-negative integer to English words (short scale: thousand,
 *  million, billion). Returns 'Zero' for 0. */
export const integerToWords = (value: number): string => {
	const n = Math.floor(Math.abs(value));
	if (n === 0) return 'Zero';

	const scales: [number, string][] = [
		[1_000_000_000, 'Billion'],
		[1_000_000, 'Million'],
		[1_000, 'Thousand'],
	];

	let remaining = n;
	const parts: string[] = [];

	for (const [scale, name] of scales) {
		if (remaining >= scale) {
			const chunk = Math.floor(remaining / scale);
			parts.push(threeDigitsToWords(chunk), name);
			remaining %= scale;
		}
	}
	if (remaining > 0) parts.push(threeDigitsToWords(remaining));

	return parts.join(' ').replace(/\s+/g, ' ').trim();
};

/** "Four Thousand Taka Only/-" style amount-in-words used on invoice/bill/
 *  receipt PDFs. `currency` is the ISO-ish code already stored on the
 *  invoice (BDT/USD/...); falls back to the code itself if not in the map. */
export const amountToWords = (amount: number, currency: string): string => {
	const currencyName = CURRENCY_NAMES[currency?.toUpperCase()] || currency || '';
	const whole = Math.floor(Math.abs(amount || 0));
	return `${integerToWords(whole)} ${currencyName} Only/-`.replace(/\s+/g, ' ').trim();
};

export default amountToWords;
