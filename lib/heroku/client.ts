import axios, { AxiosInstance } from 'axios';

/**
 * Thin wrapper over the documented Heroku Platform API (v3).
 * https://devcenter.heroku.com/articles/platform-api-reference
 *
 * Nothing in here touches an undocumented endpoint: everything is a resource
 * listed in that reference, so it will not break under us the way the private
 * GitHub-integration API would.
 */

export const HEROKU_API = 'https://api.heroku.com';

/** Version pinning is not optional — without this header the API answers with
 *  a deprecated default that has different field names. */
export const HEROKU_ACCEPT = 'application/vnd.heroku+json; version=3';

const TIMEOUT_MS = 20000;

export const herokuClient = (token: string): AxiosInstance =>
	axios.create({
		baseURL: HEROKU_API,
		timeout: TIMEOUT_MS,
		headers: {
			Accept: HEROKU_ACCEPT,
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

export type HerokuError = {
	/** The status we should answer our own client with. */
	status: number;
	message: string;
	/** Heroku's machine-readable error id, e.g. `unauthorized`, `rate_limit`. */
	id?: string;
	/** True when the key itself is the problem, so the caller can mark the
	 *  stored account invalid rather than just surfacing a red toast. */
	invalidToken: boolean;
};

/**
 * Heroku answers errors as `{ id, message, url }`. Turn that into something
 * with a status we can pass straight through, and a readable message — the raw
 * ones are good, but a few of them need context our admins will not have.
 */
export const toHerokuError = (e: any): HerokuError => {
	const status: number = e?.response?.status || 500;
	const id: string | undefined = e?.response?.data?.id;
	const raw: string | undefined = e?.response?.data?.message;

	if (e?.code === 'ECONNABORTED') {
		return { status: 504, message: 'Heroku did not respond in time', invalidToken: false };
	}

	switch (id) {
		case 'unauthorized':
			return {
				status: 401,
				id,
				message: 'Heroku rejected this API key. It may have been revoked or regenerated.',
				invalidToken: true,
			};
		case 'forbidden':
			return {
				status: 403,
				id,
				message: raw || 'This API key does not have access to that resource.',
				invalidToken: false,
			};
		case 'not_found':
			return {
				status: 404,
				id,
				message: raw || 'Not found on Heroku.',
				invalidToken: false,
			};
		case 'rate_limit':
			return {
				status: 429,
				id,
				message:
					'Heroku rate limit reached for this API key (4500 requests/hour). Try again shortly.',
				invalidToken: false,
			};
		case 'two_factor':
			return {
				status: 428,
				id,
				message:
					'This account requires two-factor verification for that request. Use a token created with `heroku authorizations:create`.',
				invalidToken: false,
			};
		default:
			return {
				status: status >= 400 ? status : 500,
				id,
				message: raw || e?.message || 'Heroku request failed',
				invalidToken: false,
			};
	}
};
