import crypto from 'crypto';
import mongoose from 'mongoose';
import AdminSession, { Place } from '../models/sessions/adminSession.model.js';
import BlacklistedToken from '../models/sessions/blacklistedToken.model.js';
import { TenantSession, TenantBlacklistedToken } from '../models/sessions/tenantSession.model.js';

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
 *
 * `makeSessions` builds the service over a session and a blacklist
 * collection: the exports below are the admins' (unchanged), and
 * `tenantSessions` is the tenant users' (docs/multi-tenancy WO-04), whose
 * tokens also name the organization they work in.
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

/* ------------------------------------------------------------ location */

/**
 * Where an IP is — "Dhaka, Bangladesh" — from ipwho.is (free, no key; set
 * GEOIP_URL for another service with the same answer shape, GEOIP_LOOKUP=off
 * to never send IPs out). Looked up once per IP a day per process and stored
 * on the session, so a list never waits on it. Private and local addresses
 * are "Local network" without a lookup.
 */
const PRIVATE_IP = /^(::1$|::$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|f[cd][0-9a-f]{2}:|fe80:|localhost$)/i;
const PLACE_TTL_MS = 24 * 60 * 60 * 1000;
const places = new Map<string, { place: Place | null; at: number }>();

export const locate = async (ip?: string | null): Promise<Place | null> => {
	if (!ip) return null;
	if (PRIVATE_IP.test(ip)) return { ip, local: true };
	if (process.env.GEOIP_LOOKUP === 'off') return null;
	const hit = places.get(ip);
	if (hit && Date.now() - hit.at < PLACE_TTL_MS) return hit.place;
	let place: Place | null = null;
	try {
		const base = (process.env.GEOIP_URL || 'https://ipwho.is').replace(/\/$/, '');
		const r = await fetch(`${base}/${encodeURIComponent(ip)}?fields=success,city,region,country,country_code`, {
			signal: AbortSignal.timeout(3000),
		});
		const j: any = await r.json();
		if (j?.success !== false && (j?.country || j?.city))
			place = { ip, city: j.city || undefined, region: j.region || undefined, country: j.country || undefined, countryCode: j.country_code || undefined };
	} catch (e: any) {
		console.error('locate:', e?.message);
		return null; // not cached: try again next time
	}
	if (places.size >= CACHE_MAX) places.delete(places.keys().next().value as string);
	places.set(ip, { place, at: Date.now() });
	return place;
};

/** "Dhaka, Bangladesh" · "Local network" · '' */
export const placeName = (p?: Place | null) =>
	!p ? '' : p.local ? 'Local network' : [p.city, p.country].filter(Boolean).join(', ');

/* ------------------------------------------------------------- service */

type SessionModels = { Session: mongoose.Model<any>; Blacklist: mongoose.Model<any> };

