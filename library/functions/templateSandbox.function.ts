import crypto from 'crypto';
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
 */

export const SANDBOX_SLUG = 'mint-template-sandbox';
const SANDBOX_EMAIL = 'template-previews@sandbox.invalid';
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
/** Previews kept at once; the oldest go first. */
const MAX_PREVIEWS = 50;

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

const publicPreview = (p: any) => ({
	_id: p._id,
	name: p.name,
	type: p.type,
	publicSlug: p.publicSlug,
	from: p.preview?.from,
	template: p.preview?.template,
	expiresAt: p.preview?.expiresAt,
	createdAt: p.createdAt,
});

/** Deletes one preview project and everything in it. */
export const removePreview = async (project: any) => {
	await removeProjectContents(project.organization, project._id);
	await TenantProject.deleteOne({ _id: project._id });
};

/**
 * Builds `template` into a new sandbox project. Returns the project, what was
 * built and a ticket link to open it. A failed build leaves nothing behind.
 */
export const previewTemplate = async (
	req: any,
	template: any,
	opts: { from?: 'draft' | 'published'; answers?: Record<string, any>; sampleData?: boolean } = {}
): Promise<{ project: any; result: ApplyResult; ticket: string; url: string; ticketExpiresAt: Date }> => {
	const from = opts.from || (template.status === 'published' && !template.changed ? 'published' : 'draft');
	const { organization, owner } = await ensureSandbox();
	// Keep the sandbox small: the oldest previews go.
	const extra = (await TenantProject.countDocuments({ organization: organization._id })) - MAX_PREVIEWS + 1;
	if (extra > 0) for (const old of await TenantProject.find({ organization: organization._id }).sort({ createdAt: 1 }).limit(extra)) await removePreview(old);

	// The build runs as the sandbox owner, in the sandbox — the admin's request lends its app and address.
	const sandboxReq = Object.assign(Object.create(req), { user: owner, organization, member: null, permissions: ['*'] });
	const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
	const project: any = await createProject(
		sandboxReq,
		organization._id,
		{ name: `${template.name} · preview ${when}`.slice(0, 80), type: template.type, description: `Preview of the template “${template.name}” (${from}).` },
		{ createdBy: owner._id, preview: { template: template._id, from, expiresAt: new Date(Date.now() + PREVIEW_TTL_MS), createdBy: req.user?._id } }
	);
	try {
		const result = await applyTemplate(sandboxReq, { project, template, from, answers: opts.answers, sampleData: opts.sampleData !== false, preview: true });
		const t = await issueTicket(project._id);
		return { project: publicPreview(await TenantProject.findById(project._id).lean()), result, ...t };
	} catch (e) {
		await removePreview(project).catch(() => undefined);
		throw e;
	}
};

/** A fresh ticket for a preview that still exists (each ticket opens it once). */
export const reopenPreview = async (projectId: any) => {
	const { organization } = await ensureSandbox();
	const project: any = await TenantProject.findOne({ _id: projectId, organization: organization._id }).lean();
	if (!project) throw new BuildError(404, 'That preview is gone — previews are deleted after 24 hours. Make a new one.');
	return { project: publicPreview(project), ...(await issueTicket(project._id)) };
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
