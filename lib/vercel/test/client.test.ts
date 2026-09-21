import { withTeam, toVercelError, readRateLimit } from '../client.js';

describe('withTeam', () => {
	it('omits teamId entirely when there is no team', () => {
		// The personal scope IS an absent teamId. Sending `teamId: ''` or
		// `teamId: undefined` would either scope to nothing or serialise into the
		// query string, and both fail silently by returning an empty list.
		expect(withTeam({ limit: 10 })).toEqual({ limit: 10 });
		expect(withTeam({ limit: 10 }, '')).toEqual({ limit: 10 });
		expect(withTeam({ limit: 10 }, undefined)).toEqual({ limit: 10 });
	});

	it('adds teamId when there is one, without losing the other params', () => {
		expect(withTeam({ limit: 10, search: 'shop' }, 'team_abc')).toEqual({
			limit: 10,
			search: 'shop',
			teamId: 'team_abc',
		});
	});

	it('does not mutate the params it was given', () => {
		const params = { limit: 10 };
		withTeam(params, 'team_abc');
		expect(params).toEqual({ limit: 10 });
	});
});

const upstream = (status: number, code?: string, message?: string, headers: any = {}) => ({
	response: { status, data: code ? { error: { code, message } } : {}, headers },
});

describe('toVercelError', () => {
	it('marks a 401 as an invalid token', () => {
		const error = toVercelError(upstream(401, 'forbidden', 'Not authorized'));
		expect(error.status).toBe(401);
		expect(error.invalidToken).toBe(true);
	});

	it('does NOT mark a 403 as an invalid token', () => {
		// On a Hobby account a 403 is far more often a plan restriction than a
		// revoked token. Flipping the stored account to `invalid` because the
		// storage API is Pro-only would be actively misleading.
		const error = toVercelError(upstream(403, 'forbidden', 'Not available on your plan'));
		expect(error.status).toBe(403);
		expect(error.invalidToken).toBe(false);
		expect(error.planRestricted).toBe(true);
	});

	it('passes a 404 message through', () => {
		const error = toVercelError(upstream(404, 'not_found', 'Project not found'));
		expect(error.status).toBe(404);
		expect(error.message).toBe('Project not found');
	});

	it('puts the reset time in a 429 message when the header is present', () => {
		const resetAt = Math.floor(Date.now() / 1000) + 600;
		const error = toVercelError(
			upstream(429, 'rate_limited', 'Too many requests', { 'x-ratelimit-reset': String(resetAt) })
		);
		expect(error.status).toBe(429);
		expect(error.message).toContain(new Date(resetAt * 1000).toISOString());
	});

	it('maps a timeout to 504 rather than a generic 500', () => {
		const error = toVercelError({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' });
		expect(error.status).toBe(504);
		expect(error.invalidToken).toBe(false);
	});
});

describe('readRateLimit', () => {
	it('returns null when Vercel sent no rate headers', () => {
		// Nothing may invent a budget. Vercel's limits vary by endpoint and are
		// only knowable from the headers, so absent means "show nothing".
		expect(readRateLimit({ headers: {} } as any)).toBeNull();
		expect(readRateLimit(undefined)).toBeNull();
	});

	it('reads limit, remaining and reset', () => {
		const resetAt = Math.floor(Date.now() / 1000) + 60;
		const rate = readRateLimit({
			headers: {
				'x-ratelimit-limit': '100',
				'x-ratelimit-remaining': '97',
				'x-ratelimit-reset': String(resetAt),
			},
		} as any);

		expect(rate).not.toBeNull();
		expect(rate!.limit).toBe(100);
		expect(rate!.remaining).toBe(97);
		expect(rate!.resetAt!.getTime()).toBe(resetAt * 1000);
	});

	it('treats a small reset value as a duration, not as 1970', () => {
		const rate = readRateLimit({ headers: { 'x-ratelimit-reset': '30' } } as any);
		expect(rate!.resetAt!.getTime()).toBeGreaterThan(Date.now());
	});
});
