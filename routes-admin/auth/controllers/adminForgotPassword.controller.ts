import Joi from 'joi';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { Admin, validatorHelper as vh, getErrorMessage } from '../../../imports.js';
import sendMail from '../../../library/controllers/marketing/mail/sendMail.controller.js';

type Body = {
	email: string;
};

type RequestType = Request & {
	body: Body;
};

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const adminForgotPasswordController = async (req: RequestType, res: Response): Promise<Response> => {
	try {
		const { error } = validate(req.body);
		if (error) return res.status(400).json({ message: error.details[0].message });

		const { email } = req.body;
		const admin = (await Admin.findOne({ email })) as any;

		// Always respond with the same message whether or not the email is
		// registered, so this endpoint can't be used to enumerate admin emails.
		if (!admin || !admin.isActive) {
			return res.status(200).json({
				message: 'If that email is registered, a password reset link has been sent.',
			});
		}

		const rawToken = crypto.randomBytes(32).toString('hex');
		const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

		admin.resetPasswordToken = hashedToken;
		admin.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
		await admin.save();

		const adminUrl = process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL;
		const resetLink = `${adminUrl}/auth/reset-password/${rawToken}`;

		await sendMail({
			to: admin.email,
			subject: 'Reset your MINT admin password',
			title: 'MINT',
			body: `Hi ${admin.name},\n\nWe received a request to reset your MINT admin password. Click the link below to choose a new one — this link expires in 1 hour.\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
			html: buildResetEmailHtml({ name: admin.name, resetLink }),
		});

		return res.status(200).json({
			message: 'If that email is registered, a password reset link has been sent.',
		});
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).send({ message });
	}
};

function buildResetEmailHtml({ name, resetLink }: { name: string; resetLink: string }): string {
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
								<h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Reset your password</h1>
								<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">
									Hi ${name}, we received a request to reset the password for your MINT admin account. Click the button below to choose a new password. This link expires in 1 hour.
								</p>
								<table role="presentation" cellpadding="0" cellspacing="0">
									<tr>
										<td style="border-radius:8px;background-color:#111827;">
											<a href="${resetLink}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
												Reset Password
											</a>
										</td>
									</tr>
								</table>
								<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
									If the button above doesn't work, copy and paste this link into your browser:<br />
									<a href="${resetLink}" style="color:#4b5563;word-break:break-all;">${resetLink}</a>
								</p>
								<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
									If you didn't request this, you can safely ignore this email — your password won't be changed.
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
	});
	return schema.validate(data);
}

export default adminForgotPasswordController;
