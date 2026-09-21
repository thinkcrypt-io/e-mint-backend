import axios from 'axios';
import { herokuClient } from './client.js';

export type LogOptions = {
	lines?: number;
	/** `app` for your own output, `heroku` for platform events (restarts, scaling). */
	source?: 'app' | 'heroku' | '';
	/** A process type (`web`) or a single dyno (`web.1`). */
	dyno?: string;
};

/**
 * Logs, in two steps, which is how the Platform API models them.
 *
 * 1. POST a log session, which returns a short-lived pre-signed `logplex_url`.
 * 2. GET that URL for the text.
 *
 * Two things that matter about step 2:
 *
 * - It must **not** carry our Authorization header. The URL is already signed,
 *   and sending a Heroku bearer token to a non-Heroku host is how tokens leak.
 * - The URL must never be returned to the browser. It grants unauthenticated
 *   access to the app's logs for anyone holding it, which would route straight
 *   around the `view-heroku-config` permission this is gated on.
 *
 * `tail` is always false: a streaming session would hold the connection open
 * and this is a request/response API.
 */
export const fetchLogs = async (
	token: string,
	app: string,
	{ lines = 100, source = '', dyno = '' }: LogOptions = {}
): Promise<string[]> => {
	const { data: session } = await herokuClient(token).post(
		`/apps/${encodeURIComponent(app)}/log-sessions`,
		{
			lines,
			tail: false,
			...(source ? { source } : {}),
			...(dyno ? { dyno } : {}),
		}
	);

	const logplexUrl: string | undefined = session?.logplex_url;
	if (!logplexUrl) return [];

	const { data: text } = await axios.get(logplexUrl, {
		timeout: 20000,
		responseType: 'text',
		// Explicitly no Authorization header — see the note above.
		transformResponse: [(value: any) => value],
	});

	return String(text || '')
		.split('\n')
		.filter(line => line.trim().length > 0);
};
