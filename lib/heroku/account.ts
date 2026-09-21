import { herokuClient } from './client.js';

export type HerokuAccountInfo = {
	id: string;
	email: string;
	name: string | null;
	verified: boolean;
	twoFactor: boolean;
	defaultTeam: string | null;
	createdAt: string;
	lastLogin: string | null;
};

export type HerokuRateLimit = {
	remaining: number;
};

/** GET /account — https://devcenter.heroku.com/articles/platform-api-reference#account */
export const getAccount = async (token: string): Promise<HerokuAccountInfo> => {
	const { data } = await herokuClient(token).get('/account');

	return {
		id: data?.id,
		email: data?.email,
		name: data?.name || null,
		verified: !!data?.verified,
		twoFactor: !!data?.two_factor_authentication,
		defaultTeam: data?.default_organization?.name || null,
		createdAt: data?.created_at,
		lastLogin: data?.last_login || null,
	};
};

/** GET /account/rate-limits — the token's remaining hourly budget (of 4500). */
export const getRateLimit = async (token: string): Promise<HerokuRateLimit> => {
	const { data } = await herokuClient(token).get('/account/rate-limits');
	return { remaining: data?.remaining ?? 0 };
};
