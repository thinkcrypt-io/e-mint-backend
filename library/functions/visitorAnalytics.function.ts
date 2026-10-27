import jwt from 'jsonwebtoken';
import { UAParser } from 'ua-parser-js';
import ProjectCustomer, { CUSTOMER_TOKEN_KIND } from '../models/tenancy/projectCustomer.model.js';
import WebsiteEvent, { CHANNELS, DEVICE_TYPES, EVENT_TYPES } from '../models/tenancy/websiteEvent.model.js';
import WebsiteVisitor from '../models/tenancy/websiteVisitor.model.js';
import { clientIp, locate, parseUserAgent } from './sessions.function.js';
import { loadSite } from './siteConfig.function.js';

/**
 * What POST /public/api/track records (docs/multi-tenancy WO-19, WO-56): a
 * batch of events from /public/track.js turned into WebsiteEvent rows — with
 * where the visitor is (country, region, city, timezone, ISP), on what (device,
 * model, OS, browser, screen, language), the visit's channel and source (ad
 * click ids, UTMs, the referring site), and who they are when the site knows —
 * plus the visitor's running summary (WebsiteVisitor) and time on page.
 *
 *   recordBatch(req, body) — the whole of the track call; returns the events
 *                            it stored (page views go on to Meta's Conversions API).
 *   channelOf(…)           — "Paid search · Google Ads", "Social · Facebook", …
 *   maskIp(ip)             — 203.0.113.0 / 2001:db8:85a3::
 */

