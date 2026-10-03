import crypto from 'crypto';
import { clientIp } from './sessions.function.js';
import { later } from './tenantNotify.function.js';
import { loadSite } from './siteConfig.function.js';

/**
 * Server-side tracking for website projects (docs/multi-tenancy WO-38): what
 * the site's visitors do, sent from this server as well as from their browser,
 * so ad blockers and iOS limits don't hide it. Turned on per provider on the
 * panel's Site setup → Server-side tab, with keys kept in
 * WebsiteSettings.secrets.
 *
 *   Meta Conversions API — page views (from track.js, with the event id the
 *     pixel used, so Meta counts each once), Lead when the site sends in a
 *     record, CompleteRegistration when a customer signs up.
 *   Google Analytics 4 Measurement Protocol — generate_lead and sign_up only:
 *     GA4 can't match a server event to the browser's, so page views stay
 *     with the browser tag.
 *
 * Fire-and-forget: a provider that's down or refuses never affects the
 * request it follows (failures are logged).
 */

const TIMEOUT = 8000;
const META_API = 'https://graph.facebook.com/v21.0';

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const hashEmail = (v: any) => (typeof v === 'string' && v.trim() ? sha(v.trim().toLowerCase()) : undefined);
const hashPhone = (v: any) => {
	const digits = typeof v === 'string' ? v.replace(/\D/g, '') : '';
	return digits ? sha(digits) : undefined;
};
const clip = (v: any, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

/** Who the visitor is, as far as the providers need: their address, browser, and the ad click cookies. */
export type Visitor = { ip?: string; userAgent?: string; fbp?: string; fbc?: string; url?: string; clientId?: string };

/** A request from the site: track.js sends fbp/fbc in its body; a site's own calls may send x-mint-* headers. */
export const visitorOf = (req: any, body: any = {}): Visitor => ({
	ip: clientIp(req) || undefined,
	userAgent: clip(req.headers['user-agent'], 500),
	fbp: clip(body.fbp || req.headers['x-mint-fbp'], 200),
	fbc: clip(body.fbc || req.headers['x-mint-fbc'], 300),
	url: clip(req.headers.referer || req.headers.origin, 1000),
	clientId: clip(body.visitorId || req.headers['x-mint-visitor'], 64),
});

export type MetaEvent = { name: string; id: string; time?: number; url?: string; custom?: Record<string, any> };

/** Sends events to Meta's Conversions API. Returns Meta's answer; null when it's off. */
export const sendMeta = async (doc: any, events: MetaEvent[], visitor: Visitor, user: { email?: string; phone?: string } = {}) => {
	const pixel = doc?.tracking?.metaPixel;
	const token = doc?.secrets?.metaAccessToken;
	if (!doc?.serverSide?.meta?.enabled || !pixel || !token || !events.length) return null;
	const user_data: any = {
		...(visitor.ip && { client_ip_address: visitor.ip }),
		...(visitor.userAgent && { client_user_agent: visitor.userAgent }),
		...(visitor.fbp && { fbp: visitor.fbp }),
		...(visitor.fbc && { fbc: visitor.fbc }),
		...(hashEmail(user.email) && { em: [hashEmail(user.email)] }),
		...(hashPhone(user.phone) && { ph: [hashPhone(user.phone)] }),
		...(visitor.clientId && { external_id: [sha(visitor.clientId)] }),
	};
	const testCode = doc.serverSide.meta.testEventCode;
	const res = await fetch(`${META_API}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT),
		body: JSON.stringify({
			data: events.slice(0, 1000).map(e => ({
				event_name: e.name,
				event_time: Math.floor((e.time || Date.now()) / 1000),
				event_id: e.id,
				action_source: 'website',
				...((e.url || visitor.url) && { event_source_url: e.url || visitor.url }),
				user_data,
				...(e.custom && { custom_data: e.custom }),
			})),
			...(testCode && { test_event_code: testCode }),
		}),
	});
	const answer: any = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`Meta: ${answer?.error?.message || res.status}`);
	return answer;
};

/** Sends events to GA4's Measurement Protocol. GA4 answers 2xx even for a wrong secret — nothing to read back. */
export const sendGa4 = async (doc: any, clientId: string, events: { name: string; params?: Record<string, any> }[]) => {
	const id = doc?.tracking?.ga4;
	const secret = doc?.secrets?.ga4ApiSecret;
	if (!doc?.serverSide?.ga4?.enabled || !id || !secret || !events.length) return null;
	const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT),
		body: JSON.stringify({ client_id: clientId, events: events.slice(0, 25) }),
	});
	if (!res.ok) throw new Error(`Google Analytics: ${res.status}`);
	return { ok: true };
};

const randomId = () => crypto.randomBytes(12).toString('hex');

/** track.js's page views, to Meta (deduplicated with the pixel by event id). In the background. */
export const forwardPageviews = (project: any, visitor: Visitor, events: { eventId?: string; path?: string; title?: string }[]) => {
	const views = events.filter(e => e.eventId);
	if (!views.length) return;
	later(async () => {
		const doc = await loadSite(project, { secrets: true, cached: true });
		if (!doc?.serverSide?.meta?.enabled) return;
		let origin = '';
		try {
			origin = visitor.url ? new URL(visitor.url).origin : '';
		} catch {}
		await sendMeta(
			doc,
			views.map(e => ({ name: 'PageView', id: String(e.eventId).slice(0, 64), url: origin && e.path ? `${origin}${e.path}` : undefined })),
			visitor
		);
	});
};

/**
 * A conversion from the site — a record it sent in (a form) or a customer
 * signing up — to Meta and GA4. In the background.
 */
export const forwardConversion = (project: any, req: any, kind: 'lead' | 'signup', data: { email?: string; phone?: string; form?: string } = {}) =>
	later(async () => {
		const doc = await loadSite(project, { secrets: true, cached: true });
		if (!doc?.serverSide?.meta?.enabled && !doc?.serverSide?.ga4?.enabled) return;
		const visitor = visitorOf(req);
		const id = randomId();
		await Promise.all([
			sendMeta(doc, [{ name: kind === 'lead' ? 'Lead' : 'CompleteRegistration', id, ...(data.form && { custom: { content_name: data.form } }) }], visitor, data).catch(e =>
				console.error('server-side tracking:', e?.message)
			),
			sendGa4(doc, visitor.clientId || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`, [
				{ name: kind === 'lead' ? 'generate_lead' : 'sign_up', params: { ...(data.form && { form: data.form }), engagement_time_msec: 1 } },
			]).catch(e => console.error('server-side tracking:', e?.message)),
		]);
	});

/** The email and phone in a record the site sent, for matching (hashed before they leave). */
export const contactOf = (body: any) => {
	const out: { email?: string; phone?: string } = {};
	for (const [k, v] of Object.entries<any>(body || {})) {
		if (typeof v !== 'string') continue;
		if (!out.email && /e-?mail/i.test(k) && /@/.test(v)) out.email = v;
		if (!out.phone && /phone|mobile|whatsapp/i.test(k)) out.phone = v;
	}
	return out;
};
