import mongoose from 'mongoose';
import Joi from 'joi';
import MailDesign from '../../models/tenancy/mailDesign.model.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import { DEFAULT_DESIGN, DESIGN_PLACEHOLDERS, FONTS, WIDTHS, checkDesign, designCtx, renderDesign } from '../../functions/mailDesign.function.js';
import { esc, para, sendOrgMail } from '../../functions/mail.function.js';
import { currentScope } from '../../functions/tenantScope.function.js';
import { recordProjectEvent } from '../../functions/recordHistory.function.js';
import { mailFrom } from './automations.tools.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * Email designs over MCP (docs/automations AU-07): the user's own AI reads the
 * project's email designs (M-03a — the frame every project email goes out in),
 * makes or changes one, makes one the default and sends itself a test — through
 * the same checks as the panel's /mail-designs API (checkDesign, renderDesign).
 * Changing them needs Manage projects, as in the panel.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string, data?: any): Out => ({ text, isError: true, ...(data && { data }) });
const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));
const MANAGERS_ONLY = 'Changing email designs needs Manage projects — the key’s owner doesn’t have it.';

const view = (d: any) => ({ ...d, _id: String(d._id), organization: undefined, project: undefined, createdBy: undefined, updatedBy: undefined, __v: undefined });
const designs = async (project: any) => (await MailDesign.find({ project }).sort({ createdAt: 1 }).lean()).map(view);
const projectDoc = async () => {
	const id = currentScope()?.project;
	return id ? TenantProject.findById(id).lean() : null;
};

/** The email every test shows — the panel's sample: a short order note with a button. */
const sample = (project: any) => ({
	heading: 'Thanks for your order #1042',
	body:
		para('Hi Sam,') +
		para(`We’ve received your order at ${esc(project.name)} and we’re getting it ready. You’ll get another email when it’s on its way.`) +
		para('If anything looks wrong, just reply to this email.'),
	button: { href: 'https://example.com/orders/1042', text: 'View your order' },
});

const summary = (d: any) =>
	`- ${d.name}${d.isDefault ? ' (default)' : ''}: ${d.style}${d.style === 'designed' ? `, header ${d.header?.show === false ? 'hidden' : `${d.header?.background} “${d.header?.title}”${d.header?.logo ? ' with the logo' : ''}`}, button ${d.colors?.button}` : ''} [id ${d._id}]`;

const listDesigns = async (_req: any, _args: any, caller: Caller): Promise<Out> => {
	const project: any = await projectDoc();
	if (!project) return refuse('Email designs belong to a project.');
	const [docs, ctx, from] = await Promise.all([designs(project._id), designCtx(project), mailFrom(caller)]);
	const data = {
		designs: docs,
		mailFrom: from,
		business: ctx.business,
		fonts: Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label })),
		widths: WIDTHS,
		placeholders: DESIGN_PLACEHOLDERS,
		defaults: { ...DEFAULT_DESIGN, header: { ...DEFAULT_DESIGN.header, logo: ctx.business.logo || '' } },
	};
	return {
		text: [
			docs.length ? `${docs.length} email design(s) — the default is what every project email goes out in:` : 'No email designs yet — emails go out in MINT’s classic look.',
			...docs.map(summary),
			from,
			`The business details a header or footer can show: ${DESIGN_PLACEHOLDERS.map(k => `{{${k}}}`).join(', ')}. In the panel: ${caller.link('/email-accounts')}`,
		].join('\n'),
		data,
	};
};

const saveDesign = async (req: any, args: any, caller: Caller): Promise<Out> => {
	if (!caller.allows('manage-projects')) return refuse(MANAGERS_ONLY);
	const project: any = await projectDoc();
	if (!project) return refuse('Email designs belong to a project.');
	let current: any = null;
	if (args?.id) {
		current = isId(args.id) ? await MailDesign.findOne({ _id: String(args.id), project: project._id }).lean() : null;
		if (!current) return refuse(`No email design ${args.id} — list_email_designs shows them.`);
	}
	// Changing one: what's left out is kept (header, colours and footer part by part).
	const merged: any = {};
	for (const k of ['name', 'style', 'font', 'width', 'radius']) merged[k] = args?.[k] !== undefined ? args[k] : current?.[k];
	for (const k of ['header', 'colors', 'footer']) merged[k] = { ...(current?.[k] || {}), ...(args?.[k] || {}) };
	let body: any;
	try {
		body = checkDesign(merged);
	} catch (e: any) {
		return refuse(e?.message || 'That design isn’t valid');
	}
	let id: any;
	if (current) {
		await MailDesign.updateOne({ _id: current._id }, { $set: { ...body, updatedBy: caller.user?._id } });
		id = current._id;
	} else {
		const first = !(await MailDesign.exists({ project: project._id }));
		const doc = await MailDesign.create({ ...body, organization: project.organization, project: project._id, isDefault: first, createdBy: caller.user?._id, updatedBy: caller.user?._id });
		id = doc._id;
	}
	if (args?.makeDefault === true) {
		await MailDesign.updateMany({ project: project._id, _id: { $ne: id } }, { $set: { isDefault: false } });
		await MailDesign.updateOne({ _id: id }, { $set: { isDefault: true } });
	}
	const saved: any = view(await MailDesign.findById(id).lean());
	recordProjectEvent({ req, model: 'MailDesign', modelPath: 'email-accounts', document: id, name: saved.name, text: `${current ? 'changed' : 'added'} the email design “${saved.name}” through the AI` });
	return {
		text: [
			`${current ? 'Saved' : 'Made'} it:`,
			summary(saved),
			saved.isDefault ? 'It’s the default: every email the project sends goes out in it, unless an automation’s email picks another.' : 'Not the default — pass makeDefault: true, or set an email action’s `design` to its id.',
			`Send yourself a look with send_test_email_design; in the panel: ${caller.link('/email-accounts')}`,
		].join('\n'),
		data: saved,
	};
};

