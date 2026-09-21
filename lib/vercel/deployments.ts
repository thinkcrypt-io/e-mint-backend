import { vercelClient, withTeam } from './client.js';
import { pagedGet, pagedGetAll, PagedResult } from './paginate.js';

/**
 * Vercel deployments are immutable. There is no restart, no scaling and no
 * maintenance mode — the Heroku mental model does not carry over:
 *
 *   rollback to release N  ->  promote an older deployment
 *   re-release current slug ->  redeploy (a new deployment from an old one)
 *   restart dynos          ->  nothing; there is no process to restart
 */

export type VercelReadyState =
	| 'QUEUED'
	| 'INITIALIZING'
	| 'BUILDING'
	| 'READY'
	| 'ERROR'
	| 'CANCELED';

export type VercelDeployment = {
	id: string;
	url: string | null;
	name: string | null;
	target: string | null;
	readyState: string | null;
	/**
	 * True while the build is waiting for a slot. Normal on a Hobby plan, which
	 * allows one concurrent build — a fact about the deployment, unlike a colour,
	 * which is why it is computed here and the tone is not. State-to-tone mapping
	 * belongs to the UI and lives in `console/StatusDot.tsx`.
	 */
	isQueued: boolean;
	createdAt: string | null;
	buildingAt: string | null;
	readyAt: string | null;
	/** Seconds from build start to ready, or null while still running. */
	buildSeconds: number | null;
	branch: string | null;
	commitSha: string | null;
	commitMessage: string | null;
	author: string | null;
	creator: string | null;
	projectId: string | null;
	/** Raw epoch millis, kept for the usage arithmetic. */
	raw: { createdAt: number | null; buildingAt: number | null; ready: number | null };
};

const iso = (value: any): string | null =>
	typeof value === 'number' || typeof value === 'string' ? new Date(value).toISOString() : null;

const millis = (value: any): number | null => (typeof value === 'number' ? value : null);

const meta = (d: any, suffix: string): string | null =>
	d?.meta?.[`github${suffix}`] ||
	d?.meta?.[`gitlab${suffix}`] ||
	d?.meta?.[`bitbucket${suffix}`] ||
	null;

export const toDeployment = (d: any): VercelDeployment => {
	const state = d?.readyState || d?.state || null;
	const buildingAt = millis(d?.buildingAt);
	const ready = millis(d?.ready);

	return {
		id: d?.uid || d?.id,
		url: d?.url ? (String(d.url).startsWith('http') ? d.url : `https://${d.url}`) : null,
		name: d?.name || null,
		target: d?.target || null,
		readyState: state,
		isQueued: String(state || '').toUpperCase() === 'QUEUED',
		createdAt: iso(d?.createdAt),
		buildingAt: iso(d?.buildingAt),
		readyAt: iso(d?.ready),
		buildSeconds: buildingAt && ready && ready > buildingAt ? Math.round((ready - buildingAt) / 1000) : null,
		branch: meta(d, 'CommitRef'),
		commitSha: meta(d, 'CommitSha'),
		commitMessage: meta(d, 'CommitMessage'),
		author: meta(d, 'CommitAuthorName'),
		creator: d?.creator?.username || d?.creator?.email || null,
		projectId: d?.projectId || null,
		raw: { createdAt: millis(d?.createdAt), buildingAt, ready },
	};
};

export type ListDeploymentsOptions = {
	project?: string;
	team?: string;
	target?: string;
	state?: string;
	limit?: number;
	until?: number | null;
	since?: number;
	rollbackCandidate?: boolean;
};

const listParams = (options: ListDeploymentsOptions): Record<string, any> => {
	const params: Record<string, any> = {};

	if (options.project) params.projectId = options.project;
	if (options.target) params.target = options.target;
	if (options.state) params.state = options.state;
	if (options.since) params.since = options.since;
	if (options.rollbackCandidate) params.rollbackCandidate = 'true';

	return params;
};

/** GET /v6/deployments — one page. */
export const listDeployments = async (
	token: string,
	options: ListDeploymentsOptions = {}
): Promise<PagedResult<VercelDeployment>> => {
	const page = await pagedGet<any>(vercelClient(token), '/v6/deployments', 'deployments', {
		team: options.team,
		limit: options.limit || 50,
		until: options.until,
		params: listParams(options),
	});

	return { items: page.items.map(toDeployment), next: page.next };
};

/** Every deployment in a window. Used by the usage rollup, which is why the
 *  page cap matters — see `pagedGetAll`. */
export const listAllDeployments = async (
	token: string,
	options: ListDeploymentsOptions = {},
	maxPages = 20
): Promise<VercelDeployment[]> => {
	const items = await pagedGetAll<any>(
		vercelClient(token),
		'/v6/deployments',
		'deployments',
		{ team: options.team, params: listParams(options) },
		maxPages
	);

	return items.map(toDeployment);
};

/** GET /v13/deployments/{idOrUrl} */
export const getDeployment = async (
	token: string,
	deployment: string,
	team?: string
): Promise<VercelDeployment> => {
	const { data } = await vercelClient(token).get(
		`/v13/deployments/${encodeURIComponent(deployment)}`,
		{ params: withTeam({}, team) }
	);

	return toDeployment(data);
};

export type GitSource = {
	type: string;
	org?: string;
	repo?: string;
	repoId?: string | number;
	ref: string;
};

export type CreateDeploymentInput = {
	name: string;
	project?: string;
	target?: string;
	/** Deploy a git ref. */
	gitSource?: GitSource;
	/** Redeploy an existing deployment. */
	deploymentId?: string;
	meta?: Record<string, string>;
};

