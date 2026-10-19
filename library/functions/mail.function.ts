import dns from 'dns/promises';
import net from 'net';
import nodemailer from 'nodemailer';
import MailSettings from '../models/tenancy/mailSettings.model.js';
import MailMessage from '../models/tenancy/mailMessage.model.js';
import MailAccount from '../models/tenancy/mailAccount.model.js';
import { open, seal } from '../../lib/crypto/secret.js';
import { TenancyError } from './tenancy.function.js';
import { designMail } from './mailDesign.function.js';

/**
 * Email (docs/messaging M-02, the user's decision 2026-10-05: "it can be sent
 * via nodemailer, they would manually add their email config"). Two senders:
 *
 * - **MINT's own** (`deliver` in controllers/twoFactor/twoFactor.service.ts,
 *   MAIL_* env): sign-up welcome, invitations, password resets, codes, the
 *   marketing site's waitlist — mail from MINT to the people who use it.
 * - **The business's own** (this file): mail from the business to its
 *   customers (welcome on sign-up, receipts, automations). A project's email
 *   goes through its default connected account (Project → Email, M-14,
 *   `MailAccount`); a project without one falls back to the organization's
 *   server (Organization → Email, M-02, `MailSettings`). Nothing goes out
 *   until one is set up: MINT has no shared sender.
 *
 * Every organization send is logged (`MailMessage`, subject only — automation
 * emails keep their body for viewing and Resend — 180 days).
 */

/* ---------------------------------------------------------------- html */

export const esc = (v: any) =>
	String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A plain, email-safe page (tables, inline styles) with the sender's name on top. Values must be escaped by the caller. */
