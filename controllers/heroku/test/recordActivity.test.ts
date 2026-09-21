import { diffConfigVars } from '../recordActivity.js';

describe('diffConfigVars', () => {
	const current = { KEEP: 'same', CHANGE: 'before', GONE: 'bye' };

	it('classifies added, updated and removed', () => {
		const changes = diffConfigVars(current, {
			NEW: 'value',
			CHANGE: 'after',
			GONE: null,
		});

		expect(changes).toEqual([
			{ key: 'CHANGE', kind: 'updated' },
			{ key: 'GONE', kind: 'removed' },
			{ key: 'NEW', kind: 'added' },
		]);
	});

	it('ignores a key submitted with its existing value', () => {
		expect(diffConfigVars(current, { KEEP: 'same' })).toEqual([]);
	});

	it('does not report deleting a key that was never set', () => {
		expect(diffConfigVars(current, { ABSENT: null })).toEqual([]);
	});

	it('never carries a value, on either side', () => {
		// The whole point of the key/kind shape: an audit row must not become a
		// second copy of the secret it is recording a change to.
		const changes = diffConfigVars(current, { CHANGE: 'a-secret-value' });
		const serialised = JSON.stringify(changes);

		expect(serialised).not.toContain('a-secret-value');
		expect(serialised).not.toContain('before');
	});
});
