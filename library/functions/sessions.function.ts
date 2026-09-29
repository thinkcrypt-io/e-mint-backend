import crypto from 'crypto';
import AdminSession from '../models/sessions/adminSession.model.js';
import BlacklistedToken from '../models/sessions/blacklistedToken.model.js';

/**
 * Admin login sessions and their revocation.
 *
 *   issueSession   — every place that hands an admin a token (login, 2FA,
 *                    accepting an invite) creates the session row and signs
 *                    its id into the token as `sid`.
 *   sessionIdOf    — a token's session id; `legacy:<hash>` for tokens from
 *                    before sessions, so they can be listed and revoked too.
 *   isRevoked      — adminProtect's check, against BlacklistedToken.
 *   touchSession   — adminProtect's "last active", written at most once a
 *                    minute per session (and creating the row for a legacy
 *                    token the first time it's seen).
 *   revokeSessions — blacklist and mark signed out.
 *
 * The revoked check is cached per process for a few seconds so it isn't a
 * query on every request; a revocation made in this process is seen at once,
 * one made by another process within REVOKED_TTL_MS.
 */

export const REVOKED_CODE = 'SESSION_REVOKED';

const REVOKED_TTL_MS = 5_000;
const TOUCH_EVERY_MS = 60_000;
const CACHE_MAX = 5_000;

/* ------------------------------------------------------------- devices */

export const parseUserAgent = (ua = '') => {
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /OPR\//.test(ua)
		? 'Opera'
		: /Firefox\//.test(ua)
		? 'Firefox'
		: /Chrome\//.test(ua)
		? 'Chrome'
		: /Safari\//.test(ua)
		? 'Safari'
		: /PostmanRuntime|curl|node|axios|undici/i.test(ua)
		? 'API client'
		: 'Unknown browser';
	const os = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
		? 'iPad'
		: /Android/.test(ua)
		? 'Android'
		: /Mac OS X|Macintosh/.test(ua)
		? 'macOS'
		: /Windows/.test(ua)
		? 'Windows'
		: /CrOS/.test(ua)
		? 'ChromeOS'
		: /Linux/.test(ua)
		? 'Linux'
		: 'Unknown OS';
	const deviceType = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'mobile' : ua ? 'desktop' : 'unknown';
	return { browser, os, deviceType: deviceType as 'desktop' | 'mobile' | 'tablet' | 'unknown' };
};

export const clientIp = (req: any) =>
	String(req?.clientIp || req?.headers?.['x-forwarded-for']?.split(',')[0] || req?.ip || '')
		.replace(/^::ffff:/, '')
		.trim();

const deviceOf = (req: any) => {
	const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 500);
	return { ...parseUserAgent(userAgent), userAgent, ip: clientIp(req) };
};

/* ------------------------------------------------------------- issuing */

/** A new session for `admin`, and its token ("Bearer …"). */
export const issueSession = async (admin: any, req: any, method: string) => {
	const sid = crypto.randomUUID();
	const device = deviceOf(req);
	await AdminSession.create({ admin: admin._id, sid, method, ...device, lastIp: device.ip, lastActiveAt: new Date() });
	return `Bearer ${admin.generateAuthToken(sid)}`;
};

/** The session a verified token belongs to. */
export const sessionIdOf = (decoded: any, rawToken: string) =>
	typeof decoded?.sid === 'string' && decoded.sid
		? decoded.sid
		: `legacy:${crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 40)}`;

/* ------------------------------------------------------------ checking */

const revokedCache = new Map<string, { revoked: boolean; at: number }>();

const remember = (sid: string, revoked: boolean) => {
	if (revokedCache.size >= CACHE_MAX) revokedCache.delete(revokedCache.keys().next().value as string);
	revokedCache.set(sid, { revoked, at: Date.now() });
};

export const isRevoked = async (sid: string) => {
	const hit = revokedCache.get(sid);
	// A revocation is for good; a "still valid" answer is only trusted briefly.
	if (hit && (hit.revoked || Date.now() - hit.at < REVOKED_TTL_MS)) return hit.revoked;
	const revoked = !!(await BlacklistedToken.exists({ sid }));
	remember(sid, revoked);
	return revoked;
};

const touched = new Map<string, number>();

/** Records activity for a session, at most once a minute. Never throws, never waits. */
export const touchSession = (req: any, adminId: any, sid: string) => {
	const now = Date.now();
	if (now - (touched.get(sid) || 0) < TOUCH_EVERY_MS) return;
	if (touched.size >= CACHE_MAX) touched.delete(touched.keys().next().value as string);
	touched.set(sid, now);
	const device = deviceOf(req);
	AdminSession.updateOne(
		{ sid },
		{
			$set: { lastActiveAt: new Date(now), lastIp: device.ip },
			// A token from before sessions: its row starts now, from what this request shows.
			$setOnInsert: { admin: adminId, method: 'legacy', browser: device.browser, os: device.os, deviceType: device.deviceType, userAgent: device.userAgent, ip: device.ip },
		},
		{ upsert: true }
	).catch((e: any) => console.error('touchSession:', e?.message));
};

/* ------------------------------------------------------------ revoking */

/** Signs out these sessions for good: blacklisted, and marked on their rows. Returns how many were newly revoked. */
export const revokeSessions = async (sessions: any[], by: any, reason: string) => {
	const live = sessions.filter(s => s && !s.revokedAt);
	if (!live.length) return 0;
	await BlacklistedToken.bulkWrite(
		live.map(s => ({
			updateOne: {
				filter: { sid: s.sid },
				update: { $setOnInsert: { sid: s.sid, admin: s.admin, session: s._id, revokedBy: by, reason } },
				upsert: true,
			},
		}))
	);
	await AdminSession.updateMany(
		{ _id: { $in: live.map(s => s._id) } },
		{ $set: { revokedAt: new Date(), revokedBy: by, revokeReason: reason } }
	);
	live.forEach(s => remember(s.sid, true));
	return live.length;
};
