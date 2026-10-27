import sharp from 'sharp';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import { fetchable } from '../controllers/mcp/website.tools.js';
import { templatePattern } from '../siteBuilder/resolve.js';
import { fetchPage } from './siteCheck.function.js';
import { siteHead, pathCandidates } from './siteHead.function.js';
import { siteOrigin } from './siteConfig.function.js';
import { ownDomain, target } from './siteConnection.function.js';

/**
 * The link preview checker (docs/seo SEO-14): what Facebook, LinkedIn,
 * WhatsApp, X and Slack show when someone shares an address. Those apps never
 * run a page's JavaScript — they read the HTML its server sends — so this
 * reads the same HTML (siteCheck's fetchPage: redirects followed, private
 * addresses refused), its share tags, and the share image's size, and builds
 * each app's card from them with that app's own fallbacks.
 *
 * Problems are the ones that change a card: no image, an image too small,
 * too large or too heavy, a title or description cut off, and tags that are
 * only added in the browser. For one of the project's own pages that is
 * added to SEO here, `mint` names its SEO record (the panel's Edit SEO) and
 * compares the HTML with the SEO set here — a connected site whose snippet
 * puts that SEO on in the browser is the case share cards miss.
 *
 * Any address can be checked, not only the project's.
 */

export type PreviewLevel = 'error' | 'warning' | 'notice';
export type PreviewApp = 'facebook' | 'linkedin' | 'whatsapp' | 'x' | 'slack';
export type PreviewProblem = { key: string; level: PreviewLevel; message: string; apps?: PreviewApp[] };
export type PreviewImage = { url: string; ok: boolean; width?: number; height?: number; bytes?: number; type?: string; message?: string };
export type PreviewCard = { app: PreviewApp; title: string; description: string; image: string; domain: string; siteName: string; layout: 'large' | 'small' | 'text' };

const APPS: PreviewApp[] = ['facebook', 'linkedin', 'whatsapp', 'x', 'slack'];
const MAX_IMAGE = 10 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
		e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m
	);
const clean = (s: string | undefined) => decode(String(s || '')).replace(/\s+/g, ' ').trim();

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
const attrOf = (tag: string, name: string) => {
	const m = attr(tag, name);
	return m ? m[1] ?? m[2] ?? m[3] ?? '' : undefined;
};

/** The share tags in a page's HTML — the first of each, the way the apps read them. */
export const shareTags = (html: string) => {
	// The apps read the head; a page with no </head> is read whole (the first 1 MB, as Facebook does).
	const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? html).slice(0, 1_000_000);
	const meta: Record<string, string> = {};
	for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
		const key = (attrOf(m[0], 'property') || attrOf(m[0], 'name') || '').toLowerCase().trim();
		const content = attrOf(m[0], 'content');
		if (key && content !== undefined && !(key in meta)) meta[key] = clean(content);
	}
	const link = (rel: RegExp) => {
		for (const m of head.matchAll(/<link\b[^>]*>/gi)) if (rel.test(attrOf(m[0], 'rel') || '')) return attrOf(m[0], 'href') || '';
		return '';
	};
	return {
		title: clean(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
		description: meta['description'] || '',
		ogTitle: meta['og:title'] || '',
		ogDescription: meta['og:description'] || '',
		ogImage: meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'] || '',
		ogImageAlt: meta['og:image:alt'] || '',
		ogUrl: meta['og:url'] || '',
		ogType: meta['og:type'] || '',
		ogSiteName: meta['og:site_name'] || '',
		twitterCard: meta['twitter:card'] || '',
		twitterTitle: meta['twitter:title'] || '',
		twitterDescription: meta['twitter:description'] || '',
		twitterImage: meta['twitter:image'] || meta['twitter:image:src'] || '',
		canonical: link(/(^|\s)canonical(\s|$)/i),
		icon: link(/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i),
	};
};
export type ShareTags = ReturnType<typeof shareTags>;

