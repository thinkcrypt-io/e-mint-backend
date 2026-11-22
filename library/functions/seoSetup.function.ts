import dns from 'node:dns/promises';
import net from 'node:net';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import WebsiteEvent from '../models/tenancy/websiteEvent.model.js';
import WebsiteSettings from '../models/tenancy/websiteSettings.model.js';
import { fetchPage } from './siteCheck.function.js';
import { connectionOf, forgetSite, loadSite } from './siteConfig.function.js';
import { target } from './siteConnection.function.js';

/**
 * Mint SEO's setup, step 1 (docs/seo-panel SP-05, README "The setup wizard"): the owner types their site's address and
 * we look at it — which platform it's built on, whether its DNS is on Cloudflare and proxied, its current title,
 * description and share image, whether Mint's snippet or Worker is already there, how many pages its sitemap lists —
 * and recommend one of the two ways. The address and both hostnames (with and without www) are saved on
 * `connection` and added to the project's domains, so visits from them count.
 */

export type Platform = 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'webflow' | 'framer' | 'ghost' | 'nextjs' | 'spa' | 'other';

export const PLATFORM_LABELS: Record<Platform, string> = {
	wordpress: 'WordPress',
	shopify: 'Shopify',
	wix: 'Wix',
	squarespace: 'Squarespace',
	webflow: 'Webflow',
	framer: 'Framer',
	ghost: 'Ghost',
	nextjs: 'Next.js',
	spa: 'A JavaScript app (React, Vue…)',
	other: 'A site we don’t recognise',
};

/** Hosted builders: their DNS and servers are theirs, so the snippet is the way (D9). */
const HOSTED: Platform[] = ['shopify', 'wix', 'squarespace', 'webflow', 'framer'];

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();

/** A `<meta>` tag's content by its name or property. */
const meta = (html: string, key: string) => {
	for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
		const tag = m[0];
		if ((attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase() === key) return decode(attr(tag, 'content') || '');
	}
	return '';
};

