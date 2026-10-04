import crypto from 'crypto';
import mongoose from 'mongoose';
import Organization from '../models/tenancy/organization.model.js';
import TenantUser from '../models/tenancy/tenantUser.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import { BuildError } from '../controllers/builder/models.controller.js';
import { applyTemplate, ApplyResult } from './applyTemplate.function.js';
import { createProject, removeProjectContents } from './projectLifecycle.function.js';
import { createOrganization } from './tenancy.function.js';

/**
 * Template previews (docs/templates TD8, T-04). A template is built — with
 * the same engine a tenant's project gets — into a throwaway project in a
 * hidden **system organization**, opened in the tenant panel through a
 * single-use 5-minute ticket, and deleted after 24 hours with everything in it.
 *
 * The sandbox owner is a TenantUser with no password (`system: true`): only a
 * ticket signs anyone in as it, and its sessions can't touch anything outside
 * the preview projects (tenantProtect, `previewGuard`). The sandbox never shows
 * in the super admin's tenant tables.
 *
 * A big template takes minutes against the real database — longer than the
 * platform's 30-second request limit — so the build runs in the background:
 * the request waits up to `BUILD_WAIT_MS`, then answers `building`, and
 * `previewStatus` (or the previews list) says when it's ready.
 */

export const SANDBOX_SLUG = 'mint-template-sandbox';
const SANDBOX_EMAIL = 'template-previews@sandbox.invalid';
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
/** Previews kept at once; the oldest go first. */
const MAX_PREVIEWS = 50;
/** How long a request waits for its build before answering `building` — under the platform's 30-second limit (TEMPLATE_PREVIEW_WAIT_MS overrides). */
export const BUILD_WAIT_MS = Number(process.env.TEMPLATE_PREVIEW_WAIT_MS) >= 0 && process.env.TEMPLATE_PREVIEW_WAIT_MS ? Number(process.env.TEMPLATE_PREVIEW_WAIT_MS) : 20 * 1000;
/** A build still `building` after this died with its server (a restart or deploy). */
const STALE_BUILD_MS = 15 * 60 * 1000;
/** A failed build's record is kept this long, so whoever asked can read why. */
const FAILED_TTL_MS = 60 * 60 * 1000;

export type PreviewStatus = 'building' | 'ready' | 'failed';

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const tenantUrl = () => String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

let cached: { organization: any; owner: any } | null = null;

/** The sandbox organization and its owner, made the first time they're needed. */
export const ensureSandbox = async () => {
	if (cached && (await Organization.exists({ _id: cached.organization._id }))) return cached;
	let owner: any = await TenantUser.findOne({ email: SANDBOX_EMAIL });
	if (!owner) owner = await TenantUser.create({ name: 'Template preview', email: SANDBOX_EMAIL, system: true, emailVerified: true });
	let organization: any = await Organization.findOne({ slug: SANDBOX_SLUG });
	if (!organization) {
		organization = await createOrganization({ name: 'Template previews', owner });
		// createOrganization slugs the name; the sandbox has a fixed one.
		organization = await Organization.findByIdAndUpdate(organization._id, { $set: { slug: SANDBOX_SLUG, system: true } }, { new: true });
	}
	if (String(owner.lastOrganization || '') !== String(organization._id)) await TenantUser.updateOne({ _id: owner._id }, { $set: { lastOrganization: organization._id } });
	cached = { organization, owner };
	return cached;
};

export const isSandboxUser = (user: any) => user?.system === true;

/** A new ticket for a preview project: the raw value goes in the link, its hash on the project. */
const issueTicket = async (projectId: any) => {
	const ticket = crypto.randomBytes(24).toString('hex');
	await TenantProject.updateOne({ _id: projectId }, { $set: { 'preview.ticketHash': hash(ticket), 'preview.ticketExpiresAt': new Date(Date.now() + TICKET_TTL_MS) } });
	return { ticket, url: `${tenantUrl()}/preview?ticket=${ticket}`, ticketExpiresAt: new Date(Date.now() + TICKET_TTL_MS) };
};

const STALE_MESSAGE = 'The build stopped part-way — the server restarted while it ran. Delete this preview and make a new one.';

/** A preview's state; one left `building` by a server that went away counts as failed. Previews from before builds ran in the background have none: ready. */
const statusOf = (p: any): PreviewStatus => {
	const s = p.preview?.status || 'ready';
	return s === 'building' && Date.now() - new Date(p.createdAt).getTime() > STALE_BUILD_MS ? 'failed' : s;
};

