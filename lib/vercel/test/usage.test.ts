import { accountUsage, UNAVAILABLE_METRICS } from '../usage.js';
import * as deployments from '../deployments.js';
import { VercelProjectSummary } from '../projects.js';

const project = (id: string, name: string): VercelProjectSummary =>
	({ id, name }) as VercelProjectSummary;

const MINUTE = 60 * 1000;

const deployment = (over: any) => ({
	id: 'dpl_' + Math.random().toString(36).slice(2, 8),
	readyState: 'READY',
	buildSeconds: 120,
	projectId: 'p1',
	name: 'shop',
	createdAt: new Date(over.created).toISOString(),
	raw: { createdAt: over.created, buildingAt: over.created, ready: over.created + 2 * MINUTE },
	...over,
});

describe('accountUsage', () => {
	const spy = jest.spyOn(deployments, 'listAllDeployments');

	afterEach(() => spy.mockReset());
	afterAll(() => spy.mockRestore());

	it('sums build minutes from buildingAt and ready', async () => {
		const now = Date.now();
		spy.mockResolvedValue([
			deployment({ created: now - MINUTE, buildSeconds: 120 }),
			deployment({ created: now - 2 * MINUTE, buildSeconds: 60 }),
		] as any);

		const usage = await accountUsage('token', [project('p1', 'shop')], { days: 30 });

		expect(usage.builds.total).toBe(2);
		expect(usage.buildMinutes.total).toBe(3);
	});

	it('counts each ready state separately', async () => {
		const now = Date.now();
		spy.mockResolvedValue([
			deployment({ created: now, readyState: 'READY' }),
			deployment({ created: now, readyState: 'ERROR' }),
			deployment({ created: now, readyState: 'CANCELED' }),
			deployment({ created: now, readyState: 'QUEUED' }),
			deployment({ created: now, readyState: 'BUILDING' }),
		] as any);

		const usage = await accountUsage('token', [project('p1', 'shop')], { days: 30 });

		expect(usage.builds).toMatchObject({
			total: 5,
			succeeded: 1,
			failed: 1,
			canceled: 1,
			queuedNow: 1,
			building: 1,
		});
	});

	it('ignores deployments older than the window', async () => {
		const now = Date.now();
		spy.mockResolvedValue([
			deployment({ created: now - MINUTE }),
			deployment({ created: now - 40 * 24 * 60 * MINUTE }),
		] as any);

		const usage = await accountUsage('token', [project('p1', 'shop')], { days: 30 });

		expect(usage.builds.total).toBe(1);
	});

	it('ranks projects by build minutes and tags storefronts', async () => {
		const now = Date.now();
		spy.mockResolvedValue([
			deployment({ created: now, buildSeconds: 600, projectId: 'p1' }),
			deployment({ created: now, buildSeconds: 60, projectId: 'p2' }),
		] as any);

		const usage = await accountUsage(
			'token',
			[project('p2', 'quiet'), project('p1', 'busy-shop')],
			{ days: 30, storefronts: { p1: true } }
		);

		expect(usage.byProject[0].name).toBe('busy-shop');
		expect(usage.byProject[0].isStorefront).toBe(true);
		expect(usage.byProject[1].isStorefront).toBe(false);
	});

	it('walks the account once, not once per project', async () => {
		// The live account has 92 projects. A per-project fetch would be 92
		// sequential round trips for one page view.
		spy.mockResolvedValue([] as any);

		const many = Array.from({ length: 92 }, (_, i) => project(`p${i}`, `project-${i}`));
		await accountUsage('token', many, { days: 30 });

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][1]).not.toHaveProperty('project');
	});

	it('still counts builds whose project has since been deleted', async () => {
		const now = Date.now();
		spy.mockResolvedValue([
			deployment({ created: now, projectId: 'gone', name: 'deleted-project' }),
		] as any);

		const usage = await accountUsage('token', [project('p1', 'live')], { days: 30 });

		expect(usage.builds.total).toBe(1);
		expect(usage.byProject[0].name).toBe('deleted-project');
	});

	it('flags a day that reached the assumed Hobby cap', async () => {
		const now = Date.now();
		spy.mockResolvedValue(
			Array.from({ length: 100 }, () => deployment({ created: now, buildSeconds: 0 })) as any
		);

		const usage = await accountUsage('token', [project('p1', 'shop')], { days: 30, plan: 'hobby' });

		expect(usage.limits.dailyCap).toBe(100);
		// The cap is not confirmed against a live account yet, and the UI has to
		// be able to say so rather than presenting a guess as a fact.
		expect(usage.limits.capSource).toBe('assumed');
		expect(usage.perDay.some(d => d.hitCap)).toBe(true);
	});

	it('always names the metrics the API cannot provide', async () => {
		spy.mockResolvedValue([] as any);

		const usage = await accountUsage('token', [project('p1', 'shop')], { days: 7 });

		expect(usage.unavailable).toEqual(UNAVAILABLE_METRICS);
		expect(usage.unavailable).toContain('bandwidth');
	});
});
