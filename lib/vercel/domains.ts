import { vercelClient, withTeam } from './client.js';

export type VercelProjectDomain = {
	name: string;
	apexName: string | null;
	projectId: string | null;
	verified: boolean;
	redirect: string | null;
	redirectStatusCode: number | null;
	gitBranch: string | null;
	/** What to create in DNS while the domain is unverified. */
	verification: { type: string; domain: string; value: string; reason: string | null }[];
	createdAt: string | null;
};

const iso = (value: any): string | null =>
	typeof value === 'number' || typeof value === 'string' ? new Date(value).toISOString() : null;

const toProjectDomain = (d: any): VercelProjectDomain => ({
	name: d?.name,
	apexName: d?.apexName || null,
	projectId: d?.projectId || null,
	verified: !!d?.verified,
	redirect: d?.redirect || null,
	redirectStatusCode: d?.redirectStatusCode ?? null,
	gitBranch: d?.gitBranch || null,
	verification: (d?.verification || []).map((v: any) => ({
		type: v?.type,
		domain: v?.domain,
		value: v?.value,
		reason: v?.reason || null,
	})),
	createdAt: iso(d?.createdAt),
});

/** GET /v9/projects/{idOrName}/domains */
export const listProjectDomains = async (
	token: string,
	project: string,
	team?: string
): Promise<VercelProjectDomain[]> => {
	const { data } = await vercelClient(token).get(
		`/v9/projects/${encodeURIComponent(project)}/domains`,
		{ params: withTeam({}, team) }
	);

	return (data?.domains || []).map(toProjectDomain);
};

/** POST /v10/projects/{idOrName}/domains */
export const addProjectDomain = async (
	token: string,
	project: string,
	name: string,
	team?: string
): Promise<VercelProjectDomain> => {
	const { data } = await vercelClient(token).post(
		`/v10/projects/${encodeURIComponent(project)}/domains`,
		{ name },
		{ params: withTeam({}, team) }
	);

	return toProjectDomain(data);
};

/** POST /v9/projects/{idOrName}/domains/{domain}/verify */
export const verifyProjectDomain = async (
	token: string,
	project: string,
	domain: string,
	team?: string
): Promise<VercelProjectDomain> => {
	const { data } = await vercelClient(token).post(
		`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}/verify`,
		{},
		{ params: withTeam({}, team) }
	);

	return toProjectDomain(data);
};

/** DELETE /v9/projects/{idOrName}/domains/{domain} */
export const removeProjectDomain = async (
	token: string,
	project: string,
	domain: string,
	team?: string
): Promise<void> => {
	await vercelClient(token).delete(
		`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`,
		{ params: withTeam({}, team) }
	);
};

/**
 * GET /v6/domains/{domain}/config — the DNS records to set.
 *
 * This is the only reason anyone opens the Domains tab on an unverified
 * domain, so it is fetched alongside the list rather than behind a click.
 */
export const getDomainConfig = async (
	token: string,
	domain: string,
	team?: string
): Promise<any> => {
	const { data } = await vercelClient(token).get(
		`/v6/domains/${encodeURIComponent(domain)}/config`,
		{ params: withTeam({}, team) }
	);

	return data;
};

/** GET /v5/domains — account-level. */
export const listAccountDomains = async (token: string, team?: string): Promise<any[]> => {
	const { data } = await vercelClient(token).get('/v5/domains', {
		params: withTeam({ limit: 100 }, team),
	});

	return (data?.domains || []).map((d: any) => ({
		name: d?.name,
		verified: !!d?.verified,
		serviceType: d?.serviceType || null,
		boughtAt: iso(d?.boughtAt),
		expiresAt: iso(d?.expiresAt),
		createdAt: iso(d?.createdAt),
	}));
};
