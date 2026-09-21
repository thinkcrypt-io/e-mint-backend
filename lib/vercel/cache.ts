/**
 * A small in-process TTL cache in front of the Vercel REST API.
 *
 * Same shape as `lib/heroku/cache.ts`, with one difference that matters: **the
 * team is part of the key**. The same `kind` under two scopes is two different
 * answers, and leaving the team out would serve one team's project list under
 * another — or, more likely here, a team's list under the personal account.
 *
 * Unlike Heroku's flat 4500/hour, Vercel's limits vary by endpoint and are only
 * knowable from the `x-ratelimit-*` headers, so these TTLs are tuned to how
 * fast each resource actually changes rather than to a budget. Revise them once
 * VWO-01 #6 reports what the real headers say.
 *
 * What is never cached, and must not be added to CACHE_TTL:
 *   - environment variables, which are live secrets and must always read fresh
 *   - build logs and runtime logs, for the same reason plus they change constantly
 */

type Entry = { value: any; expiresAt: number };

const store = new Map<string, Entry>();

/** Seconds. */
export const CACHE_TTL = {
	user: 60,
	teams: 300,
	projects: 60,
	project: 30,
	deployments: 15,
	deployment: 10,
	domains: 120,
	resources: 300,
	accountResources: 300,
	usage: 300,
} as const;

export type CacheKind = keyof typeof CACHE_TTL;

/** `team` is intentionally in the key, not appended to the suffix — see above. */
const keyFor = (accountId: string, team: string, kind: string, suffix = '') =>
	`${accountId}:${team || 'personal'}:${kind}${suffix ? `:${suffix}` : ''}`;

/**
 * Read through the cache, or call `loader` and store the result.
 *
 * A rejected `loader` is not cached — an outage or a 429 should not be
 * remembered for the next five minutes.
 */
export const cached = async <T>(
	accountId: string,
	team: string,
	kind: CacheKind,
	suffix: string,
	loader: () => Promise<T>
): Promise<T> => {
	const key = keyFor(accountId, team, kind, suffix);
	const hit = store.get(key);

	if (hit && hit.expiresAt > Date.now()) return hit.value as T;

	const value = await loader();
	store.set(key, { value, expiresAt: Date.now() + CACHE_TTL[kind] * 1000 });

	return value;
};

/**
 * Drop cached reads for one account after a write.
 *
 * Broad rather than surgical, and deliberately across every team scope: a
 * project write moves the account-level project list, the usage window and the
 * resource rollup at once. An over-eager invalidation costs one request; a
 * missed one shows the admin a stale deployment list immediately after they
 * deployed, which is the moment they are most likely to be watching.
 */
export const invalidate = (accountId: string, projectRef?: string): void => {
	const prefix = `${accountId}:`;

	store.forEach((_, key) => {
		if (!key.startsWith(prefix)) return;

		if (projectRef && !key.includes(projectRef)) {
			// Account-level aggregates still move when one project changes, so
			// those are cleared regardless of which project it was.
			const isAggregate =
				key.includes(':projects') ||
				key.includes(':usage') ||
				key.includes(':accountResources');

			if (!isAggregate) return;
		}

		store.delete(key);
	});
};

/** Test seam. */
export const clearAll = (): void => store.clear();
