import express from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import MailAccount from '../library/models/tenancy/mailAccount.model.js';
import MailSettings from '../library/models/tenancy/mailSettings.model.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { tenantPermissions } from '../library/functions/tenantPermissions.function.js';
import { seal } from '../lib/crypto/secret.js';
import { accountView, checkHost, esc, findMail, loadAccountConfig, mailMessageView, mailPage, para, recentMail, resendMail, sendOrgMail, SECURE_PORTS, SMTP_PORTS, verifyMail } from '../library/functions/mail.function.js';
import { emailAllowance } from '../library/functions/automations.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';

/**
 * /tenant/api/p/:projectId/mail-accounts — the email accounts connected to a
 * project (docs/messaging M-14): SMTP server, port, address, password and the
 * sender name; one is the default, which the project's emails go out
 * through. `manage-projects` for all of it. Passwords are never returned.
 *
 *   GET    /                { doc, messages, ports, fallback }   accounts oldest first; the project's last 50 sends;
 *                           `fallback` = the organization's server address its emails use while it has no account
 *   POST   /test            { name?, fromName?, host, port, email, password, id? }   connects and signs in,
 *                           sends nothing → { ok, message } (always 200). With `id` and no password, the stored one.
 *   POST   /                { name, fromName, host, port, email, password }   the first becomes the default
 *   PUT    /:id             the same; an empty password keeps the stored one
 *   POST   /:id/default     make it the default
 *   POST   /:id/send-test   { to? }   a real test email (to you by default)
 *   DELETE /:id             the oldest left becomes the default
 *   GET    /messages/:id    one logged email; automation emails with their body (docs/automations AU-03c)
 *   POST   /messages/:id/resend   send a failed automation email again → the new attempt
 *
 * Saving checks the connection too (never blocking the save), so each row
 * shows whether it works.
 */
const router = express.Router({ mergeParams: true });
router.use(tenantPermissions(['manage-projects']));

const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255);
const fields = {
	name: Joi.string().trim().max(80).allow('').default(''),
	fromName: Joi.string().trim().max(120).allow('').default(''),
	host: Joi.string()
		.trim()
		.lowercase()
		.max(255)
		.pattern(/^[a-z0-9.-]+$/)
		.required()
		.messages({ 'string.pattern.base': 'The SMTP server is a name like smtp.gmail.com', 'any.required': 'Type the SMTP server (e.g. smtp.gmail.com)', 'string.empty': 'Type the SMTP server (e.g. smtp.gmail.com)' }),
	port: Joi.number()
		.integer()
		.valid(...SMTP_PORTS)
		.required()
		.messages({ 'any.only': `Email servers take mail on ports ${SMTP_PORTS.join(', ')}` }),
	email: email.required().messages({ 'any.required': 'Type the email address', 'string.empty': 'Type the email address', 'string.email': 'That isn’t an email address' }),
	password: Joi.string().max(500).allow('').default(''),
};
const accountSchema = Joi.object(fields);

const sealed = (password: string) => {
	try {
		return seal(password);
	} catch {
		throw new TenancyError(500, 'This server can’t store passwords yet (SECRET_ENCRYPTION_KEY isn’t set) — tell MINT’s team.', 'mail_secret');
	}
};

/** One of this project's accounts, or 404. */
const findAccount = async (req: any, select = '') => {
	if (!isId(req.params.id)) throw new TenancyError(404, 'No such email account.');
	const doc: any = await MailAccount.findOne({ _id: req.params.id, project: req.project._id }).select(select).lean();
	if (!doc) throw new TenancyError(404, 'No such email account.');
	return doc;
};

/** Checks a saved account's connection and stores what came of it. */
const recheck = async (project: any, id: any) => {
	const cfg = await loadAccountConfig(project, id).catch(() => null);
	if (!cfg) return;
	const r = await verifyMail(cfg);
	await MailAccount.updateOne({ _id: id }, { $set: r.ok ? { verifiedAt: new Date(), lastError: '', lastErrorAt: null } : { lastError: r.message, lastErrorAt: new Date() } });
};

const list = async (req: any) => (await MailAccount.find({ project: req.project._id }).sort({ createdAt: 1 }).lean()).map(accountView);

const event = (req: any, id: any, name: string, text: string) =>
	recordProjectEvent({ req, model: 'MailAccount', modelPath: 'email-accounts', document: id, name, text });

router.get(
	'/',
	handle(async (req: any) => {
		const [doc, messages, org] = await Promise.all([
			list(req),
			recentMail(req.organization._id, 50, req.project._id),
			MailSettings.findOne({ organization: req.organization._id }).select('fromAddress').lean(),
		]);
		return { doc, messages, ports: SMTP_PORTS, fallback: (org as any)?.fromAddress || null };
	})
);

router.get(
	'/messages/:id',
	handle(async (req: any) => mailMessageView(await findMail(req.project._id, req.params.id), true))
);

