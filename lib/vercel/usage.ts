import { VercelDeployment, listAllDeployments } from './deployments.js';
import { VercelProjectSummary } from './projects.js';

/**
 * Account usage, derived from the deployment list.
 *
 * Vercel exposes no consumer-side metered usage endpoint — the `marketplace*`
 * calls are the partner side, for integration vendors reporting usage *to*
 * Vercel. So bandwidth, function invocations, edge requests and image
 * optimisations are **not reachable**, and this module does not pretend
 * otherwise: `unavailable` names each one, and the UI is required to render it.
 *
 * What is reachable turns out to answer the real question. Every deployment
 * carries `createdAt`, `buildingAt` and `ready`, so builds per day against the
 * cap, build minutes, and which project is burning the account are all exact
 * rather than estimated.
 */

/**
 * Hobby's published deployment cap. **Still assumed, not confirmed** — VWO-01 #7
 * needs an account that actually hits the cap to learn the real number and the
 * real over-cap response shape. `capSource` is on the response so the UI can
 * say "assumed" rather than presenting a guess as a fact.
 */
const ASSUMED_CAPS: Record<string, { dailyCap: number | null; concurrentBuilds: number | null }> = {
	hobby: { dailyCap: 100, concurrentBuilds: 1 },
	pro: { dailyCap: null, concurrentBuilds: 12 },
	enterprise: { dailyCap: null, concurrentBuilds: null },
	unknown: { dailyCap: null, concurrentBuilds: null },
};

/**
 * Named so the UI renders the same list the API will not provide.
 *
 * Confirmed against the live account (VWO-01 #11): `GET /v1/usage` exists and
 * takes ISO dates, and answers `plan_upgrade_required` — "This API endpoint is
 * only available to Teams on the Pro or Enterprise plan." So this is a plan
 * restriction with a precise reason, not a missing endpoint, and the UI should
 * say which.
 */
export const UNAVAILABLE_METRICS = [
	'bandwidth',
	'functionInvocations',
	'functionDuration',
	'edgeRequests',
	'imageOptimizations',
];

export type UsageProject = {
	projectId: string;
	name: string;
	deployments: number;
	minutes: number;
	failed: number;
	lastDeployedAt: string | null;
	/** Set from the storefront cross-reference, so a spike in builds can be
	 *  traced to a shop rather than to an anonymous project id. */
	isStorefront: boolean;
};

export type UsageDay = {
	date: string;
	count: number;
	minutes: number;
	/** True when this day reached the assumed cap — flagged, not asserted. */
	hitCap: boolean;
};

export type AccountUsage = {
	window: { from: string; to: string; days: number };
	builds: {
		total: number;
		succeeded: number;
		failed: number;
		canceled: number;
		queuedNow: number;
		building: number;
	};
	buildMinutes: { total: number };
	perDay: UsageDay[];
	byProject: UsageProject[];
	limits: {
		plan: string;
		dailyCap: number | null;
		concurrentBuilds: number | null;
		capSource: 'confirmed' | 'assumed';
	};
	/** Metrics the API does not expose. Rendered, never omitted. */
	unavailable: string[];
	/** True when a project's deployment history was longer than the page cap,
	 *  so the figures below are a floor rather than a total. */
	truncated: boolean;
};

const dayKey = (millis: number): string => new Date(millis).toISOString().slice(0, 10);

/** 100 deployments a page; 20 pages is two thousand builds in the window. */
const MAX_USAGE_PAGES = 20;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export type AccountUsageOptions = {
	team?: string;
	days?: number;
	plan?: string;
	/** Vercel project id -> true, from `lib/vercel/managed.ts`. */
	storefronts?: Record<string, boolean>;
};

/**
 * Walk every project's deployments inside the window and fold them into one
 * computed object. The arithmetic lives here, not in a component.
 *
 * This is the most expensive call in the console — a month across many projects
 * is many requests — which is why the controller caches it for five minutes and
 * the UI offers 7 / 30 / 90 rather than a free date picker.
 */
