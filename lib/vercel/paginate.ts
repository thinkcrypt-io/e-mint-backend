import { AxiosInstance } from 'axios';
import { withTeam } from './client.js';

/**
 * Cursor pagination, which Vercel uses for projects and deployments.
 *
 * Nothing like Heroku's Range headers, so `lib/heroku/range.ts` does not
 * transfer. A list request takes `limit` plus an optional `until` (milliseconds
 * since the epoch) and answers with the collection alongside
 * `{ pagination: { count, next, prev } }`. `next` is the timestamp to send as
 * `until` on the following page, and is null on the last one.
 *
 * The collection key differs per endpoint (`projects`, `deployments`, ...), so
 * callers name it rather than this guessing from the response shape.
 */

export type PageOptions = {
	limit?: number;
	/** A `pagination.next` value from a previous call. */
	until?: number | null;
	team?: string;
	/** Endpoint-specific filters, merged into the query string. */
	params?: Record<string, any>;
};

export type PagedResult<T> = {
	items: T[];
	/** Pass back as `until` for the next page; null when the list ends. */
	next: number | null;
};

/** Vercel caps page size server-side; asking for more just wastes the request. */
export const MAX_PAGE = 100;

export const pagedGet = async <T = any>(
	client: AxiosInstance,
	path: string,
	collection: string,
	{ limit = 50, until, team, params = {} }: PageOptions = {}
): Promise<PagedResult<T>> => {
	const query = withTeam(
		{
			...params,
			limit: Math.min(limit, MAX_PAGE),
			...(until ? { until } : {}),
		},
		team
	);

	const { data } = await client.get(path, { params: query });

	const next = data?.pagination?.next;

	return {
		items: data?.[collection] || [],
		// Vercel sends null on the last page; normalise anything non-numeric to
		// null so a caller looping on truthiness cannot spin.
		next: typeof next === 'number' && next > 0 ? next : null,
	};
};

/**
 * Walk every page of a list.
 *
 * `maxPages` is a guard, not a preference: the account usage window (VWO-22)
 * pulls a month of deployments across every project, and an endpoint that kept
 * returning a `next` would otherwise loop until the request timed out. Callers
 * that hit the cap get what was fetched, which is better than nothing and
 * better than hanging.
 */
export const pagedGetAll = async <T = any>(
	client: AxiosInstance,
	path: string,
	collection: string,
	options: PageOptions = {},
	maxPages = 20
): Promise<T[]> => {
	const all: T[] = [];
	let until: number | null = options.until ?? null;
	let pages = 0;

	while (pages < maxPages) {
		const page: PagedResult<T> = await pagedGet<T>(client, path, collection, {
			...options,
			limit: options.limit || MAX_PAGE,
			until,
		});

		all.push(...page.items);
		pages += 1;

		if (!page.next || !page.items.length) break;
		until = page.next;
	}

	return all;
};