/** A page that draws itself in the browser: almost no words in its HTML, a script, and an app's empty root. */
export const isAppShell = (html: string) => {
	const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
	const words = body
		.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	const root = /<div\b[^>]*\bid\s*=\s*["'](root|app|__next|__nuxt|svelte|q-app)["'][^>]*>\s*<\/div>/i.test(body);
	return words.length < 120 && /<script\b[^>]*\bsrc=/i.test(html) && (root || words.length < 20);
};

const resolve = (raw: string, base: string) => {
	if (!raw) return '';
	try {
		const u = new URL(raw, base);
		return /^https?:$/.test(u.protocol) ? u.toString() : '';
	} catch {
		return '';
	}
};

/** Downloads the share image (up to 10 MB, each redirect checked) and reads its size. */
const measure = async (url: string): Promise<PreviewImage> => {
	let current = url;
	for (let hop = 0; hop < 4; hop++) {
		const refused = await fetchable(current);
		if (refused) return { url, ok: false, message: refused };
		const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'facebookexternalhit/1.1 (MINT link preview check)', accept: 'image/*' } }).catch(
			(e: any) => e as Error
		);
		if (res instanceof Error) return { url, ok: false, message: `Couldn’t download the image (${res.name === 'TimeoutError' ? 'it took too long' : res.message}).` };
		if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
			current = new URL(res.headers.get('location')!, current).toString();
			continue;
		}
		if (!res.ok) return { url, ok: false, message: `The image address answered ${res.status}.` };
		const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
		const declared = Number(res.headers.get('content-length') || 0);
		if (declared > MAX_IMAGE) {
			res.body?.cancel().catch(() => undefined);
			return { url, ok: true, bytes: declared, type, message: 'Too heavy to measure.' };
		}
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length > MAX_IMAGE) return { url, ok: true, bytes: buffer.length, type, message: 'Too heavy to measure.' };
		const info = await sharp(buffer)
			.metadata()
			.catch(() => null);
		if (!info?.width || !info.height) return { url, ok: false, bytes: buffer.length, type, message: type.startsWith('image/') ? 'The image couldn’t be read.' : `That address isn’t an image (${type || 'no type'}).` };
		return { url, ok: true, width: info.width, height: info.height, bytes: buffer.length, type: type || `image/${info.format}` };
	}
	return { url, ok: false, message: 'Too many redirects.' };
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Each app's card: its own tags first, then the ones it falls back to. */
export const cards = (t: ShareTags, image: PreviewImage | null, twitterImage: PreviewImage | null, domain: string): PreviewCard[] => {
	const title = t.ogTitle || t.title;
	const description = t.ogDescription || t.description;
	const usable = (i: PreviewImage | null) => (i?.ok && (!i.width || (i.width >= 200 && i.height! >= 200)) ? i : null);
	const img = usable(image);
	const wide = (i: PreviewImage | null, w: number, h: number) => !!i && (!i.width || (i.width >= w && i.height! >= h && i.width / i.height! >= 1.3));
	const siteName = t.ogSiteName || domain;
	// Facebook: a big picture from 600×315, a thumbnail below it, none under 200×200.
	const facebook: PreviewCard = { app: 'facebook', title, description, image: img?.url || '', domain, siteName, layout: wide(img, 600, 315) ? 'large' : img ? 'small' : 'text' };
	// LinkedIn: the picture and title, no description in the feed.
	const linkedin: PreviewCard = { app: 'linkedin', title, description: '', image: img?.url || '', domain, siteName, layout: wide(img, 400, 209) ? 'large' : img ? 'small' : 'text' };
	// WhatsApp: a wide picture big, any other as a square thumbnail; heavy pictures are often dropped.
	const wa = img && (!img.bytes || img.bytes <= 600 * 1024) ? img : null;
	const whatsapp: PreviewCard = { app: 'whatsapp', title, description, image: wa?.url || '', domain, siteName, layout: wide(wa, 300, 157) ? 'large' : wa ? 'small' : 'text' };
	// X: twitter:* first; summary_large_image is the big card, anything else a small one.
	const xImg = usable(twitterImage) || img;
	const xLarge = t.twitterCard === 'summary_large_image' && !!xImg && (!xImg.width || (xImg.width >= 300 && xImg.height! >= 157));
	const x: PreviewCard = {
		app: 'x',
		title: t.twitterTitle || title,
		description: t.twitterDescription || description,
		image: xImg && (!xImg.bytes || xImg.bytes <= 5 * 1024 * 1024) ? xImg.url : '',
		domain,
		siteName,
		layout: xLarge ? 'large' : xImg ? 'small' : 'text',
	};
	// Slack: site name, title, description, the picture under them.
	const slack: PreviewCard = { app: 'slack', title, description, image: img?.url || '', domain, siteName, layout: img ? (wide(img, 400, 209) ? 'large' : 'small') : 'text' };
	return [facebook, linkedin, whatsapp, x, slack];
};