const publicPreview = (p: any) => {
	const status = statusOf(p);
	return {
		_id: p._id,
		name: p.name,
		type: p.type,
		publicSlug: p.publicSlug,
		from: p.preview?.from,
		template: p.preview?.template,
		status,
		...(status === 'failed' && { error: p.preview?.error || STALE_MESSAGE, problems: p.preview?.problems || [] }),
		builtAt: p.preview?.builtAt,
		expiresAt: p.preview?.expiresAt,
		createdAt: p.createdAt,
	};
};

/** What a finished build made, kept on the preview for whoever asks later. */
const summaryOf = (r: ApplyResult) => ({
	template: r.template,
	models: r.models,
	pages: r.pages,
	records: r.records,
	widgets: r.widgets,
	roles: r.roles,
	endpoints: r.endpoints,
	webhooks: r.webhooks,
	warnings: r.warnings,
});

const sleep = (ms: number) => new Promise<null>(resolve => setTimeout(() => resolve(null), ms));

/** Deletes one preview project and everything in it. */
export const removePreview = async (project: any) => {
	await removeProjectContents(project.organization, project._id);
	await TenantProject.deleteOne({ _id: project._id });
};

export type PreviewAnswer =
	| { status: 'ready'; project: any; result: ApplyResult; ticket: string; url: string; ticketExpiresAt: Date }
	| { status: 'building'; project: any; already?: boolean };

/**
 * Builds `template` into a new sandbox project, in the background. Waits up to
 * `waitMs` for it: done → the project, what was built and a ticket link;
 * still going → `building` (ask `previewStatus`). A build that fails while the
 * caller waits throws and leaves nothing behind; one that fails later leaves a
 * `failed` record with the reason for an hour. While a template has a build
 * running, asking again answers that one (`already`) — builds side by side
 * only slow each other down.
 */
export const previewTemplate = async (
	req: any,
	template: any,
	opts: { from?: 'draft' | 'published'; answers?: Record<string, any>; sampleData?: boolean; waitMs?: number } = {}
): Promise<PreviewAnswer> => {
	const from = opts.from || (template.status === 'published' && !template.changed ? 'published' : 'draft');
	const { organization, owner } = await ensureSandbox();
	const running: any = await TenantProject.findOne({
		organization: organization._id,
		'preview.template': template._id,
		'preview.status': 'building',
		createdAt: { $gt: new Date(Date.now() - STALE_BUILD_MS) },
	}).lean();
	if (running) return { status: 'building', project: publicPreview(running), already: true };

	// Keep the sandbox small: the oldest previews go (never one still building).
	const extra = (await TenantProject.countDocuments({ organization: organization._id })) - MAX_PREVIEWS + 1;
	if (extra > 0) {
		const old = await TenantProject.find({ organization: organization._id }).sort({ createdAt: 1 }).lean();
		for (const p of old.filter(p => statusOf(p) !== 'building').slice(0, extra)) await removePreview(p);
	}

	// The build runs as the sandbox owner, in the sandbox — the admin's request lends its app and address.
	const sandboxReq = Object.assign(Object.create(req), { user: owner, organization, member: null, permissions: ['*'] });
	const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const project: any = await createProject(
		sandboxReq,
		organization._id,
		{ name: `${template.name} · preview ${when}`.slice(0, 80), type: template.type, description: `Preview of the template “${template.name}” (${from}).` },
		{
			createdBy: owner._id,
			preview: { template: template._id, from, status: 'building', expiresAt: new Date(Date.now() + PREVIEW_TTL_MS), createdBy: req.user?._id },
		}
	);

	const build = (async () => {
		try {
			const result = await applyTemplate(sandboxReq, { project, template, from, answers: opts.answers, sampleData: opts.sampleData !== false, preview: true });
			await TenantProject.updateOne({ _id: project._id }, { $set: { 'preview.status': 'ready', 'preview.builtAt': new Date(), 'preview.result': summaryOf(result) } });
			return result;
		} catch (e: any) {
			if (!(e instanceof BuildError)) console.error(`Template preview of “${template.name}” failed:`, e?.stack || e);
			await removeProjectContents(project.organization, project._id).catch(() => undefined);
			await TenantProject.updateOne(
				{ _id: project._id },
				{
					$set: {
						'preview.status': 'failed',
						'preview.error': String(e?.message || 'the build failed').slice(0, 2000),
						'preview.problems': (e?.problems || []).slice(0, 50).map((p: any) => String(p).slice(0, 500)),
						'preview.expiresAt': new Date(Date.now() + FAILED_TTL_MS),
					},
				}
			).catch(() => undefined);
			throw e;
		}
	})();

	const done = await Promise.race([build.then(result => ({ result }), (error: any) => ({ error })), sleep(opts.waitMs ?? BUILD_WAIT_MS)]);
	if (!done) return { status: 'building', project: publicPreview(await TenantProject.findById(project._id).lean()) };
	if ('error' in done) {
		// The caller hears why, so the failed record isn't needed.
		await TenantProject.deleteOne({ _id: project._id }).catch(() => undefined);
		throw done.error;
	}
	const t = await issueTicket(project._id);
	return { status: 'ready', project: publicPreview(await TenantProject.findById(project._id).lean()), result: done.result, ...t };
};

