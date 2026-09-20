import crypto from 'crypto';
import { Request, Response } from 'express';
import { Admin, getErrorMessage } from '../../../imports.js';
import sendMail from '../../../library/controllers/marketing/mail/sendMail.controller.js';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const resendInvitationController = async (req: Request, res: Response): Promise<Response> => {
	try {
		const { id } = req.params;
		const admin = (await Admin.findById(id)) as any;

		if (!admin) return res.status(404).json({ message: 'Admin not found' });
		if (admin.invitationStatus !== 'pending') {
			return res.status(400).json({ message: 'Only a pending invitation can be resent' });
		}

		const rawToken = crypto.randomBytes(32).toString('hex');
		const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

		admin.invitationToken = hashedToken;
		admin.invitationExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
		await admin.save();

		const adminUrl = process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL;
		const inviteLink = `${adminUrl}/auth/accept-invitation/${rawToken}`;

		await sendMail({
			to: admin.email,
			subject: "You've been invited to join MINT admin",
			title: 'MINT',
			body: `Hi,\n\nHere's a fresh invitation link to join the MINT admin panel — this one expires in 7 days.\n\n${inviteLink}\n\nIf you weren't expecting this, you can safely ignore this email.`,
		});

		return res.status(200).json({ message: 'Invitation resent' });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

export default resendInvitationController;
