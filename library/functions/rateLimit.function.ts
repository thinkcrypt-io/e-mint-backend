/**
 * A small in-process rate limit for public endpoints (tenant sign-up and
 * sign-in, the public API's customer auth, analytics). Per key — usually the
 * client IP plus the route — at most `max` hits per `windowMs`. In-memory, so
 * per process: it slows a script down, it isn't a distributed quota.
 */
import { clientIp } from './sessions.function.js';

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 50_000;

export const rateLimit =
	({ windowMs, max, name }: { windowMs: number; max: number; name: string }) =>
	(req: any, res: any, next: any) => {
		const key = `${name}:${clientIp(req)}`;
		const now = Date.now();
		let b = buckets.get(key);
		if (!b || b.resetAt <= now) {
			if (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value as string);
			b = { count: 0, resetAt: now + windowMs };
			buckets.set(key, b);
		}
		b.count += 1;
		if (b.count > max) {
			res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
			return res.status(429).json({ message: 'Too many attempts — wait a little and try again.', code: 'rate_limited' });
		}
		next();
	};
