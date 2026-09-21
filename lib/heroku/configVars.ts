import { herokuClient } from './client.js';
// Shared with the Vercel environment download — the rules it encodes are
// dotenv's, not Heroku's, and one copy of them is the point.
import { escapeEnvValue } from '../dotenv/escape.js';

export type ConfigVars = Record<string, string | null>;

/** GET /apps/{id_or_name}/config-vars */
export const getConfigVars = async (token: string, app: string): Promise<ConfigVars> => {
	const { data } = await herokuClient(token).get(`/apps/${encodeURIComponent(app)}/config-vars`);
	return data || {};
};

/**
 * PATCH /apps/{id_or_name}/config-vars
 *
 * The patch is a merge, not a replacement: keys present are set, keys absent
 * are left alone, and **a null value deletes a key**. That last part is why
 * deletions have to be sent as an explicit `{ KEY: null }` rather than by
 * omitting the key — omitting it is a no-op.
 *
 * Heroku restarts every dyno on success. The caller is responsible for having
 * confirmed that with the admin first.
 */
export const updateConfigVars = async (
	token: string,
	app: string,
	patch: ConfigVars
): Promise<ConfigVars> => {
	const { data } = await herokuClient(token).patch(
		`/apps/${encodeURIComponent(app)}/config-vars`,
		patch
	);

	return data || {};
};

/** Keys come back in whatever order Heroku felt like; sorted is easier to diff
 *  against a local .env, and makes two downloads of the same app comparable. */
const sortedEntries = (vars: ConfigVars): [string, string][] =>
	Object.keys(vars)
		.sort()
		.map(key => [key, vars[key] == null ? '' : String(vars[key])] as [string, string]);


export const toEnvFile = (app: string, vars: ConfigVars): string => {
	const header = [
		`# Heroku config vars for ${app}`,
		`# Downloaded ${new Date().toISOString()}`,
		'# These are live secrets — do not commit this file.',
		'',
	];

	const body = sortedEntries(vars).map(([key, value]) => `${key}=${escapeEnvValue(value)}`);

	return header.concat(body).join('\n') + '\n';
};

export const toJsonFile = (vars: ConfigVars): string => {
	const sorted = sortedEntries(vars).reduce<Record<string, string>>((acc, [key, value]) => {
		acc[key] = value;
		return acc;
	}, {});

	return JSON.stringify(sorted, null, 2) + '\n';
};
