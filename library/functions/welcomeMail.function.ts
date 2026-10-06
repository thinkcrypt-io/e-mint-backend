import { esc } from './mail.function.js';

/**
 * The welcome email a new account gets at sign-up (routes-tenant/auth): what
 * MINT is, the steps to a first project — each with its guide on the docs
 * site — and the way back into the app. The same steps are on the app's home
 * until the first project is built (admin library/tenant/FirstSteps.tsx);
 * keep the two in step.
 */

const trim = (url: string) => url.replace(/\/+$/, '');

/** The user guides' site (mint-docs). */
export const docsUrl = () => trim(process.env.DOCS_URL || 'https://docs.mintapp.shop');

/** The steps to a first project, and the guide for each (paths and #anchors on the docs site). */
export const FIRST_STEPS: { title: string; text: string; guide: string }[] = [
	{
		title: 'Create a project',
		text: 'A project is one thing you build: an app (your own data tool, like a CRM), a website (pages, SEO and content), or an API (a backend for your own site or app). Start from a ready-made template, or from scratch.',
		guide: '/projects#create',
	},
	{
		title: 'Describe your data',
		text: 'Add a model for each thing you keep track of: customers, orders, bookings. Each one gets a table, a form, filters and a detail page straight away. No code needed.',
		guide: '/models#models-wizard',
	},
	{
		title: 'Add your first records',
		text: 'Type them in, or import a spreadsheet. Then search, filter, edit many rows at once, and undo anything from its history.',
		guide: '/records',
	},
	{
		title: 'Shape your panel',
		text: 'Arrange the sidebar, choose its icons, and pick the numbers and charts your dashboard shows.',
		guide: '/sidebar',
	},
	{
		title: 'Invite your team',
		text: 'Add people by email, and choose what each of them may do and which projects they open.',
		guide: '/organization#invitations',
	},
	{
		title: 'Go live',
		text: 'Open your models to your own website or app through the public API, with sign-in for your customers.',
		guide: '/public-api',
	},
];

const INK = '#0d0d0d';
const MUTED = '#555b6e';

const step = (n: number, s: (typeof FIRST_STEPS)[number]) => `<tr>
<td valign="top" width="40" style="padding:0 0 22px;"><div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:#ecfdf5;color:#047857;font-size:12px;font-family:Menlo,Consolas,monospace;text-align:center;">0${n}</div></td>
<td valign="top" style="padding:3px 0 22px;">
<p style="margin:0 0 4px;font-size:15px;color:${INK};">${esc(s.title)}</p>
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${MUTED};">${esc(s.text)}</p>
<a href="${esc(docsUrl() + s.guide)}" style="font-size:13px;color:#4f46e5;text-decoration:none;">Read the guide &rarr;</a>
</td></tr>`;

/** The email itself: { subject, text, html }. */
export const welcomeMail = ({ name, organization, appUrl }: { name: string; organization: string; appUrl: string }) => {
	const app = trim(appUrl);
	const home = `${app}/dashboard`;
	const docs = docsUrl();
	const first = String(name || '').trim().split(/\s+/)[0] || 'there';
	const subject = `Welcome to MINT, ${first}`;

	const text = [
		`Hi ${first},`,
		'',
		`Welcome to MINT. Your organization, ${organization}, is ready.`,
		'',
		'MINT is a backend with the admin panel built in. You describe the things your business keeps track of, and you get a ready admin for them: tables, forms, filters and a dashboard. Then you can open them to your own website or app.',
		'',
		'Build your first project in six steps:',
		'',
		...FIRST_STEPS.flatMap((s, i) => [`${i + 1}. ${s.title}`, `   ${s.text}`, `   Guide: ${docs}${s.guide}`, '']),
		`Start here: ${home}`,
		'The same steps wait on your home page in MINT, where you can tick them off as you go.',
		'',
		`Every guide: ${docs}`,
		`Stuck? Open a support ticket: ${app}/support`,
		'',
		'— The MINT team',
	].join('\n');

	const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6e8ef;">
<tr><td style="background:${INK};background-image:linear-gradient(110deg,rgba(16,185,129,0.35) 0%,rgba(6,182,212,0.2) 40%,rgba(99,102,241,0.25) 75%,rgba(168,85,247,0.35) 100%);padding:28px 36px;">
<span style="font-size:15px;letter-spacing:0.34em;color:#faf8f1;">MINT</span>
<p style="margin:22px 0 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#34d399;font-family:Menlo,Consolas,monospace;">Welcome aboard</p>
<h1 style="margin:8px 0 0;font-size:26px;line-height:1.15;font-weight:300;letter-spacing:0.01em;text-transform:uppercase;color:#faf8f1;">${esc(organization)} is ready</h1>
</td></tr>
<tr><td style="padding:32px 36px 8px;">
<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${INK};">Hi ${esc(first)},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${MUTED};">Welcome to MINT. It's a backend with the admin panel built in. You describe the things your business keeps track of, and you get a ready admin for them: tables, forms, filters and a dashboard. Then you can open them to your own website or app.</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:${MUTED};">Here's how to build your first project. Each step has a short guide.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${FIRST_STEPS.map((s, i) => step(i + 1, s)).join('')}</table>
<p style="margin:6px 0 10px;"><a href="${esc(home)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${INK};color:#ffffff;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">Build your first project</a></p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${MUTED};">The same steps are waiting on your home page in MINT, where you can tick them off as you go.</p>
</td></tr>
<tr><td style="padding:22px 36px 28px;border-top:1px solid #eceef4;">
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">Every guide, from your first model to a live site: <a href="${esc(docs)}" style="color:#4f46e5;text-decoration:none;">${esc(docs.replace(/^https?:\/\//, ''))}</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">Stuck? <a href="${esc(app)}/support" style="color:#4f46e5;text-decoration:none;">Open a support ticket</a> and we'll help.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9298a8;">MINT · mintapp.shop</p>
</td></tr></table></body></html>`;

	return { subject, text, html };
};
