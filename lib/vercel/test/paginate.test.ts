import { pagedGet, pagedGetAll } from '../paginate.js';

/** A stand-in for the axios instance, recording what it was asked for. */
const fakeClient = (pages: any[]) => {
	const calls: any[] = [];
	let index = 0;

	return {
		calls,
		client: {
			get: async (path: string, config: any) => {
				calls.push({ path, params: config?.params });
				const data = pages[Math.min(index, pages.length - 1)];
				index += 1;
				return { data };
			},
		} as any,
	};
};

describe('pagedGet', () => {
	it('reads the named collection and the next cursor', async () => {
		const { client } = fakeClient([
			{ projects: [{ id: 'a' }, { id: 'b' }], pagination: { count: 2, next: 1700000000000 } },
		]);

		const page = await pagedGet(client, '/v9/projects', 'projects', {});

		expect(page.items).toHaveLength(2);
		expect(page.next).toBe(1700000000000);
	});

	it('normalises a null or missing cursor to null', async () => {
		// A caller looping on truthiness must terminate; anything non-numeric
		// coming back as a cursor would spin forever.
		const { client } = fakeClient([{ projects: [], pagination: { count: 0, next: null } }]);
		expect((await pagedGet(client, '/v9/projects', 'projects', {})).next).toBeNull();

		const bare = fakeClient([{ projects: [] }]);
		expect((await pagedGet(bare.client, '/v9/projects', 'projects', {})).next).toBeNull();
	});

	it('sends until only when continuing, and caps the page size', async () => {
		const { client, calls } = fakeClient([{ deployments: [], pagination: { next: null } }]);

		await pagedGet(client, '/v6/deployments', 'deployments', { limit: 5000, until: 123 });

		expect(calls[0].params.until).toBe(123);
		expect(calls[0].params.limit).toBe(100);
	});

	it('omits teamId for a personal account', async () => {
		const { client, calls } = fakeClient([{ projects: [], pagination: { next: null } }]);
		await pagedGet(client, '/v9/projects', 'projects', {});
		expect(calls[0].params.teamId).toBeUndefined();
	});
});

describe('pagedGetAll', () => {
	it('follows the cursor to the end', async () => {
		const { client, calls } = fakeClient([
			{ projects: [{ id: 'a' }], pagination: { next: 200 } },
			{ projects: [{ id: 'b' }], pagination: { next: 100 } },
			{ projects: [{ id: 'c' }], pagination: { next: null } },
		]);

		const all = await pagedGetAll(client, '/v9/projects', 'projects', {});

		expect(all.map((p: any) => p.id)).toEqual(['a', 'b', 'c']);
		expect(calls[1].params.until).toBe(200);
		expect(calls[2].params.until).toBe(100);
	});

	it('stops at maxPages rather than looping forever', async () => {
		// An endpoint that always returns a cursor would otherwise run until the
		// request timed out. Partial data beats a hang.
		const { client, calls } = fakeClient([{ projects: [{ id: 'a' }], pagination: { next: 1 } }]);

		const all = await pagedGetAll(client, '/v9/projects', 'projects', {}, 3);

		expect(calls).toHaveLength(3);
		expect(all).toHaveLength(3);
	});

	it('stops on an empty page even when a cursor is returned', async () => {
		const { client, calls } = fakeClient([{ projects: [], pagination: { next: 999 } }]);
		await pagedGetAll(client, '/v9/projects', 'projects', {}, 10);
		expect(calls).toHaveLength(1);
	});
});
