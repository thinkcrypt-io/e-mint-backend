import dns from 'dns/promises';
import net from 'net';
import nodemailer from 'nodemailer';
import MailSettings from '../models/tenancy/mailSettings.model.js';
import MailMessage from '../models/tenancy/mailMessage.model.js';
import { open, seal } from '../../lib/crypto/secret.js';
import { TenancyError } from './tenancy.function.js';

/**
 * Email (docs/messaging M-02, the user's decision 2026-10-05: "it can be sent
 * via nodemailer, they would manually add their email config"). Two senders:
 *
 * - **MINT's own** (`deliver` in controllers/twoFactor/twoFactor.service.ts,
 *   MAIL_* env): sign-up welcome, invitations, password resets, codes, the
 *   marketing site's waitlist — mail from MINT to the people who use it.
 * - **The organization's own** (this file): its SMTP server, typed in on the
 *   Email page — mail from the business to its customers (welcome on sign-up
 *   now; record emails, newsletters and automations later). Nothing goes out
 *   for an organization until it has set this up: MINT has no shared sender.
 *
 * Every organization send is logged (`MailMessage`, subject only, 180 days).
 */

/* ---------------------------------------------------------------- html */

export const esc = (v: any) =>
	String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A plain, email-safe page (tables, inline styles) with the sender's name on top. Values must be escaped by the caller. */
