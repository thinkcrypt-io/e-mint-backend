import { vercelClient, withTeam, toVercelError } from './client.js';
import { listProjectDomains, listAccountDomains } from './domains.js';
import { VercelProjectSummary } from './projects.js';

/**
 * "What is this project using", and its account-level inverse.
 *
 * Every section is fetched independently and is allowed to fail on its own.
 * Half a resources page beats an error page — and on a Hobby account several of
 * these endpoints are expected to answer 403 because the feature is Pro-only.
 */

/**
 * A panel has **three** states, not two, and the third is the one that matters
 * on Hobby: has items · has none · not available on this plan. A 403 from an
 * endpoint that exists means the plan does not include it, and the UI must say
 * that rather than rendering an error or, worse, an empty table that implies
 * the account has none.
 */
export type ResourceSection<T> = {
	available: boolean;
	planRestricted: boolean;
	items: T[];
	/** Set when `available` is false: why, in one plain sentence. */
	note: string | null;
};

const ok = <T>(items: T[]): ResourceSection<T> => ({
	available: true,
	planRestricted: false,
	items,
	note: null,
});

const unavailable = <T>(e: any, what: string): ResourceSection<T> => {
	const error = toVercelError(e);

	return {
		available: false,
		planRestricted: !!error.planRestricted,
		items: [],
		// Deliberately does not repeat `what` — the panel heading already says
		// which resource this is, and gluing a plural name onto "is not" reads as
		// broken English ("Log drains is not available"). This sentence answers
		// *why*, which the heading cannot.
		note: error.planRestricted
			? 'Vercel offers this on Pro and Enterprise plans only.'
			: `Vercel could not be reached for this: ${error.message}`,
	};
};

/** Run a section fetch without letting it take the whole response down. */
const section = async <T>(what: string, load: () => Promise<T[]>): Promise<ResourceSection<T>> => {
	try {
		return ok(await load());
	} catch (e: any) {
		return unavailable<T>(e, what);
	}
};

const iso = (value: any): string | null =>
	typeof value === 'number' || typeof value === 'string' ? new Date(value).toISOString() : null;

export type VercelStore = {
	id: string;
	name: string | null;
	type: string | null;
	region: string | null;
	projectIds: string[];
	createdAt: string | null;
};

/**
 * GET /v1/storage/stores — Blob, Postgres, KV and Edge Config.
 *
 * Not in the installed `@vercel/sdk`, so its availability on this plan is
 * VWO-01 #3. A 403 here turns the Stores panel into a plan notice; it does not
 * fail the page.
 */
const loadStores = async (token: string, team?: string): Promise<VercelStore[]> => {
	const { data } = await vercelClient(token).get('/v1/storage/stores', {
		params: withTeam({}, team),
	});

	const stores = data?.stores || data || [];

	return stores.map((s: any) => ({
		id: s?.id || s?.store?.id,
		name: s?.name || s?.store?.name || null,
		type: s?.type || s?.store?.type || null,
		region: s?.region || s?.primaryRegion || null,
		projectIds: (s?.projectsMetadata || s?.projects || [])
			.map((p: any) => p?.projectId || p?.id || p)
			.filter(Boolean),
		createdAt: iso(s?.createdAt || s?.store?.createdAt),
	}));
};

export type VercelIntegration = {
	id: string;
	name: string | null;
	slug: string | null;
	projectIds: string[];
	installedBy: string | null;
	createdAt: string | null;
};

/** GET /v1/integrations/configurations — installed marketplace integrations. */
const loadIntegrations = async (token: string, team?: string): Promise<VercelIntegration[]> => {
	const { data } = await vercelClient(token).get('/v1/integrations/configurations', {
		params: withTeam({ view: 'account' }, team),
	});

	const configs = Array.isArray(data) ? data : data?.configurations || [];

	return configs.map((c: any) => ({
		id: c?.id,
		name: c?.integration?.name || c?.slug || null,
		slug: c?.slug || null,
		projectIds: c?.projects || [],
		installedBy: c?.ownerId || null,
		createdAt: iso(c?.createdAt),
	}));
};

