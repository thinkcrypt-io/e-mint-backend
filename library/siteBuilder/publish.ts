import crypto from 'crypto';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import SiteRelease from '../models/siteBuilder/siteRelease.model.js';
import { TenancyError, slugify } from '../functions/tenancy.function.js';
import { recordProjectEvent } from '../functions/recordHistory.function.js';
import { siteChanges, EMPTY_SEO } from './site.js';

/**
 * Publish and restore (docs/site-builder D7). Publish checks every draft, then
 * copies drafts to their published copies (pages first, then the design),
 * removes pages deleted since, and writes a SiteRelease snapshot last; then it
 * tells the renderer to drop its cached pages. Restore makes an old release
 * live again (and the drafts with it) as a new release. Both run inside the
 * project's scope.
 */

export const KEEP_RELEASES = 50;

/** The live site's address: a custom domain, the default address, or the local renderer. */
export const siteUrl = (project: any): string | null => {
	const domain = (project.domains || []).find((d: string) => !d.startsWith('localhost'));
	if (domain) return `https://${domain}`;
	const root = process.env.SITES_ROOT_DOMAIN;
	if (root) return `https://${project.publicSlug}.${root}`;
	const renderer = process.env.SITES_RENDERER_URL;
	if (renderer) {
		try {
			const u = new URL(renderer);
			if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return `${u.protocol}//${project.publicSlug}.localhost${u.port ? `:${u.port}` : ''}`;
		} catch {
			/* not a URL */
		}
	}
	return null;
};

/**
 * Asks the renderer to drop its cached pages for the project
 * (POST {SITES_RENDERER_URL}/api/revalidate, HMAC-signed). A failure is logged
 * and reported, never an error — the cache expires on its own in minutes.
 */
export const revalidateSite = async (project: any): Promise<boolean> => {
	const base = process.env.SITES_RENDERER_URL;
	const secret = process.env.SITE_REVALIDATE_SECRET;
	if (!base || !secret) return false;
	const body = JSON.stringify({ tag: `site:${project._id}`, slug: project.publicSlug });
	try {
		const r = await fetch(`${base.replace(/\/$/, '')}/api/revalidate`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-mint-signature': crypto.createHmac('sha256', secret).update(body).digest('hex') },
			body,
			signal: AbortSignal.timeout(4000),
		});
		if (!r.ok) console.error(`site revalidate ${project.publicSlug}: ${r.status}`);
		return r.ok;
	} catch (e: any) {
		console.error(`site revalidate ${project.publicSlug}:`, e?.message);
		return false;
	}
};

/** The page's fields as they go live (pages' `published`, releases' `pages`). */
const snapshot = (p: any) => ({
	name: p.name,
	path: p.path,
	kind: p.kind || 'static',
	source: p.source || null,
	layout: p.layout || 'default',
	showInMenu: !!p.showInMenu,
	menuLabel: p.menuLabel || '',
	priority: p.priority || 0,
	isHome: !!p.isHome,
	tree: p.draft?.tree || [],
	seo: { ...EMPTY_SEO, ...(p.draft?.seo || {}) },
});

const designSnapshot = (draft: any) => ({
	theme: draft.theme,
	tokens: draft.tokens || {},
	colorScheme: draft.colorScheme || 'light',
	layouts: draft.layouts || {},
	sections: draft.sections || {},
});

const nextVersion = async () => {
	const last: any = await SiteRelease.findOne({}, { version: 1 }).sort({ version: -1 }).lean();
	return (last?.version || 0) + 1;
};

const writeRelease = async (data: any) => {
	try {
		await SiteRelease.create(data);
	} catch (e: any) {
		if (e?.code === 11000) throw new TenancyError(409, 'Someone else published at the same moment — check the changes and publish again.');
		throw e;
	}
	// Keep the last KEEP_RELEASES.
	const old = await SiteRelease.find({}, { _id: 1 }).sort({ version: -1 }).skip(KEEP_RELEASES).lean();
	if (old.length) await SiteRelease.deleteMany({ _id: { $in: old.map((r: any) => r._id) } });
};

