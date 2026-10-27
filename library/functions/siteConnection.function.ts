import WebsiteEvent from '../models/tenancy/websiteEvent.model.js';
import { fetchPage } from './siteCheck.function.js';
import { siteHead } from './siteHead.function.js';
import { siteOrigin } from './siteConfig.function.js';

/**
 * "Test connection" on Website setup → Existing website (docs/site-connect
 * SC-08b): is a site built elsewhere connected? Four answers, each ok /
 * warning / missing / idle:
 *
 *   domain    the address's host is one of the project's domains (visits from other hosts are dropped)
 *   snippet   the page's HTML has track.js with this project's key (and data-seo)
 *   visits    page views are arriving — the snippet runs in browsers (also true when a tag manager adds it)
 *   seo       whether this page takes its SEO from here, and whether the HTML already carries it
 *
 * Runs in the project's scope (tenant router). Fetching the page goes through
 * siteCheck's fetchPage (redirects followed, private addresses refused).
 */

export type ConnectionItem = { key: 'domain' | 'snippet' | 'visits' | 'seo'; label: string; status: 'ok' | 'warning' | 'missing' | 'idle'; message: string };

const DAY = 24 * 60 * 60 * 1000;

const ago = (d: Date) => {
	const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
	if (s < 90) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
	if (s < 2 * DAY / 1000) return `${Math.round(s / 3600)} hours ago`;
	return `${Math.round(s / 86400)} days ago`;
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const has = (tag: string, name: string) => new RegExp(`\\s${name}(\\s|=|>|/)`, 'i').test(tag);

/** The address to test: what the owner typed (a path or a whole address), else the site's home page. */
export const target = (raw: unknown, origin: string) => {
	const v = typeof raw === 'string' ? raw.trim() : '';
	if (!v) return origin ? `${origin}/` : '';
	if (v.startsWith('/')) return origin ? origin + v : '';
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return ''; // ftp://, file://
	const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
	try {
		const u = new URL(withScheme);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
	} catch {
		return '';
	}
};

export const ownDomain = (host: string, domains: string[]) => {
	const bare = host.toLowerCase().replace(/^www\./, '');
	return domains.some(d => {
		const dom = d.toLowerCase().replace(/^www\./, '');
		return bare === dom || bare.endsWith(`.${dom}`);
	});
};

export const testConnection = async (project: any, doc: any, models: { pages?: any; seo?: any }, raw: unknown) => {
	const checkedAt = new Date().toISOString();
	const origin = siteOrigin(project, doc);
	const url = target(raw, origin);
	const items: ConnectionItem[] = [];
	if (!url)
		return {
			checkedAt,
			url: '',
			connected: false,
			message: 'Type your site’s address (https://www.example.com), or add its domain on Site setup → Domains.',
			items,
		};
	const address = new URL(url);
	const domains: string[] = (project.domains || []).filter((d: string) => !d.startsWith('localhost'));

	// 1. The domain: track drops visits from hosts that aren't the project's (once it has any).
	if (!domains.length)
		items.push({ key: 'domain', label: 'Domain', status: 'warning', message: `No domain set — add ${address.host} on Site setup → Domains, so only your site’s visits count and the sitemap and share links use it.` });
	else if (ownDomain(address.host, domains)) items.push({ key: 'domain', label: 'Domain', status: 'ok', message: `${address.host} is one of this project’s domains.` });
	else
		items.push({
			key: 'domain',
			label: 'Domain',
			status: 'missing',
			message: `${address.host} isn’t one of this project’s domains (${domains.join(', ')}) — its visits aren’t counted. Add it on Site setup → Domains.`,
		});

	// 2. The snippet in the page's HTML.
	const page = await fetchPage(url);
	let html = '';
	let seoOn = false;
	if (typeof page === 'string') items.push({ key: 'snippet', label: 'Snippet', status: 'missing', message: page });
	else if (page.status >= 400) items.push({ key: 'snippet', label: 'Snippet', status: 'missing', message: `The page answered ${page.status} — check the address.` });
	else {
		html = page.html;
		const tags = [...html.matchAll(/<script\b[^>]*\/public\/track\.js[^>]*>/gi)].map(m => m[0]);
		const ours = tags.find(t => !!project.apiKey && attr(t, 'data-key') === project.apiKey);
		if (ours) {
			seoOn = has(ours, 'data-seo');
			const notes = [
				!seoOn && 'it has no data-seo, so it counts visits but leaves SEO alone — add data-seo to use the SEO from here',
				has(ours, 'data-no-track') && 'data-no-track is on, so it counts nothing',
				seoOn && has(ours, 'defer') && 'remove defer so the SEO goes on the page sooner',
			].filter(Boolean);
			items.push({
				key: 'snippet',
				label: 'Snippet',
				status: notes.length ? 'warning' : 'ok',
				message: `The snippet is on ${page.url}${notes.length ? ` — ${notes.join('; ')}.` : ', with this project’s key and SEO on.'}`,
			});
		} else if (tags.length)
			items.push({ key: 'snippet', label: 'Snippet', status: 'missing', message: 'The page has the snippet with another project’s key — copy it again from step 1.' });
		else
			items.push({
				key: 'snippet',
				label: 'Snippet',
				status: 'idle',
				message: `The snippet isn’t in ${page.url}’s HTML. Added through a tag manager or a plugin that loads it later? Then Visits below tells you whether it runs.`,
			});
	}

	// 3. Visits arriving — the proof that the snippet runs in visitors' browsers.
	const last: any = await WebsiteEvent.findOne({ type: 'pageview' }, { createdAt: 1, path: 1 }).sort({ createdAt: -1 }).lean();
	const today = last ? await WebsiteEvent.countDocuments({ type: 'pageview', createdAt: { $gte: new Date(Date.now() - DAY) } }) : 0;
	if (!last) items.push({ key: 'visits', label: 'Visits', status: 'idle', message: 'No visits counted yet. Open your site in a browser (with ad blockers off), then test again.' });
	else {
		const when = new Date(last.createdAt);
		const recent = Date.now() - when.getTime() < DAY;
		items.push({
			key: 'visits',
			label: 'Visits',
			status: recent ? 'ok' : 'warning',
			message: recent
				? `Visits are arriving — the last one ${ago(when)} on ${last.path || '/'}, ${today} page view${today === 1 ? '' : 's'} in the last 24 hours.`
				: `The last visit was ${ago(when)} on ${last.path || '/'}. Open your site in a browser, then test again.`,
		});
	}

	// 4. This page's SEO: added here or its own; and whether the HTML already carries it (link previews).
	const head = await siteHead(project, doc, models, address.pathname);
	if (!head.found)
		items.push({
			key: 'seo',
			label: 'SEO',
			status: 'idle',
			message: `${head.path} isn’t added to SEO here, so it keeps its own. Add it on Website → Pages (path ${head.path}, Published) and give it SEO on Website → SEO.`,
		});
	else {
		const title = head.seo?.title || '';
		const htmlTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
		const decoded = htmlTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
		if (html && title && decoded === title)
			items.push({ key: 'seo', label: 'SEO', status: 'ok', message: `${head.path} takes its SEO from here (“${title}”), and it’s in the HTML your server sends — search engines and link previews see it.` });
		else if (seoOn)
			items.push({
				key: 'seo',
				label: 'SEO',
				status: 'ok',
				message: `${head.path} takes its SEO from here (“${title}”); the snippet puts it on the page in the browser — Google sees it. For link previews, print it on your server (step 4).`,
			});
		else
			items.push({
				key: 'seo',
				label: 'SEO',
				status: 'warning',
				message: `${head.path} is added to SEO here (“${title}”), but nothing puts it on the page yet — add data-seo to the snippet, or print it on your server (step 4).`,
			});
	}

	const bad = items.some(i => i.status === 'missing');
	const running = items.find(i => i.key === 'visits')?.status === 'ok' || items.find(i => i.key === 'snippet')?.status === 'ok';
	return {
		checkedAt,
		url,
		connected: !bad && !!running,
		message: bad ? 'Not connected yet — see what’s missing below.' : running ? 'Connected.' : 'Almost — open your site in a browser, then test again.',
		items,
	};
};