const clip = (v: any, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const hostOf = (url?: string) => {
	try {
		return url ? new URL(url).host.toLowerCase().replace(/^www\./, '') : '';
	} catch {
		return '';
	}
};
/** A custom event's properties: a flat object of short values, at most 20. */
const smallProps = (p: any) => {
	if (!p || typeof p !== 'object' || Array.isArray(p)) return undefined;
	const out: any = {};
	for (const [k, v] of Object.entries(p).slice(0, 20))
		if (['string', 'number', 'boolean'].includes(typeof v)) out[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 200) : v;
	return Object.keys(out).length ? out : undefined;
};

/* ------------------------------------------------------------- sources */

const SEARCH: [RegExp, string][] = [
	[/(^|\.)google\.|googlequicksearchbox/, 'Google'],
	[/(^|\.)bing\.com$/, 'Bing'],
	[/duckduckgo\.com$/, 'DuckDuckGo'],
	[/(^|\.)yahoo\./, 'Yahoo'],
	[/(^|\.)yandex\./, 'Yandex'],
	[/(^|\.)baidu\.com$/, 'Baidu'],
	[/(^|\.)ecosia\.org$/, 'Ecosia'],
	[/search\.brave\.com$/, 'Brave'],
	[/(^|\.)naver\.com$/, 'Naver'],
	[/chatgpt\.com$|openai\.com$/, 'ChatGPT'],
	[/perplexity\.ai$/, 'Perplexity'],
];
const SOCIAL: [RegExp, string][] = [
	[/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
	[/(^|\.)instagram\.com$/, 'Instagram'],
	[/^t\.co$|(^|\.)(x|twitter)\.com$/, 'X'],
	[/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
	[/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
	[/(^|\.)tiktok\.com$/, 'TikTok'],
	[/(^|\.)pinterest\./, 'Pinterest'],
	[/(^|\.)reddit\.com$/, 'Reddit'],
	[/whatsapp\.(com|net)$|^wa\.me$/, 'WhatsApp'],
	[/telegram\.(org|me)$|^t\.me$/, 'Telegram'],
	[/(^|\.)threads\.(net|com)$/, 'Threads'],
	[/(^|\.)messenger\.com$/, 'Messenger'],
	[/(^|\.)snapchat\.com$/, 'Snapchat'],
	[/(^|\.)quora\.com$/, 'Quora'],
];
/** The ad click id in the landing address → the network that sent it. */
export const CLICK_IDS: Record<string, string> = {
	gclid: 'google',
	gbraid: 'google',
	wbraid: 'google',
	dclid: 'google',
	msclkid: 'microsoft',
	fbclid: 'meta',
	ttclid: 'tiktok',
	li_fat_id: 'linkedin',
	twclid: 'x',
	ScCid: 'snapchat',
	epik: 'pinterest',
};
const AD_NETWORK: Record<string, string> = {
	google: 'Google Ads',
	microsoft: 'Microsoft Ads',
	meta: 'Meta Ads',
	tiktok: 'TikTok Ads',
	linkedin: 'LinkedIn Ads',
	x: 'X Ads',
	snapchat: 'Snapchat Ads',
	pinterest: 'Pinterest Ads',
};

const match = (list: [RegExp, string][], host: string) => (host ? list.find(([re]) => re.test(host))?.[1] : undefined);
/** A UTM source written as a name ("facebook", "google") read like a host. */
const named = (list: [RegExp, string][], source: string) => (source && !source.includes('.') ? match(list, `${source}.com`) : match(list, source));

type Channel = (typeof CHANNELS)[number];

/** Where a visit came from, the way GA4's default channels sort it. */
export const channelOf = ({ refHost = '', utmSource = '', utmMedium = '', clickId = '' }: { refHost?: string; utmSource?: string; utmMedium?: string; clickId?: string }): { channel: Channel; source: string } => {
	const medium = utmMedium.toLowerCase();
	const src = utmSource.toLowerCase();
	const paid = /^(cpc|ppc|cpm|cpv|cpa|cpp|display|banner|ads?|retargeting|remarketing)$|paid/.test(medium);
	const search = match(SEARCH, refHost) || named(SEARCH, src);
	const social = match(SOCIAL, refHost) || named(SOCIAL, src) || (/^(ig|fb|insta)$/.test(src) ? (src === 'fb' ? 'Facebook' : 'Instagram') : undefined);
	if (clickId === 'google' || clickId === 'microsoft') return { channel: 'Paid search', source: AD_NETWORK[clickId] };
	// Meta adds fbclid to every link off Facebook, so it's an ad only when the UTMs say so.
	if (clickId === 'meta') return paid ? { channel: 'Paid social', source: AD_NETWORK.meta } : { channel: 'Social', source: social || 'Facebook' };
	if (clickId && AD_NETWORK[clickId]) return { channel: 'Paid social', source: AD_NETWORK[clickId] };
	if (/e-?mail|newsletter/.test(medium) || /newsletter|mailchimp|klaviyo|sendgrid|brevo/.test(src)) return { channel: 'Email', source: utmSource || 'Email' };
	if (paid) return { channel: search ? 'Paid search' : social ? 'Paid social' : 'Paid other', source: utmSource || search || social || refHost || 'Ads' };
	if (social || /social/.test(medium)) return { channel: 'Social', source: social || utmSource };
	if (search) return { channel: 'Organic search', source: search };
	if (refHost) return { channel: 'Referral', source: refHost };
	if (utmSource) return { channel: 'Referral', source: utmSource };
	return { channel: 'Direct', source: '' };
};

/* ----------------------------------------------------------- addresses */

/** The address without its last part: 203.0.113.0, 2001:db8:85a3:: — still a place, no longer a household. */
export const maskIp = (ip = '') => {
	if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, '.0');
	if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::`;
	return '';
};

const IP_MODES = ['full', 'masked', 'off'] as const;
export type IpMode = (typeof IP_MODES)[number];
export const ipModeOf = (doc: any): IpMode => (IP_MODES.includes(doc?.tracking?.visitorIp) ? doc.tracking.visitorIp : 'full');

/* ------------------------------------------------------------- people */

const secret = () => process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542';

/** A signed-in customer's id from the token mint.js keeps — checked, but without the account lookups a request would make. */
const customerIdOf = (token: any, project: any) => {
	if (typeof token !== 'string' || token.length > 2000) return null;
	try {
		const claims: any = jwt.verify(token.replace(/^Bearer\s+/i, '').trim(), secret());
		return claims?.kind === CUSTOMER_TOKEN_KIND && claims.project === String(project._id) && claims._id ? String(claims._id) : null;
	} catch {
		return null;
	}
};

const deviceModelOf = (ua: string) => {
	try {
		const d = new UAParser(ua).getDevice();
		return clip([d.vendor, d.model].filter(Boolean).join(' '), 80);
	} catch {
		return undefined;
	}
};

/* ------------------------------------------------------------- record */

const MAX_DURATION = 6 * 60 * 60 * 1000;

/** Time on a page and how far it was read, onto its page view (the larger figure wins: a page can be left and come back to). */
const recordEngagement = (visitorId: string | undefined, list: any[]) =>
	Promise.all(
		list
			.filter(e => clip(e?.eventId, 64) && visitorId)
			.slice(0, 20)
			.map(e => {
				const $max: any = {};
				const d = Number(e.duration);
				const s = Number(e.scroll);
				if (d > 0) $max.duration = Math.min(Math.round(d), MAX_DURATION);
				if (s > 0) $max.scroll = Math.min(Math.round(s), 100);
				return Object.keys($max).length ? WebsiteEvent.updateOne({ eventId: clip(e.eventId, 64), visitorId, type: 'pageview' }, { $max }) : null;
			})
	);

/** The visitor's running summary, after their batch is stored. */
const recordVisitor = async (docs: any[], who: { customer?: string; user?: any }) => {
	const visitorId = docs[0]?.visitorId;
	if (!visitorId) return;
	const views = docs.filter(d => d.type === 'pageview');
	const entries = views.filter(d => d.entry);
	const entry = entries[0];
	const last = docs[docs.length - 1];
	const set: any = {
		lastSeen: new Date(),
		place: last.place,
		device: last.device,
		os: last.os,
		browser: last.browser,
		deviceModel: last.deviceModel,
		language: last.language,
		screen: last.screen,
	};
	if (views.length) set.lastPath = views[views.length - 1].path;
	if (entry) Object.assign(set, { lastChannel: entry.channel, lastSource: entry.source });
	if (who.user?.id) set.userId = clip(String(who.user.id), 120);
	if (who.user?.name) set.name = clip(who.user.name, 120);
	if (who.user?.email) set.email = clip(who.user.email, 200);
	if (who.customer) {
		const c: any = await ProjectCustomer.findById(who.customer).select('name email').lean();
		if (c) Object.assign(set, { customer: c._id, ...(c.name && { name: clip(c.name, 120) }), ...(c.email && { email: clip(c.email, 200) }) });
	}
	for (const k of Object.keys(set)) if (set[k] === undefined) delete set[k];
	const update = {
		$set: set,
		$setOnInsert: { firstSeen: docs[0].createdAt || new Date() },
		$inc: { visits: entries.length, pageviews: views.length, events: docs.length - views.length },
	};
	try {
		await WebsiteVisitor.updateOne({ visitorId }, update, { upsert: true });
	} catch (e: any) {
		if (e?.code !== 11000) throw e;
		await WebsiteVisitor.updateOne({ visitorId }, update); // made by a batch at the same moment
	}
	// How they first arrived — their first visit's entry (or the first one seen since WO-56).
	if (entry)
		await WebsiteVisitor.updateOne(
			{ visitorId, 'first.channel': { $exists: false } },
			{
				$set: {
					first: {
						channel: entry.channel,
						source: entry.source,
						referrer: entry.referrer,
						landing: entry.path,
						utmSource: entry.utmSource,
						utmMedium: entry.utmMedium,
						utmCampaign: entry.utmCampaign,
						clickId: entry.clickId,
					},
				},
			}
		);
};

/** POST /public/api/track's work, in the project's scope. Returns the events stored. */
export const recordBatch = async (req: any, body: any) => {
	const sent: any[] = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
	const visitorId = clip(body.visitorId, 64);
	const sessionId = clip(body.sessionId, 64);
	const engagement = sent.filter(e => e?.type === 'engagement');
	const events = sent.filter(e => EVENT_TYPES.includes(e?.type));
	await recordEngagement(visitorId, engagement);
	if (!events.length) return [];

	const ua = String(req.headers['user-agent'] || '');
	const { browser, os, deviceType } = parseUserAgent(ua);
	const ip = clientIp(req);
	const [found, site]: any[] = await Promise.all([locate(ip).catch(() => null), loadSite(req.project, { req, cached: true }).catch(() => null)]);
	const place: any = found && !found.local ? found : null;
	const mode = ipModeOf(site);
	const keptIp = mode === 'off' || !ip ? undefined : mode === 'masked' ? maskIp(ip) || undefined : clip(ip, 64);
	const ownHost = String(req.headers.origin ? hostOf(String(req.headers.origin)) : '');
	// The site's own address as the browser sent it (www kept, port kept) — the domain Analytics offers to add.
	let pageHost = '';
	try {
		pageHost = new URL(String(req.headers.origin || req.headers.referer || '')).host.toLowerCase().slice(0, 255);
	} catch {
		/* no Origin / Referer */
	}
	const customer = customerIdOf(body.token, req.project);
	const shared = {
		sessionId,
		visitorId,
		device: (DEVICE_TYPES as readonly string[]).includes(deviceType) ? deviceType : 'other',
		os: clip(os, 40),
		browser: clip(browser, 40),
		deviceModel: deviceModelOf(ua),
		language: clip(body.language, 20),
		screen: /^\d{2,5}x\d{2,5}$/.test(String(body.screen || '')) ? String(body.screen) : undefined,
		country: clip(place?.country, 80),
		countryCode: clip(place?.countryCode, 4),
		region: clip(place?.region, 80),
		city: clip(place?.city, 80),
		// The browser's own clock zone first: it's right behind a VPN too.
		timezone: clip(body.timezone, 60) || clip(place?.timezone, 60),
		ip: keptIp,
		isp: clip(place?.isp, 120),
		org: clip(place?.org, 120),
		asn: typeof place?.asn === 'number' ? place.asn : undefined,
		...(customer && { customer }),
	};
	const now = Date.now();
	const docs = events.map((e: any, i: number) => {
		const refHost = hostOf(e.referrer);
		const external = refHost && refHost !== ownHost ? refHost : '';
		const clickId = typeof e.click === 'string' ? CLICK_IDS[e.click] : undefined;
		const entry = e.type === 'pageview' && e.entry === true;
		return {
			type: e.type,
			name: clip(e.name, 120),
			path: clip(e.path, 500),
			title: clip(e.title, 300),
			referrer: clip(e.referrer, 1000),
			referrerHost: external,
			host: pageHost || undefined,
			utmSource: clip(e.utmSource, 120),
			utmMedium: clip(e.utmMedium, 120),
			utmCampaign: clip(e.utmCampaign, 120),
			utmTerm: clip(e.utmTerm, 120),
			utmContent: clip(e.utmContent, 120),
			clickId,
			...(entry && {
				entry: true,
				...channelOf({ refHost: external, utmSource: clip(e.utmSource, 120), utmMedium: clip(e.utmMedium, 120), clickId }),
			}),
			eventId: e.type === 'pageview' ? clip(e.eventId, 64) : undefined,
			...shared,
			...(e.type === 'click' &&
				e.element && {
					element: { tag: clip(e.element.tag, 20), text: clip(e.element.text, 200), href: clip(e.element.href, 1000), id: clip(e.element.id, 120) },
				}),
			...(e.type === 'event' && { props: smallProps(e.props) }),
			// Keeps a batch in the order it happened.
			createdAt: new Date(now - (events.length - 1 - i)),
		};
	});
	await WebsiteEvent.insertMany(docs);
	const placeSummary = place ? { ip: keptIp, country: shared.country, countryCode: shared.countryCode, region: shared.region, city: shared.city, timezone: shared.timezone, lat: place.lat, lng: place.lng, isp: shared.isp, org: shared.org, asn: shared.asn } : keptIp ? { ip: keptIp, timezone: shared.timezone } : undefined;
	await recordVisitor(
		docs.map(d => ({ ...d, place: placeSummary })),
		{ customer: customer || undefined, user: body.user && typeof body.user === 'object' ? body.user : undefined }
	).catch(e => console.error('recordVisitor:', e?.message));
	return docs;
};
