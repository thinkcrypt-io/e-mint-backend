import { fetchable } from '../controllers/mcp/website.tools.js';
import { siteOrigin, TRACKERS } from './siteConfig.function.js';

/**
 * "Check the site" (docs/multi-tenancy WO-38; after AGS's Test Analytics):
 * fetches the live site's home page and compares what's on it with the
 * project's tracking settings, then asks Google and Meta about the IDs and
 * keys where they allow it.
 *
 * The tags are added by track.js in the visitor's browser, so a page with the
 * analytics script (and no `data-no-tags`) carries every tag set here. IDs
 * written into the page's own HTML are found too — the same ID twice means
 * every visit is counted twice; another ID means the site has its own.
 */

export type CheckItem = {
	key: string;
	label: string;
	configured: string;
	/** IDs of this kind in the page's HTML. */
	inHtml: string[];
	status: 'ok' | 'warning' | 'missing' | 'idle';
	message: string;
};

const LABELS: Record<string, string> = {
	ga4: 'Google Analytics 4',
	gtm: 'Google Tag Manager',
	googleAds: 'Google Ads',
	metaPixel: 'Meta Pixel',
	tiktokPixel: 'TikTok Pixel',
	linkedinPartner: 'LinkedIn Insight',
	pinterestTag: 'Pinterest Tag',
	xPixel: 'X Pixel',
	snapPixel: 'Snap Pixel',
	clarity: 'Microsoft Clarity',
	hotjar: 'Hotjar',
};

