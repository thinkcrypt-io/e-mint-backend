/**
 * The store's time zone (docs/ecommerce DISCOUNTS.md DS9): a discount's Starts and Ends are days — "ends on 5 Nov"
 * means until midnight after 5 Nov where the store is. Dates are kept as the panel's date input sends them (that day
 * at 00:00 UTC); these turn such a day into the instant it starts or ends in a zone. No library: Intl knows the zones.
 */

const DAY = 24 * 60 * 60 * 1000;

/** A zone for a store whose organization is in this country — its capital's, near enough for most. */
const BY_COUNTRY: Record<string, string> = {
	BD: 'Asia/Dhaka',
	IN: 'Asia/Kolkata',
	PK: 'Asia/Karachi',
	NP: 'Asia/Kathmandu',
	LK: 'Asia/Colombo',
	BT: 'Asia/Thimphu',
	MM: 'Asia/Yangon',
	TH: 'Asia/Bangkok',
	MY: 'Asia/Kuala_Lumpur',
	SG: 'Asia/Singapore',
	ID: 'Asia/Jakarta',
	PH: 'Asia/Manila',
	VN: 'Asia/Ho_Chi_Minh',
	CN: 'Asia/Shanghai',
	HK: 'Asia/Hong_Kong',
	JP: 'Asia/Tokyo',
	KR: 'Asia/Seoul',
	AE: 'Asia/Dubai',
	SA: 'Asia/Riyadh',
	QA: 'Asia/Qatar',
	KW: 'Asia/Kuwait',
	OM: 'Asia/Muscat',
	BH: 'Asia/Bahrain',
	TR: 'Europe/Istanbul',
	EG: 'Africa/Cairo',
	NG: 'Africa/Lagos',
	KE: 'Africa/Nairobi',
	ZA: 'Africa/Johannesburg',
	GB: 'Europe/London',
	IE: 'Europe/Dublin',
	FR: 'Europe/Paris',
	DE: 'Europe/Berlin',
	ES: 'Europe/Madrid',
	IT: 'Europe/Rome',
	NL: 'Europe/Amsterdam',
	SE: 'Europe/Stockholm',
	US: 'America/New_York',
	CA: 'America/Toronto',
	MX: 'America/Mexico_City',
	BR: 'America/Sao_Paulo',
	AU: 'Australia/Sydney',
	NZ: 'Pacific/Auckland',
};

export const zoneForCountry = (code?: string) => BY_COUNTRY[String(code || '').toUpperCase()] || 'UTC';

export const validZone = (tz: any) => {
	if (!tz || typeof tz !== 'string') return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

/** How many minutes the zone is ahead of UTC at that instant (Asia/Dhaka: 360; America/New_York: −300 or −240). */
export const zoneOffset = (tz: string, at: Date | number = Date.now()) => {
	const t = new Date(at);
	if (!validZone(tz) || isNaN(t.getTime())) return 0;
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(t);
	const n = (type: string) => Number(parts.find(p => p.type === type)?.value);
	const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
	return Math.round((wall - Math.floor(t.getTime() / 1000) * 1000) / 60000);
};

/** The day a date names: its 00:00 UTC (what the date input stores). */
export const dayOf = (d: any) => {
	const t = new Date(d);
	return isNaN(t.getTime()) ? null : Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};

/** When that day starts in the zone. */
export const startOfDay = (d: any, tz: string): Date | null => {
	const day = dayOf(d);
	return day === null ? null : new Date(day - zoneOffset(tz, day) * 60000);
};

/** When that day is over in the zone: midnight after it. */
export const endOfDay = (d: any, tz: string): Date | null => {
	const day = dayOf(d);
	return day === null ? null : new Date(day + DAY - zoneOffset(tz, day + DAY) * 60000);
};

/** "5 Nov 2026" for a stored day. */
export const dayText = (d: any) => {
	const day = dayOf(d);
	return day === null ? '' : new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
