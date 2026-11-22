import PanelAdmin from '../models/tenancy/panelAdmin.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import TenantUser from '../models/tenancy/tenantUser.model.js';
import WebsiteEvent from '../models/tenancy/websiteEvent.model.js';
import WebsiteSettings from '../models/tenancy/websiteSettings.model.js';
import sendMail from '../controllers/marketing/mail/sendMail.controller.js';
import { button, esc, mailPage, para } from './mail.function.js';
import { fetchPage } from './siteCheck.function.js';
import { connectionOf, forgetSite, loadSite } from './siteConfig.function.js';
import { notifyTenant, projectAudience, projectHrefFor } from './tenantNotify.function.js';
import { runInScope, runUnscoped } from './tenantScope.function.js';

/**
 * Mint SEO keeps watching a live site (docs/seo-panel SP-09, D7). Once a day each live SEO site is checked again:
 *
 *   cloudflare  the site answers with Mint's `x-mint-edge` header, or the Worker asked Mint for its settings in the
 *               last 2 days (its own health ping: every `GET /site/edge` it sends is noted, see noteEdgePing)
 *   script      the snippet with this project's key is in the page's HTML, or visits from the site arrived in the
 *               last 3 days (a tag manager or plugin adds it later, so it isn't in the HTML)
 *
 * A failed check sets `status: 'attention'` with the reason — a banner on every page of Mint SEO, an email to the
 * project's logins and owners, a notification in the tenant panel. Editing stays open (D7); only Disconnect closes
 * the screens. The next check that passes puts it back to `live` and says so. A site that didn't answer is asked
 * once more a few seconds later, so one blip doesn't raise the alarm.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const TICK_MS = () => Number(process.env.SEO_WATCH_MS) || HOUR;
const DUE_MS = () => Number(process.env.SEO_WATCH_DUE_MS) || DAY;
const WORKER_QUIET_MS = 2 * DAY;
const VISITS_QUIET_MS = 3 * DAY;
const RETRY_MS = () => Number(process.env.SEO_WATCH_RETRY_MS) || 5000;
const TEST_DOMAIN = /@(example\.(com|org|net)|[^@]+\.(test|invalid|localhost))$/i;
const SEO_APP_URL = () => (process.env.SEO_APP_URL || 'https://seo.tcrypt.site').replace(/\/+$/, '');

/* --------------------------------------------- the Worker's health ping */

/**
 * The Worker's health ping: every `GET /site/edge` it sends carries `x-mint-edge: <version>`. Noted on the
 * connection (at most once an hour, or when the version changes) — the daily check reads it, and Home shows the
 * version ("update available" when older than Mint's).
 */
export const noteEdgePing = async (project: any, doc: any, version: unknown) => {
	const v = String(version || '').split(';')[0].trim().slice(0, 20);
	if (!v || !doc?.connection?.status) return;
	const c = doc.connection;
	const seen = c.edgeSeenAt ? new Date(c.edgeSeenAt).getTime() : 0;
	if (Date.now() - seen < HOUR && c.edgeVersion === v) return;
	await runInScope({ organization: project.organization, project: project._id }, () =>
		WebsiteSettings.updateOne({}, { $set: { 'connection.edgeSeenAt': new Date(), 'connection.edgeVersion': v } })
	);
	forgetSite(project);
};

/* ------------------------------------------------------ the daily check */

export type WatchResult = { ok: boolean; reason: string; how: string };

// The snippet as testConnection finds it (siteConnection.function.ts): track.js with this project's key.
const hasOurSnippet = (html: string, key: string) =>
	!!key && [...html.matchAll(/<script\b[^>]*\/(?:public|_mint)\/track\.js[^>]*>/gi)].some(m => m[0].match(/\bdata-key\s*=\s*["']([^"']*)["']/i)?.[1] === key);

// Why the page couldn't be read, in a few words.
const noAnswer = (page: Awaited<ReturnType<typeof fetchPage>>) =>
	typeof page === 'string' ? 'Mint couldn’t open your site' : `Your site answered with an error (${page.status})`;

const fetchTwice = async (url: string) => {
	const first = await fetchPage(url);
	if (typeof first !== 'string' && first.status < 500) return first;
	await new Promise(r => setTimeout(r, RETRY_MS()));
	return fetchPage(url);
};

/** Is the site still connected the way it was set up? (In the project's scope.) */
export const checkSite = async (project: any, c: ReturnType<typeof connectionOf> & { edgeSeenAt?: any }): Promise<WatchResult> => {
	if (!c.siteUrl) return { ok: false, reason: 'The site’s address is missing.', how: '' };
	const page = await fetchTwice(c.siteUrl);
	const reached = typeof page !== 'string' && page.status < 400;
	if (c.mode === 'cloudflare') {
		if (reached && String(page.headers?.['x-mint-edge'] || '').trim()) return { ok: true, reason: '', how: 'worker' };
		const seen = c.edgeSeenAt ? new Date(c.edgeSeenAt).getTime() : 0;
		if (Date.now() - seen < WORKER_QUIET_MS) return { ok: true, reason: '', how: 'ping' };
		if (!reached) return { ok: false, reason: `${noAnswer(page)}, and Mint’s Worker hasn’t been in touch for 2 days.`, how: '' };
		return { ok: false, reason: 'Mint’s Cloudflare Worker isn’t in front of your site any more — its route may have been removed, or the Worker deleted.', how: '' };
	}
	if (reached && hasOurSnippet(page.html, project.apiKey)) return { ok: true, reason: '', how: 'snippet' };
	const hosts = (c.hostnames || []).map((h: string) => h.toLowerCase());
	const visit = hosts.length && (await WebsiteEvent.exists({ type: 'pageview', host: { $in: hosts }, createdAt: { $gte: new Date(Date.now() - VISITS_QUIET_MS) } }));
	if (visit) return { ok: true, reason: '', how: 'visits' };
	if (!reached) return { ok: false, reason: `${noAnswer(page)}, and no visits arrived for 3 days.`, how: '' };
	return { ok: false, reason: 'Mint’s snippet isn’t on your site any more, and no visits arrived for 3 days — a theme update or a new plugin may have removed it.', how: '' };
};

