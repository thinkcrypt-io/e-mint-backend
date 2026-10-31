/**
 * The couriers' one way out (docs/couriers README §4): JSON over fetch with a
 * 15 s limit, answers kept whatever their status (adapters read the courier's
 * own error), and failures in plain words. Never logs a request — headers and
 * bodies carry keys.
 */

export class CourierError extends Error {
	constructor(message: string, public kind: 'network' | 'timeout' | 'answer' = 'network') {
		super(message);
	}
}

/**
 * Smoke tests point every courier at one local stub (scripts/tenancy-smoke/courier-stub.mjs):
 * COURIER_STUB_URL=http://127.0.0.1:4599 → <stub>/<courier>/<mode>. Ignored in production.
 */
export const baseUrl = (courier: string, mode: string, real: string) => {
	const stub = process.env.NODE_ENV !== 'production' && process.env.COURIER_STUB_URL;
	return stub ? `${stub.replace(/\/$/, '')}/${courier}/${mode}` : real;
};

export type Answer = { status: number; body: any };

export const courierFetch = async (
	name: string,
	url: string,
	{ method = 'GET', headers = {}, body, timeout = 15000 }: { method?: string; headers?: Record<string, string>; body?: any; timeout?: number } = {}
): Promise<Answer> => {
	let r: Response;
	try {
		r = await fetch(url, {
			method,
			headers: { accept: 'application/json', ...(body !== undefined && { 'content-type': 'application/json' }), ...headers },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(timeout),
		});
	} catch (e: any) {
		if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new CourierError(`${name} didn’t answer in ${Math.round(timeout / 1000)} seconds — try again in a minute.`, 'timeout');
		throw new CourierError(`Couldn’t reach ${name} — check again in a minute.`, 'network');
	}
	const text = await r.text().catch(() => '');
	let parsed: any = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = { raw: text.slice(0, 500) };
	}
	return { status: r.status, body: parsed };
};

/** The courier's own words for a refusal, from the shapes they use (message, errors {field: [..]}, error). */
export const courierWords = (body: any): string => {
	if (!body) return '';
	if (typeof body.message === 'string' && body.message) return body.message;
	if (typeof body.error === 'string') return body.error;
	const errs = body.errors && typeof body.errors === 'object' ? Object.values(body.errors).flat() : [];
	return errs.filter(x => typeof x === 'string').join(' ');
};
