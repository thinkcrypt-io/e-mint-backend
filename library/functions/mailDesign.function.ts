import Joi from 'joi';
import mongoose from 'mongoose';
import MailDesign from '../models/tenancy/mailDesign.model.js';
import Organization from '../models/tenancy/organization.model.js';
import { Business, projectBusiness } from './business.function.js';
import { TenancyError } from './tenancy.function.js';
import { esc, mailPage, button as classicButton } from './mail.function.js';

/**
 * Email designs (docs/messaging M-03a): the frame a project's emails are put
 * in. `designMail` is what senders call — the project's design (a chosen one,
 * else its default) around the email's heading, body and button; without one,
 * MINT's classic look. `renderDesign` draws one design (the panel's live
 * preview uses it too), `checkDesign` is what the API saves.
 *
 * Email-safe on purpose: tables and inline styles only, web-safe fonts, no
 * CSS the big clients drop.
 */

export const FONTS: Record<string, { label: string; stack: string }> = {
	sans: { label: 'Clean (Helvetica, Arial)', stack: "'Helvetica Neue',Helvetica,Arial,sans-serif" },
	system: { label: 'System (the reader’s own)', stack: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
	serif: { label: 'Classic (Georgia)', stack: "Georgia,'Times New Roman',serif" },
	friendly: { label: 'Friendly (Trebuchet, Verdana)', stack: "'Trebuchet MS',Verdana,sans-serif" },
	mono: { label: 'Typewriter (Courier)', stack: "'Courier New',Courier,monospace" },
};
export const WIDTHS = [480, 560, 640];

/** What a design starts as — and fills any colour it leaves out. */
export const DEFAULT_DESIGN = {
	name: 'Our emails',
	style: 'designed' as 'plain' | 'designed',
	font: 'sans',
	width: 560,
	header: { show: true, logo: '', logoHeight: 40, title: '{{business.name}}', align: 'left' as 'left' | 'center', background: '#111827', color: '#ffffff' },
	colors: { page: '#f4f4f5', card: '#ffffff', text: '#4b5563', heading: '#111827', button: '#111827', buttonText: '#ffffff' },
	radius: 12,
	footer: { text: '{{business.name}}\n{{business.address}}', align: 'center' as 'left' | 'center' },
};

/** The placeholders a header title or footer takes. */
export const DESIGN_PLACEHOLDERS = ['business.name', 'business.address', 'business.phone', 'business.email', 'business.website', 'project', 'year'];

/** What an email says, already escaped by the sender: a heading, the body's HTML, a button. */
export type MailContent = { heading?: string; body: string; button?: { href: string; text: string }; brand?: string };

type Ctx = { business: Business; projectName: string };

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: any, fallback: string) => (HEX.test(String(v || '')) ? String(v) : fallback);

const fillDesign = (text: string, ctx: Ctx) =>
	String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
		if (k === 'project') return ctx.projectName;
		if (k === 'year') return String(new Date().getFullYear());
		if (k.startsWith('business.')) return (ctx.business as any)[k.slice(9)] || '';
		return '';
	});

/** Footer lines, filled; a line left empty by a missing detail is dropped. */
const footerHtml = (text: string, ctx: Ctx) =>
	fillDesign(text, ctx)
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean)
		.map(esc)
		.join('<br>');

/** A design with every part present (what the database or a form left out comes from DEFAULT_DESIGN). */
export const fullDesign = (d: any = {}) => {
	const D = DEFAULT_DESIGN;
	return {
		style: d.style === 'plain' ? 'plain' : 'designed',
		font: FONTS[d.font] ? d.font : D.font,
		width: WIDTHS.includes(Number(d.width)) ? Number(d.width) : D.width,
		header: {
			show: d.header?.show !== false,
			logo: String(d.header?.logo || ''),
			logoHeight: Math.min(120, Math.max(20, Number(d.header?.logoHeight) || D.header.logoHeight)),
			title: d.header?.title ?? D.header.title,
			align: d.header?.align === 'center' ? 'center' : 'left',
			background: hex(d.header?.background, D.header.background),
			color: hex(d.header?.color, D.header.color),
		},
		colors: Object.fromEntries(Object.entries(D.colors).map(([k, v]) => [k, hex(d.colors?.[k], v)])) as typeof D.colors,
		radius: Math.min(24, Math.max(0, Number(d.radius ?? D.radius) || 0)),
		footer: { text: d.footer?.text ?? D.footer.text, align: d.footer?.align === 'left' ? 'left' : 'center' },
	};
};

