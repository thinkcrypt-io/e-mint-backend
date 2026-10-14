import Waitlist from '../../models/waitlist/waitlist.model.js';
import { sendSignupLinks } from '../../models/waitlist/waitlist.mail.js';

/**
 * PUT /admin/api/waitlist/send-link/:id — the Waitlist table's "Resend signup
 * link" (edit-waitlist). Approves the entry if it isn't yet and mails the
 * link now, answering with whether it went out.
 */
export const sendSignupLink = async (req: any, res: any) => {
	try {
		const entry: any = await Waitlist.findById(req.params.id);
		if (!entry) return res.status(404).json({ message: 'No waitlist entry with this id' });

		if (entry.status !== 'approved') entry.approvedAt = new Date();
		await Waitlist.updateOne(
			{ _id: entry._id },
			{ $set: { status: 'approved', approvedAt: entry.approvedAt || new Date() }, $unset: { linkSentAt: 1 } }
		).setOptions({ skipSignupLinkHook: true });

		const { sent, error } = await sendSignupLinks(Waitlist, { _id: entry._id });
		if (!sent) return res.status(502).json({ message: error || 'The email could not be sent' });
		return res.status(200).json({ message: `Sign-up link sent to ${entry.email}`, sent });
	} catch (e: any) {
		console.log('waitlist send link:', e?.message);
		return res.status(500).json({ message: e?.message || 'Something went wrong' });
	}
};