const sendTest = async (_req: any, args: any, caller: Caller): Promise<Out> => {
	if (!caller.allows('manage-projects')) return refuse(MANAGERS_ONLY);
	const project: any = await projectDoc();
	if (!project) return refuse('Email designs belong to a project.');
	const doc: any = isId(args?.id) ? await MailDesign.findOne({ _id: String(args.id), project: project._id }).lean() : null;
	if (!doc) return refuse(`No email design ${args?.id ?? ''} — list_email_designs shows them.`);
	const { error, value } = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow('').validate(args?.to || '');
	if (error) return refuse('That isn’t an email address');
	const target = value || caller.user?.email;
	if (!target) return refuse('Say whom to send it to (`to`).');
	try {
		await sendOrgMail(
			{
				to: target,
				subject: `Test of “${doc.name}” — Thanks for your order #1042`,
				text: `A test of the email design “${doc.name}”.\n\nHi Sam,\n\nWe’ve received your order and we’re getting it ready.`,
				html: renderDesign(doc, await designCtx(project), sample(project)),
			},
			{ organization: project.organization, project: project._id, kind: 'test', sentBy: caller.user?._id }
		);
	} catch (e: any) {
		return refuse(e?.message || 'It couldn’t be sent');
	}
	return { text: `Sent a sample email in “${doc.name}” to ${target} — check that inbox (and its spam folder).`, data: { to: target } };
};

const COLOR = { type: 'string', description: 'Like #1f2937' };

export const EMAIL_DESIGN_TOOLS: ToolDef[] = [
	{
		name: 'list_email_designs',
		title: 'List the email designs',
		description:
			'How the project’s emails look: each email design in full (plain or designed, font, width, header with logo/title/colours, colours, corner rounding, footer), which is the default, where emails go out from, the business details a header or footer can show, and the choices (fonts, widths). Call it before save_email_design.',
		scope: 'read',
		only: 'project',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: listDesigns,
	},
	{
		name: 'save_email_design',
		title: 'Make or change an email design',
		description:
			'One email design — the frame every email the project sends goes out in (automation emails, receipts, welcomes). With `id`, changes it (what’s left out is kept); without it, makes one (the project’s first becomes the default). "designed": a header with the logo and/or title on a colour, a card, a button colour, a footer; "plain": just the text like a person wrote it, the footer as a signature. Header titles and footers take {{business.name}}, {{business.address}}, {{business.phone}}, {{business.email}}, {{business.website}}, {{project}}, {{year}}. Show the user the look you suggest (colours, header, footer) and get their go-ahead before saving.',
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'The design to change (list_email_designs); leave out to make a new one' },
				name: { type: 'string', description: 'Up to 80 characters, e.g. "Newsletter"' },
				style: { type: 'string', enum: ['designed', 'plain'] },
				font: { type: 'string', enum: Object.keys(FONTS) },
				width: { type: 'number', enum: WIDTHS, description: 'The card’s width in pixels' },
				header: {
					type: 'object',
					properties: {
						show: { type: 'boolean' },
						logo: { type: 'string', description: 'An image address starting with https:// — the business logo by default; empty for the title only' },
						logoHeight: { type: 'number', description: '20–120 pixels' },
						title: { type: 'string', description: 'Beside or instead of the logo, e.g. "{{business.name}}"; empty for the logo only' },
						align: { type: 'string', enum: ['left', 'center'] },
						background: COLOR,
						color: { ...COLOR, description: 'The title’s colour' },
					},
				},
				colors: {
					type: 'object',
					properties: { page: COLOR, card: COLOR, text: COLOR, heading: COLOR, button: COLOR, buttonText: COLOR },
				},
				radius: { type: 'number', description: 'Corner rounding, 0–24 pixels' },
				footer: {
					type: 'object',
					properties: { text: { type: 'string', description: 'Lines under the email; a line whose detail is missing is dropped' }, align: { type: 'string', enum: ['left', 'center'] } },
				},
				makeDefault: { type: 'boolean', description: 'Make it the one every email goes out in' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: saveDesign,
	},
	{
		name: 'send_test_email_design',
		title: 'Send a test of an email design',
		description: 'Sends a sample email (a short order note with a button) in one design through the project’s email account — to the key’s owner, or `to`.',
		scope: 'build',
		only: 'project',
		inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, to: { type: 'string', description: 'An email address; left out, the key’s owner' } } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		run: sendTest,
	},
];

/** The paragraph every project's AI gets about email designs. */
export const EMAIL_DESIGN_INSTRUCTIONS = `

Email designs (how the project's emails look — automation emails included): list_email_designs shows them and the business details they can show; save_email_design makes or changes one (makeDefault: true to use it for every email); send_test_email_design sends a sample to the user. Suggest the look in plain words and get the user's go-ahead before saving.`;