router.post(
	'/messages/:id/resend',
	handle(async (req: any) => {
		const doc = await resendMail({ _id: req.project._id, organization: req.organization._id }, req.params.id, req.user._id, {
			limit: async () => emailAllowance(req.project._id),
		});
		recordProjectEvent({ req, model: 'MailMessage', modelPath: 'email-accounts', document: doc._id, name: doc.subject, text: `resent an email to ${doc.to}` });
		return doc;
	})
);

router.post(
	'/test',
	handle(async (req: any) => {
		const body = check(accountSchema.keys({ id: Joi.string().allow('') }), req.body);
		let password = body.password;
		if (!password && body.id) {
			const saved = await loadAccountConfig(req.project._id, isId(body.id) ? body.id : null);
			if (!saved) throw new TenancyError(404, 'No such email account.');
			password = saved.password;
		}
		if (!password) return { ok: false, message: 'Type the password for this email account.' };
		return verifyMail({
			host: body.host,
			port: body.port,
			secure: SECURE_PORTS.includes(body.port),
			username: body.email,
			password,
			fromName: body.fromName,
			fromAddress: body.email,
			replyTo: '',
		});
	})
);

router.post(
	'/',
	handle(async (req: any, res: any) => {
		const body = check(accountSchema, req.body);
		if (!body.password) throw new TenancyError(400, 'Type the password for this email account.');
		await checkHost(body.host, body.port);
		const hasDefault = await MailAccount.exists({ project: req.project._id, isDefault: true });
		const doc: any = await MailAccount.create({
			organization: req.organization._id,
			project: req.project._id,
			name: body.name || body.email,
			fromName: body.fromName || req.project.name,
			host: body.host,
			port: body.port,
			secure: SECURE_PORTS.includes(body.port),
			email: body.email,
			password: sealed(body.password),
			isDefault: !hasDefault,
			createdBy: req.user._id,
			updatedBy: req.user._id,
		});
		await recheck(req.project._id, doc._id);
		event(req, doc._id, doc.name, `connected the email account ${doc.email}`);
		res.status(201);
		return { doc: await list(req) };
	})
);

router.put(
	'/:id',
	handle(async (req: any) => {
		const was = await findAccount(req, '+password');
		const body = check(accountSchema, req.body);
		await checkHost(body.host, body.port);
		await MailAccount.updateOne(
			{ _id: was._id },
			{
				$set: {
					name: body.name || body.email,
					fromName: body.fromName,
					host: body.host,
					port: body.port,
					secure: SECURE_PORTS.includes(body.port),
					email: body.email,
					...(body.password && { password: sealed(body.password) }),
					updatedBy: req.user._id,
				},
			}
		);
		await recheck(req.project._id, was._id);
		event(req, was._id, body.name || body.email, `changed the email account ${body.email}`);
		return { doc: await list(req) };
	})
);

router.post(
	'/:id/default',
	handle(async (req: any) => {
		const doc = await findAccount(req);
		await MailAccount.updateMany({ project: req.project._id, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
		await MailAccount.updateOne({ _id: doc._id }, { $set: { isDefault: true } });
		event(req, doc._id, doc.name, `made ${doc.email} the default email account`);
		return { doc: await list(req) };
	})
);

router.post(
	'/:id/send-test',
	handle(async (req: any) => {
		const doc = await findAccount(req);
		const { to } = check(Joi.object({ to: email.allow('') }), req.body);
		const target = to || req.user.email;
		const name = req.project.name;
		await sendOrgMail(
			{
				to: target,
				subject: `Test email from ${name}`,
				text: `This is a test from MINT. Emails from ${name} through “${doc.name}” go out via ${doc.host} as ${doc.email} — it works.`,
				html: mailPage(
					esc(doc.fromName || name),
					'It works',
					para(`This is a test from MINT. Emails from ${esc(name)} through <b>${esc(doc.name)}</b> go out via <b>${esc(doc.host)}</b> as <b>${esc(doc.email)}</b>.`)
				),
			},
			{ organization: req.organization._id, project: req.project._id, account: doc._id, kind: 'test', sentBy: req.user._id }
		);
		return { message: `Sent to ${target} — check that inbox (and its spam folder).`, doc: await list(req) };
	})
);

router.delete(
	'/:id',
	handle(async (req: any) => {
		const doc = await findAccount(req);
		await MailAccount.deleteOne({ _id: doc._id });
		if (doc.isDefault) {
			const next: any = await MailAccount.findOne({ project: req.project._id }).sort({ createdAt: 1 }).lean();
			if (next) await MailAccount.updateOne({ _id: next._id }, { $set: { isDefault: true } });
		}
		event(req, doc._id, doc.name, `removed the email account ${doc.email}`);
		return { doc: await list(req) };
	})
);

export default router;