const findPreview = async (projectId: any) => {
	const { organization } = await ensureSandbox();
	if (!mongoose.isValidObjectId(projectId)) throw new BuildError(400, `“${projectId}” isn’t a preview id.`);
	const project: any = await TenantProject.findOne({ _id: projectId, organization: organization._id }).lean();
	if (!project) throw new BuildError(404, 'That preview is gone — previews are deleted after 24 hours. Make a new one.');
	return project;
};

/**
 * Where a preview stands. Ready → what was built and a fresh single-use link;
 * building → how long it has run; failed → why.
 */
export const previewStatus = async (projectId: any) => {
	const project = await findPreview(projectId);
	const pub = publicPreview(project);
	if (pub.status !== 'ready') return { status: pub.status, project: pub };
	return { status: pub.status, project: pub, result: project.preview?.result || null, ...(await issueTicket(project._id)) };
};

/** A fresh ticket for a preview that still exists (each ticket opens it once). */
export const reopenPreview = async (projectId: any) => {
	const project = await findPreview(projectId);
	const pub = publicPreview(project);
	if (pub.status === 'building') throw new BuildError(409, 'That preview is still being built — it opens once it’s ready.');
	if (pub.status === 'failed') throw new BuildError(409, `That preview wasn’t built: ${pub.error}`, pub.problems);
	return { project: pub, ...(await issueTicket(project._id)) };
};

/** A template's previews that still exist, newest first. */
export const listPreviews = async (templateId?: any) => {
	const { organization } = await ensureSandbox();
	const docs = await TenantProject.find({ organization: organization._id, ...(templateId && { 'preview.template': templateId }) })
		.sort({ createdAt: -1 })
		.lean();
	return docs.map(publicPreview);
};

export const deletePreview = async (projectId: any) => {
	const { organization } = await ensureSandbox();
	const project: any = await TenantProject.findOne({ _id: projectId, organization: organization._id });
	if (!project) throw new BuildError(404, 'That preview is already gone.');
	// Its build would carry on writing into a project that's gone.
	if (statusOf(project) === 'building') throw new BuildError(409, 'That preview is still being built — delete it once it’s ready.');
	await removePreview(project);
};

/**
 * The tenant panel's /preview page: a ticket for a session as the sandbox
 * owner, once, within 5 minutes. Returns the user and the project to open.
 */
export const redeemTicket = async (ticket: string) => {
	const value = String(ticket || '').trim();
	if (!/^[a-f0-9]{48}$/.test(value)) return null;
	const project: any = await TenantProject.findOneAndUpdate(
		{ 'preview.ticketHash': hash(value), 'preview.ticketExpiresAt': { $gt: new Date() } },
		{ $unset: { 'preview.ticketHash': 1, 'preview.ticketExpiresAt': 1 } },
		{ new: true }
	).lean();
	if (!project) return null;
	const { owner, organization } = await ensureSandbox();
	if (String(project.organization) !== String(organization._id)) return null;
	return { owner, organization, project };
};

/** Deletes expired previews (boot and hourly). Never throws. */
export const purgeExpiredPreviews = async () => {
	try {
		const expired = await TenantProject.find({ 'preview.expiresAt': { $lt: new Date() } });
		for (const p of expired) await removePreview(p).catch((e: any) => console.error(`Template preview cleanup: ${e.message}`));
		return expired.length;
	} catch (e: any) {
		console.error(`Template preview cleanup: ${e.message}`);
		return 0;
	}
};

export const schedulePreviewPurge = () => {
	purgeExpiredPreviews();
	setInterval(purgeExpiredPreviews, 60 * 60 * 1000).unref();
};