export const accountUsage = async (
	token: string,
	projects: VercelProjectSummary[],
	{ team, days = 30, plan = 'unknown', storefronts = {} }: AccountUsageOptions = {}
): Promise<AccountUsage> => {
	const to = Date.now();
	const from = to - days * 24 * 60 * 60 * 1000;

	const dayTotals: Record<string, { count: number; minutes: number }> = {};
	const projectTotals: Record<string, UsageProject> = {};

	let total = 0;
	let succeeded = 0;
	let failed = 0;
	let canceled = 0;
	let queuedNow = 0;
	let building = 0;
	let totalMinutes = 0;

	const nameById: Record<string, string> = {};
	projects.forEach(project => {
		nameById[project.id] = project.name;
	});

	/**
	 * One account-wide walk, not one request per project.
	 *
	 * The live account has 92 projects, and a per-project fetch would be 92
	 * sequential round trips for a single page view — slow enough to feel
	 * broken, and a real dent in the 1000/hour budget that endpoint reports.
	 * `/v6/deployments` with no `projectId` returns the whole scope, so the same
	 * data costs a handful of pages and the grouping happens here.
	 */
	const deployments: VercelDeployment[] = await listAllDeployments(
		token,
		{ team, since: from },
		MAX_USAGE_PAGES
	);

	const truncated = deployments.length >= MAX_USAGE_PAGES * 100;

	deployments.forEach(d => {
		const created = d.raw.createdAt;
		if (!created || created < from) return;

		total += 1;

		const state = String(d.readyState || '').toUpperCase();
		const isFailed = state === 'ERROR';

		if (state === 'READY') succeeded += 1;
		else if (isFailed) failed += 1;
		else if (state === 'CANCELED') canceled += 1;
		else if (state === 'QUEUED') queuedNow += 1;
		else if (state === 'BUILDING' || state === 'INITIALIZING') building += 1;

		const mins = d.buildSeconds ? d.buildSeconds / 60 : 0;
		totalMinutes += mins;

		const key = dayKey(created);
		if (!dayTotals[key]) dayTotals[key] = { count: 0, minutes: 0 };
		dayTotals[key].count += 1;
		dayTotals[key].minutes += mins;

		// A deployment can outlive its project, and `name` is the only handle on
		// one that has been deleted — grouping on the id alone would silently
		// drop those builds from a total that is meant to explain the account.
		const projectId = d.projectId || d.name || 'unknown';

		if (!projectTotals[projectId]) {
			projectTotals[projectId] = {
				projectId,
				name: nameById[projectId] || d.name || projectId,
				deployments: 0,
				minutes: 0,
				failed: 0,
				lastDeployedAt: null,
				isStorefront: !!storefronts[projectId],
			};
		}

		const entry = projectTotals[projectId];
		entry.deployments += 1;
		entry.minutes += mins;
		if (isFailed) entry.failed += 1;
		if (!entry.lastDeployedAt || (d.createdAt && d.createdAt > entry.lastDeployedAt)) {
			entry.lastDeployedAt = d.createdAt;
		}
	});

	const perProject: UsageProject[] = Object.keys(projectTotals).map(id => ({
		...projectTotals[id],
		minutes: round1(projectTotals[id].minutes),
	}));

	const caps = ASSUMED_CAPS[plan] || ASSUMED_CAPS.unknown;

	const perDay: UsageDay[] = Object.keys(dayTotals)
		.sort()
		.map(date => ({
			date,
			count: dayTotals[date].count,
			minutes: round1(dayTotals[date].minutes),
			hitCap: caps.dailyCap !== null && dayTotals[date].count >= caps.dailyCap,
		}));

	return {
		window: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days },
		builds: { total, succeeded, failed, canceled, queuedNow, building },
		buildMinutes: { total: round1(totalMinutes) },
		perDay,
		byProject: perProject.sort((a, b) => b.minutes - a.minutes || b.deployments - a.deployments),
		limits: {
			plan,
			dailyCap: caps.dailyCap,
			concurrentBuilds: caps.concurrentBuilds,
			capSource: 'assumed',
		},
		unavailable: UNAVAILABLE_METRICS,
		truncated,
	};
};
