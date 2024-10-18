import convertToOptions from '../convertToOptions.js';

describe('convertToOptions', () => {
	it('should convert options to label-value pairs with formatted labels', () => {
		const input = ['net-30', 'net-60', 'prepaid', 'cod', 'others'];
		const expectedOutput = [
			{ label: 'Net 30', value: 'net-30' },
			{ label: 'Net 60', value: 'net-60' },
			{ label: 'Prepaid', value: 'prepaid' },
			{ label: 'Cod', value: 'cod' },
			{ label: 'Others', value: 'others' },
		];

		const result = convertToOptions(input);
		expect(result).toEqual(expectedOutput);
	});

	it('should handle an empty array', () => {
		const input: string[] = [];
		const expectedOutput: { label: string; value: string }[] = [];

		const result = convertToOptions(input);
		expect(result).toEqual(expectedOutput);
	});

	it('should handle null or undefined input', () => {
		const input = null;
		const expectedOutput: { label: string; value: string }[] = [];

		const result = convertToOptions(input as any);
		expect(result).toEqual(expectedOutput);
	});
});
