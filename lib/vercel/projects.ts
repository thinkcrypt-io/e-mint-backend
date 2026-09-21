import { vercelClient, withTeam } from './client.js';
import { pagedGet, pagedGetAll, PagedResult } from './paginate.js';

export type VercelGitRepo = {
	type: string | null;
	org: string | null;
	repo: string | null;
	repoId: string | number | null;
	productionBranch: string | null;
	url: string | null;
};

export type VercelDeploymentRef = {
	id: string | null;
	url: string | null;
	readyState: string | null;
	createdAt: string | null;
	branch: string | null;
	commitMessage: string | null;
};

export type VercelProjectSummary = {
	id: string;
	name: string;
	framework: string | null;
	nodeVersion: string | null;
	rootDirectory: string | null;
	buildCommand: string | null;
	installCommand: string | null;
	outputDirectory: string | null;
	devCommand: string | null;
	gitRepo: VercelGitRepo | null;
	latestProductionDeployment: VercelDeploymentRef | null;
	createdAt: string | null;
	updatedAt: string | null;
};

const iso = (value: any): string | null =>
	typeof value === 'number' || typeof value === 'string' ? new Date(value).toISOString() : null;

const toGitRepo = (link: any): VercelGitRepo | null => {
	if (!link || !link.type) return null;

	const org = link.org || link.owner || link.namespace || null;
	const repo = link.repo || link.project || link.slug || null;

	return {
		type: link.type || null,
		org,
		repo,
		repoId: link.repoId ?? link.projectId ?? null,
		productionBranch: link.productionBranch || null,
		// `link` carries a URL for GitHub but not consistently for the others, so
		// it is rebuilt from the parts when absent rather than left null.
		url: link.url || (org && repo && link.type === 'github' ? `https://github.com/${org}/${repo}` : null),
	};
};

const toDeploymentRef = (d: any): VercelDeploymentRef | null => {
	if (!d) return null;

	return {
		id: d.id || d.uid || null,
		// Vercel returns the host without a scheme on nested deployment refs.
		url: d.url ? (String(d.url).startsWith('http') ? d.url : `https://${d.url}`) : null,
		readyState: d.readyState || d.state || null,
		createdAt: iso(d.createdAt),
		branch: d.meta?.githubCommitRef || d.meta?.gitlabCommitRef || d.meta?.bitbucketCommitRef || null,
		commitMessage:
			d.meta?.githubCommitMessage ||
			d.meta?.gitlabCommitMessage ||
			d.meta?.bitbucketCommitMessage ||
			null,
	};
};

/**
 * The raw project object is large, deeply nested and inconsistent about where
 * the same fact lives. Normalising once here is what keeps six tab components
 * readable, and means no snake_case or provider-shaped data reaches a
 * controller.
 */
export const toProjectSummary = (data: any): VercelProjectSummary => ({
	id: data?.id,
	name: data?.name,
	framework: data?.framework || null,
	nodeVersion: data?.nodeVersion || null,
	rootDirectory: data?.rootDirectory || null,
	buildCommand: data?.buildCommand || null,
	installCommand: data?.installCommand || null,
	outputDirectory: data?.outputDirectory || null,
	devCommand: data?.devCommand || null,
	gitRepo: toGitRepo(data?.link),
	latestProductionDeployment: toDeploymentRef(
		data?.targets?.production || (data?.latestDeployments || [])[0]
	),
	createdAt: iso(data?.createdAt),
	updatedAt: iso(data?.updatedAt),
});

export type ListProjectsOptions = {
	team?: string;
	search?: string;
	limit?: number;
	until?: number | null;
};

/** GET /v9/projects — one page. */
export const listProjects = async (
	token: string,
	{ team, search, limit = 100, until }: ListProjectsOptions = {}
): Promise<PagedResult<VercelProjectSummary>> => {
	const page = await pagedGet<any>(vercelClient(token), '/v9/projects', 'projects', {
		team,
		limit,
		until,
		params: search ? { search } : {},
	});

	return {
		items: page.items.map(toProjectSummary).sort((a, b) => a.name.localeCompare(b.name)),
		next: page.next,
	};
};

/** Every project, walked to the end. Used by the usage and resource rollups. */
export const listAllProjects = async (
	token: string,
	{ team, search }: ListProjectsOptions = {}
): Promise<VercelProjectSummary[]> => {
	const items = await pagedGetAll<any>(vercelClient(token), '/v9/projects', 'projects', {
		team,
		params: search ? { search } : {},
	});

	return items.map(toProjectSummary).sort((a, b) => a.name.localeCompare(b.name));
};

/** GET /v9/projects/{idOrName} */
export const getProject = async (
	token: string,
	project: string,
	team?: string
): Promise<VercelProjectSummary> => {
	const { data } = await vercelClient(token).get(
		`/v9/projects/${encodeURIComponent(project)}`,
		{ params: withTeam({}, team) }
	);

	return toProjectSummary(data);
};

export type CreateProjectInput = {
	name: string;
	framework?: string;
	/** `owner/repo`, as the Vercel API expects it. */
	gitRepository?: { repo: string; type: string };
	buildCommand?: string;
	installCommand?: string;
	outputDirectory?: string;
	rootDirectory?: string;
};

/** POST /v10/projects */
export const createProject = async (
	token: string,
	input: CreateProjectInput,
	team?: string
): Promise<VercelProjectSummary> => {
	const { data } = await vercelClient(token).post('/v10/projects', input, {
		params: withTeam({}, team),
	});

	return toProjectSummary(data);
};

/** PATCH /v9/projects/{idOrName} */
export const updateProject = async (
	token: string,
	project: string,
	patch: Record<string, any>,
	team?: string
): Promise<VercelProjectSummary> => {
	const { data } = await vercelClient(token).patch(
		`/v9/projects/${encodeURIComponent(project)}`,
		patch,
		{ params: withTeam({}, team) }
	);

	return toProjectSummary(data);
};

/**
 * DELETE /v9/projects/{idOrName}
 *
 * No undo: this takes the project's deployments and domain attachments with it.
 * Controllers must refuse it outright for a storefront project — see
 * `lib/vercel/managed.ts` — and require type-to-confirm for everything else.
 */
export const deleteProject = async (
	token: string,
	project: string,
	team?: string
): Promise<void> => {
	await vercelClient(token).delete(`/v9/projects/${encodeURIComponent(project)}`, {
		params: withTeam({}, team),
	});
};
