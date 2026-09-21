import { vercelClient, withTeam, readRateLimit, RateLimit } from './client.js';

export type VercelUserInfo = {
	userId: string | null;
	username: string | null;
	userEmail: string | null;
	displayName: string | null;
	plan: 'hobby' | 'pro' | 'enterprise' | 'unknown';
	avatar: string | null;
	createdAt: string | null;
	/** Null when Vercel sent no `x-ratelimit-*` headers, which is common. */
	rateLimit: RateLimit | null;
};

/**
 * Which plan the account is on, from whatever the user object happens to carry.
 *
 * VWO-01 #1 asked a real account and the answer was: nothing useful. The only
 * plan-shaped field on `GET /v2/user` is `version`, and it came back
 * `northstar` — that is Vercel's dashboard generation, not a billing plan, so
 * it is deliberately **not** read here. Misreading it would have labelled every
 * account "unknown plan: northstar" or, worse, guessed.
 *
 * The remaining candidates are kept because they cost nothing and may appear on
 * a team account. When none matches, `planFromCapability` below is the real
 * answer.
 */
const planFromUser = (user: any): VercelUserInfo['plan'] => {
	const candidates = [user?.billing?.plan, user?.billing?.tier, user?.plan, user?.tier];

	for (let i = 0; i < candidates.length; i += 1) {
		const value = String(candidates[i] || '').toLowerCase();

		if (value === 'hobby' || value === 'free') return 'hobby';
		if (value === 'pro' || value === 'premium') return 'pro';
		if (value === 'enterprise') return 'enterprise';
	}

	return 'unknown';
};

/**
 * Ask the API what the account is allowed to do, and infer the plan from that.
 *
 * `GET /v1/usage` is Pro-and-above and says so precisely: with a valid ISO
 * range it answers either 200 or a 400 carrying `plan_upgrade_required` and the
 * message "This API endpoint is only available to Teams on the Pro or
 * Enterprise plan." That makes it a reliable plan probe, and it is the only one
 * this API offers (VWO-01 #1, #11).
 *
 * Inferring a plan from a capability rather than a field is not ideal, and it
 * is documented as such: if Vercel ever exposes the plan directly, `planFromUser`
 * should win and this should go. Until then the console needs *some* basis for
 * saying "not available on your plan", and a wrong guess there hides features
 * that actually work.
 */
export const planFromCapability = async (
	token: string,
	team?: string
): Promise<VercelUserInfo['plan']> => {
	const to = new Date();
	const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

	try {
		await vercelClient(token).get('/v1/usage', {
			params: withTeam({ from: from.toISOString(), to: to.toISOString() }, team),
		});

		// 200 means metered usage is available, so Pro at least. Pro and
		// Enterprise are not distinguishable from here, and nothing in the
		// console needs to tell them apart.
		return 'pro';
	} catch (e: any) {
		if (e?.response?.data?.error?.code === 'plan_upgrade_required') return 'hobby';
		return 'unknown';
	}
};

/**
 * GET /v2/user — identity, and the only reliable test of whether a token works.
 *
 * Every other endpoint can fail for reasons that have nothing to do with the
 * token (a plan restriction, a project that does not exist, a team the token is
 * not in), which is why `handleVercelFailure` does not infer token validity
 * from an arbitrary 403. This call either answers or the token is bad.
 */
export const getUser = async (token: string, team?: string): Promise<VercelUserInfo> => {
	const response = await vercelClient(token).get('/v2/user');
	const user = response.data?.user || response.data || {};

	const declared = planFromUser(user);
	// One extra request, only when the user object did not say — which on every
	// account tested so far is always. The account read is cached for 60s, so
	// this is not per page view.
	const plan = declared === 'unknown' ? await planFromCapability(token, team) : declared;

	return {
		userId: user.id || user.uid || null,
		username: user.username || null,
		userEmail: user.email || null,
		displayName: user.name || null,
		plan,
		avatar: user.avatar || null,
		createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
		rateLimit: readRateLimit(response),
	};
};
