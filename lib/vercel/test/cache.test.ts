import { cached, invalidate, clearAll } from '../cache.js';

describe('cache', () => {
	beforeEach(() => clearAll());

	it('serves the second read from the cache', async () => {
		let calls = 0;
		const load = async () => {
			calls += 1;
			return calls;
		};

		expect(await cached('acct', '', 'projects', '', load)).toBe(1);
		expect(await cached('acct', '', 'projects', '', load)).toBe(1);
		expect(calls).toBe(1);
	});

	it('never serves one team the other team answer', async () => {
		// The team is part of the key, not the suffix. Without this, switching
		// teams on the account page shows the previous team's project list.
		await cached('acct', 'team_a', 'projects', '', async () => 'A');
		const b = await cached('acct', 'team_b', 'projects', '', async () => 'B');

		expect(b).toBe('B');
	});

	it('keeps the personal scope separate from a team scope', async () => {
		await cached('acct', '', 'projects', '', async () => 'personal');
		const team = await cached('acct', 'team_a', 'projects', '', async () => 'team');

		expect(team).toBe('team');
	});

	it('does not cache a rejected loader', async () => {
		// An outage or a 429 must not be remembered for the next five minutes.
		await expect(
			cached('acct', '', 'projects', '', async () => {
				throw new Error('429');
			})
		).rejects.toThrow('429');

		expect(await cached('acct', '', 'projects', '', async () => 'recovered')).toBe('recovered');
	});

	it('invalidates across every team scope of one account', async () => {
		await cached('acct', 'team_a', 'projects', '', async () => 'a1');
		await cached('acct', 'team_b', 'projects', '', async () => 'b1');

		invalidate('acct');

		expect(await cached('acct', 'team_a', 'projects', '', async () => 'a2')).toBe('a2');
		expect(await cached('acct', 'team_b', 'projects', '', async () => 'b2')).toBe('b2');
	});

	it('leaves other accounts alone', async () => {
		await cached('acct_1', '', 'projects', '', async () => 'one');
		await cached('acct_2', '', 'projects', '', async () => 'two');

		invalidate('acct_1');

		expect(await cached('acct_2', '', 'projects', '', async () => 'changed')).toBe('two');
	});

	it('clears account-level aggregates even when one project is named', async () => {
		// A project write moves the project list, the usage window and the
		// resource rollup, not just that project's own entries.
		await cached('acct', '', 'usage', '30', async () => 'stale');
		await cached('acct', '', 'deployment', 'other_project', async () => 'untouched');

		invalidate('acct', 'prj_123');

		expect(await cached('acct', '', 'usage', '30', async () => 'fresh')).toBe('fresh');
		expect(await cached('acct', '', 'deployment', 'other_project', async () => 'changed')).toBe(
			'untouched'
		);
	});
});