/** POST /v13/deployments — deploy a git ref, or redeploy an existing build. */
export const createDeployment = async (
	token: string,
	input: CreateDeploymentInput,
	team?: string
): Promise<VercelDeployment> => {
	const { data } = await vercelClient(token).post('/v13/deployments', input, {
		params: withTeam({}, team),
	});

	return toDeployment(data);
};

/**
 * Redeploy an existing deployment, with a fallback.
 *
 * `POST /v13/deployments` with `{ deploymentId }` is the documented redeploy,
 * but VWO-01 #9 could not confirm it without making a real deployment on a live
 * account — and the alternative reading is that the endpoint wants a full file
 * manifest. Rather than pick one and hope, this tries the documented shape and,
 * if Vercel rejects the *request* (a 400 about the body, not a 403 or a 404),
 * falls back to redeploying the same git ref the original was built from.
 *
 * The fallback is not merely a retry: for a git-linked project it produces the
 * same result, and for a project with no git link there is nothing to fall back
 * to, so the original error is what the caller sees. `usedFallback` is on the
 * response so the UI can say which path ran instead of quietly differing.
 */
export const redeploy = async (
	token: string,
	input: { name: string; project: string; deploymentId: string; target?: string },
	source: GitSource | null,
	team?: string
): Promise<{ deployment: VercelDeployment; usedFallback: boolean }> => {
	try {
		const deployment = await createDeployment(
			token,
			{
				name: input.name,
				project: input.project,
				deploymentId: input.deploymentId,
				target: input.target,
				// Vercel records this on the new deployment, so the Deploys list
				// shows a redeploy as a redeploy rather than as a fresh build.
				meta: { action: 'redeploy', originalDeploymentId: input.deploymentId },
			},
			team
		);

		return { deployment, usedFallback: false };
	} catch (e: any) {
		const status = e?.response?.status;
		const retryable = status === 400 || status === 422;

		if (!retryable || !source?.ref) throw e;

		const deployment = await createDeployment(
			token,
			{
				name: input.name,
				project: input.project,
				target: input.target,
				gitSource: source,
				meta: { action: 'redeploy-from-ref', originalDeploymentId: input.deploymentId },
			},
			team
		);

		return { deployment, usedFallback: true };
	}
};

/** PATCH /v12/deployments/{id}/cancel */
export const cancelDeployment = async (
	token: string,
	deployment: string,
	team?: string
): Promise<VercelDeployment> => {
	const { data } = await vercelClient(token).patch(
		`/v12/deployments/${encodeURIComponent(deployment)}/cancel`,
		{},
		{ params: withTeam({}, team) }
	);

	return toDeployment(data);
};

/** DELETE /v13/deployments/{id} */
export const deleteDeployment = async (
	token: string,
	deployment: string,
	team?: string
): Promise<void> => {
	await vercelClient(token).delete(`/v13/deployments/${encodeURIComponent(deployment)}`, {
		params: withTeam({}, team),
	});
};

/**
 * POST /v10/projects/{projectId}/promote/{deploymentId}
 *
 * This is what "rollback" means on Vercel: the production alias is moved to an
 * existing deployment. Nothing is rebuilt, so it is fast and reversible by
 * promoting back.
 */
export const promote = async (
	token: string,
	project: string,
	deployment: string,
	team?: string
): Promise<any> => {
	const { data } = await vercelClient(token).post(
		`/v10/projects/${encodeURIComponent(project)}/promote/${encodeURIComponent(deployment)}`,
		{},
		{ params: withTeam({}, team) }
	);

	return data;
};

/** GET /v1/projects/{projectId}/promote/aliases */
export const listPromoteAliases = async (
	token: string,
	project: string,
	team?: string
): Promise<any[]> => {
	const { data } = await vercelClient(token).get(
		`/v1/projects/${encodeURIComponent(project)}/promote/aliases`,
		{ params: withTeam({}, team) }
	);

	return data?.aliases || data || [];
};

export type BuildLogEvent = {
	type: string | null;
	createdAt: string | null;
	text: string;
	level: string | null;
};

/**
 * GET /v3/deployments/{idOrUrl}/events — build logs.
 *
 * **These carry secrets.** A build prints env values, tokens and connection
 * strings constantly, which is why the route is gated on `view-vercel-env`
 * rather than `view-vercel` and answers with `Cache-Control: no-store`.
 */
export const getDeploymentEvents = async (
	token: string,
	deployment: string,
	team?: string,
	limit = 500
): Promise<BuildLogEvent[]> => {
	const { data } = await vercelClient(token).get(
		`/v3/deployments/${encodeURIComponent(deployment)}/events`,
		{ params: withTeam({ limit, direction: 'backward' }, team) }
	);

	const events = Array.isArray(data) ? data : data?.events || [];

	return events.map((e: any) => ({
		type: e?.type || null,
		createdAt: iso(e?.created || e?.date || e?.createdAt),
		text: String(e?.payload?.text ?? e?.text ?? ''),
		level: e?.payload?.level || e?.level || null,
	}));
};

/** GET /v1/deployments/{deploymentId}/checks */
export const listChecks = async (
	token: string,
	deployment: string,
	team?: string
): Promise<any[]> => {
	const { data } = await vercelClient(token).get(
		`/v1/deployments/${encodeURIComponent(deployment)}/checks`,
		{ params: withTeam({}, team) }
	);

	return data?.checks || [];
};

/** GET /v2/deployments/{id}/aliases */
export const listDeploymentAliases = async (
	token: string,
	deployment: string,
	team?: string
): Promise<any[]> => {
	const { data } = await vercelClient(token).get(
		`/v2/deployments/${encodeURIComponent(deployment)}/aliases`,
		{ params: withTeam({}, team) }
	);

	return data?.aliases || [];
};