export const mailPage = (brand: string, heading: string, body: string, color = '#111827') => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${/^#[0-9a-f]{6}$/i.test(color) ? color : '#111827'};padding:24px 32px;"><span style="font-size:18px;font-weight:700;color:#fff;">${brand}</span></td></tr>
<tr><td style="padding:32px;"><h1 style="margin:0 0 16px;font-size:19px;color:#111827;">${heading}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;

export const para = (html: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">${html}</p>`;
export const button = (href: string, text: string) =>
	`<p style="margin:8px 0 20px;"><a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#111827;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">${esc(text)}</a></p>`;

/* ---------------------------------------------------- the server's address */

/** The ports email servers take mail on — nothing else (a tenant can't point MINT at any service). */
export const SMTP_PORTS = [25, 465, 587, 2465, 2525, 2587];

const privateAddress = (ip: string) => {
	if (net.isIPv4(ip)) {
		const [a, b] = ip.split('.').map(Number);
		return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
	}
	const v = ip.toLowerCase();
	return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
};

/**
 * The host must be a public email server: on production, names that lead to
 * private or local addresses are refused (MINT's own network is no business
 * of a tenant's). Local development allows them, for test servers.
 */
const checkHost = async (host: string, port: number) => {
	if (!SMTP_PORTS.includes(port)) throw new TenancyError(400, `Email servers take mail on ports ${SMTP_PORTS.join(', ')} — ${port} isn’t one.`);
	if (process.env.NODE_ENV !== 'production' && !process.env.MAIL_BLOCK_PRIVATE) return;
	let addresses: string[] = [];
	try {
		addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
	} catch {
		throw new TenancyError(400, `There’s no server called ${host} — check the spelling.`, 'mail_host');
	}
	if (!addresses.length || addresses.some(privateAddress)) throw new TenancyError(400, `${host} isn’t a public email server.`, 'mail_host');
};

/* ---------------------------------------------------------- the settings */

export type MailConfig = {
	host: string;
	port: number;
	secure: boolean;
	username: string;
	password: string;
	fromName: string;
	fromAddress: string;
	replyTo: string;
};

/** What the panel sees: everything but the password. */
export const mailView = (s: any) =>
	s && {
		host: s.host,
		port: s.port,
		secure: !!s.secure,
		username: s.username || '',
		passwordSet: !!s.password || !!s.passwordSet,
		fromName: s.fromName || '',
		fromAddress: s.fromAddress,
		replyTo: s.replyTo || '',
		customerWelcome: s.customerWelcome !== false,
		verifiedAt: s.verifiedAt || null,
		lastError: s.lastError || '',
		lastErrorAt: s.lastErrorAt || null,
		updatedAt: s.updatedAt,
	};

/** The organization's settings with the password opened, or null when it has none. */
export const loadMailConfig = async (organization: any): Promise<(MailConfig & { doc: any }) | null> => {
	const doc: any = await MailSettings.findOne({ organization }).select('+password').lean();
	if (!doc) return null;
	let password = '';
	try {
		password = doc.password ? open(doc.password) : '';
	} catch {
		throw new TenancyError(500, 'The email password can’t be read on this server — type it in again on the Email page.', 'mail_secret');
	}
	return { host: doc.host, port: doc.port, secure: !!doc.secure, username: doc.username || '', password, fromName: doc.fromName || '', fromAddress: doc.fromAddress, replyTo: doc.replyTo || '', doc };
};

/** Saves the settings. An empty password keeps the one stored; connection changes clear "verified". */
export const saveMailSettings = async (organization: any, body: any, by?: any) => {
	await checkHost(body.host, body.port);
	const was: any = await MailSettings.findOne({ organization }).select('+password').lean();
	if (!was && !body.password && body.username) throw new TenancyError(400, 'Type the password for this email account.');
	let password = was?.password || '';
	if (body.password) {
		try {
			password = seal(body.password);
		} catch {
			throw new TenancyError(500, 'This server can’t store passwords yet (SECRET_ENCRYPTION_KEY isn’t set) — tell MINT’s team.', 'mail_secret');
		}
	}
	const connection = (x: any) => [x?.host, x?.port, !!x?.secure, x?.username || ''].join('|');
	const changed = !was || body.password || connection(was) !== connection(body);
	const doc: any = await MailSettings.findOneAndUpdate(
		{ organization },
		{
			$set: {
				host: body.host,
				port: body.port,
				secure: body.secure,
				username: body.username || '',
				password,
				fromName: body.fromName || '',
				fromAddress: body.fromAddress,
				replyTo: body.replyTo || '',
				customerWelcome: body.customerWelcome !== false,
				...(changed && { verifiedAt: null, lastError: '', lastErrorAt: null }),
				...(by && { updatedBy: by }),
			},
		},
		{ upsert: true, new: true }
	).lean();
	return mailView({ ...doc, passwordSet: !!password });
};

/* ------------------------------------------------------------- sending */

/** What went wrong, in words a person can act on. */
export const mailProblem = (e: any, cfg: Pick<MailConfig, 'host' | 'port' | 'secure'>) => {
	const code = e?.code || '';
	const msg = String(e?.message || '');
	if (code === 'EAUTH') return 'The email server refused the username or password. Check them — some providers (Gmail, Outlook) need an app password.';
	if (code === 'EENVELOPE') return `The email server wouldn’t take this address: ${msg.replace(/^.*?:\s*/, '').slice(0, 160)}`;
	if (/ENOTFOUND|EAI_AGAIN/.test(code + msg)) return `There’s no server called ${cfg.host} — check the spelling.`;
	if (/ECONNREFUSED/.test(code + msg)) return `${cfg.host} didn’t answer on port ${cfg.port}. Check the port (usually 587, or 465 with SSL).`;
	if (/ETIMEDOUT|timeout/i.test(code + msg)) return `${cfg.host} didn’t answer in time on port ${cfg.port}. Check the port, or that the server takes mail from outside.`;
	if (/wrong version number|ssl|tls|certificate/i.test(msg))
		return cfg.secure ? 'The secure connection failed — try SSL off with port 587.' : 'The secure connection failed — try SSL on with port 465.';
	return `The email server said: ${msg.slice(0, 200) || 'something went wrong'}`;
};

const transportOf = (cfg: MailConfig) =>
	nodemailer.createTransport({
		host: cfg.host,
		port: cfg.port,
		secure: cfg.secure,
		...(cfg.username && { auth: { user: cfg.username, pass: cfg.password } }),
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000,
		// Local test servers have no certificate; real servers keep full checks.
		...(process.env.NODE_ENV !== 'production' && { tls: { rejectUnauthorized: false } }),
	});

export type OutgoingMail = { to: string; subject: string; text: string; html?: string };
type SendMeta = { organization: any; project?: any; kind: (typeof import('../models/tenancy/mailMessage.model.js').MAIL_KINDS)[number]; sentBy?: any };

/**
 * Sends one email through the organization's own server and logs it. Throws
 * a TenancyError (409 `mail_not_set_up`) when there's no server, and a 502
 * with the reason when the server refuses — after logging the failure.
 */
export const sendOrgMail = async (mail: OutgoingMail, meta: SendMeta, cfgIn?: MailConfig | null) => {
	const cfg = cfgIn || (await loadMailConfig(meta.organization));
	if (!cfg) throw new TenancyError(409, 'Set up your email first (Organization → Email).', 'mail_not_set_up');
	const log = { organization: meta.organization, project: meta.project || null, kind: meta.kind, to: mail.to, subject: String(mail.subject).slice(0, 300), sentBy: meta.sentBy || null };
	try {
		const info: any = await transportOf(cfg).sendMail({
			from: cfg.fromName ? { name: cfg.fromName, address: cfg.fromAddress } : cfg.fromAddress,
			to: mail.to,
			...(cfg.replyTo && { replyTo: cfg.replyTo }),
			subject: mail.subject,
			text: mail.text,
			...(mail.html && { html: mail.html }),
		});
		await Promise.all([
			MailMessage.create({ ...log, status: 'sent', messageId: String(info?.messageId || '').slice(0, 300) }),
			MailSettings.updateOne({ organization: meta.organization }, { $set: { verifiedAt: new Date(), lastError: '', lastErrorAt: null } }),
		]);
		return { sent: true, messageId: info?.messageId || '' };
	} catch (e: any) {
		const problem = mailProblem(e, cfg);
		await Promise.all([
			MailMessage.create({ ...log, status: 'failed', error: problem }),
			MailSettings.updateOne({ organization: meta.organization }, { $set: { lastError: problem, lastErrorAt: new Date() } }),
		]).catch(() => undefined);
		throw new TenancyError(502, problem, 'mail_failed');
	}
};

/** The organization's recent sends, newest first. */
export const recentMail = async (organization: any, limit = 50) =>
	(await MailMessage.find({ organization }).sort({ createdAt: -1 }).limit(limit).lean()).map((m: any) => ({
		_id: String(m._id),
		kind: m.kind,
		to: m.to,
		subject: m.subject,
		status: m.status,
		error: m.error || '',
		project: m.project ? String(m.project) : null,
		createdAt: m.createdAt,
	}));

/* ------------------------------------------------- the emails themselves */

/** A customer signed up on one of the organization's sites: a welcome, from the business. Quiet when email isn't set up or welcomes are off. */
export const welcomeCustomer = async (project: any, customer: { name?: string; email: string }, siteUrl?: string) => {
	const cfg = await loadMailConfig(project.organization).catch(() => null);
	if (!cfg || cfg.doc.customerWelcome === false) return;
	const name = project.name;
	const hi = customer.name ? `Hi ${customer.name},` : 'Hi,';
	await sendOrgMail(
		{
			to: customer.email,
			subject: `Welcome to ${name}`,
			text: `${hi}\n\nYour account at ${name} is ready. Sign in any time with ${customer.email}.${siteUrl ? `\n\n${siteUrl}` : ''}\n\n— ${cfg.fromName || name}`,
			html: mailPage(
				esc(cfg.fromName || name),
				`Welcome to ${esc(name)}`,
				para(esc(hi)) + para(`Your account at ${esc(name)} is ready. Sign in any time with <b>${esc(customer.email)}</b>.`) + (siteUrl ? button(siteUrl, `Visit ${name}`) : '')
			),
		},
		{ organization: project.organization, project: project._id, kind: 'customer-welcome' },
		cfg
	).catch(() => undefined); // logged as failed; the sign-up still succeeds
};
