import { AxiosInstance } from 'axios';

/**
 * Range pagination, which Heroku uses for releases, builds and dynos instead of
 * page/limit query params.
 *
 * The request carries `Range: <field> ..; order=desc, max=50`; a partial
 * response comes back 206 with a `Next-Range` header that is an opaque cursor
 * for the following page. Callers should treat that cursor as a token, not
 * parse it — the shape is Heroku's to change.
 *
 * https://devcenter.heroku.com/articles/platform-api-reference#ranges
 */

export type RangeOptions = {
	/** The field to sort and page on. `version` for releases and builds. */
	field?: string;
	order?: 'asc' | 'desc';
	max?: number;
	/** A `Next-Range` value from a previous call. Overrides the other options. */
	cursor?: string;
};

export type RangedResult<T> = {
	items: T[];
	/** Pass back as `cursor` to fetch the next page; null when the list ends. */
	nextRange: string | null;
};

export const buildRangeHeader = ({
	field = 'version',
	order = 'desc',
	max = 50,
	cursor,
}: RangeOptions = {}): string => {
	if (cursor) return cursor;
	return `${field} ..; order=${order}, max=${max}`;
};

export const rangedGet = async <T = any>(
	client: AxiosInstance,
	path: string,
	options: RangeOptions = {}
): Promise<RangedResult<T>> => {
	const response = await client.get(path, {
		headers: { Range: buildRangeHeader(options) },
		// A 206 is the normal, successful answer for a partial list — without this
		// axios treats it as an error and every paginated read throws.
		validateStatus: status => status >= 200 && status < 300,
	});

	const nextRange = response.headers?.['next-range'];

	return {
		items: response.data || [],
		nextRange: typeof nextRange === 'string' && nextRange.length ? nextRange : null,
	};
};