/** What's wrong with the tags, for the cards. */
export const previewProblems = (t: ShareTags, image: PreviewImage | null, twitterImage: PreviewImage | null, finalUrl: string): PreviewProblem[] => {
	const out: PreviewProblem[] = [];
	const add = (key: string, level: PreviewLevel, message: string, apps?: PreviewApp[]) => out.push({ key, level, message, ...(apps && { apps }) });
	const title = t.ogTitle || t.title;
	const description = t.ogDescription || t.description;

	if (!title) add('no-title', 'error', 'No title — no og:title and no <title>. The cards show the bare address.', APPS);
	else if (!t.ogTitle) add('no-og-title', 'notice', 'No og:title — the apps use the page’s <title>, which often carries the site’s name twice.');
	if (title.length > 70) add('long-title', 'warning', `The title is ${title.length} characters — most apps cut it after about 60–70, so the end is lost.`, ['facebook', 'linkedin', 'x', 'whatsapp']);
	if (!description) add('no-description', 'warning', 'No description — no og:description and no meta description. Facebook, WhatsApp and Slack show only the title.', ['facebook', 'whatsapp', 'slack']);
	else if (description.length > 200) add('long-description', 'notice', `The description is ${description.length} characters — the apps show one or two lines of it.`, ['facebook', 'whatsapp', 'slack']);

	if (!t.ogImage) add('no-image', 'error', 'No og:image — every card is text only, and Facebook may pick any picture from the page.', APPS);
	else if (!/^https?:\/\//i.test(t.ogImage)) add('relative-image', 'warning', `og:image is “${t.ogImage}”, not a whole address — Facebook and LinkedIn need https://… to find it.`, ['facebook', 'linkedin']);
	if (image && !image.ok) add('image-broken', 'error', `The share image can’t be shown: ${image.message}`, APPS);
	if (image?.ok && image.width && image.height) {
		const { width: w, height: h } = image;
		if (w < 200 || h < 200) add('image-tiny', 'error', `The share image is ${w}×${h} — under 200×200, Facebook and LinkedIn show no picture. Use 1200×630.`, APPS);
		else if (w < 600 || h < 315) add('image-small', 'warning', `The share image is ${w}×${h} — under 600×315 it shows as a small thumbnail, not the big picture. Use 1200×630.`, ['facebook', 'linkedin', 'slack']);
		const ratio = w / h;
		if (w >= 200 && h >= 200 && (ratio < 1.6 || ratio > 2.2))
			add('image-ratio', 'notice', `The share image is ${ratio < 1 ? 'tall' : ratio < 1.6 ? 'nearly square' : 'very wide'} (${w}×${h}) — the big cards are 1.91:1 (1200×630), so it’s cropped or shown small.`);
	}
	if (image?.ok && image.bytes) {
		if (image.bytes > 8 * 1024 * 1024) add('image-heavy', 'error', `The share image is ${kb(image.bytes)} — Facebook refuses images over 8 MB, X over 5 MB.`, ['facebook', 'x', 'linkedin', 'whatsapp']);
		else if (image.bytes > 5 * 1024 * 1024) add('image-heavy', 'warning', `The share image is ${kb(image.bytes)} — X and LinkedIn refuse images over 5 MB.`, ['x', 'linkedin', 'whatsapp']);
		else if (image.bytes > 600 * 1024) add('image-heavy-whatsapp', 'warning', `The share image is ${kb(image.bytes)} — WhatsApp often drops pictures this heavy. Keep it under 300 KB (a compressed JPEG or WebP).`, ['whatsapp']);
	}
	if (image?.ok && image.type && !/^image\/(jpe?g|png|webp|gif)$/.test(image.type))
		add('image-type', 'warning', `The share image is ${image.type} — use JPEG, PNG or WebP; ${image.type.includes('svg') ? 'SVG isn’t shown by any app' : 'some apps don’t show it'}.`, APPS);
	if (twitterImage && !twitterImage.ok) add('twitter-image-broken', 'warning', `twitter:image can’t be shown on X: ${twitterImage.message}`, ['x']);

	if (!t.twitterCard) add('no-twitter-card', 'warning', 'No twitter:card — X shows a small card at best. Add summary_large_image for the big picture.', ['x']);
	else if (t.twitterCard !== 'summary_large_image' && t.twitterCard !== 'summary') add('twitter-card', 'notice', `twitter:card is “${t.twitterCard}” — for a page, use summary_large_image (or summary).`, ['x']);
	if (!t.ogSiteName) add('no-site-name', 'notice', 'No og:site_name — Slack and Facebook show the bare domain instead of your site’s name.', ['slack', 'facebook']);
	if (t.ogUrl && finalUrl) {
		const strip = (u: string) => u.replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/^www\./i, '').toLowerCase();
		if (strip(t.ogUrl) !== strip(finalUrl))
			add('og-url', 'notice', `og:url is ${t.ogUrl} — the apps show and count shares for that address, not ${finalUrl}. Right if it’s the page’s main address.`);
	}
	return out;
};

