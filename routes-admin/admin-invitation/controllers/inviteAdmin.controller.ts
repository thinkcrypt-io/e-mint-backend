import Joi from 'joi';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { Admin, validatorHelper as vh, getErrorMessage } from '../../../imports.js';
import sendMail from '../../../library/controllers/marketing/mail/sendMail.controller.js';

type Body = {
	email: string;
	role: string;
};

type RequestType = Request & {
	body: Body;
	user?: any;
};

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const inviteAdminController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		if (error) return res.status(400).json({ message: error.details[0].message });

		const { email, role } = req.body;
		const existing = (await Admin.findOne({ email })) as any;

		if (existing && existing.invitationStatus === 'accepted') {
			return res.status(400).json({ message: 'This email is already registered as an admin' });
		}

		if (existing && existing.invitationStatus === 'pending') {
			return res.status(400).json({
				message: 'This email already has a pending invitation — resend it instead of inviting again',
			});
		}

		const rawToken = crypto.randomBytes(32).toString('hex');
		const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
		const invitationExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

		// `existing` here can only be a previously cancelled invite (accepted
		// and pending are handled above) — reuse that document instead of
		// creating a duplicate admin per email.
		const admin =
			existing ||
			new Admin({
				email,
			});

		admin.role = role;
		admin.invitationStatus = 'pending';
		admin.invitationToken = hashedToken;
		admin.invitationExpires = invitationExpires;
		await admin.save();

		const adminUrl = process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL;
		const inviteLink = `${adminUrl}/auth/accept-invitation/${rawToken}`;

		await sendMail({
			to: email,
			subject: "You've been invited to join MINT admin",
			title: 'MINT',
			body: `Hi,\n\nYou've been invited to join the MINT admin panel. Click the link below to set up your account — this invitation expires in 7 days.\n\n${inviteLink}\n\nIf you weren't expecting this, you can safely ignore this email.`,
			html: buildInviteEmailHtml({ inviteLink }),
		});

		return res.status(201).json({ message: 'Invitation sent', admin: { _id: admin._id, email: admin.email } });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

function buildInviteEmailHtml({ inviteLink }: { inviteLink: string }): string {
	return `
<!DOCTYPE html>
<html>
	<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
			<tr>
				<td align="center">
					<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
						<tr>
							<td style="background-color:#111827;padding:28px 32px;">
								<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:0.04em;color:#ffffff;">MINT</span>
							</td>
						</tr>
						<tr>
							<td style="padding:32px;">
								<h1 style="margin:0 0 16px;font-size:20px;color:#111827;">You're invited</h1>
								<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">
									You've been invited to join the MINT admin panel. Click the button below to set your name, phone number and password. This invitation expires in 7 days.
								</p>
								<table role="presentation" cellpadding="0" cellspacing="0">
									<tr>
										<td style="border-radius:8px;background-color:#111827;">
											<a href="${inviteLink}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
												Accept Invitation
											</a>
										</td>
									</tr>
								</table>
								<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
									If the button above doesn't work, copy and paste this link into your browser:<br />
									<a href="${inviteLink}" style="color:#4b5563;word-break:break-all;">${inviteLink}</a>
								</p>
								<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
									If you weren't expecting this, you can safely ignore this email.
								</p>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`;
}

function validate(data: any): Joi.ValidationResult {
	const schema = Joi.object({
		email: vh.email,
		role: Joi.string().required().messages({ 'any.required': 'Role is required' }),
	});
	return schema.validate(data);
}

export default inviteAdminController;
