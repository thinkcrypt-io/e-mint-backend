import express from 'express';
import Joi from 'joi';
import MailSettings from '../../library/models/tenancy/mailSettings.model.js';
import { TenancyError, handle } from '../../library/functions/tenancy.function.js';
import { tenantPermissions } from '../../library/functions/tenantPermissions.function.js';
import { esc, loadMailConfig, mailPage, mailView, para, recentMail, saveMailSettings, sendOrgMail, SMTP_PORTS } from '../../library/functions/mail.function.js';

/**
 * /tenant/api/org/mail — the organization's own email server (docs/messaging
 * M-02): MINT sends its emails to customers through it, with nodemailer.
 * `manage-organization` for all of it (the page shows the server's details).
 *
 *   GET    /          { settings | null, messages }   settings never carry the password (`passwordSet`)
 *   PUT    /          { host, port, secure, username, password?, fromName, fromAddress, replyTo, customerWelcome }
 *                     an empty password keeps the stored one
 *   POST   /test      { to? }   a test email (to you by default) through the saved settings
 *   DELETE /          forget the server — the organization's emails stop
 */
const router = express.Router();
const manage = tenantPermissions(['manage-organization']);

const check = (schema: Joi.Schema, body: any) => {
	const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
	return value;
};

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(255);

router.get(
	'/',
	manage,
	handle(async req => {
		const [doc, messages] = await Promise.all([MailSettings.findOne({ organization: req.organization._id }).select('+password').lean(), recentMail(req.organization._id)]);
		return { settings: doc ? mailView({ ...doc, passwordSet: !!(doc as any).password, password: undefined }) : null, messages, ports: SMTP_PORTS };
	})
);

router.put(
	'/',
	manage,
	handle(async req => {
		const body = check(
			Joi.object({
				host: Joi.string().trim().lowercase().max(255).pattern(/^[a-z0-9.-]+$/).required().messages({ 'string.pattern.base': 'The server is a name like smtp.gmail.com', 'any.required': 'Type the email server (e.g. smtp.gmail.com)' }),
				port: Joi.number().integer().required(),
				secure: Joi.boolean().default(false),
				username: Joi.string().trim().max(255).allow('').default(''),
				password: Joi.string().max(500).allow('').default(''),
				fromName: Joi.string().trim().max(120).allow('').default(''),
				fromAddress: email.required().messages({ 'any.required': 'Type the address emails come from', 'string.email': 'The “from” address isn’t an email address' }),
				replyTo: email.allow('').default('').messages({ 'string.email': 'The reply-to address isn’t an email address' }),
				customerWelcome: Joi.boolean().default(true),
			}),
			req.body
		);
		return { settings: await saveMailSettings(req.organization._id, body, req.user._id) };
	})
);

router.post(
	'/test',
	manage,
	handle(async req => {
		const { to } = check(Joi.object({ to: email.allow('') }), req.body);
		const cfg = await loadMailConfig(req.organization._id);
		if (!cfg) throw new TenancyError(409, 'Save your email server first.', 'mail_not_set_up');
		const target = to || req.user.email;
		const org = req.organization.name;
		await sendOrgMail(
			{
				to: target,
				subject: `Test email from ${org}`,
				text: `This is a test from MINT. ${org}'s emails go out through ${cfg.host} as ${cfg.fromAddress} — it works.`,
				html: mailPage(
					esc(cfg.fromName || org),
					'It works',
					para(`This is a test from MINT. ${esc(org)}’s emails go out through <b>${esc(cfg.host)}</b> as <b>${esc(cfg.fromAddress)}</b>.`) +
						para('Customers who sign up on your sites get their welcome email this way.')
				),
			},
			{ organization: req.organization._id, kind: 'test', sentBy: req.user._id },
			cfg
		);
		return { message: `Sent to ${target} — check that inbox (and its spam folder).`, settings: mailView(await MailSettings.findOne({ organization: req.organization._id }).lean()) };
	})
);

router.delete(
	'/',
	manage,
	handle(async req => {
		await MailSettings.deleteOne({ organization: req.organization._id });
		return { message: 'Email server removed — your organization’s emails have stopped.' };
	})
);

export default router;