/** How each tag's ID shows in a page that writes it into its HTML. */
const FIND: Record<string, RegExp[]> = {
	ga4: [/\b(G-[A-Z0-9]{4,15})\b/g],
	gtm: [/\b(GTM-[A-Z0-9]{4,12})\b/g],
	googleAds: [/\b(AW-\d{6,15})\b/g],
	metaPixel: [/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,20})['"]/g, /facebook\.com\/tr\?id=(\d{6,20})/g],
	tiktokPixel: [/ttq\.load\(\s*['"]([A-Z0-9]{10,30})['"]/g],
	linkedinPartner: [/_linkedin_partner_id\s*=\s*['"]?(\d{3,12})/g],
	pinterestTag: [/pintrk\(\s*['"]load['"]\s*,\s*['"](\d{6,20})['"]/g],
	xPixel: [/twq\(\s*['"]config['"]\s*,\s*['"]([a-z0-9]{4,12})['"]/g],
	snapPixel: [/snaptr\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]{36})['"]/g],
	clarity: [/clarity\.ms\/tag\/([a-z0-9]{6,20})/g, /\(window,\s*document,\s*["']clarity["'],\s*["']script["'],\s*["']([a-z0-9]{6,20})["']\)/g],
	hotjar: [/hotjar-(\d{5,10})\.js/g, /hjid\s*:\s*(\d{5,10})/g],
};

const idsIn = (html: string, key: string) => {
	const found = new Set<string>();
	for (const re of FIND[key] || []) for (const m of html.matchAll(re)) found.add(m[1]);
	return [...found];
};

/** The page's HTML, following up to 3 redirects (each address checked). */
const fetchPage = async (start: string): Promise<{ html: string; status: number; url: string } | string> => {
	let current = start;
	for (let i = 0; i < 4; i++) {
		const refused = await fetchable(current);
		if (refused) return refused;
		const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'MINT-site-check/1.0', accept: 'text/html' } }).catch(
			(e: any) => e as Error
		);
		if (res instanceof Error) return `Couldn’t reach ${current} (${res.name === 'TimeoutError' ? 'it took too long' : res.message}).`;
		if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
			current = new URL(res.headers.get('location')!, current).toString();
			continue;
		}
		const text = (await res.text()).slice(0, 3_000_000);
		return { html: text, status: res.status, url: current };
	}
	return 'Too many redirects.';
};

const gtmContainer = async (id: string) => {
	try {
		const res = await fetch(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return { ok: false, note: `Google Tag Manager answered ${res.status} — check the ID.` };
		// A container that doesn't exist still answers, with a short stub.
		return (await res.text()).length > 1000
			? { ok: true, note: 'Google Tag Manager knows this container.' }
			: { ok: false, note: 'Google Tag Manager doesn’t seem to know this container — check the ID, and that it’s published.' };
	} catch {
		return { ok: null, note: 'Couldn’t reach Google Tag Manager to check the ID.' };
	}
};

/** Whether the Conversions API token is valid and made for this pixel (Meta's debug_token; read-only). */
const metaToken = async (pixel: string, token: string) => {
	try {
		const res = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`, {
			signal: AbortSignal.timeout(8000),
		});
		const body: any = await res.json().catch(() => ({}));
		const info = body?.data;
		if (!res.ok || !info) return { ok: false, note: body?.error?.message ? `Meta refused the access token: ${body.error.message}` : 'Meta doesn’t recognise the access token.' };
		if (!info.is_valid) return { ok: false, note: 'The access token has expired or was revoked — make a new one in Events Manager.' };
		const scoped = (info.granular_scopes || []).some((s: any) => (s.target_ids || []).includes(pixel));
		return scoped
			? { ok: true, note: 'Meta confirms the token is valid and made for this pixel.' }
			: { ok: false, note: 'The token is valid but not made for this pixel — generate it from this pixel’s settings.' };
	} catch {
		return { ok: null, note: 'Couldn’t reach Meta to check the token.' };
	}
};

export const checkSite = async (project: any, doc: any) => {
	const checkedAt = new Date().toISOString();
	const origin = siteOrigin(project, doc);
	const tracking = doc.tracking || {};
	const base = { checkedAt, origin };
	if (!origin) return { ...base, reachable: false, message: 'Add the site’s domain (Domains tab) so it can be checked.', items: [], extra: [], serverSide: {} };

	const page = await fetchPage(`${origin}/`);
	if (typeof page === 'string') return { ...base, reachable: false, message: page, items: [], extra: [], serverSide: {} };
	const html = page.html;
	const scriptTag = [...html.matchAll(/<script\b[^>]*\/public\/track\.js[^>]*>/gi)].map(m => m[0]).find(t => t.includes(`data-project="${project.publicSlug}"`) || t.includes(`data-project='${project.publicSlug}'`));
	const delivers = !!scriptTag && !/data-no-tags/i.test(scriptTag);

	const items: CheckItem[] = [];
	const extra: { key: string; label: string; ids: string[] }[] = [];
	for (const key of TRACKERS) {
		const configured = String(tracking[key] || '');
		const inHtml = idsIn(html, key);
		const others = inHtml.filter(x => x !== configured);
		if (!configured) {
			if (inHtml.length) extra.push({ key, label: LABELS[key], ids: inHtml });
			continue;
		}
		let status: CheckItem['status'];
		let message: string;
		if (delivers && inHtml.includes(configured)) {
			status = 'warning';
			message = 'Added by the analytics script and also written in the page — each visit may be counted twice. Remove one.';
		} else if (delivers) {
			status = 'ok';
			message = 'The analytics script is on the site and adds this tag.';
		} else if (inHtml.includes(configured)) {
			status = 'ok';
			message = 'Found in the page’s HTML.';
		} else {
			status = 'missing';
			message = scriptTag ? 'The analytics script has data-no-tags, and this ID isn’t in the page.' : 'Not on the site — add the analytics script (Analytics → the snippet).';
		}
		if (others.length) {
			status = status === 'missing' ? 'missing' : 'warning';
			message += ` The page also has ${others.join(', ')} — another ${LABELS[key]} of its own.`;
		}
		items.push({ key, label: LABELS[key], configured, inHtml, status, message });
	}

	// What Google and Meta can confirm.
	const gtm = items.find(i => i.key === 'gtm');
	if (gtm) {
		const r = await gtmContainer(gtm.configured);
		gtm.message += ` ${r.note}`;
		if (r.ok === false && gtm.status === 'ok') gtm.status = 'warning';
	}
	const serverSide: any = {};
	if (doc.serverSide?.meta?.enabled || doc.secrets?.metaAccessToken) {
		serverSide.meta =
			tracking.metaPixel && doc.secrets?.metaAccessToken
				? await metaToken(tracking.metaPixel, doc.secrets.metaAccessToken)
				: { ok: false, note: 'Needs the Meta Pixel ID and an access token.' };
	}
	if (doc.serverSide?.ga4?.enabled || doc.secrets?.ga4ApiSecret)
		serverSide.ga4 = {
			ok: null,
			note: 'Google doesn’t let anyone check an API secret — events sent with a wrong one are dropped silently. Send a test lead and look in GA4 → Reports → Realtime.',
		};

	return {
		...base,
		reachable: page.status < 400,
		status: page.status,
		url: page.url,
		message: page.status >= 400 ? `The site answered ${page.status}.` : scriptTag ? (delivers ? 'The analytics script is on the site.' : 'The analytics script is on the site with data-no-tags: it counts visits but leaves the tags to the page.') : 'The analytics script isn’t on the home page.',
		script: { found: !!scriptTag, tags: delivers },
		items,
		extra,
		serverSide,
	};
};
