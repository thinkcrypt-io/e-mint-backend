import { herokuClient } from './client.js';

export type HerokuAppSummary = {
	id: string;
	name: string;
	webUrl: string | null;
	gitUrl: string | null;
	region: string | null;
	stack: string | null;
	buildpack: string | null;
	maintenance: boolean;
	/** Bytes, as Heroku reports them. Null until the app has been deployed. */
	slugSize: number | null;
	repoSize: number | null;
	owner: string | null;
	team: string | null;
	releasedAt: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

/** The Platform API returns snake_case; every read goes through this so the
 *  frontend only ever sees one shape. */
const toAppSummary = (data: any): HerokuAppSummary => ({
	id: data?.id,
	name: data?.name,
	webUrl: data?.web_url || null,
	// Always present on the API response, but derivable from the name too —
	// `https://git.heroku.com/<name>.git` is the documented remote.
	gitUrl: data?.git_url || (data?.name ? `https://git.heroku.com/${data.name}.git` : null),
	region: data?.region?.name || null,
	stack: data?.stack?.name || null,
	buildpack: data?.buildpack_provided_description || null,
	maintenance: !!data?.maintenance,
	slugSize: data?.slug_size ?? null,
	repoSize: data?.repo_size ?? null,
	owner: data?.owner?.email || null,
	team: data?.team?.name || data?.organization?.name || null,
	releasedAt: data?.released_at || null,
	createdAt: data?.created_at || null,
	updatedAt: data?.updated_at || null,
});

/**
 * GET /apps — every app the token can see, personal and team alike. Heroku
 * already folds team apps into this list for a user token, so there is no
 * second call per team to make.
 */
export const listApps = async (token: string): Promise<HerokuAppSummary[]> => {
	const { data } = await herokuClient(token).get('/apps');
	const apps: HerokuAppSummary[] = (data || []).map(toAppSummary);

	return apps.sort((a, b) => a.name.localeCompare(b.name));
};

/** GET /apps/{id_or_name} */
export const getApp = async (token: string, app: string): Promise<HerokuAppSummary> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}`);
	return toAppSummary(data);
};
