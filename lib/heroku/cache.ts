/**
 * A small in-process TTL cache in front of the Platform API.
 *
 * The budget is 4500 requests/hour **per API key**, shared by every admin
 * looking at that account. One app page open fires roughly eight calls, so a
 * few people with tabs open on a polling admin will exhaust it without this.
 *
 * In-process, not Redis, on purpose: the TTLs here are seconds, the payloads
 * are small, and a stale entry surviving a deploy would be worse than a cold
 * start. If this backend is ever scaled past one process, each process keeping
 * its own copy is still correct — just less effective.
 *
 * What is never cached, and must not be added to CACHE_TTL:
 *   - config vars, which are live secrets and must always be read fresh
 *   - logs, for the same reason plus they are different every second
 */

type Entry = { value: any; expiresAt: number };

const store = new Map<string, Entry>();

/** Seconds. Tuned to how fast each resource actually changes. */
export const CACHE_TTL = {
	apps: 60,
	app: 30,
	formation: 10,
	dynos: 10,
	releases: 15,
	builds: 15,
	addons: 120,
	domains: 120,
	collaborators: 120,
	invoices: 300,
	usage: 300,
	account: 30,
} as const;

export type CacheKind = keyof typeof CACHE_TTL;

const keyFor = (accountId: string, kind: string, suffix = '') =>
	`${accountId}:${kind}${suffix ? `:${suffix}` : ''}`;

/**
 * Read through the cache, or call `loader` and store the result.
 *
 * A rejected `loader` is not cached — an outage or a 429 should not be
 * remembered for the next 60 seconds.
 */
export const cached = async <T>(
	accountId: string,
	kind: CacheKind,
	suffix: string,
	loader: () => Promise<T>
): Promise<T> => {
	const key = keyFor(accountId, kind, suffix);
	const hit = store.get(key);

	if (hit && hit.expiresAt > Date.now()) return hit.value as T;

	const value = await loader();
	store.set(key, { value, expiresAt: Date.now() + CACHE_TTL[kind] * 1000 });

	return value;
};

/**
 * Drop cached reads for one account after a write.
 *
 * Called with an app name, it also clears that app's entries. Broad rather than
 * surgical: after a restart or a scale, several resources move at once, and an
 * over-eager invalidation costs one request while a missed one shows the admin
 * a stale dyno count right after they changed it.
 */
export const invalidate = (accountId: string, appName?: string): void => {
	const prefix = `${accountId}:`;

	store.forEach((_, key) => {
		if (!key.startsWith(prefix)) return;
		if (appName && !key.includes(appName)) {
			// Account-level lists still move when an app changes (appCount, usage),
			// so those are cleared regardless of which app it was.
			if (!key.startsWith(`${prefix}apps`)) return;
		}
		store.delete(key);
	});
};

/** Test seam. */
export const clearAll = (): void => store.clear();
