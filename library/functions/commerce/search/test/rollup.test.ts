import { dayBounds, todayIn, viewDayKey, viewsOf } from '../rollup';

const DAY = 24 * 60 * 60 * 1000;

describe('store days (the rollup counts by the store’s own day)', () => {
	test('Dhaka is 6 hours ahead: 20:00 UTC is already the next day there', () => {
		const at = Date.UTC(2026, 10, 10, 20, 0);
		expect(todayIn('Asia/Dhaka', at)).toBe(Date.UTC(2026, 10, 11));
		expect(todayIn('UTC', at)).toBe(Date.UTC(2026, 10, 10));
	});
	test('New York is behind: 02:00 UTC is still the day before', () => {
		expect(todayIn('America/New_York', Date.UTC(2026, 10, 11, 2, 0))).toBe(Date.UTC(2026, 10, 10));
	});
	test('a Dhaka day runs 18:00 UTC to 18:00 UTC', () => {
		const { from, to } = dayBounds(Date.UTC(2026, 10, 11), 'Asia/Dhaka');
		expect(from.toISOString()).toBe('2026-11-10T18:00:00.000Z');
		expect(to.toISOString()).toBe('2026-11-11T18:00:00.000Z');
	});
	test('a day with a clock change is 23 or 25 hours', () => {
		const spring = dayBounds(Date.UTC(2026, 2, 8), 'America/New_York');
		expect(spring.to.getTime() - spring.from.getTime()).toBe(23 * 3600 * 1000);
		const fall = dayBounds(Date.UTC(2026, 10, 1), 'America/New_York');
		expect(fall.to.getTime() - fall.from.getTime()).toBe(25 * 3600 * 1000);
	});
});

describe('views in the last 30 days', () => {
	const now = Date.UTC(2026, 10, 11, 12);
	test('day keys are the UTC date', () => {
		expect(viewDayKey(now)).toBe('20261111');
		expect(viewDayKey(Date.UTC(2026, 0, 2, 23, 59))).toBe('20260102');
	});
	test('today and the 29 days before count; older days are dropped', () => {
		const days = { [viewDayKey(now)]: 3, [viewDayKey(now - 29 * DAY)]: 2, [viewDayKey(now - 30 * DAY)]: 7, [viewDayKey(now - 90 * DAY)]: 1 };
		const r = viewsOf(days, now);
		expect(r.views30).toBe(5);
		expect(r.old.sort()).toEqual([viewDayKey(now - 90 * DAY), viewDayKey(now - 30 * DAY)].sort());
	});
	test('nothing counted yet: 0', () => {
		expect(viewsOf(undefined, now)).toEqual({ views30: 0, old: [] });
		expect(viewsOf({}, now)).toEqual({ views30: 0, old: [] });
	});
	test('junk counts as 0', () => expect(viewsOf({ [viewDayKey(now)]: 'x' as any }, now).views30).toBe(0));
});