/** The project's SEO record for a path — a page added to SEO here (exact, or a builder template page's records). */
const mintRecord = async (models: { pages?: any; seo?: any }, rawPath: string) => {
	if (!models.pages || !models.seo) return null;
	const { path, candidates } = pathCandidates(rawPath);
	let page: any = await models.pages.findOne({ path: { $in: candidates }, archivedAt: null }, { name: 1, path: 1 }).lean();
	if (!page) {
		const templates: any[] = await SitePage.find({ kind: 'template', deletedAt: null }, { path: 1 }).limit(200).lean();
		const hit = templates.find(t => templatePattern(t.path)?.regex.test(path));
		if (hit) page = await models.pages.findOne({ path: hit.path, archivedAt: null }, { name: 1, path: 1 }).lean();
	}
	if (!page) return null;
	const rec: any = await models.seo.findOne({ page: page._id, archivedAt: null }, { _id: 1 }).lean();
	// A builder page is drawn on Mint's server (mint-sites), its tags in the HTML already.
	const builder = !!(await SitePage.exists({ path: page.path, deletedAt: null }));
	return { page: { name: String(page.name || ''), path: String(page.path || path) }, seo: rec ? String(rec._id) : null, template: page.path.includes('['), builder };
};

export const linkPreview = async (project: any, doc: any, models: { pages?: any; seo?: any }, raw: unknown) => {
	const checkedAt = new Date().toISOString();
	const origin = siteOrigin(project, doc);
	const url = target(raw, origin);
	if (!url)
		return {
			checkedAt,
			url: '',
			ok: false,
			message: String(raw ?? '').trim()
				? 'That isn’t a web address — type one like https://www.example.com/page.'
				: 'Type an address to check (https://www.example.com/page), or add the site’s domain on Site setup → Domains.',
		};

	const page = await fetchPage(url);
	if (typeof page === 'string') return { checkedAt, url, ok: false, message: page };
	if (page.status >= 400) return { checkedAt, url, finalUrl: page.url, status: page.status, ok: false, message: `The page answered ${page.status} — the apps show no card for it.` };

	const finalUrl = page.url;
	const tags = shareTags(page.html);
	const imageUrl = resolve(tags.ogImage, finalUrl);
	const twitterUrl = resolve(tags.twitterImage, finalUrl);
	const [image, twitterImage] = await Promise.all([imageUrl ? measure(imageUrl) : null, twitterUrl && twitterUrl !== imageUrl ? measure(twitterUrl) : null]);
	const host = new URL(finalUrl).host.replace(/^www\./, '');
	const problems = previewProblems(tags, image, twitterImage, finalUrl);
	if (finalUrl !== url) problems.push({ key: 'redirected', level: 'notice', message: `${url} sends visitors on to ${finalUrl} — the cards are read from there.` });

	// Tags added in the browser: the apps never see them.
	const domains: string[] = (project.domains || []).filter((d: string) => !d.startsWith('localhost'));
	const ours = !domains.length || ownDomain(new URL(finalUrl).hostname, domains);
	const record = ours ? await mintRecord(models, new URL(finalUrl).pathname) : null;
	let browserOnly = false;
	if (record?.seo && !record.builder) {
		const head = await siteHead(project, doc, models, new URL(finalUrl).pathname);
		const want = head.seo;
		const missing = want
			? [
					want.ogTitle && tags.ogTitle !== want.ogTitle && 'its title',
					want.ogDescription && tags.ogDescription !== want.ogDescription && 'description',
					want.image && !tags.ogImage && 'share image',
			  ].filter(Boolean)
			: [];
		if (missing.length) {
			browserOnly = true;
			const snippet = /\/public\/track\.js[^>]*data-seo/i.test(page.html) || /data-seo[^>]*\/public\/track\.js/i.test(page.html);
			problems.unshift({
				key: 'browser-only',
				level: 'error',
				message: `The SEO set here for ${record.page.path} (${missing.join(', ')}) isn’t in the HTML your server sends${
					snippet ? ' — the snippet puts it on the page in the browser, and share apps don’t run JavaScript' : ''
				}. The cards show the page’s own tags. Print it on your server, or put the Mint edge in front of the site (Website setup → Existing website).`,
				apps: APPS,
			});
		}
	}
	if (!browserOnly && isAppShell(page.html))
		problems.unshift({
			key: 'app-shell',
			level: tags.ogTitle && tags.ogImage ? 'notice' : 'error',
			message:
				tags.ogTitle && tags.ogImage
					? 'This page draws itself in the browser (a JavaScript app). Its share tags are in the HTML, so the cards are right — but any tag it changes later isn’t seen.'
					: 'This page draws itself in the browser (a JavaScript app), and its share tags aren’t in the HTML the server sends — tags added by its JavaScript are never seen by the apps.',
			apps: APPS,
		});

	const order: Record<PreviewLevel, number> = { error: 0, warning: 1, notice: 2 };
	problems.sort((a, b) => order[a.level] - order[b.level]);
	return {
		checkedAt,
		url,
		finalUrl,
		status: page.status,
		ok: true,
		tags,
		image,
		twitterImage,
		cards: cards(tags, image, twitterImage, host),
		problems,
		counts: { error: problems.filter(p => p.level === 'error').length, warning: problems.filter(p => p.level === 'warning').length, notice: problems.filter(p => p.level === 'notice').length },
		mint: record ? { ...record, browserOnly } : null,
	};
};