/** GET /v1/log-drains — believed Pro and above; VWO-01 #5 confirms. */
const loadLogDrains = async (token: string, team?: string): Promise<any[]> => {
	const { data } = await vercelClient(token).get('/v1/log-drains', {
		params: withTeam({}, team),
	});

	const drains = Array.isArray(data) ? data : data?.logDrains || [];

	return drains.map((d: any) => ({
		id: d?.id,
		name: d?.name || null,
		url: d?.url || null,
		projectIds: d?.projectIds || [],
		createdAt: iso(d?.createdAt),
	}));
};

export type ProjectResources = {
	gitRepo: VercelProjectSummary['gitRepo'];
	stores: ResourceSection<VercelStore>;
	integrations: ResourceSection<VercelIntegration>;
	domains: ResourceSection<any>;
	logDrains: ResourceSection<any>;
};

/**
 * Everything one project consumes.
 *
 * Stores, integrations and drains are account-scoped upstream, so they are
 * fetched whole and filtered to this project. That is one request each rather
 * than one per resource, and it is also what makes the account rollup below
 * cheap to build from the same calls.
 */
export const getProjectResources = async (
	token: string,
	project: VercelProjectSummary,
	team?: string
): Promise<ProjectResources> => {
	const [stores, integrations, domains, logDrains] = await Promise.all([
		section('Storage', () => loadStores(token, team)),
		section('Integrations', () => loadIntegrations(token, team)),
		section('Domains', () => listProjectDomains(token, project.id, team)),
		section('Log drains', () => loadLogDrains(token, team)),
	]);

	const mine = <T extends { projectIds: string[] }>(s: ResourceSection<T>): ResourceSection<T> =>
		s.available
			? { ...s, items: s.items.filter(i => i.projectIds.indexOf(project.id) !== -1) }
			: s;

	return {
		gitRepo: project.gitRepo,
		stores: mine(stores),
		integrations: mine(integrations),
		domains,
		logDrains: mine(logDrains as ResourceSection<any>),
	};
};

export type AccountResources = {
	stores: ResourceSection<VercelStore & { projects: string[] }>;
	integrations: ResourceSection<VercelIntegration & { projects: string[] }>;
	domains: ResourceSection<any>;
	logDrains: ResourceSection<any>;
	/**
	 * Resources attached to no project at all.
	 *
	 * The part worth building: a store or a paid integration with nothing using
	 * it is money leaving the account for nothing, and it is invisible in the
	 * per-project view by definition.
	 */
	orphans: { stores: VercelStore[]; integrations: VercelIntegration[] };
};

/** Account-wide: what exists, and which projects use it. */
export const getAccountResources = async (
	token: string,
	projects: VercelProjectSummary[],
	team?: string
): Promise<AccountResources> => {
	const [stores, integrations, domains, logDrains] = await Promise.all([
		section('Storage', () => loadStores(token, team)),
		section('Integrations', () => loadIntegrations(token, team)),
		section('Domains', () => listAccountDomains(token, team)),
		section('Log drains', () => loadLogDrains(token, team)),
	]);

	const nameById: Record<string, string> = {};
	projects.forEach(p => {
		nameById[p.id] = p.name;
	});

	const named = <T extends { projectIds: string[] }>(items: T[]) =>
		items.map(item => ({
			...item,
			projects: item.projectIds.map(id => nameById[id] || id),
		}));

	return {
		stores: stores.available
			? { ...stores, items: named(stores.items) }
			: (stores as any),
		integrations: integrations.available
			? { ...integrations, items: named(integrations.items) }
			: (integrations as any),
		domains,
		logDrains,
		orphans: {
			stores: stores.available ? stores.items.filter(s => !s.projectIds.length) : [],
			integrations: integrations.available
				? integrations.items.filter(i => !i.projectIds.length)
				: [],
		},
	};
};