export const publishSite = async ({ req, project, note = '' }: { req: any; project: any; note?: string }) => {
	const changes = await siteChanges();
	if (!changes.canPublish)
		throw Object.assign(new TenancyError(400, 'Fix the problems first — nothing was published.'), { extra: { problems: changes.problems } });
	if (!changes.any && changes.live) throw new TenancyError(400, 'Nothing has changed since the last publish.');

	const version = await nextVersion();
	const publishedAt = new Date();
	const pages: any[] = await SitePage.find({ deletedAt: null }).lean();
	const live: any[] = [];
	for (const p of pages) {
		if (p.status === 'unpublished') continue;
		const snap = snapshot(p);
		// A save landing meanwhile keeps its newer rev, so the page shows as changed again.
		await SitePage.updateOne({ _id: p._id }, { $set: { published: { ...snap, rev: p.draft?.rev || 1, version, publishedAt }, status: 'published' } });
		live.push({ page: p._id, ...snap });
	}
	await SitePage.deleteMany({ deletedAt: { $ne: null } });

	const design: any = await SiteDesign.findOne({}).lean();
	const designSnap = designSnapshot(design.draft);
	await SiteDesign.updateOne({ _id: design._id }, { $set: { published: { ...designSnap, rev: design.draft.rev, version, publishedAt } } });

	const by = req?.user || {};
	await writeRelease({ version, note: String(note || '').slice(0, 300), publishedBy: by._id, publishedByName: by.name || '', publishedAt, design: designSnap, pages: live });

	recordProjectEvent({
		req,
		model: 'Site',
		modelPath: 'site-builder',
		document: project._id,
		name: 'Site',
		text: `published the site (version ${version}${note ? ` — “${String(note).slice(0, 80)}”` : ''})`,
	});
	const revalidated = await revalidateSite(project);
	return { version, publishedAt, url: siteUrl(project), revalidated, pages: live.length };
};

/** Makes release `version` live again — and the drafts with it — as a new release. */
export const restoreRelease = async ({ req, project, version: from }: { req: any; project: any; version: number }) => {
	const release: any = await SiteRelease.findOne({ version: from }).lean();
	if (!release) throw new TenancyError(404, `There is no version ${from} (the last ${KEEP_RELEASES} are kept)`);
	const version = await nextVersion();
	const publishedAt = new Date();
	const snapIds = new Set(release.pages.map((p: any) => String(p.page)));
	const current: any[] = await SitePage.find({}).lean();

	// 1. Snapshot pages step aside, so paths can swap without clashing.
	for (const p of current) if (snapIds.has(String(p._id))) await SitePage.updateOne({ _id: p._id }, { $set: { path: `/~restoring-${p._id}`, isHome: false } });
	// 2. Pages made since that release stay as drafts (off the live site); one on a restored path moves aside.
	const taken = new Set(release.pages.map((p: any) => p.path));
	for (const p of current) {
		if (snapIds.has(String(p._id))) continue;
		const set: any = { published: null, status: 'draft', isHome: false };
		if (!p.deletedAt && taken.has(p.path)) {
			// A page that had become the home page goes back to a path from its name.
			const base = p.path === '/' ? `/${slugify(p.name) || 'page'}` : `${p.path}-old`;
			let path = base;
			for (let i = 2; taken.has(path) || (await SitePage.exists({ path, deletedAt: null, _id: { $ne: p._id } })); i++) path = `${base}-${i}`;
			set.path = path;
		}
		await SitePage.updateOne({ _id: p._id }, { $set: set });
	}
	// 3. The release's pages, live and as drafts (recreated if they were deleted since).
	for (const s of release.pages) {
		const { page, tree, seo, ...fields } = s;
		const existing = current.find(p => String(p._id) === String(page));
		const rev = (existing?.draft?.rev || 0) + 1;
		const doc = {
			...fields,
			draft: { tree, seo, rev, updatedAt: publishedAt, updatedBy: req?.user?._id },
			published: { ...fields, tree, seo, rev, version, publishedAt },
			status: 'published',
			deletedAt: null,
		};
		if (existing) await SitePage.updateOne({ _id: page }, { $set: doc });
		else await SitePage.create({ _id: page, ...doc });
	}
	// 4. The design.
	const design: any = await SiteDesign.findOne({}).lean();
	const rev = (design?.draft?.rev || 0) + 1;
	await SiteDesign.updateOne({ _id: design._id }, { $set: { draft: { ...release.design, rev }, published: { ...release.design, rev, version, publishedAt } } });

	const by = req?.user || {};
	await writeRelease({ version, note: `Restored version ${from}`, restoredFrom: from, publishedBy: by._id, publishedByName: by.name || '', publishedAt, design: release.design, pages: release.pages });
	recordProjectEvent({ req, model: 'Site', modelPath: 'site-builder', document: project._id, name: 'Site', text: `restored version ${from} of the site (now version ${version})` });
	const revalidated = await revalidateSite(project);
	return { version, restoredFrom: from, publishedAt, url: siteUrl(project), revalidated };
};
