/**
 * The built-in countries (docs/widgets W-02): Bangladesh and ten more to
 * start; the rest are added later the same way (data here, pictures from
 * scripts/countries/buildCountryAssets.mjs). Payment providers follow the
 * user's rule — Bangladesh: SSLCommerz and bKash as well; elsewhere Stripe —
 * and can be changed per country in the database.
 */
export type CountryData = {
	code: string;
	code3: string;
	name: string;
	nativeName: string;
	dialCode: string;
	flag: string;
	currency: { code: string; symbol: string; name: string };
	region: string;
	paymentProviders: string[];
	priority?: number;
};

export const COUNTRIES: CountryData[] = [
	{
		code: 'BD',
		code3: 'BGD',
		name: 'Bangladesh',
		nativeName: 'বাংলাদেশ',
		dialCode: '+880',
		flag: '🇧🇩',
		currency: { code: 'BDT', symbol: '৳', name: 'Bangladeshi taka' },
		region: 'Asia',
		paymentProviders: ['sslcommerz', 'bkash', 'stripe'],
		priority: 100,
	},
	{ code: 'IN', code3: 'IND', name: 'India', nativeName: 'भारत', dialCode: '+91', flag: '🇮🇳', currency: { code: 'INR', symbol: '₹', name: 'Indian rupee' }, region: 'Asia', paymentProviders: ['stripe'] },
	{ code: 'PK', code3: 'PAK', name: 'Pakistan', nativeName: 'پاکستان', dialCode: '+92', flag: '🇵🇰', currency: { code: 'PKR', symbol: '₨', name: 'Pakistani rupee' }, region: 'Asia', paymentProviders: ['stripe'] },
	{ code: 'US', code3: 'USA', name: 'United States', nativeName: 'United States', dialCode: '+1', flag: '🇺🇸', currency: { code: 'USD', symbol: '$', name: 'US dollar' }, region: 'Americas', paymentProviders: ['stripe'] },
	{ code: 'GB', code3: 'GBR', name: 'United Kingdom', nativeName: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', currency: { code: 'GBP', symbol: '£', name: 'Pound sterling' }, region: 'Europe', paymentProviders: ['stripe'] },
	{
		code: 'AE',
		code3: 'ARE',
		name: 'United Arab Emirates',
		nativeName: 'الإمارات العربية المتحدة',
		dialCode: '+971',
		flag: '🇦🇪',
		currency: { code: 'AED', symbol: 'د.إ', name: 'UAE dirham' },
		region: 'Asia',
		paymentProviders: ['stripe'],
	},
	{
		code: 'SA',
		code3: 'SAU',
		name: 'Saudi Arabia',
		nativeName: 'المملكة العربية السعودية',
		dialCode: '+966',
		flag: '🇸🇦',
		currency: { code: 'SAR', symbol: '﷼', name: 'Saudi riyal' },
		region: 'Asia',
		paymentProviders: ['stripe'],
	},
	{ code: 'MY', code3: 'MYS', name: 'Malaysia', nativeName: 'Malaysia', dialCode: '+60', flag: '🇲🇾', currency: { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit' }, region: 'Asia', paymentProviders: ['stripe'] },
	{ code: 'SG', code3: 'SGP', name: 'Singapore', nativeName: 'Singapore', dialCode: '+65', flag: '🇸🇬', currency: { code: 'SGD', symbol: 'S$', name: 'Singapore dollar' }, region: 'Asia', paymentProviders: ['stripe'] },
	{ code: 'CA', code3: 'CAN', name: 'Canada', nativeName: 'Canada', dialCode: '+1', flag: '🇨🇦', currency: { code: 'CAD', symbol: '$', name: 'Canadian dollar' }, region: 'Americas', paymentProviders: ['stripe'] },
	{ code: 'AU', code3: 'AUS', name: 'Australia', nativeName: 'Australia', dialCode: '+61', flag: '🇦🇺', currency: { code: 'AUD', symbol: '$', name: 'Australian dollar' }, region: 'Oceania', paymentProviders: ['stripe'] },
];
