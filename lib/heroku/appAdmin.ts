import { herokuClient } from './client.js';

/**
 * PATCH /apps/{app} — maintenance mode.
 *
 * With it on, Heroku serves the maintenance page for every web request and
 * stops routing to the app's web dynos. Worker dynos keep running.
 */
export const setMaintenance = async (
	token: string,
	app: string,
	enabled: boolean
): Promise<{ maintenance: boolean }> => {
	const { data } = await herokuClient(token).patch(`/apps/${encodeURIComponent(app)}`, {
		maintenance: enabled,
	});

	return { maintenance: !!data?.maintenance };
};

/**
 * PATCH /apps/{app} — rename.
 *
 * The git remote and the default `*.herokuapp.com` hostname both follow the
 * name, so anything pointing at the old URL breaks the moment this returns.
 * The UI must say so before calling it.
 */
export const renameApp = async (
	token: string,
	app: string,
	name: string
): Promise<{ name: string; webUrl: string | null; gitUrl: string | null }> => {
	const { data } = await herokuClient(token).patch(`/apps/${encodeURIComponent(app)}`, { name });

	return {
		name: data?.name,
		webUrl: data?.web_url || null,
		gitUrl: data?.git_url || null,
	};
};

/**
 * DELETE /apps/{app} — permanent, immediate, and not recoverable through the
 * API. Every caller must have confirmed with a typed app name first.
 */
export const destroyApp = async (token: string, app: string): Promise<void> => {
	await herokuClient(token).delete(`/apps/${encodeURIComponent(app)}`);
};