export const makeSessions = ({ Session, Blacklist }: SessionModels) => {
	/** Fills in where a session is, after the fact (never holds up the caller). */
	const placeSession = (sid: string, ip: string, firstSeen = false) =>
		locate(ip)
			.then(place => {
				if (!place) return;
				const set: any = { lastLocation: place };
				if (firstSeen) set.location = place;
				return Session.updateOne({ sid }, { $set: set }).then(() =>
					// A row with no sign-in place yet (a legacy token) takes the first one found.
					Session.updateOne({ sid, location: { $exists: false } }, { $set: { location: place } })
				);
			})
			.catch((e: any) => console.error('placeSession:', e?.message));

	/**
	 * Places for rows listed before their lookup finished (or from before
	 * locations existed): looked up now, at most ~2 s, saved for next time.
	 */
	const withPlaces = async (rows: any[]) => {
		const missing = rows.filter(s => !s.lastLocation && (s.lastIp || s.ip));
		if (!missing.length) return rows;
		const fill = Promise.all(
			missing.slice(0, 25).map(async s => {
				const place = await locate(s.lastIp || s.ip);
				if (!place) return;
				const firstPlace = !s.location;
				s.lastLocation = place;
				if (firstPlace) s.location = place;
				Session.updateOne({ _id: s._id }, { $set: { lastLocation: place, ...(firstPlace && { location: place }) } }).catch(() => undefined);
			})
		);
		await Promise.race([fill, new Promise(r => setTimeout(r, 2000))]);
		return rows;
	};

	/**
	 * A new session for `user`, and its token ("Bearer …"). `org` is signed
	 * into a tenant user's token (the organization it works in).
	 */
	const issueSession = async (user: any, req: any, method: string, org?: any) => {
		const sid = crypto.randomUUID();
		const device = deviceOf(req);
		await Session.create({ admin: user._id, sid, method, ...device, lastIp: device.ip, lastActiveAt: new Date() });
		located.set(sid, device.ip);
		placeSession(sid, device.ip, true);
		return `Bearer ${user.generateAuthToken(sid, org)}`;
	};

	const revokedCache = new Map<string, { revoked: boolean; at: number }>();

	const remember = (sid: string, revoked: boolean) => {
		if (revokedCache.size >= CACHE_MAX) revokedCache.delete(revokedCache.keys().next().value as string);
		revokedCache.set(sid, { revoked, at: Date.now() });
	};

	const isRevoked = async (sid: string) => {
		const hit = revokedCache.get(sid);
		// A revocation is for good; a "still valid" answer is only trusted briefly.
		if (hit && (hit.revoked || Date.now() - hit.at < REVOKED_TTL_MS)) return hit.revoked;
		const revoked = !!(await Blacklist.exists({ sid }));
		remember(sid, revoked);
		return revoked;
	};

	const touched = new Map<string, number>();
	/** The IP each session was last located from, so a move (home → office) is looked up once. */
	const located = new Map<string, string>();

	/** Records activity for a session, at most once a minute. Never throws, never waits. */
	const touchSession = (req: any, userId: any, sid: string) => {
		const now = Date.now();
		if (now - (touched.get(sid) || 0) < TOUCH_EVERY_MS) return;
		if (touched.size >= CACHE_MAX) touched.delete(touched.keys().next().value as string);
		touched.set(sid, now);
		const device = deviceOf(req);
		Session.updateOne(
			{ sid },
			{
				$set: { lastActiveAt: new Date(now), lastIp: device.ip },
				// A token from before sessions: its row starts now, from what this request shows.
				$setOnInsert: { admin: userId, method: 'legacy', browser: device.browser, os: device.os, deviceType: device.deviceType, userAgent: device.userAgent, ip: device.ip },
			},
			{ upsert: true }
		)
			.then(() => {
				if (!device.ip || located.get(sid) === device.ip) return;
				if (located.size >= CACHE_MAX) located.delete(located.keys().next().value as string);
				located.set(sid, device.ip);
				return placeSession(sid, device.ip);
			})
			.catch((e: any) => console.error('touchSession:', e?.message));
	};

	/** Signs out these sessions for good: blacklisted, and marked on their rows. Returns how many were newly revoked. */
	const revokeSessions = async (sessions: any[], by: any, reason: string) => {
		const live = sessions.filter(s => s && !s.revokedAt);
		if (!live.length) return 0;
		await Blacklist.bulkWrite(
			live.map(s => ({
				updateOne: {
					filter: { sid: s.sid },
					update: { $setOnInsert: { sid: s.sid, admin: s.admin, session: s._id, revokedBy: by, reason } },
					upsert: true,
				},
			}))
		);
		await Session.updateMany(
			{ _id: { $in: live.map(s => s._id) } },
			{ $set: { revokedAt: new Date(), revokedBy: by, revokeReason: reason } }
		);
		live.forEach(s => remember(s.sid, true));
		return live.length;
	};

	return { Session, issueSession, isRevoked, touchSession, revokeSessions, withPlaces };
};

export type SessionService = ReturnType<typeof makeSessions>;

/** The token's session id; `legacy:<hash>` for tokens from before sessions. */
export const sessionIdOf = (decoded: any, rawToken: string) =>
	typeof decoded?.sid === 'string' && decoded.sid
		? decoded.sid
		: `legacy:${crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 40)}`;

/** The admins' sessions — these exports are what every admin path has always used. */
export const adminSessions = makeSessions({ Session: AdminSession, Blacklist: BlacklistedToken });
export const { issueSession, isRevoked, touchSession, revokeSessions, withPlaces } = adminSessions;

/** Tenant users' sessions (TenantSession / TenantBlacklistedToken). */
export const tenantSessions = makeSessions({ Session: TenantSession, Blacklist: TenantBlacklistedToken });
