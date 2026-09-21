import { herokuClient } from './client.js';
import { rangedGet, RangeOptions } from './range.js';

export type HerokuRelease = {
	id: string;
	version: number;
	description: string;
	status: string;
	current: boolean;
	slugId: string | null;
	user: string | null;
	createdAt: string | null;
};

export type HerokuBuild = {
	id: string;
	status: string;
	sourceUrl: string | null;
	sourceVersion: string | null;
	slugId: string | null;
	user: string | null;
	createdAt: string | null;
	releasedAt: string | null;
};

const toRelease = (data: any): HerokuRelease => ({
	id: data?.id,
	version: data?.version,
	description: data?.description || '',
	status: data?.status || 'unknown',
	current: !!data?.current,
	slugId: data?.slug?.id || null,
	user: data?.user?.email || null,
	createdAt: data?.created_at || null,
});

const toBuild = (data: any): HerokuBuild => ({
	id: data?.id,
	status: data?.status || 'unknown',
	sourceUrl: data?.source_blob?.url || null,
	sourceVersion: data?.source_blob?.version || null,
	slugId: data?.slug?.id || null,
	user: data?.user?.email || null,
	createdAt: data?.created_at || null,
	releasedAt: data?.released_at || null,
});

/** GET /apps/{app}/releases — Range-paginated, newest first. */
export const listReleases = async (token: string, app: string, options: RangeOptions = {}) => {
	const { items, nextRange } = await rangedGet(
		herokuClient(token),
		`/apps/${encodeURIComponent(app)}/releases`,
		{ field: 'version', order: 'desc', max: 50, ...options }
	);

	return { releases: items.map(toRelease), nextRange };
};

/** GET /apps/{app}/builds */
export const listBuilds = async (token: string, app: string, options: RangeOptions = {}) => {
	const { items, nextRange } = await rangedGet(
		herokuClient(token),
		`/apps/${encodeURIComponent(app)}/builds`,
		{ field: 'created_at', order: 'desc', max: 25, ...options }
	);

	return { builds: items.map(toBuild), nextRange };
};

/** The release currently serving traffic, which the app page leads with. */
export const getCurrentRelease = async (
	token: string,
	app: string
): Promise<HerokuRelease | null> => {
	const { releases } = await listReleases(token, app, { max: 10 });
	return releases.find(release => release.current) || releases[0] || null;
};

/**
 * POST /apps/{app}/releases — re-release an existing slug.
 *
 * This is both "rollback" and "redeploy": Heroku has no separate redeploy verb,
 * so redeploying is re-releasing the slug that is already current, and rolling
 * back is re-releasing an older one. Either way the running code is a slug that
 * has already been built — no rebuild happens, and no new code is fetched.
 */
export const releaseSlug = async (
	token: string,
	app: string,
	slugId: string,
	description?: string
): Promise<HerokuRelease> => {
	const { data } = await herokuClient(token).post(`/apps/${encodeURIComponent(app)}/releases`, {
		slug: slugId,
		...(description ? { description } : {}),
	});

	return toRelease(data);
};

/**
 * POST /apps/{app}/builds — build and release from a source tarball.
 *
 * The documented way to deploy new code without a git push. `sourceUrl` must be
 * a publicly reachable (or pre-signed) `.tar.gz`; a GitHub tarball URL for a
 * branch or tag is the usual case.
 */
export const createBuild = async (
	token: string,
	app: string,
	{ sourceUrl, version }: { sourceUrl: string; version?: string }
): Promise<HerokuBuild> => {
	const { data } = await herokuClient(token).post(`/apps/${encodeURIComponent(app)}/builds`, {
		source_blob: { url: sourceUrl, ...(version ? { version } : {}) },
	});

	return toBuild(data);
};
