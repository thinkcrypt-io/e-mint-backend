import { deliver } from '../../library/controllers/twoFactor/twoFactor.service.js';
import { button, esc, mailPage, para } from '../../library/functions/mail.function.js';

/**
 * "Your spot is ready" — the email an approved waitlist entry gets, with a
 * link to create their account in the MINT app (the tenant panel's sign-up,
 * their email filled in). From MINT's own mail (docs/messaging M-02).
 *
 * `linkSentAt` marks an entry as mailed: each send claims it first, so two
 * saves at once, or an edit followed by a bulk approve, mail one time only.
 * Approving again (after moving the entry off "approved") clears it and mails
 * again; "Resend signup link" clears it on purpose.
 */

const tenantUrl = () => String(process.env.TENANT_FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

export const signupUrl = (email: string) => `${tenantUrl()}/auth/register?email=${encodeURIComponent(email)}`;

const mail = (entry: any) => {
	const hi = entry.name ? `Hi ${entry.name},` : 'Hi,';
	const url = signupUrl(entry.email);
	return deliver(
		entry.email,
		'Your MINT spot is ready — create your account',
		`${hi}\n\nGood news — your spot on MINT is ready. Create your account with this email (${entry.email}) here:\n\n${url}\n\n— The MINT team`,
		mailPage(
			'MINT',
			'Your spot is ready',
			para(esc(hi)) +
				para(`Good news — your spot on MINT is ready. Create your account with this email (<b>${esc(entry.email)}</b>) to get started.`) +
				button(url, 'Create your account')
		)
	);
};

/**
 * Mails every approved, not-yet-mailed entry matching `filter`. Returns how
 * many went out and the first failure; a failed send is un-claimed so it can
 * be retried.
 */
export const sendSignupLinks = async (Model: any, filter: any = {}) => {
	const due = await Model.find({ ...filter, status: 'approved', linkSentAt: null }).select('_id').lean();
	let sent = 0;
	let error: string | undefined;
	for (const { _id } of due) {
		const entry = await Model.findOneAndUpdate(
			{ _id, status: 'approved', linkSentAt: null },
			{ $set: { linkSentAt: new Date() } },
			{ new: true }
		).lean();
		if (!entry) continue;
		try {
			await mail(entry);
			sent++;
		} catch (e: any) {
			error = error || e?.message || 'The email could not be sent';
			console.log('waitlist signup link:', e?.message);
			await Model.updateOne({ _id }, { $unset: { linkSentAt: 1 } }).catch(() => undefined);
		}
	}
	return { sent, error };
};
