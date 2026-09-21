import { buildRangeHeader } from '../range.js';

describe('buildRangeHeader', () => {
	it('builds a descending header with defaults', () => {
		expect(buildRangeHeader()).toBe('version ..; order=desc, max=50');
	});

	it('honours field, order and max', () => {
		expect(buildRangeHeader({ field: 'created_at', order: 'asc', max: 25 })).toBe(
			'created_at ..; order=asc, max=25'
		);
	});

	it('passes a cursor straight through', () => {
		// A Next-Range value is Heroku's to format; re-deriving it from parts
		// would drop whatever it encodes beyond field/order/max.
		const cursor = 'version 1234..; order=desc, max=50';
		expect(buildRangeHeader({ cursor, max: 10 })).toBe(cursor);
	});
});