/** Which platform made the page: the generator meta first, then the platforms' own markers and headers. */
export const platformOf = (html: string, headers: Record<string, string>): Platform => {
	const gen = meta(html, 'generator').toLowerCase();
	const server = `${headers['server'] || ''} ${headers['x-powered-by'] || ''}`.toLowerCase();
	if (gen.includes('wordpress') || /\/wp-content\/|\/wp-includes\//i.test(html)) return 'wordpress';
	if (gen.includes('wix') || /static\.wixstatic\.com|x-wix-request-id/i.test(html) || headers['x-wix-request-id']) return 'wix';
	if (gen.includes('squarespace') || /static1\.squarespace\.com|squarespace-cdn\.com/i.test(html)) return 'squarespace';
	if (gen.includes('webflow') || /\bdata-wf-site=|\bdata-wf-page=/i.test(html)) return 'webflow';
	if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html) || headers['x-shopid'] || headers['x-shopify-stage']) return 'shopify';
	if (gen.includes('framer') || /framerusercontent\.com/i.test(html)) return 'framer';
	if (gen.includes('ghost')) return 'ghost';
	if (/id=["']__next["']|\/_next\/static\//i.test(html) || server.includes('next.js')) return 'nextjs';
	// One empty mount point and scripts: the page is built in the browser.
	const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
	const text = body
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<[^>]+>/g, '')
		.trim();
	if (/<div\b[^>]*\bid=["'](root|app)["'][^>]*>\s*<\/div>/i.test(html) && text.length < 200) return 'spa';
	return 'other';
};

/** Whether the domain's nameservers are Cloudflare's: the host, then each parent, until one has NS records. */
export const cloudflareDns = async (host: string): Promise<boolean | null> => {
	const bare = host.split(':')[0];
	if (net.isIP(bare) || bare === 'localhost' || !bare.includes('.')) return null;
	const labels = bare.split('.');
	for (let i = 0; i < labels.length - 1; i++) {
		const name = labels.slice(i).join('.');
		const ns = await Promise.race([dns.resolveNs(name), new Promise<string[]>((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]).catch(() => [] as string[]);
		if (ns.length) return ns.some(n => /\.ns\.cloudflare\.com\.?$/i.test(n));
	}
	return null;
};

/** The other hostname of the pair: www.acme.com ↔ acme.com (none for localhost or a subdomain beyond www). */
export const otherHost = (host: string) => {
	const [name, port] = host.split(':');
	if (name === 'localhost' || net.isIP(name)) return '';
	if (name.startsWith('www.')) return name.slice(4) + (port ? `:${port}` : '');
	return name.split('.').length === 2 ? `www.${host}` : '';
};

const sitemapCount = async (origin: string): Promise<number | null> => {
	const page = await fetchPage(`${origin}/sitemap.xml`);
	if (typeof page === 'string' || page.status >= 400 || !/<(urlset|sitemapindex)\b/i.test(page.html)) return null;
	return (page.html.match(/<loc>/gi) || []).length;
};

export type Detected = {
	url: string;
	host: string;
	platform: Platform;
	platformLabel: string;
	/** Answered through Cloudflare's network (a `cf-ray` header): the records are proxied. */
	proxied: boolean;
	/** The nameservers are Cloudflare's (null: couldn't tell). */
	cloudflare: boolean | null;
	seo: { title: string; description: string; image: string; canonical: string };
	snippet: 'ours' | 'other' | 'none';
	snippetSeo: boolean;
	/** mint-edge's version from its `x-mint-edge` header, when the Worker is in front of the site. */
	worker: string;
	sitemapPages: number | null;
	recommend: 'script' | 'cloudflare';
	why: string;
	checkedAt: string;
};

export const recommendWay = (d: Pick<Detected, 'platform' | 'proxied' | 'cloudflare' | 'worker' | 'snippet'>): { way: 'script' | 'cloudflare'; why: string } => {
	if (d.worker) return { way: 'cloudflare', why: 'Mint’s Worker is already in front of your site.' };
	if (HOSTED.includes(d.platform))
		return { way: 'script', why: `${PLATFORM_LABELS[d.platform]} runs your site’s servers, so the snippet is the way — paste it in its custom code settings.` };
	if (d.proxied || d.cloudflare)
		return { way: 'cloudflare', why: 'Your site is already on Cloudflare, so the Worker is a few clicks — and every crawler and link preview sees your SEO.' };
	if (d.platform === 'spa')
		return { way: 'cloudflare', why: 'Your pages are built in the browser, so link previews only see your SEO when the Worker puts it in the page.' };
	if (d.snippet === 'ours') return { way: 'script', why: 'Mint’s snippet is already on your site.' };
	return { way: 'script', why: 'The snippet is the quickest start: one line, no DNS changes. You can add the Worker later for link previews.' };
};

/** Looks at the site and saves what was found. Answers 400-style `{ error }` when the page can't be read. */
export const detectSite = async (project: any, raw: unknown): Promise<{ error: string } | { detected: Detected; connection: any; domains: string[] }> => {
	const url = target(raw, '');
	if (!url) return { error: 'Type your site’s address, like www.example.com.' };
	let page = await fetchPage(url);
	// Typed without a scheme (acme.com) and https doesn't answer: try http — some small sites have no certificate yet.
	if (typeof page === 'string' && typeof raw === 'string' && !/^https?:\/\//i.test(raw.trim())) {
		const plain = await fetchPage(url.replace(/^https:/, 'http:'));
		if (typeof plain !== 'string') page = plain;
	}
	if (typeof page === 'string') return { error: page };
	if (page.status >= 400) return { error: `${new URL(page.url).host} answered ${page.status} — check the address.` };

	const final = new URL(page.url);
	const host = final.host.toLowerCase();
	const html = page.html;
	const headers = page.headers || {};
	const tags = [...html.matchAll(/<script\b[^>]*\/public\/track\.js[^>]*>/gi)].map(m => m[0]);
	const ours = tags.find(t => !!project.apiKey && attr(t, 'data-key') === project.apiKey);
	const platform = platformOf(html, headers);
	const [cloudflare, sitemapPages] = await Promise.all([cloudflareDns(host), sitemapCount(final.origin)]);
	const base = {
		platform,
		proxied: !!headers['cf-ray'] || /cloudflare/i.test(headers['server'] || ''),
		cloudflare,
		worker: String(headers['x-mint-edge'] || '').split(';')[0].trim(),
		snippet: (ours ? 'ours' : tags.length ? 'other' : 'none') as Detected['snippet'],
	};
	const { way, why } = recommendWay(base);
	const detected: Detected = {
		url: final.toString(),
		host,
		platformLabel: PLATFORM_LABELS[platform],
		...base,
		seo: {
			title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 300),
			description: meta(html, 'description').slice(0, 500),
			image: meta(html, 'og:image').slice(0, 1000),
			canonical: attr(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '', 'href') || '',
		},
		snippetSeo: !!ours && /\sdata-seo(\s|=|>|\/)/i.test(ours),
		sitemapPages,
		recommend: way,
		why,
		checkedAt: new Date().toISOString(),
	};

	// The address, both hostnames, and the project's domains (visits from other hosts aren't counted).
	const hostnames = [host, otherHost(host)].filter(Boolean);
	const domains: string[] = [...(project.domains || [])];
	for (const h of hostnames) if (!domains.includes(h) && domains.length < 20) domains.push(h);
	if (domains.length !== (project.domains || []).length) {
		await TenantProject.updateOne({ _id: project._id }, { $set: { domains } });
		forgetSite(project);
	}
	await loadSite(project); // makes the settings document the first time
	const doc: any = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
	const now = connectionOf(doc);
	const connection = {
		...(doc?.connection || {}),
		siteUrl: final.origin,
		hostnames,
		detected,
		status: now.status,
		step: Math.max(now.step, 2),
	};
	await WebsiteSettings.updateOne({}, { $set: { connection } });
	forgetSite(project);
	return { detected, connection: connectionOf({ connection }), domains };
};

/** Saves the way the owner picked (`script` = head snippet, `cloudflare` = Worker) and moves the wizard to step 3. */
export const chooseWay = async (project: any, mode: unknown): Promise<{ error: string } | { connection: any }> => {
	if (mode !== 'script' && mode !== 'cloudflare') return { error: 'Choose the snippet or Cloudflare.' };
	await loadSite(project);
	const doc: any = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
	const now = connectionOf(doc);
	const connection = { ...(doc?.connection || {}), mode, status: now.status, step: Math.max(now.step, 3) };
	await WebsiteSettings.updateOne({}, { $set: { connection } });
	forgetSite(project);
	return { connection: connectionOf({ connection }) };
};

/**
 * Step 4 (SP-07): does the site really belong to this project — any one proof is enough:
 *   visit   a page view from one of the site's hostnames since the address was checked (the snippet runs there)
 *   worker  the site answers with Mint's `x-mint-edge` header (the Worker is in front of it)
 *   txt     a TXT record `_mint.<domain>` = `mint-verify=<project id>` (works for either way)
 */
export const verifyOwnership = async (project: any) => {
	await loadSite(project);
	const doc: any = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
	const c = connectionOf(doc);
	const txt = `mint-verify=${project._id}`;
	if (!c.siteUrl) return { owned: false, how: null as null | string, txt, checks: { visit: false, worker: false, txt: false }, message: 'Add your site’s address first (step 1).' };
	const since = c.detected?.checkedAt ? new Date(c.detected.checkedAt) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
	const [visit, worker, txtOk] = await Promise.all([
		WebsiteEvent.exists({ type: 'pageview', host: { $in: c.hostnames.map((h: string) => h.toLowerCase()) }, createdAt: { $gte: since } }).then(x => !!x),
		fetchPage(c.siteUrl).then(page => typeof page !== 'string' && !!String(page.headers['x-mint-edge'] || '').trim()),
		(async () => {
			for (const h of c.hostnames) {
				const bare = h.split(':')[0].replace(/^www\./, '');
				if (!bare.includes('.')) continue;
				const rows = await Promise.race([dns.resolveTxt(`_mint.${bare}`), new Promise<string[][]>((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]).catch(() => [] as string[][]);
				if (rows.some(r => r.join('').trim() === txt)) return true;
			}
			return false;
		})(),
	]);
	const how = visit ? 'visit' : worker ? 'worker' : txtOk ? 'txt' : null;
	if (c.txt !== txt) {
		await WebsiteSettings.updateOne({}, { $set: { 'connection.txt': txt } });
		forgetSite(project);
	}
	return {
		owned: !!how,
		how,
		txt,
		checks: { visit, worker, txt: txtOk },
		message: how
			? how === 'visit' ? 'A visit from your site reached Mint.' : how === 'worker' ? 'Mint’s Worker answers on your site.' : 'The TXT record is in place.'
			: 'Not yet — open your site in a browser, or finish the Worker, or add the TXT record.',
	};
};

/** **Start using**: owned + the connection test shows nothing missing → live (opens the rest of Mint SEO). */
export const startUsing = async (project: any, test: { items: { status: string; message: string }[] }, owned: boolean): Promise<{ error: string } | { connection: any }> => {
	if (!owned) return { error: 'Mint can’t tell yet that this site is yours: open it in a browser (snippet), finish the Worker, or add the TXT record — then try again.' };
	const missing = test.items.find(i => i.status === 'missing');
	if (missing) return { error: missing.message };
	await loadSite(project);
	const doc: any = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
	const now = connectionOf(doc);
	const at = new Date();
	const connection = { ...(doc?.connection || {}), status: 'live', step: 5, verifiedAt: at, liveAt: now.liveAt || at, lastCheckAt: at, lastCheck: test, attentionReason: '' };
	await WebsiteSettings.updateOne({}, { $set: { connection } });
	forgetSite(project);
	return { connection: connectionOf({ connection }) };
};
