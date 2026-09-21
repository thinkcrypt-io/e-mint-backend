import axios, { AxiosInstance, AxiosResponse } from 'axios';

/**
 * Thin wrapper over the documented Vercel REST API.
 * https://vercel.com/docs/rest-api
 *
 * Raw axios rather than the installed `@vercel/sdk`, deliberately. The value of
 * this layer is not the HTTP call, it is `toVercelError` — one place that turns
 * an upstream failure into something with a status we can pass straight
 * through. The cache and the paginator both wrap a request function, and
 * wrapping one `get` is better than wrapping 142 generated SDK methods. The SDK
 * stays installed and `controllers/hongo` keeps using it; nothing forces a
 * single choice.
 */

export const VERCEL_API = 'https://api.vercel.com';

const TIMEOUT_MS = 20000;

export const vercelClient = (token: string): AxiosInstance =>
	axios.create({
		baseURL: VERCEL_API,
		timeout: TIMEOUT_MS,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

/**
 * Append the team scope to a query object.
 *
 * **Every** service function goes through this. Nearly every Vercel endpoint
 * takes an optional `teamId`, and getting it wrong is a silent failure rather
 * than an error: with no `teamId` the call is scoped to the personal account,
 * and with the wrong one it returns an empty list. Neither throws. One
 * chokepoint is the only way to keep that from recurring in forty call sites.
 *
 * On a Hobby/personal account `team` is undefined and omitting the parameter is
 * the correct behaviour, not a fallback.
 */
export const withTeam = (params: Record<string, any> = {}, team?: string): Record<string, any> => {
	if (!team) return params;
	return { ...params, teamId: team };
};

export type VercelError = {
	/** The status we should answer our own client with. */
	status: number;
	message: string;
	/** Vercel's machine-readable code, e.g. `forbidden`, `not_found`. */
	code?: string;
	/** True when the token itself is the problem, so the caller can mark the
	 *  stored account invalid rather than just surfacing a red toast. */
	invalidToken: boolean;
	/** Set when the failure was a plan restriction rather than a real error, so
	 *  the UI can render "not available on this plan" instead of an error state. */
	planRestricted?: boolean;
};

/**
 * Vercel answers errors as `{ error: { code, message } }`.
 *
 * `invalidToken` is set for 401 only, never for 403. A 403 here means "this
 * token cannot reach that resource", which on a Hobby account is far more often
 * a plan restriction than a revoked token — flipping the stored account to
 * `invalid` because the storage API is Pro-only would be actively misleading.
 * The reliable token test is `GET /v2/user`, which is what `POST /verify` and
 * the account sync use.
 */
export const toVercelError = (e: any): VercelError => {
	const status: number = e?.response?.status || 500;
	const code: string | undefined = e?.response?.data?.error?.code;
	const raw: string | undefined = e?.response?.data?.error?.message;

	if (e?.code === 'ECONNABORTED') {
		return { status: 504, message: 'Vercel did not respond in time', invalidToken: false };
	}

	if (status === 401) {
		return {
			status: 401,
			code,
			message: 'Vercel rejected this token. It may have been revoked or regenerated.',
			invalidToken: true,
		};
	}

	if (status === 403) {
		return {
			status: 403,
			code,
			message: raw || 'This token does not have access to that resource.',
			invalidToken: false,
			// The caller decides whether to render this as a plan notice. A 403
			// from the storage or log-drain endpoints means "not on this plan";
			// a 403 from a project route means the token cannot see it.
			planRestricted: true,
		};
	}

	if (status === 404) {
		return {
			status: 404,
			code,
			message: raw || 'Not found on Vercel.',
			invalidToken: false,
		};
	}

	if (status === 429) {
		const resetAt = readResetAt(e?.response);

		return {
			status: 429,
			code,
			message: resetAt
				? `Vercel rate limit reached for this token. Try again after ${resetAt.toISOString()}.`
				: 'Vercel rate limit reached for this token. Try again shortly.',
			invalidToken: false,
		};
	}

	return {
		status: status >= 400 ? status : 500,
		code,
		message: raw || e?.message || 'Vercel request failed',
		invalidToken: false,
	};
};

export type RateLimit = {
	limit: number | null;
	remaining: number | null;
	resetAt: Date | null;
};

const num = (v: any): number | null => {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

const readResetAt = (response?: AxiosResponse): Date | null => {
	const reset = num(response?.headers?.['x-ratelimit-reset']);
	if (reset === null) return null;

	// Seconds since the epoch, not milliseconds, and not a duration. Guard the
	// scale anyway: a value small enough to be a duration is treated as one, so
	// a header format change degrades to a sane time instead of 1970.
	if (reset < 1e6) return new Date(Date.now() + reset * 1000);
	return new Date(reset * 1000);
};

/**
 * Read the rate budget off a response, or null when Vercel did not send it.
 *
 * Nothing hardcodes a budget: unlike Heroku's flat 4500/hour, Vercel's limits
 * vary by endpoint and are only knowable from these headers. Returning null
 * when they are absent is the honest answer — the account page shows nothing
 * rather than a made-up number.
 */
export const readRateLimit = (response?: AxiosResponse): RateLimit | null => {
	if (!response?.headers) return null;

	const limit = num(response.headers['x-ratelimit-limit']);
	const remaining = num(response.headers['x-ratelimit-remaining']);
	const resetAt = readResetAt(response);

	if (limit === null && remaining === null && resetAt === null) return null;

	return { limit, remaining, resetAt };
};