export const mailPage = (brand: string, heading: string, body: string, color = '#111827') => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:${/^#[0-9a-f]{6}$/i.test(color) ? color : '#111827'};padding:24px 32px;"><span style="font-size:18px;font-weight:700;color:#fff;">${brand}</span></td></tr>
<tr><td style="padding:32px;color:#4b5563;"><h1 style="margin:0 0 16px;font-size:19px;color:#111827;">${heading}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;

/** A paragraph; its colour comes from the page around it (the design's text colour). */
export const para = (html: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">${html}</p>`;
export const button = (href: string, text: string) =>
	`<p style="margin:8px 0 20px;"><a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#111827;color:#fff;font-size:14px;font-weight:600;text-decoration:none;">${esc(text)}</a></p>`;

/* ---------------------------------------------------- the server's address */

/** The ports email servers take mail on — nothing else (a tenant can't point MINT at any service). */
export const SMTP_PORTS = [25, 465, 587, 2465, 2525, 2587];
/** The ports that speak TLS from the start; the rest upgrade with STARTTLS. */
export const SECURE_PORTS = [465, 2465];

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
export const checkHost = async (host: string, port: number) => {
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
	/** The project's account it is (M-14); absent = the organization's server. */
	accountId?: string;
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

/** What the panel sees of a project's account: everything but the password. */
export const accountView = (a: any) => ({
	_id: String(a._id),
	name: a.name,
	fromName: a.fromName || '',
	host: a.host,
	port: a.port,
	secure: !!a.secure,
	email: a.email,
	isDefault: !!a.isDefault,
	verifiedAt: a.verifiedAt || null,
	lastError: a.lastError || '',
	lastErrorAt: a.lastErrorAt || null,
	createdAt: a.createdAt,
	updatedAt: a.updatedAt,
});

const openPassword = (sealed: string) => {
	try {
		return sealed ? open(sealed) : '';
	} catch {
		throw new TenancyError(500, 'This email password can’t be read on this server — type it in again on the Email page.', 'mail_secret');
	}
};

/** A project account as something to send with: the given one, or the project's default. Null when the project has none. */
export const loadAccountConfig = async (project: any, accountId?: any): Promise<(MailConfig & { doc: any }) | null> => {
	const doc: any = await MailAccount.findOne(accountId ? { _id: accountId, project } : { project, isDefault: true })
		.select('+password')
		.lean();
	if (!doc) return null;
	return {
		host: doc.host,
		port: doc.port,
		secure: !!doc.secure,
		username: doc.email,
		password: openPassword(doc.password),
		fromName: doc.fromName || '',
		fromAddress: doc.email,
		replyTo: '',
		accountId: String(doc._id),
		doc,
	};
};

/** What a project's email goes out through: its default account, else its organization's server. */
export const resolveMailConfig = async (organization: any, project?: any) => (project && (await loadAccountConfig(project))) || loadMailConfig(organization);

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

/**
 * Connects and signs in, sending nothing (the Test button in the panel).
 * Answers `{ ok, message }` — a refusal is an answer, not an error.
 */
export const verifyMail = async (cfg: MailConfig) => {
	try {
		await checkHost(cfg.host, cfg.port);
		await transportOf(cfg).verify();
		return { ok: true, message: `Connected to ${cfg.host} and signed in as ${cfg.username || cfg.fromAddress}.` };
	} catch (e: any) {
		return { ok: false, message: e instanceof TenancyError ? e.message : mailProblem(e, cfg) };
	}
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

/** One email; `attachments` are files sent with it (an automation's invoice PDF). */
export type OutgoingMail = { to: string; subject: string; text: string; html?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] };
type SendMeta = {
	organization: any;
	project?: any;
	account?: any;
	kind: (typeof import('../models/tenancy/mailMessage.model.js').MAIL_KINDS)[number];
	sentBy?: any;
	/**
	 * Keep the body on the log (automation emails, AU-03c) — its text, HTML and
	 * these links (the run, the record, the email it resends) — so the panel can
	 * show it and resend it when it failed. A kept email that can't go out for
	 * want of an email account is logged as failed too.
	 */
	keep?: { automation?: any; run?: any; route?: string; record?: any; design?: any; resendOf?: any };
};

/**
 * Sends one email and logs it: through `meta.account`, else the project's
 * default account, else the organization's server. Throws a TenancyError (409
 * `mail_not_set_up`) when there's none, and a 502 with the reason when the
 * server refuses — after logging the failure.
 */
export const sendOrgMail = async (mail: OutgoingMail, meta: SendMeta, cfgIn?: MailConfig | null) => {
	const cfg = cfgIn || (meta.account && meta.project ? await loadAccountConfig(meta.project, meta.account) : await resolveMailConfig(meta.organization, meta.project));
	const kept = meta.keep
		? {
				kept: true,
				text: mail.text,
				html: mail.html || '',
				...(mail.attachments?.length && { files: mail.attachments.map(f => ({ filename: f.filename, size: f.content?.length || 0 })) }),
				...Object.fromEntries(Object.entries(meta.keep).filter(([, v]) => v != null && v !== '')),
			}
		: {};
	// Failed and kept: its files stay with it, so Resend sends the same email.
	const keptFiles = meta.keep && mail.attachments?.length ? { attachments: mail.attachments.map(f => ({ filename: f.filename, content: f.content, contentType: f.contentType || 'application/octet-stream' })) } : {};
	if (!cfg) {
		const problem = meta.project ? 'Connect an email account first (Project → Email).' : 'Set up your email first (Organization → Email).';
		if (meta.keep)
			await MailMessage.create({ organization: meta.organization, project: meta.project || null, kind: meta.kind, to: mail.to, subject: String(mail.subject).slice(0, 300), sentBy: meta.sentBy || null, status: 'failed', error: problem, ...kept, ...keptFiles }).catch(() => undefined);
		throw new TenancyError(409, problem, 'mail_not_set_up');
	}
	const log = { organization: meta.organization, project: meta.project || null, account: cfg.accountId || null, kind: meta.kind, to: mail.to, subject: String(mail.subject).slice(0, 300), sentBy: meta.sentBy || null, ...kept };
	const status = (set: any) => (cfg.accountId ? MailAccount.updateOne({ _id: cfg.accountId }, { $set: set }) : MailSettings.updateOne({ organization: meta.organization }, { $set: set }));
	try {
		const info: any = await transportOf(cfg).sendMail({
			from: cfg.fromName ? { name: cfg.fromName, address: cfg.fromAddress } : cfg.fromAddress,
			to: mail.to,
			...(cfg.replyTo && { replyTo: cfg.replyTo }),
			subject: mail.subject,
			text: mail.text,
			...(mail.html && { html: mail.html }),
			...(mail.attachments?.length && { attachments: mail.attachments }),
		});
		const [logged] = await Promise.all([
			MailMessage.create({ ...log, status: 'sent', messageId: String(info?.messageId || '').slice(0, 300) }),
			status({ verifiedAt: new Date(), lastError: '', lastErrorAt: null }),
		]);
		return { sent: true, messageId: info?.messageId || '', log: logged?._id };
	} catch (e: any) {
		const problem = mailProblem(e, cfg);
		const [logged]: any = await Promise.all([
			MailMessage.create({ ...log, ...keptFiles, status: 'failed', error: problem }),
			status({ lastError: problem, lastErrorAt: new Date() }),
		]).catch(() => [null]);
		throw Object.assign(new TenancyError(502, problem, 'mail_failed'), { log: logged?._id });
	}
};

/** A logged email as the panel shows it; `withBody` adds what was kept of it (AU-03c). */
export const mailMessageView = (m: any, withBody = false) => ({
	_id: String(m._id),
	kind: m.kind,
	to: m.to,
	subject: m.subject,
	status: m.status,
	error: m.error || '',
	project: m.project ? String(m.project) : null,
	account: m.account ? String(m.account) : null,
	createdAt: m.createdAt,
	kept: !!m.kept,
	files: (m.files || []).map((f: any) => ({ filename: f.filename, size: f.size || 0 })),
	run: m.run ? String(m.run) : null,
	route: m.route || null,
	record: m.record ? String(m.record) : null,
	resendOf: m.resendOf ? String(m.resendOf) : null,
	resent: m.resent?.at ? { at: m.resent.at, status: m.resent.status, error: m.resent.error || '', message: m.resent.message ? String(m.resent.message) : null } : null,
	/** A failed email whose body was kept, not already resent: Resend sends it again. */
	canResend: !!m.kept && m.status === 'failed' && m.resent?.status !== 'sent',
	...(withBody && { text: m.text || '', html: m.html || '' }),
});

/** One of a project's logged emails, with its body (404 when it's another project's, or gone). */
export const findMail = async (project: any, id: any, kind?: string) => {
	const ok = /^[a-f0-9]{24}$/i.test(String(id || ''));
	const m: any = ok ? await MailMessage.findOne({ _id: id, project, ...(kind && { kind }) }).select('+text +html').lean() : null;
	if (!m) throw new TenancyError(404, 'That email isn’t in the log any more.');
	return m;
};

/**
 * Sends a failed email again — the same to, subject, body and files —
 * through the project's email account as it is now, and logs the attempt as
 * a new email (`resendOf`); the failed one remembers how it went.
 * `limit(count)` throws when the project's daily allowance is used up.
 */
export const resendMail = async (project: { _id: any; organization: any }, id: any, by: any, opts: { kind?: string; limit?: () => Promise<void> } = {}) => {
	const m: any = await MailMessage.findOne({ _id: (await findMail(project._id, id, opts.kind))._id }).select('+text +html +attachments').lean();
	if (!m.kept) throw new TenancyError(400, 'Only the subject of this email was kept, so it can’t be sent again.');
	if (m.status !== 'failed') throw new TenancyError(400, 'This email went — there’s nothing to resend.');
	if (m.resent?.status === 'sent') throw new TenancyError(400, 'This email was already resent.');
	await opts.limit?.();
	const keep = { automation: m.automation, run: m.run, route: m.route, record: m.record, design: m.design, resendOf: m._id };
	const attachments = (m.attachments || []).map((f: any) => ({ filename: f.filename, content: Buffer.from(f.content?.buffer || f.content), contentType: f.contentType }));
	const mail = { to: m.to, subject: m.subject, text: m.text || '', html: m.html || undefined, ...(attachments.length && { attachments }) };
	try {
		const r = await sendOrgMail(mail, { organization: project.organization, project: project._id, kind: m.kind, sentBy: by, keep });
		await MailMessage.updateOne({ _id: m._id }, { $set: { resent: { at: new Date(), by, status: 'sent', error: '', message: r.log } }, $unset: { attachments: 1 } });
		return mailMessageView(await MailMessage.findById(r.log).lean());
	} catch (e: any) {
		await MailMessage.updateOne({ _id: m._id }, { $set: { resent: { at: new Date(), by, status: 'failed', error: e?.message || 'Not sent', ...(e?.log && { message: e.log }) } } });
		throw e;
	}
};

/** Recent sends — the organization's, or one project's — newest first. */
export const recentMail = async (organization: any, limit = 50, project?: any) =>
	(await MailMessage.find(project ? { organization, project } : { organization }).sort({ createdAt: -1 }).limit(limit).lean()).map(m => mailMessageView(m));

/* ------------------------------------------------- the emails themselves */

/**
 * A customer signed up on one of the project's sites: a welcome, from the
 * business. Quiet when email isn't set up or the organization turned
 * welcomes off (its Email page's switch covers its projects' accounts too).
 */
export const welcomeCustomer = async (project: any, customer: { name?: string; email: string }, siteUrl?: string) => {
	const cfg = await resolveMailConfig(project.organization, project._id).catch(() => null);
	if (!cfg) return;
	const org: any = cfg.accountId ? await MailSettings.findOne({ organization: project.organization }).select('customerWelcome').lean() : cfg.doc;
	if (org?.customerWelcome === false) return;
	const name = project.name;
	const hi = customer.name ? `Hi ${customer.name},` : 'Hi,';
	await sendOrgMail(
		{
			to: customer.email,
			subject: `Welcome to ${name}`,
			text: `${hi}\n\nYour account at ${name} is ready. Sign in any time with ${customer.email}.${siteUrl ? `\n\n${siteUrl}` : ''}\n\n— ${cfg.fromName || name}`,
			html: await designMail(project, {
				brand: esc(cfg.fromName || name),
				heading: `Welcome to ${esc(name)}`,
				body: para(esc(hi)) + para(`Your account at ${esc(name)} is ready. Sign in any time with <b>${esc(customer.email)}</b>.`),
				...(siteUrl ? { button: { href: siteUrl, text: `Visit ${name}` } } : {}),
			}),
		},
		{ organization: project.organization, project: project._id, kind: 'customer-welcome' },
		cfg
	).catch(() => undefined); // logged as failed; the sign-up still succeeds
};
