import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import MailDesign from '../library/models/tenancy/mailDesign.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { esc, para, sendOrgMail } from '../library/functions/mail.function.js';
import { DEFAULT_DESIGN, DESIGN_PLACEHOLDERS, FONTS, WIDTHS, checkDesign, designCtx, renderDesign } from '../library/functions/mailDesign.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/mail-designs — how the project's emails look
 * (docs/messaging M-03a): plain or designed, header, colours, footer. One is
 * the default, which every email the project sends goes out in; an
 * automation's email can pick another. No design: MINT's classic look.
 * Reading (and the preview) for `manage-projects` or `build` (the automation
 * editor picks one); changing them for `manage-projects`.
 *
 *   GET    /                { doc, business, projectName, fonts, widths, placeholders, defaults }
 *   POST   /preview         { design }   → { html } — a sample email in it, nothing saved
 *   POST   /                a design (the first becomes the default)
 *   PUT    /:id             the same
 *   POST   /:id/default     make it the default
 *   POST   /:id/send-test   { to? }   the sample email in it, to you by default
 *   DELETE /:id             the oldest left becomes the default
 */
const router = express.Router({ mergeParams: true });
const read = tenantPermissions(['manage-projects', 'build']);
const write = tenantPermissions(['manage-projects']);

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const view = (d: any) => ({ ...d, _id: String(d._id), organization: undefined, project: undefined, __v: undefined });
const list = async (req: any) => (await MailDesign.find({ project: req.project._id }).sort({ createdAt: 1 }).lean()).map(view);

const find = async (req: any) => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'No such email design.');
	const doc: any = await MailDesign.findOne({ _id: req.params.id, project: req.project._id }).lean();
	if (!doc) throw new TenancyError(404, 'No such email design.');
	return doc;
};

const event = (req: any, id: any, name: string, text: string) =>
	recordProjectEvent({ req, model: 'MailDesign', modelPath: 'email-accounts', document: id, name, text });

/** The email every preview and test shows: a short order note with a button. */
const sample = (req: any) => ({
	heading: 'Thanks for your order #1042',
	body:
		para('Hi Sam,') +
		para(`We’ve received your order at ${esc(req.project.name)} and we’re getting it ready. You’ll get another email when it’s on its way.`) +
		para('If anything looks wrong, just reply to this email.'),
	button: { href: 'https://example.com/orders/1042', text: 'View your order' },
});

router.get(
	'/',
	read,
	handle(async (req: any) => {
		const [doc, ctx] = await Promise.all([list(req), designCtx(req.project)]);
		return {
			doc,
			business: ctx.business,
			projectName: ctx.projectName,
			fonts: Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label })),
			widths: WIDTHS,
			placeholders: DESIGN_PLACEHOLDERS,
			defaults: { ...DEFAULT_DESIGN, header: { ...DEFAULT_DESIGN.header, logo: ctx.business.logo || '' } },
		};
	})
);

router.post(
	'/preview',
	read,
	handle(async (req: any) => {
		// Forgiving on purpose — the form is half-filled while someone types; renderDesign fills the gaps.
		return { html: renderDesign(req.body?.design || {}, await designCtx(req.project), sample(req)) };
	})
);

router.post(
	'/',
	write,
	handle(async (req: any) => {
		const body = checkDesign(req.body);
		const first = !(await MailDesign.exists({ project: req.project._id }));
		const doc = await MailDesign.create({ ...body, organization: req.organization._id, project: req.project._id, isDefault: first, createdBy: req.user._id, updatedBy: req.user._id });
		event(req, doc._id, doc.name, `added the email design “${doc.name}”`);
		return { _id: String(doc._id), doc: await list(req) };
	})
);

router.put(
	'/:id',
	write,
	handle(async (req: any) => {
		const doc = await find(req);
		const body = checkDesign(req.body);
		await MailDesign.updateOne({ _id: doc._id }, { $set: { ...body, updatedBy: req.user._id } });
		event(req, doc._id, body.name, `changed the email design “${body.name}”`);
		return { _id: String(doc._id), doc: await list(req) };
	})
);

router.post(
	'/:id/default',
	write,
	handle(async (req: any) => {
		const doc = await find(req);
		await MailDesign.updateMany({ project: req.project._id, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
		await MailDesign.updateOne({ _id: doc._id }, { $set: { isDefault: true } });
		event(req, doc._id, doc.name, `made “${doc.name}” the email design the project’s emails use`);
		return { doc: await list(req) };
	})
);

router.post(
	'/:id/send-test',
	write,
	handle(async (req: any) => {
		const doc = await find(req);
		const { error, value } = Joi.object({ to: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow('') }).validate(req.body || {}, { stripUnknown: true });
		if (error) throw new TenancyError(400, 'That isn’t an email address');
		const target = value.to || req.user.email;
		await sendOrgMail(
			{
				to: target,
				subject: `Test of “${doc.name}” — Thanks for your order #1042`,
				text: `A test of the email design “${doc.name}”.\n\nHi Sam,\n\nWe’ve received your order and we’re getting it ready.`,
				html: renderDesign(doc, await designCtx(req.project), sample(req)),
			},
			{ organization: req.organization._id, project: req.project._id, kind: 'test', sentBy: req.user._id }
		);
		return { message: `Sent to ${target} — check that inbox (and its spam folder).` };
	})
);

router.delete(
	'/:id',
	write,
	handle(async (req: any) => {
		const doc = await find(req);
		await MailDesign.deleteOne({ _id: doc._id });
		if (doc.isDefault) {
			const next: any = await MailDesign.findOne({ project: req.project._id }).sort({ createdAt: 1 }).lean();
			if (next) await MailDesign.updateOne({ _id: next._id }, { $set: { isDefault: true } });
		}
		event(req, doc._id, doc.name, `removed the email design “${doc.name}”`);
		return { doc: await list(req) };
	})
);

export default router;