/* ------------------------------------------------------------ telling */

/** Everyone who should hear: the project's active logins with an email, and the owners who manage the site. */
const recipients = async (project: any) => {
	const [logins, members] = await Promise.all([
		runUnscoped(() => PanelAdmin.find({ project: project._id, isActive: { $ne: false }, demo: { $ne: true }, email: { $nin: [null, ''] } }, { email: 1 }).limit(20).lean()),
		projectAudience({ organization: project.organization, project, permission: 'manage-site' }).catch(() => [] as any[]),
	]);
	const users: any[] = members.length ? await runUnscoped(() => TenantUser.find({ _id: { $in: members } }, { email: 1 }).lean()) : [];
	const emails = [...new Set([...logins, ...users].map((x: any) => String(x.email || '').toLowerCase()).filter(Boolean))].slice(0, 25);
	return { emails, members };
};

const tell = async (project: any, siteUrl: string, lost: boolean, reason: string) => {
	const { emails, members } = await recipients(project);
	const site = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
	const title = lost ? `${site} needs attention` : `${site} is connected again`;
	const message = lost ? `${reason} Editing in Mint SEO still works. Once it’s fixed, press Check now on Connection.` : 'Mint can see your site again — nothing more to do.';
	const href = await projectHrefFor(project, '/website-setup');
	await notifyTenant(members.map(recipient => ({ recipient, organization: project.organization, project: project._id, type: lost ? 'seo-attention' : 'seo-live', title, message, href })));
	const link = `${SEO_APP_URL()}/connection`;
	const html = mailPage('MINT SEO', esc(title), para(esc(message)) + button(link, 'Open Connection'));
	const body = `${message}\n\n${link}`;
	for (const to of emails) {
		// In development, mail to reserved test domains is logged, not sent (as twoFactor.service.ts does).
		if (process.env.NODE_ENV !== 'production' && TEST_DOMAIN.test(to)) console.log(`[mail → ${to}] ${title}\n${body}`);
		else await sendMail({ to, subject: title, title: 'MINT SEO', body, html });
	}
	return emails.length;
};

/**
 * Checks one project's site now and moves its status: live → attention on a failed check (telling everyone once),
 * attention → live when it passes again (telling them it's fixed). Returns the new connection.
 */
export const recheckSeoSite = async (project: any) => {
	const doc: any = await loadSite(project);
	const c: any = { ...connectionOf(doc), edgeSeenAt: doc?.connection?.edgeSeenAt };
	if (c.status !== 'live' && c.status !== 'attention') return { connection: connectionOf(doc), result: null };
	const result = await checkSite(project, c);
	const at = new Date();
	const status = result.ok ? 'live' : 'attention';
	const set: any = { 'connection.status': status, 'connection.lastCheckAt': at, 'connection.attentionReason': result.ok ? '' : result.reason };
	await runInScope({ organization: project.organization, project: project._id }, () => WebsiteSettings.updateOne({}, { $set: set }));
	forgetSite(project);
	if (status !== c.status) await tell(project, c.siteUrl, status === 'attention', result.reason).catch((e: any) => console.error('seo watch tell:', e?.message));
	return { connection: connectionOf(await loadSite(project)), result };
};

/* --------------------------------------------------------- the schedule */

/** Every live SEO site whose last check is a day old, once. Claimed by moving `lastCheckAt`, so two servers never both check. */
export const runSeoWatch = async () => {
	const projects: any[] = await runUnscoped(() => TenantProject.find({ type: 'website', edition: 'seo', isActive: { $ne: false } }).lean());
	let checked = 0;
	for (const project of projects) {
		try {
			await runInScope({ organization: project.organization, project: project._id }, async () => {
				const doc: any = await WebsiteSettings.findOne({}, { connection: 1 }).lean();
				const c = doc?.connection;
				if (!c || (c.status !== 'live' && c.status !== 'attention')) return;
				const last = c.lastCheckAt ? new Date(c.lastCheckAt) : null;
				if (last && Date.now() - last.getTime() < DUE_MS()) return;
				const claim = await WebsiteSettings.updateOne({ _id: doc._id, 'connection.lastCheckAt': c.lastCheckAt ?? null }, { $set: { 'connection.lastCheckAt': new Date() } });
				if (!claim.modifiedCount) return;
				forgetSite(project);
				await recheckSeoSite(project);
				checked++;
			});
		} catch (e: any) {
			console.error('seo watch:', e?.message);
		}
	}
	return checked;
};

let running = false;
export const scheduleSeoWatch = () => {
	setInterval(async () => {
		if (running) return;
		running = true;
		try {
			await runSeoWatch();
		} finally {
			running = false;
		}
	}, TICK_MS()).unref();
};