/** One design around one email, as a whole HTML page. */
export const renderDesign = (design: any, ctx: Ctx, c: MailContent) => {
	const d = fullDesign(design);
	const font = FONTS[d.font].stack;
	const footer = footerHtml(d.footer.text, ctx);

	if (d.style === 'plain') {
		// Like a person wrote it: the text, a link, the signature. No heading — the subject says it.
		const link = c.button ? `<p style="margin:0 0 16px;"><a href="${esc(c.button.href)}" style="color:${d.colors.button};">${esc(c.button.text)}</a></p>` : '';
		const sign = footer ? `<p style="margin:24px 0 0;color:${d.colors.text};">${footer}</p>` : '';
		return `<!DOCTYPE html><html><body style="margin:0;padding:24px 16px;background:#ffffff;font-family:${font};font-size:14px;line-height:1.6;color:${d.colors.text};">
<div style="max-width:600px;">${c.body}${link}${sign}</div></body></html>`;
	}

	const h = d.header;
	const title = esc(fillDesign(h.title, ctx).trim());
	const logo = h.logo && /^https?:\/\//i.test(h.logo) ? `<img src="${esc(h.logo)}" alt="${title}" height="${h.logoHeight}" style="display:inline-block;height:${h.logoHeight}px;width:auto;border:0;vertical-align:middle;">` : '';
	const header =
		h.show && (logo || title)
			? `<tr><td align="${h.align}" style="background:${h.background};padding:22px 32px;">${logo}${logo && title ? '<span style="display:inline-block;width:12px;"></span>' : ''}${
					title ? `<span style="font-size:18px;font-weight:700;color:${h.color};vertical-align:middle;">${title}</span>` : ''
				}</td></tr>`
			: '';
	const btn = c.button
		? `<p style="margin:8px 0 20px;"><a href="${esc(c.button.href)}" style="display:inline-block;padding:11px 20px;border-radius:${Math.min(d.radius, 12)}px;background:${d.colors.button};color:${d.colors.buttonText};font-size:14px;font-weight:600;text-decoration:none;">${esc(c.button.text)}</a></p>`
		: '';
	const heading = c.heading ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${d.colors.heading};">${c.heading}</h1>` : '';
	return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${d.colors.page};font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="${d.width}" cellpadding="0" cellspacing="0" style="max-width:${d.width}px;width:100%;background:${d.colors.card};border-radius:${d.radius}px;overflow:hidden;">
${header}<tr><td style="padding:32px;font-size:14px;line-height:1.6;color:${d.colors.text};">${heading}${c.body}${btn}</td></tr>
</table>${footer ? `<table role="presentation" width="${d.width}" cellpadding="0" cellspacing="0" style="max-width:${d.width}px;width:100%;"><tr><td align="${d.footer.align}" style="padding:20px 32px;font-size:12px;line-height:1.6;color:#6b7280;">${footer}</td></tr></table>` : ''}
</td></tr></table></body></html>`;
};

/** A project's details and name, as designs fill them. */
export const designCtx = async (project: any): Promise<Ctx> => {
	const org = project?.organization ? await Organization.findById(project.organization).lean() : null;
	return { business: projectBusiness(project, org), projectName: project?.name || '' };
};

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

/** The design an email goes out in: the chosen one (if it's still there), else the project's default, else none. */
export const designOf = async (projectId: any, designId?: any) =>
	((designId && isId(designId) && (await MailDesign.findOne({ _id: designId, project: projectId }).lean())) ||
		(await MailDesign.findOne({ project: projectId, isDefault: true }).lean())) as any;

/**
 * An email's HTML in the project's design — what every project email uses.
 * Without a design: MINT's classic look, headed by `brand` (or the project's name).
 */
export const designMail = async (project: any, c: MailContent, designId?: any) => {
	const design = project?._id ? await designOf(project._id, designId).catch(() => null) : null;
	if (!design) return mailPage(esc(c.brand || project?.name || 'MINT'), c.heading || '', c.body + (c.button ? classicButton(c.button.href, c.button.text) : ''));
	return renderDesign(design, await designCtx(project), c);
};

/* ------------------------------------------------------------ saving */

const color = Joi.string().trim().pattern(HEX).messages({ 'string.pattern.base': 'A colour is written like #1f2937' });
const withPlaceholders = (max: number) => Joi.string().allow('').max(max);

/** A placeholder a header title or footer can't fill — a 400 naming the ones it can (outside Joi: it reads {{…}} as its own). */
const checkPlaceholders = (text: string) => {
	const bad = [...String(text || '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]).find(k => !DESIGN_PLACEHOLDERS.includes(k));
	if (bad) throw new TenancyError(400, `{{${bad}}} isn’t a detail a design can show — use ${DESIGN_PLACEHOLDERS.map(k => `{{${k}}}`).join(', ')}`);
};

export const designSchema = Joi.object({
	name: Joi.string().trim().max(80).required().messages({ 'any.required': 'Name the design', 'string.empty': 'Name the design' }),
	style: Joi.string().valid('plain', 'designed').default('designed'),
	font: Joi.string().valid(...Object.keys(FONTS)).default('sans'),
	width: Joi.number().valid(...WIDTHS).default(560),
	header: Joi.object({
		show: Joi.boolean().default(true),
		logo: Joi.string().trim().allow('').max(1000).pattern(/^https?:\/\//i).messages({ 'string.pattern.base': 'The logo is an image address starting with https://' }),
		logoHeight: Joi.number().integer().min(20).max(120),
		title: withPlaceholders(160),
		align: Joi.string().valid('left', 'center'),
		background: color,
		color: color,
	}).default({}),
	colors: Joi.object(Object.fromEntries(Object.keys(DEFAULT_DESIGN.colors).map(k => [k, color]))).default({}),
	radius: Joi.number().integer().min(0).max(24),
	footer: Joi.object({ text: withPlaceholders(2000), align: Joi.string().valid('left', 'center') }).default({}),
});

/** A design as the API saves it, every part filled — or a 400 naming what's wrong. */
export const checkDesign = (body: any) => {
	const { error, value } = designSchema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	checkPlaceholders(value.header?.title);
	checkPlaceholders(value.footer?.text);
	return { name: value.name, ...fullDesign(value) };
};
